import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory tests/e2e/fixtures',
    url: 'http://127.0.0.1:4173/article.html',
    reuseExistingServer: true,
  },
});
