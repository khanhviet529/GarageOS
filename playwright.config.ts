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
    /*
     * 🔒 Ghim múi giờ, đừng để nó theo máy chạy test.
     *
     * Lịch xưởng vẽ ô theo `new Date(plannedStart).getHours()` — tức GIỜ TRÌNH
     * DUYỆT. Còn seed đặt việc theo `branch.timezone` (Asia/Ho_Chi_Minh), vì
     * ngày làm việc của một xưởng là ngày ở nơi xưởng đứng.
     *
     * Hai cái đó trùng nhau trên máy dev ở Việt Nam và LỆCH 7 TIẾNG trên CI
     * (UTC). Việc xếp lúc 8h sáng thành 1h sáng, rơi ra ngoài khung 7–18h, ô
     * lịch rỗng — và bài test tìm nút "Kiểm tra" đỏ với thông báo không nói gì
     * về múi giờ.
     *
     * Ghim vào giờ Việt Nam vì đó là thực tế của sản phẩm: một tiệm sửa xe ở
     * Việt Nam, `docs/00-vision.md` đã gạch "đa ngôn ngữ / đa tiền tệ" khỏi
     * phạm vi. Test chạy ở đâu cũng phải thấy đúng cái người dùng thấy.
     *
     * ⚠️ Nhưng việc lịch xưởng đọc giờ TRÌNH DUYỆT thay vì giờ CHI NHÁNH vẫn là
     *    một giả định chưa được enforce — đã ghi vào phần nợ kỹ thuật của
     *    STATUS.md. Ghim ở đây làm CI tất định, không làm giả định đó biến mất.
     */
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
});
