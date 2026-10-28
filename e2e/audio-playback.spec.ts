import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('starting the game loads recordings and produces a non-silent Web Audio output', async ({ page }) => {
  await openAdventure(page);
  await expect.poll(() => page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    return Object.keys(scene.aiRuntime.manifest.assets).filter(id => id.startsWith('music.') || id.startsWith('ambience.') || id.startsWith('step.'))
      .filter(id => scene.cache.audio.exists(scene.aiRuntime.key(id))).length;
  })).toBe(23);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.sound.context.state)).toBe('running');
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const meter = scene.sound.context.createAnalyser();
    meter.fftSize = 2048;
    scene.sound.masterVolumeNode.connect(meter);
    (window as any).audioTestMeter = meter;
  });
  const energy = () => page.evaluate(() => {
    const meter = (window as any).audioTestMeter as AnalyserNode;
    const samples = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  });
  // Checks real decoded sound reaching the output, not just a playing flag or HTTP 200.
  await expect.poll(energy).toBeGreaterThan(.00001);
  await page.evaluate(() => (window as any).pointleshDemo.scene.audio.setEnabled(false));
  await expect.poll(energy).toBeLessThan(.000001);
  await page.evaluate(() => (window as any).pointleshDemo.scene.audio.setEnabled(true));
  await expect.poll(energy).toBeGreaterThan(.00001);
  await page.evaluate(() => {
    (window as any).pointleshDemo.scene.sound.masterVolumeNode.disconnect((window as any).audioTestMeter);
  });
});
