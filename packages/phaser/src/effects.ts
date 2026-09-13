import { pointInPolygon, pointleshAreaCapabilities, type Point, type ResolvedPointleshArea } from "@pointlesh/core";
import type Phaser from "phaser";

export type PointleshAreaEffects = {
  scale: number;
  zoom: number;
  zoomSmoothing: number;
  walkBehindBaseline?: number;
  activeAreaIds: string[];
};
export type PointleshAreaEffectDefaults = { defaultScale?: number; defaultZoom?: number; zoomSmoothing?: number };

function numeric(area: ResolvedPointleshArea, key: string, fallback: number): number {
  const value = area.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Start/end values follow the area's bounding box along its authored x/y axis. */
export function interpolatePointleshArea(area: ResolvedPointleshArea, point: Point, start: number, end: number, axis: "x" | "y" = area.properties.axis === "x" ? "x" : "y"): number {
  const coordinates = area.polygon.map(vertex => vertex[axis]);
  if (!coordinates.length) return start;
  const minimum = Math.min(...coordinates), maximum = Math.max(...coordinates);
  const amount = maximum === minimum ? 0 : Math.max(0, Math.min(1, (point[axis] - minimum) / (maximum - minimum)));
  return start + (end - start) * amount;
}

/** Roles compose independently. Later enabled areas win per effect, matching manifest order. */
export function evaluatePointleshAreaEffects(areas: readonly ResolvedPointleshArea[], point: Point, defaults: PointleshAreaEffectDefaults = {}): PointleshAreaEffects {
  const effects: PointleshAreaEffects = {
    scale: defaults.defaultScale ?? 1, zoom: defaults.defaultZoom ?? 1,
    zoomSmoothing: defaults.zoomSmoothing ?? 5, activeAreaIds: [],
  };
  for (const area of areas) {
    if (!area.enabled || !area.closed || !pointInPolygon(point, area.polygon)) continue;
    effects.activeAreaIds.push(area.id);
    const roles = pointleshAreaCapabilities(area);
    const axis = (key: string) => (area.properties[key] ?? area.properties.axis) === "x" ? "x" : "y";
    if (roles.scale) {
      effects.scale = Math.max(0.01, interpolatePointleshArea(area, point, numeric(area, "minScale", 0.65), numeric(area, "maxScale", 1), axis("scaleAxis")));
    }
    if (roles.zoom) {
      effects.zoom = Math.max(0.01, interpolatePointleshArea(area, point, numeric(area, "minZoom", 1.2), numeric(area, "maxZoom", 1), axis("zoomAxis")));
      effects.zoomSmoothing = Math.max(0, numeric(area, "smoothing", 5));
    }
    if (roles.walkBehind) {
      effects.walkBehindBaseline = numeric(area, "baseline", 0);
    }
  }
  return effects;
}

export type PointleshWalkBehindOverlay = {
  readonly image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  sync(area: ResolvedPointleshArea): void;
  destroy(): void;
};

/**
 * Mask a duplicate of the room background to the authored foreground polygon.
 * Actors use their foot Y for depth; the overlay uses its baseline, so they cross
 * naturally in front of and behind scenery. Supply an image aligned to the room.
 */
export function createWalkBehindOverlay(
  scene: Phaser.Scene,
  area: ResolvedPointleshArea,
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  options: { depthOffset?: number; destroyImage?: boolean } = {},
): PointleshWalkBehindOverlay {
  const graphics = scene.add.graphics();
  scene.children.remove(graphics);
  const webgl = "gl" in scene.renderer && Boolean(scene.renderer.gl);
  type Submitter = Phaser.Renderer.WebGL.RenderNodes.SubmitterQuad;
  const customNodes = image.customRenderNodes as { Submitter?: Submitter };
  const defaultNodes = image.defaultRenderNodes as { Submitter: Submitter };
  const originalSubmitter = customNodes.Submitter;
  if (webgl) {
    // Draw the original room texture directly through a stencil polygon. A mask
    // filter captures a lower-resolution intermediate image, which disagrees
    // with the background on high-DPI canvases and exposes seams while zooming.
    const submitter = originalSubmitter ?? defaultNodes.Submitter;
    const masked = Object.create(submitter) as typeof submitter;
    masked.run = function (context, ...args) {
      const renderer = context.renderer, gl = renderer.gl;
      renderer.renderNodes.finishBatch();
      const mask = context.getClone();
      mask.setColorWritemask(false, false, false, false);
      // Reserve the high stencil bit for this draw; preserve the other bits.
      mask.setStencil(true, gl.ALWAYS, 0x80, 0x80, gl.KEEP, gl.KEEP, gl.REPLACE, 0, 0x80);
      mask.clear(gl.STENCIL_BUFFER_BIT);
      const compositor = renderer.renderNodes.getNode("ListCompositor") as Phaser.Renderer.WebGL.RenderNodes.ListCompositor;
      compositor.run(mask, [graphics]);
      renderer.renderNodes.finishBatch();
      const clipped = context.getClone();
      clipped.setStencil(true, gl.EQUAL, 0x80, 0x80);
      try {
        submitter.run(clipped, ...args);
        renderer.renderNodes.finishBatch();
      } finally {
        mask.clear(gl.STENCIL_BUFFER_BIT);
        context.beginDraw();
      }
    };
    customNodes.Submitter = masked;
  }
  const geometryMask = webgl ? undefined : graphics.createGeometryMask();
  if (geometryMask) image.setMask(geometryMask);
  let destroyed = false;
  const sync = (next: ResolvedPointleshArea) => {
    if (destroyed) return;
    graphics.clear();
    const points = next.polygon;
    if (points.length >= 3) {
      graphics.fillStyle(0xffffff, 1).beginPath().moveTo(points[0]!.x, points[0]!.y);
      for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.closePath().fillPath();
    }
    image.setVisible(next.enabled && next.closed && points.length >= 3 && pointleshAreaCapabilities(next).walkBehind);
    image.setDepth((options.depthOffset ?? 0) + numeric(next, "baseline", 0));
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off("shutdown", destroy);
    if (webgl) {
      if (originalSubmitter) customNodes.Submitter = originalSubmitter;
      else delete customNodes.Submitter;
    }
    if (geometryMask) { image.clearMask(false); geometryMask.destroy(); }
    graphics.destroy();
    if (options.destroyImage !== false) image.destroy();
  };
  scene.events.once("shutdown", destroy);
  sync(area);
  return { image, sync, destroy };
}
