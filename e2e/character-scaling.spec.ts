import { test, expect } from '@playwright/test';

test('character logical size stays stable across differently sized animation sources', async ({ page }, testInfo) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const results = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.sceneDesigner.designer.close(); scene.sys.pause();
    const records = [];
    for (const activity of ['idle', 'walking', 'speaking']) {
      scene.character.stop(); scene.character.finishSpeech(); scene.character.face('down');
      if (activity === 'walking') void scene.character.walkTo({x:471,y:480}, scene.walkables());
      if (activity === 'speaking') void scene.character.say('test', 5000);
      scene.binding.sync();
      const sprite = scene.actor;
      const clip = scene.aiRuntime.manifest.assets[sprite.texture.key].animations[0];
      const timing = clip.frameTimings?.[scene.character.state.animationFrame % clip.frames.length];
      records.push({ logicalWidth: sprite.displayWidth / (timing?.scaleX ?? 1), logicalHeight: sprite.displayHeight / (timing?.scaleY ?? 1), activity, texture:sprite.texture.key, width:sprite.width, height:sprite.height,
        scaleX:sprite.scaleX,scaleY:sprite.scaleY,displayWidth:sprite.displayWidth,displayHeight:sprite.displayHeight,
        filter:sprite.texture.source[0].scaleMode,smooth:sprite.texture.smoothPixelArt });
    }
    return records;
  });
  for (const result of results) {
    expect(result.logicalWidth).toBeCloseTo(results[0].logicalWidth, 5);
    expect(result.logicalHeight).toBeCloseTo(results[0].logicalHeight, 5);
    expect(result.filter).toBe(1);
  }
  await testInfo.attach('character-scale.json', {body:JSON.stringify(results,null,2),contentType:'application/json'});
});
