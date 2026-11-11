import type { PointleshPrefabMetadata } from '@pointlesh/core';
import type { ScenePrefabAttribute } from '@scene-designer/core';

const help: Record<string, string> = {
  name: 'The name shown for this prefab in the designer. Renaming it does not change its stable ID.',
  'point name': 'The name of this scene point. Use points to mark entrances, exits, or places a character can walk to.',
  tag: 'An optional tag on this sprite or shape that game code can use to identify it.',
  x: 'Horizontal position in scene coordinates, measured from the left edge.',
  y: 'Vertical position in scene coordinates, measured from the top edge.',
  'scale x': 'Horizontal display size multiplier for this sprite. One uses its authored width.',
  'scale y': 'Vertical display size multiplier for this sprite. One uses its authored height.',
  rotate: 'Rotation of this sprite in degrees.',
  'anchor x': 'Horizontal sprite pivot: zero is the left edge, one is the right edge.',
  'anchor y': 'Vertical sprite pivot measured upward from the feet: zero is the bottom edge, one is the top edge.',
  paint: 'How the selected graphic fills this platform shape: repeat tiles, stretch to fit, or paint a tile map.',
  'tile rotation (deg)': 'Rotation applied to each repeated tile, in degrees.',
  'mirror horizontally': 'Mirror the repeated tile left to right.',
  'mirror vertically': 'Mirror the repeated tile top to bottom.',
  enabled: 'Whether this entity exists in the game. The designer eye and lock controls only affect editing.',
  interactive: 'Allow hover labels, look, interact, and inventory use on this entity. Turn off for scenery or the player character.',
  label: 'Name shown when the player hovers over this interactive entity.',
  description: 'Default description used when the player looks at this entity, unless game code supplies another response.',
  role: 'A game-defined role used to distinguish this entity in story or rendering code.',
  targetid: 'Story interaction ID for this entity. Multiple scene graphics can share one interaction target.',
  actorname: 'Actor ID used by game code to connect this character to its movement, speech, and animation state.',
  pickupid: 'Inventory item ID awarded when the player picks up this object.',
  itemid: 'Stable inventory item ID used by interactions, saves, and game code.',
  walkthrough: 'Allow characters to pass through this character or object. When off, pathfinding routes around its ground footprint.',
  'walk point': 'Optional scene point the player approaches before interacting. With none selected, normal approach positioning applies.',
  walkpointid: 'Optional scene point the player approaches before interacting. With none selected, normal approach positioning applies.',
  ignoreScaling: 'Keep this object at its authored display scale instead of applying character scale from the area beneath it.',
  displayedscale: 'Extra multiplier applied to this entity’s displayed size without changing its authored position.',
  'walking speed': 'Walking speed in scene pixels per second when movement is not tied to animation frames.',
  speed: 'Walking speed in scene pixels per second when movement is not tied to animation frames.',
  'pixels per animation frame': 'Distance the character travels for each walk animation frame when movement is linked to animation.',
  walkstep: 'Distance the character travels for each walk animation frame when movement is linked to animation.',
  'frame duration (ms)': 'Milliseconds per frame for the fallback walk animation.',
  framedurationms: 'Milliseconds per frame for the fallback walk animation.',
  'walk animation frames': 'Number of frames in the fallback walk cycle.',
  framecount: 'Number of frames in the fallback walk cycle.',
  movementlinkedtoanimation: 'Advance the character by a set distance each animation frame, keeping footsteps aligned with movement.',
  adjustspeedtoscale: 'Adjust walking speed with the character’s perspective scale so distant characters move more slowly on screen.',
  directions: 'Use four cardinal directions or add the four optional diagonals for this character’s animations.',
  facing: 'Direction the character faces while standing still or before a new movement starts.',
  'portrait asset': 'Close-up graphic used when this character speaks in a dialog or scene.',
  'speaking animation': 'Animation played on the close-up portrait during speech. None keeps the portrait still.',
  'object animation': 'Named animation played on this object. None shows the base image.',
  animation: 'Named animation played on this object. None shows the base image.',
  'play animation': 'Start this object’s selected animation when it appears.',
  'loop animation': 'Repeat the object animation continuously instead of stopping after one play.',
  'inventory graphic': 'Graphic displayed for this item in the inventory and as the selected cursor.',
  'interaction point': 'The pixel of this inventory cursor that touches a target. Drag it on the preview, use arrow keys, or adjust its X and Y values.',
  'interaction point x': 'Horizontal position of the cursor interaction point from zero at the left edge to one at the right edge.',
  'interaction point y': 'Vertical position of the cursor interaction point from zero at the top edge to one at the bottom edge.',
  'crosshair graphic': 'Graphic drawn at the interaction point while this inventory item is the cursor.',
  'crosshair animation': 'Named animation that loops on the crosshair while the inventory item is selected.',
  character: 'Character used by the movement preview buttons for this point.',
  walkable: 'Allow characters to find paths through this area. This can be enabled temporarily during scene transitions.',
  'character scale': 'Change character display size across this area to create perspective.',
  'scale axis': 'Direction along which character scale changes: top to bottom or left to right.',
  'scale at start': 'Character scale at the top or left edge of this area, depending on the scale axis.',
  'scale at end': 'Character scale at the bottom or right edge of this area, depending on the scale axis.',
  'camera zoom': 'Change camera zoom as the player moves across this area.',
  'zoom axis': 'Direction along which camera zoom changes: top to bottom or left to right.',
  'zoom at start': 'Camera zoom at the top or left edge of this area, depending on the zoom axis.',
  'zoom at end': 'Camera zoom at the bottom or right edge of this area, depending on the zoom axis.',
  'camera response': 'How quickly the camera approaches the zoom selected by this area. Higher values respond faster.',
  'walk-behind': 'Draw characters behind this area when their feet are above its baseline.',
  baseline: 'Vertical depth line for walk-behind ordering. Drag it in the scene or enter its scene Y coordinate.',
  'approach x': 'Horizontal approach position used when this hotspot has no named walk point.',
  'approach y': 'Vertical approach position used when this hotspot has no named walk point.',
  'approach distance': 'How close the player must get before this hotspot interaction runs.',
  'receive room lighting': 'Let environmental lights affect this character’s sprite.',
  'light characters': 'Let this animated object cast light onto nearby characters.',
  'character light reach multiplier': 'Multiply this object’s light radius when lighting characters.',
  'character light intensity multiplier': 'Multiply this object’s light brightness when lighting characters.',
  'character light elevation / radius': 'Approximate the light’s height above the ground as a fraction of its radius.',
  lightenabled: 'Turn this object’s emitted light on or off.',
  lightcolor: 'Color of the light emitted by this object, as a hex color.',
  lightintensity: 'Brightness of the light emitted by this object.',
  lightradiusx: 'Horizontal reach of this object’s light in scene pixels.',
  lightradiusy: 'Vertical reach of this object’s light in scene pixels.',
  lightoffsetx: 'Horizontal offset of the light source from the object’s position.',
  lightoffsety: 'Vertical offset of the light source from the object’s position.',
  lightframeintensities: 'Per-frame brightness values used to make an animated light flicker with its graphic.',
  dooralwaysopen: 'Keep this door open during normal gameplay.',
  'extra behavior ids': 'Additional game behavior IDs for this scene instance. These run alongside the prefab’s defaults.',
  'behavior ids': 'Game behavior IDs attached to this area. The behavior functions are registered in game code.',
  'default behavior ids': 'Game behavior IDs inherited by every instance of this prefab. The behavior functions are registered in game code.',
  'custom property name': 'Name of a new game-defined property to save on this prefab or instance.',
  'custom property json value': 'JSON value for the new property, such as a number, text, boolean, array, or object.',
};

