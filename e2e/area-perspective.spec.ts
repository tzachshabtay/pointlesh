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
