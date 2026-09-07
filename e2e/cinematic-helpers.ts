import { expect, type Page } from '@playwright/test';

export type CinematicView = {
  kind: 'intro' | 'ending';
  stepIndex: number;
  elapsedMs: number;
  visible: boolean;
  cast: { id: string; x: number; y: number; visible: boolean }[];
};

export async function cinematicView(page: Page): Promise<CinematicView | undefined> {
  return page.evaluate(() => (window as unknown as {
    pointleshDemo: { scene: { cinematic?: { snapshot(): CinematicView } } };
  }).pointleshDemo.scene.cinematic?.snapshot());
}

export async function expectCastMotion(page: Page) {
  const before = await cinematicView(page);
  expect(before?.visible).toBe(true);
  expect(before?.cast.some(actor => actor.visible)).toBe(true);
  await expect.poll(async () => {
    const after = await cinematicView(page);
    return !!after && after.kind === before!.kind && after.stepIndex === before!.stepIndex && after.cast.some(actor => {
      const original = before!.cast.find(candidate => candidate.id === actor.id);
      return actor.visible && original?.visible && Math.hypot(actor.x - original.x, actor.y - original.y) > 2;
    });
  }, { message: 'An actual visible cutscene sprite must move while this shot plays', timeout: 3_000 }).toBe(true);
}

export async function expectCinematicCleanup(page: Page) {
  await expect.poll(() => cinematicView(page)).toBeUndefined();
  const remaining = await page.evaluate(() => {
    const scene = (window as unknown as { pointleshDemo: { scene: {
      children: { list: { name: string }[] };
      cameras: { cameras: { name: string }[] };
    } } }).pointleshDemo.scene;
    return {
      containers: scene.children.list.filter(child => child.name === 'pointlesh-cinematic').length,
      cameras: scene.cameras.cameras.filter(camera => camera.name === 'pointlesh-cinematic-camera').length,
    };
  });
  expect(remaining).toEqual({ containers: 0, cameras: 0 });
}