const normalized = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const builtInHelp = new Map(Object.entries(help).map(([key, description]) => [normalized(key), description]));

/** Custom schemas take priority; unknown extensions still explain inheritance and code ownership. */
export function prefabFieldHelp(label: string, metadata: PointleshPrefabMetadata, attributes: ScenePrefabAttribute[] = [], context: 'prefab' | 'instance' | 'area' = 'prefab'): string {
  const normalizedLabel = normalized(label);
  if (normalizedLabel === 'name' && context !== 'prefab') return context === 'area'
    ? 'Name of this scene area shown in the designer.' : 'Name of this placed instance shown in the scene designer.';
  const schema = Object.entries(metadata.propertySchema ?? {}).find(([key, value]) => normalized(key) === normalizedLabel || normalized(value.label ?? '') === normalizedLabel)?.[1];
  if (schema?.description) return schema.description;
  const animation = label.match(/^(Idle|Walk|Speak) (Front|Back|Left|Right|Front left|Front right|Back left|Back right) (asset|animation|Flip)$/i);
  if (animation) {
    const pose = `${animation[1]!.toLowerCase()} ${animation[2]!.toLowerCase()}`;
    return animation[3]!.toLowerCase() === 'asset' ? `Graphic asset that supplies the ${pose} animation.`
      : animation[3]!.toLowerCase() === 'flip' ? `Mirror the ${pose} animation horizontally, useful when reusing the opposite direction.`
      : `Named animation played when this character is ${pose}. Unset directions use a fallback.`;
  }
  const named = builtInHelp.get(normalizedLabel);
  if (named) return named;
  const attribute = attributes.find(value => normalized(value.name) === normalizedLabel);
  if (attribute?.kind === 'number') return builtInHelp.get(normalized(attribute.id)) ?? `Default ${label.toLowerCase()} value inherited by instances of this prefab.`;
  return `Custom ${label.toLowerCase()} property saved on this ${metadata.kind}. Game code can read it from the resolved properties; instances inherit the prefab value unless overridden.`;
}

