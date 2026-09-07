import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5186',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}),
  },
  webServer: {
    command: 'npm run dev --workspace pointlesh-forest-demo -- --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
