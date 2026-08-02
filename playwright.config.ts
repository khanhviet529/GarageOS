import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  // 🔒 Một `test.only(...)` lỡ commit sẽ khiến CI chạy đúng 1 trong 17 kịch bản
  //    rồi báo xanh — và output chỉ nói "1 passed" nên không ai nhìn ra.
  forbidOnly: process.env.CI === 'true',
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  },
});