/** Covers Pointlesh controls and the native Scene Designer fields in the Prefabs tab. */
export function annotatePrefabFields(editor: HTMLElement, metadata: PointleshPrefabMetadata, attributes: ScenePrefabAttribute[], context: 'prefab' | 'instance' | 'area' = 'prefab') {
  for (const browser of editor.querySelectorAll<HTMLElement>('.scene-designer__asset-browser')) {
    browser.dataset.pointleshFieldHelp = 'Choose the graphic asset used by this prefab’s sprite or platform.';
  }
  for (const marker of editor.querySelectorAll<HTMLButtonElement>('button[aria-label="Interaction point"]')) {
    marker.dataset.pointleshFieldHelp = help['interaction point']!;
    marker.setAttribute('aria-description', help['interaction point']!);
  }
  for (const label of editor.querySelectorAll<HTMLLabelElement>('label')) {
    const control = label.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea');
    if (!control || label.hidden || label.closest('[hidden]')) continue;
    const name = label.querySelector(':scope > span')?.textContent?.trim() || control.getAttribute('aria-label') || '';
    if (!name) continue;
    const explanation = prefabFieldHelp(name, metadata, attributes, context);
    label.dataset.pointleshFieldHelp = explanation;
    control.setAttribute('aria-description', explanation);
  }
  for (const control of editor.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input[aria-label],select[aria-label],textarea[aria-label]')) {
    if (control.closest('label') || control.parentElement?.closest('[hidden]')) continue;
    const name = control.getAttribute('aria-label'); if (!name) continue;
    const explanation = prefabFieldHelp(name, metadata, attributes, context);
    control.dataset.pointleshFieldHelp = explanation;
    control.setAttribute('aria-description', explanation);
  }
  for (const trigger of editor.querySelectorAll<HTMLButtonElement>('button.pointlesh-select-trigger')) {
    const select = trigger.previousElementSibling;
    const description = select instanceof HTMLSelectElement ? select.getAttribute('aria-description') : null;
    if (!description) continue;
    trigger.dataset.pointleshFieldHelp = description;
    trigger.setAttribute('aria-description', description);
  }
}

export function installPrefabFieldTooltips(root: HTMLElement) {
  const document = root.ownerDocument;
  const tooltip = document.createElement('div'); tooltip.className = 'pointlesh-prefab-field-tooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true; document.body.append(tooltip);
  const style = document.createElement('style'); style.textContent = `
    .pointlesh-prefab-field-tooltip{position:fixed;z-index:2147483647;max-width:min(320px,calc(100vw - 20px));padding:9px 11px;border:1px solid #8092af;border-radius:6px;background:#172132;color:#f5f7fb;box-shadow:0 10px 26px #0009;font:12px/1.4 system-ui,sans-serif;pointer-events:none}
    .pointlesh-prefab-field-tooltip[hidden]{display:none}`;
  document.head.append(style);
  let owner: HTMLElement | null = null;
  const field = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>('[data-pointlesh-field-help]') : null;
  const position = (x: number, y: number) => {
    const view = document.defaultView!;
    tooltip.style.left = `${Math.max(8, Math.min(x + 12, view.innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${y + tooltip.offsetHeight + 12 <= view.innerHeight ? y + 12 : Math.max(8, y - tooltip.offsetHeight - 12)}px`;
  };
  const show = (candidate: HTMLElement | null, x: number, y: number) => {
    if (!candidate || !root.contains(candidate)) return;
    owner = candidate; tooltip.textContent = candidate.dataset.pointleshFieldHelp ?? ''; tooltip.hidden = !tooltip.textContent;
    if (!tooltip.hidden) position(x, y);
  };
  const hide = () => { owner = null; tooltip.hidden = true; };
  const observer = new document.defaultView!.MutationObserver(() => { if (owner && !root.contains(owner)) hide(); });
  observer.observe(root, { childList: true, subtree: true });
  const pointerOver = (event: PointerEvent) => show(field(event.target), event.clientX, event.clientY);
  const pointerMove = (event: PointerEvent) => { if (owner && owner.contains(event.target as Node)) position(event.clientX, event.clientY); };
  const pointerOut = (event: PointerEvent) => { if (owner && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide(); };
  const focusIn = (event: FocusEvent) => { const target = field(event.target); if (target) { const box = target.getBoundingClientRect(); show(target, box.left, box.bottom); } };
  const focusOut = (event: FocusEvent) => { if (owner && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide(); };
  root.addEventListener('pointerover', pointerOver); root.addEventListener('pointermove', pointerMove); root.addEventListener('pointerout', pointerOut);
  root.addEventListener('focusin', focusIn); root.addEventListener('focusout', focusOut);
  return { destroy() { observer.disconnect(); hide(); tooltip.remove(); style.remove(); root.removeEventListener('pointerover', pointerOver);
    root.removeEventListener('pointermove', pointerMove); root.removeEventListener('pointerout', pointerOut);
    root.removeEventListener('focusin', focusIn); root.removeEventListener('focusout', focusOut); } };
}
