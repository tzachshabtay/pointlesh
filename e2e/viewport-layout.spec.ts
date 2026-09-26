import { expect, test } from '@playwright/test';

test('game stays centered and every designer tab stays reachable after zoom and resize', async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const checkLayout = async () => {
    await expect.poll(() => page.evaluate(() => {
      const viewport = window.visualViewport!;
      const game = document.querySelector('.game-shell')!.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('[role="toolbar"] button')];
      return Math.abs(game.left + game.width / 2 - viewport.offsetLeft - viewport.width / 2) < 2
        && game.width <= viewport.width
        && tabs.length === 5 && tabs.every(tab => {
          const rect = tab.getBoundingClientRect();
          return rect.left >= viewport.offsetLeft && rect.right <= viewport.offsetLeft + viewport.width + 1
            && rect.top >= viewport.offsetTop && rect.bottom <= viewport.offsetTop + viewport.height + 1;
        });
    })).toBe(true);
  };
  await checkLayout();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
  await checkLayout();
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Toggle prefab designer', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await checkLayout();
  // Reproduce both a side-pane resize while zoomed and a normal narrow window.
  await page.setViewportSize({ width: 1100, height: 900 });
  await checkLayout();
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await page.setViewportSize({ width: 480, height: 900 });
  await checkLayout();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).press('Enter');
  const frame = () => page.evaluate(() => (window as any).pointleshDemo.scene.actor.frame.name);
  const before = await frame();
  await expect.poll(frame).not.toBe(before);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await checkLayout();
  // Close the floating panel before clicking the game control beneath it.
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.locator('#designer').click();
  await expect(page.getByRole('toolbar', { name: 'Game designer tools' })).toBeHidden();
  await page.locator('#designer').click();
  await checkLayout();
});
