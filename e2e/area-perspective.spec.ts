import { pointInPolygon } from '@pointlesh/core';
import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';
import { selectInstance } from './designer-helpers';

test('transition scale and zoom edit only the selected area and leave Borin outside it unchanged', async ({ page }, testInfo) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await openAdventure(page, true);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.character.place({ x: 700, y: 480 }); scene.binding.sync();
  });
  await selectInstance(page, 'village.transition.to-forest');
  const context = page.getByRole('region', { name: 'Selected area adventure properties' });
  const read = () => page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene, room = scene.resolved();
    const corridor = room.areas.find((a: any) => a.id === 'village.transition.to-forest');
    return {
      floor: room.areas.find((a: any) => a.id === 'village.floor').properties,
      corridor: corridor.properties, polygon: corridor.polygon,
      actor: { x: scene.actor.x, y: scene.actor.y, scaleX: scene.actor.scaleX, scaleY: scene.actor.scaleY },
    };
  });
  const original = await read(); expect(pointInPolygon(original.actor, original.polygon)).toBe(false);
  await expect(context.getByRole('checkbox', { name: 'Character scale', exact: true })).toBeChecked();
  await expect(context.getByRole('checkbox', { name: 'Camera zoom', exact: true })).toBeChecked();
  const scale = context.getByRole('spinbutton', { name: 'Scale at end', exact: true });
  const zoom = context.getByRole('spinbutton', { name: 'Zoom at end', exact: true });
  await expect(scale).toHaveValue(String(original.corridor.maxScale));
  await expect(zoom).toHaveValue(String(original.corridor.maxZoom));
  await scale.fill('2.5'); await scale.press('Tab');
  await zoom.fill('1.6'); await zoom.press('Tab');
  const edited = await read();
  expect(edited.floor).toEqual(original.floor);
  expect(edited.actor).toEqual(original.actor);
  expect(edited.corridor.maxScale).toBe(2.5);
  expect(edited.corridor.maxZoom).toBe(1.6);
  expect(edited.corridor.perspectiveSourceAreaId).toBeUndefined();
  await context.getByRole('button', { name: 'Undo', exact: true }).click();
  await context.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await read()).toEqual(original);
  await page.screenshot({ path: testInfo.outputPath('independent-area-perspective.png') });
});

test('Borin passes through .75, .625, .5, .375, .25 across the transition shape itself', async ({ page }, testInfo) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await openAdventure(page, true);
  const result = await page.evaluate(() => {
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep();
    const manifest = api.manifest;
    const area = manifest.scenes.village.layers.flatMap((l: any) => l.areas)
      .find((a: any) => a.pointlesh?.entityId === 'village.transition.to-forest');
    // This is the actual reported shape: only a small portion overlaps the
    // floor's old Y range (352–532). Most of it used to clamp straight to .25.
    area.vertices = [{id:'a',x:405,y:216},{id:'b',x:494,y:336},{id:'c',x:513,y:366},{id:'d',x:408,y:366}];
    Object.assign(area.pointlesh.properties, { minScale: .25, maxScale: .75, enabled: true,
      scaleRange: { start: 352, end: 532 }, zoomRange: { start: 352, end: 532 }, minZoom: 1, maxZoom: 1 });
    api.setManifest(manifest);
    const samples = [];
    // The shape's left edge is straight, so moving a tiny amount into the
    // polygon gives valid foot positions at every interpolation coordinate.
    for (const y of [366,328.5,291,253.5,216]) {
      const t = (y-216)/150, x = y === 216 ? 405 : 405+3*t;
      scene.character.place({x,y}); scene.binding.sync();
      samples.push({y, scale:scene.character.state.scale, width:scene.actor.displayWidth, height:scene.actor.displayHeight});
    }
    // Verify ordinary walking samples too, using the same library binding.
    scene.character.place({x:408,y:366}); scene.binding.sync();
    void scene.character.walkTo({x:405,y:216});
    const walking = [];
    for(let i=0;i<600 && scene.character.state.activity==='walking';i++) {
      scene.binding.update(20);
      const p=scene.character.state.position;
      walking.push({y:p.y, scale:scene.character.state.scale});
    }
    scene.scene.pause(); scene.game.loop.wake();
    return {samples, walking, finished:scene.character.state.activity!=='walking'};
  });
  expect(result.samples.map(p=>p.scale)).toEqual([.75,.625,.5,.375,.25]);
  for(const sample of result.samples) {
    expect(sample.width / result.samples[0].width).toBeCloseTo(sample.scale/.75,5);
    expect(sample.height / result.samples[0].height).toBeCloseTo(sample.scale/.75,5);
  }
  expect(result.finished).toBe(true);
  expect(result.walking.length).toBeGreaterThan(30);
  for(const sample of result.walking) expect(sample.scale).toBeCloseTo(.25+(sample.y-216)/150*.5,6);
  await page.screenshot({path:testInfo.outputPath('transition-scale-quarter-to-three-quarters.png')});
});
