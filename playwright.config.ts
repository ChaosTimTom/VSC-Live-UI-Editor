import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  outputDir: '.cache/browser-tests',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5198',
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm --prefix webview-ui run preview -- --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: !process.env.CI,
  },
});
