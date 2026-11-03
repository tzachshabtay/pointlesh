import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('Borin reaches for a collected item, then uses upright back-facing speech for dialogue', async ({ page }) => {
  await openAdventure(page);
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const pickup = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('house', false);
    scene.applyInteraction('coin');
    scene.binding.sync();
    return { animation: scene.actor.anims.currentAnim?.key, text: document.querySelector('#speech')?.textContent,
      inventory: [...scene.story.inventory] };
  });
  expect(pickup.inventory).toContain('coin');
  expect(pickup.text).toContain('copper');
  expect(pickup.animation).toContain('borin.pick-up-back');

  const speech = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.dismissSpeech();
    scene.character.face('up');
    scene.say('I can speak without reaching for another item.');
    scene.binding.sync();
    return scene.actor.anims.currentAnim?.key;
  });
  expect(speech).toContain('borin.speak-back');
});

test('walking into the guarded encampment speaks the warning as Borin', async ({ page }) => {
  await openAdventure(page);
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const click = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('camp');
    if (!scene.campRestricted()) throw new Error('Camp should be restricted while the guard is awake');
    const canvas = scene.game.canvas, bounds = canvas.getBoundingClientRect();
    for (const y of [200, 260, 320, 380, 440]) for (const x of [200, 360, 500, 700]) {
      const world = scene.cameras.main.getWorldPoint(x, y);
      if (!scene.hit(world.x, world.y)) return { x: bounds.left + x * bounds.width / canvas.width,
        y: bounds.top + y * bounds.height / canvas.height };
    }
    throw new Error('No empty camp ground found');
  });
  await page.mouse.click(click.x, click.y);
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#speaker')).toHaveText('Borin');
  await expect(page.locator('#speech')).toContainText('I need to keep hidden.');
});

test('Borin exposes both animations in the asset designer', async ({ page }) => {
  await openAdventure(page, true);
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.getByRole('button', { name: /Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
  await page.getByRole('button', { name: 'Borin', exact: true }).click();
  const animation = page.locator('.ai-game-assets-designer__animation-select');
  await expect(animation.locator('option[value="borin.speak-back"]')).toHaveText('Speak · back');
  await expect(animation.locator('option[value="borin.pick-up-back"]')).toHaveText('Pick up · back');
  const image = page.locator('.ai-game-assets-designer__current-image');
  await animation.selectOption('borin.speak-back');
  await expect(image).toHaveAttribute('src', /borin\.speak-back\.generated-20261102\.png/);
  await animation.selectOption('borin.pick-up-back');
  await expect(image).toHaveAttribute('src', /borin\.speak-back\.promoted-1790475721109\.png/);
});
