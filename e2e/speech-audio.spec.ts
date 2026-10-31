import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('lock break plays at the cage animation tag', async ({ page }) => {
  await openAdventure(page);
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep(); scene.dismissSpeech();
    scene.story.introStep = 3; scene.story.endingStep = 0;
    scene.renderCutscene();
    const cues: any[] = [];
    const play = scene.audio.playSfx.bind(scene.audio);
    scene.audio.playSfx = (name: string) => {
      const sound = play(name);
      cues.push({ name, playing: sound?.isPlaying, key: sound?.key });
      if (name === 'lock-break' && sound) {
        const meter = scene.sound.context.createAnalyser(); meter.fftSize = 512;
        sound.volumeNode.connect(meter); (window as any).lockMeter = meter;
      }
      return sound;
    };
    for (let ms = 0; ms <= 4000; ms += 20) scene.cinematic.render(0, ms);
    return { cues, cage: scene.cinematic.doorBinding?.animation,
      pickaxe: scene.cinematic.cast.get('borin')?.binding?.animation };
  });
  expect(result.cues, JSON.stringify(result)).toEqual([expect.objectContaining({ name: 'lock-break', playing: true })]);
  await expect.poll(() => page.evaluate(() => {
    const meter = (window as any).lockMeter as AnalyserNode;
    const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  }), { intervals: [10, 20, 20], timeout: 2000 }).toBeGreaterThan(.001);
});

test('voiced speech finishes, rests for half a second, then advances without Continue', async ({ page }) => {
  await openAdventure(page);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.advanceCutscene(true);
  });
  await expect.poll(() => page.evaluate(() => !(window as any).pointleshDemo.scene.uncancellableAction())).toBe(true);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const line = Object.values(scene.aiRuntime.manifest.assets).find((a: any) => a.kind === 'voice-line' && a.voiceSettings?.voiceAssetId === 'voice.elder' && a.versions[a.activeVersion]?.file) as any;
    scene.say(line.voiceSettings.text, 'Elder Rowan', line.id);
    (window as any).speechTest = {};
    scene.interactionSound.once('complete', () => { (window as any).speechTest.ended = performance.now(); });
    const advance = scene.continueSpeech.bind(scene);
    scene.continueSpeech = () => { (window as any).speechTest.advanced = performance.now(); advance(); };
  });
  await expect(page.locator('#dialog')).toBeHidden({ timeout: 30000 });
  const timing = await page.evaluate(() => (window as any).speechTest);
  expect(timing.advanced - timing.ended).toBeGreaterThanOrEqual(450);
  expect(timing.advanced - timing.ended).toBeLessThan(1100);
  await page.evaluate(() => (window as any).pointleshDemo.scene.conversation.start('elder'));
  await expect(page.locator('#choices button')).toHaveCount(3, { timeout: 30000 });
  await expect(page.locator('#dialog-next')).toBeHidden();
  // Automatic advancement stops at choices rather than selecting one for the player.
  await page.waitForTimeout(700);
  await expect(page.locator('#choices button')).toHaveCount(3);
});
