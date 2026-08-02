import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  },
});
