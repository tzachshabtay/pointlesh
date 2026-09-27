import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stablePreview } from '../demos/forest/scripts/stable-preview';

let server: ViteDevServer, cache: string, base: string;
test.beforeAll(async () => {
  cache = await mkdtemp(join(tmpdir(), 'pointlesh-stable-preview-'));
  server = await createServer({ configFile: false, root: resolve('demos/forest'),
    cacheDir: cache, base: './', plugins: [stablePreview()], logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await server.listen();
  base = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
});
test.afterAll(async () => { await server.close(); await rm(cache, { recursive: true, force: true }); });

test('an authoring session survives suspension, reconnect, file notifications and server restart', async ({ page, context }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  const errors: string[] = [], sockets: string[] = [];
  let navigations = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => sockets.push(socket.url()));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto(base + '/?designer=1');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Designer', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Game designer tools' })).toBeVisible();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.character.place({ x: 600, y: 470 });
    scene.story.flags.reconnectProbe = true;
    (window as any).documentIdentity = 'same-session';
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await context.setOffline(true);
  server.watcher.emit('change', resolve('demos/forest/public/authoring/assets.json'));
  server.ws.send({ type: 'full-reload', path: '*' });
  await server.restart();
  await context.setOffline(false);
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await page.waitForTimeout(1500); // The old client reloads after its first successful reconnect ping.
  expect(navigations).toBe(1);
  expect(sockets).toEqual([]);
  await expect(page.locator('#start-screen')).toBeHidden();
  expect(await page.evaluate(() => ({ id: (window as any).documentIdentity,
    flag: (window as any).pointleshDemo.scene.story.flags.reconnectProbe,
    position: (window as any).pointleshDemo.scene.character.state.position }))).toEqual({
      id: 'same-session', flag: true, position: { x: 600, y: 470 } });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  // A deliberate refresh still starts at the menu; there is no implicit save/load.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeEnabled();
  await expect(page.locator('#start-screen')).toBeVisible();
});
