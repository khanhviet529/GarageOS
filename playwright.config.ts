import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 🔒 Seed lại trước mỗi lượt — xem `e2e/global-setup.ts` để biết vì sao
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  // 🔒 Một `test.only(...)` lỡ commit sẽ khiến CI chạy đúng 1 trong 17 kịch bản
  //    rồi báo xanh — và output chỉ nói "1 passed" nên không ai nhìn ra.
  forbidOnly: process.env.CI === 'true',
  workers: 1,
  /*
   * 🔒 Trên CI thêm reporter `github` — không phải để cho đẹp.
   *
   * Reporter `list` in ra stdout, mà log của GitHub Actions **cần token mới đọc
   * được**. Nên khi E2E đỏ trên CI, thứ duy nhất nhìn thấy từ bên ngoài là
   * "Process completed with exit code 1" — không tên bài, không thông điệp,
   * không dòng nào.
   *
   * Reporter `github` phát ra `::error file=…,line=…::` và GitHub biến chúng
   * thành **annotation của check-run**, mà annotation thì đọc được công khai
   * qua API. Một lần đỏ trở thành một câu trả lời thay vì một câu hỏi.
   *
   * 💡 Đã mất một buổi dựng lại toàn bộ điều kiện CI ở máy local chỉ để đoán
   *    xem bài nào đỏ. Ba dòng cấu hình này đáng lẽ tiết kiệm được cả buổi đó.
   */
  reporter: process.env.CI === 'true' ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  },
});
