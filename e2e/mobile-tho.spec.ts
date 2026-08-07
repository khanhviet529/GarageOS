import { test, expect } from '@playwright/test';

/**
 * Phase 4 — app thợ, kiểm chứng qua bản web của Expo.
 *
 * ⚠️ Đây KHÔNG phải thiết bị thật. `expo start --web` chạy cùng mã nguồn React
 * Native qua `react-native-web`, nên nó xác nhận được logic, luồng dữ liệu và
 * phân quyền — nhưng KHÔNG xác nhận được cử chỉ chạm, quyền camera, hay cách
 * app cư xử khi mất mạng giữa chừng.
 *
 * Việc chạy trên máy thật cần một tài khoản Expo và một chiếc điện thoại; xem
 * `apps/mobile/README.md`.
 */

const MOBILE = 'http://localhost:3002';

async function dangNhap(page: import('@playwright/test').Page, phone: string): Promise<void> {
  await page.goto(MOBILE);
  await expect(page.getByText('Ứng dụng kỹ thuật viên')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('thợ đăng nhập và thấy việc được giao hôm nay', async ({ page }) => {
  await dangNhap(page, '0901000007');
  await expect(page.getByText('Việc hôm nay')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Vũ Đình Thợ Mới')).toBeVisible();

  // Seed dựng sẵn việc cho thợ này (xem infra/seed.ts). `.first()` vì một
  // chiếc xe có thể có nhiều hạng mục trong ngày.
  await expect(page.getByText('30A12345').first()).toBeVisible();

  // Giờ công tải sau danh sách — khẳng định nó THẬT SỰ hiện ra, nếu không thì
  // thợ không biết mình đã làm bao lâu so với định mức.
  await expect(page.getByText(/Đã làm .* định mức/).first()).toBeVisible({ timeout: 20_000 });
});

test('🔒 vai KHÔNG phải thợ bị chặn ngay ở màn đăng nhập', async ({ page }) => {
  /*
   * Không phải vì bảo mật — API đã chặn từng endpoint. Mà vì app này chỉ có
   * màn hình cho thợ: một cố vấn đăng nhập vào sẽ thấy giao diện trống rỗng và
   * tưởng hệ thống hỏng. Nói rõ ngay còn hơn để họ đoán.
   */
  await dangNhap(page, '0901000003'); // cố vấn dịch vụ
  await expect(page.getByText(/dành cho kỹ thuật viên/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Việc hôm nay')).toHaveCount(0);
});

test('🔒 job card KHÔNG hiện bất kỳ số tiền nào', async ({ page }) => {
  /*
   * docs/02 mục 2.3. Chốt chặn thật nằm ở API (`tho-khong-thay-tien.spec.ts`
   * quét mọi endpoint), nhưng màn hình cũng phải không tự bịa ra số tiền từ dữ
   * liệu khác — ví dụ nhân giờ với một đơn giá cứng trong mã nguồn.
   *
   * Quét TOÀN BỘ chữ trên màn hình tìm dấu hiệu tiền tệ Việt Nam.
   */
  await dangNhap(page, '0901000007');
  await expect(page.getByText('Việc hôm nay')).toBeVisible({ timeout: 20_000 });

  const chu = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  // "đ" đứng sau chữ số, hoặc nhóm nghìn kiểu 1.234.567 / 1,234,567
  const dauHieuTien = /\d\s?đ\b|\d{1,3}([.,]\d{3}){2,}/;
  expect(
    dauHieuTien.test(chu),
    `Màn hình thợ hiện số tiền — docs/02 mục 2.3 cấm. Nội dung: ${chu.slice(0, 300)}`,
  ).toBe(false);
});

test('bấm giờ: bắt đầu rồi tạm dừng có lý do', async ({ page }) => {
  await dangNhap(page, '0901000007');
  await expect(page.getByText('Việc hôm nay')).toBeVisible({ timeout: 20_000 });

  // Seed luôn dựng sẵn một việc CHỜ LÀM cho thợ này, nên chờ nút hiện ra thay
  // vì `test.skip` — lỗi "test tự bỏ qua chính thứ nó kiểm" đã mắc ba lần.
  const batDau = page.getByRole('button', { name: 'Bắt đầu' }).first();
  await expect(batDau).toBeVisible({ timeout: 20_000 });
  await batDau.click();
  await expect(page.getByRole('button', { name: 'Tạm dừng' }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Tạm dừng BẮT BUỘC chọn lý do — thời gian chờ phải phân loại được, đó là
  // dữ liệu duy nhất trả lời "xe nằm lâu vì ai" (báo cáo 6.2)
  await page.getByRole('button', { name: 'Tạm dừng' }).first().click();
  await expect(page.getByText('Tạm dừng vì')).toBeVisible();
  await page.getByRole('button', { name: 'Chờ phụ tùng' }).click();

  await expect(page.getByRole('button', { name: 'Bắt đầu' }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('🔒 BR-02-2: thợ báo phát sinh, KHÔNG có ô nhập giá nào', async ({ page }) => {
  /*
   * Thợ ĐỀ XUẤT, cố vấn mới lập báo giá. Màn hình này không được có chỗ nào
   * nhập tiền — và danh mục lấy về cũng đã bị API lược sạch giá bán
   * (`catalog:readPrice`), nên thợ không suy ra được giá từ đó.
   */
  await dangNhap(page, '0901000007');
  await expect(page.getByText('Việc hôm nay')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Báo phát sinh' }).first().click();

  // React Native không sinh thẻ `heading` — nhận diện màn hình bằng chữ đặc
  // trưng của nó, không bằng vai trợ năng vốn chỉ tồn tại trên HTML.
  await expect(page.getByText('Mô tả cho cố vấn')).toBeVisible({ timeout: 20_000 });
  // Danh mục hạng mục phải nạp được — thợ cần nó để đề xuất
  await expect(page.getByText('Cần làm thêm gì')).toBeVisible();

  const chu = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(
    /\d\s?đ\b|\d{1,3}([.,]\d{3}){2,}/.test(chu),
    'màn báo phát sinh hiện số tiền — BR-02-2 tách người phát hiện khỏi người định giá',
  ).toBe(false);
});

test('🔒 BR-07-5: thợ chọn việc nào bị chặn, không mặc định chặn hết', async ({ page }) => {
  await dangNhap(page, '0901000007');
  await expect(page.getByText('Việc hôm nay')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Báo phát sinh' }).first().click();

  await expect(
    page.getByText(/Việc nào không làm tiếp được/),
  ).toBeVisible();

  // Câu giải thích phải nói rõ hệ quả của việc KHÔNG tích — nếu không, thợ sẽ
  // tích hết cho "an toàn" và cả xưởng dừng vì một phát sinh
  await expect(page.getByText(/Việc không tích vẫn chạy bình thường/)).toBeVisible();

  // Đúng MỘT ô được tích sẵn: chính việc đang làm
  const daTich = page.getByText('☑', { exact: false });
  expect(await daTich.count()).toBe(1);
});
