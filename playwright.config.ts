import { defineConfig } from '@playwright/test';

const channel =
  process.env.PLAYWRIGHT_CHANNEL ??
  (process.env.CI ? undefined : process.platform === 'win32' ? 'chrome' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    ...(channel ? { channel } : {}),
  },
  webServer: {
    command: 'pnpm --filter @gitstory/web preview --port 4175 --host 127.0.0.1',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
