import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('new authored hotspots show their labels and conversation topics return without repeating greetings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  await page.locator('#skip-intro').click();
  await expect(page.locator('body')).not.toHaveClass(/cinematic-playing/);
  await page.waitForFunction(() => {
    const s = (window as any).pointleshDemo.scene;
    return !s.cutsceneCrossfade && !s.roomTransition?.active && s.introArrival !== 'walking';
  });
  await page.evaluate(() => (window as any).pointleshDemo.scene.continueSpeech());
  const pointer = await page.evaluate(() => {
    const demo = (window as any).pointleshDemo, s = demo.scene, manifest = demo.manifest;
    const layer = manifest.scenes.village.layers[0];
    const area = structuredClone(layer.areas.find((a:any) => a.pointlesh?.kind === 'hotspot'));
    area.id = 'test-well-area'; area.pointlesh.entityId = 'test-well'; area.pointlesh.name = 'Village well';
    area.pointlesh.properties = { enabled:true, interactive:true, label:'Village well' };
    area.vertices = [{id:'a',x:530,y:310},{id:'b',x:580,y:310},{id:'c',x:580,y:370},{id:'d',x:530,y:370}];
    layer.areas = layer.areas.filter((a:any) => a.pointlesh?.kind !== 'hotspot');
    layer.areas.push(area); demo.setManifest(manifest); s.dismissSpeech();
    const c = s.cameras.main, point = c.matrix.transformPoint(555-c.scrollX,340-c.scrollY);
    const rect = s.game.canvas.getBoundingClientRect();
    return { x:rect.left+point.x*rect.width/s.scale.gameSize.width, y:rect.top+point.y*rect.height/s.scale.gameSize.height };
  });
  await page.mouse.move(pointer.x,pointer.y);
  await expect(page.locator('#hover-label')).toHaveText('Village well');
  await expect(page.locator('#hover-label')).toHaveClass('visible');
  await page.locator('#hotspots').click();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.labels.map((label: any) => label.text))).toContain('Village well');
  await page.evaluate(() => { const s=(window as any).pointleshDemo.scene; s.story.inventory=['coin']; s.selected='coin'; s.hover('test-well'); });
  await expect(page.locator('#hover-label')).toHaveText('Use Copper coin with Village well');
  await page.evaluate(() => { const s=(window as any).pointleshDemo.scene; s.selected=undefined; s.applyInteraction('elder'); });
  const finishReply = () => page.evaluate(() => {
    const s=(window as any).pointleshDemo.scene;
    for(let n=0;n<50 && s.conversation.current()?.type==='line';n++) s.continueSpeech();
  });
  await finishReply();
  await expect(page.locator('#choices button')).toHaveCount(3);
  await page.locator('#choices button').first().click();
  await finishReply();
  await expect(page.locator('#choices button')).toHaveCount(3);
  await page.locator('#choices button').nth(1).click();
  await finishReply();
  await expect(page.locator('#choices button')).toHaveCount(4);
  await expect(page.locator('#choices')).toContainText('What was my father like?');
  await page.locator('#choices button').last().click();
  await finishReply();
  await expect(page.locator('#dialog')).toBeHidden();
  expect(errors).toEqual([]);
});
