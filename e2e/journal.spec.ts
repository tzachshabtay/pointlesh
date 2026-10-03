import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

const notes = [
  'King Aldric was taken east. Find a way into the orc camp.',
  'Mara says dreamcaps grow in the wood. Mix one with honey stout to make a sleeping draught.',
  'Orrin’s secret: the tool chest opens to “Stone remembers.”',
  'Mara sold me honey stout. Orcs love its smell.',
  'The dreamcap stout is ready. Add it to the camp’s cauldron while the guard looks away.',
  'The runed chest yielded a pickaxe. It should break the king’s lock.',
  'Grub drank the doctored stew. His snores are shaking the palisade.',
  'Grub is securely tied up. Even if the lock wakes him, he cannot stop us.',
];

for (const width of [1440, 390]) test(`handwritten journal pages remain readable at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await openAdventure(page);
  await page.evaluate(notes => {
    const scene = (window as any).pointleshDemo.scene, save = scene.snapshot();
    save.cutscene = { introVersion: 2, introStep: 3, endingStep: -1 };
    save.extensions.journal = notes; scene.restore(save);
  }, notes);
  const stageBefore = await page.locator('.stage-wrap').boundingBox();
  await page.locator('#journal').click();
  await expect(page.getByRole('dialog', { name: 'Borin’s field notes' })).toHaveClass(/journal-modal/);
  await expect(page.locator('.journal-note')).toHaveCount(6);
  for (const note of notes.slice(0, 6)) await expect(page.locator('.journal-notes')).toContainText([note]);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('.journal-note p').first().evaluate(node => getComputedStyle(node).fontFamily)).toContain('Borin Hand');
  expect(await page.evaluate(() => document.fonts.check('26px "Borin Hand"'))).toBe(true);
  const bounds = await page.locator('.journal-modal').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(await page.locator('.journal-modal').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`journal-${width}.png`) });
  await page.getByRole('button', { name: 'Later notes' }).click();
  await expect(page.locator('.journal-note')).toHaveCount(2);
  await expect(page.locator('#modal-body')).toContainText('Pages 3–4 of 4');
  await expect(page.locator('#modal-body')).toContainText(notes[7]!);
  await page.getByRole('button', { name: 'Earlier notes' }).click();
  await expect(page.locator('.journal-note')).toHaveCount(6);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.locator('.stage-wrap').boundingBox()).toEqual(stageBefore);
  await page.locator('#map').click();
  await expect(page.getByRole('dialog')).not.toHaveClass(/journal-modal/);
  await expect(page.locator('.map-grid')).toBeVisible();
});

test('a learned clue plays the generated quill, fades away and is not replayed on load', async ({ page }, testInfo) => {
  await openAdventure(page);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene, save = scene.snapshot();
    save.cutscene = { introVersion: 2, introStep: 3, endingStep: -1 }; scene.restore(save);
    scene.changeRoom('pub', false); scene.applyInteraction('innkeeper');
  });
  await page.locator('#dialog-next').click();
  await page.getByRole('button', { name: 'How do I get past an orc guard?' }).click();
  const notice = page.locator('#journal-notification'), quill = notice.locator('canvas');
  await expect(notice).toBeVisible();
  await expect(page.locator('#clue-dot')).toBeVisible();
  await expect(quill).toHaveAttribute('data-asset-id', 'journal.quill');
  await expect(quill).toHaveAttribute('data-state', 'write');
  await expect.poll(() => quill.getAttribute('data-frame')).not.toBe('0');
  await expect(notice).toContainText(notes[1]!);
  const fade = await notice.evaluate(node => {
    const animation = node.getAnimations()[0]!;
    return { duration: animation.effect!.getTiming().duration, frames: (animation.effect as KeyframeEffect).getKeyframes().map(frame => frame.opacity) };
  });
  expect(fade).toEqual({ duration: 3600, frames: ['0', '1', '1', '0'] });
  await page.screenshot({ path: testInfo.outputPath('new-note-quill.png') });
  await expect(notice).toBeHidden({ timeout: 6000 });
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.render(); });
  await expect(notice).toBeHidden();
  await page.locator('#journal').click();
  await expect(page.locator('.journal-note')).toHaveCount(2);
  await expect(page.locator('#clue-dot')).toBeHidden();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.restore(scene.snapshot()); });
  await expect(notice).toBeHidden();
  await expect(page.locator('#clue-dot')).toBeHidden();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.story.journal)).toEqual(notes.slice(0, 2));
});
