import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, caret: 'initial' });
}

function watchConsole(page: Page): string[] {
  const errs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}

/**
 * ⭐ Kịch bản demo của toàn dự án, chạy thật đầu-cuối:
 * tiếp nhận xe → lập báo giá 2 hạng mục → mở link như khách trên điện thoại →
 * duyệt 1 trong 2 → thấy trạng thái đổi ở cả hai phía.
 */
test('⭐ demo đầu-cuối: tiếp nhận → báo giá → khách duyệt từng phần trên điện thoại', async ({
  browser,
}) => {
  // --- Phía nhân viên: máy tính ở quầy ---
  const staff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await staff.newPage();
  const consoleErrors = watchConsole(page);

  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();

  const plate = `30K-${Date.now().toString().slice(-5)}`;
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Bùi Thị Khách Hàng');
  await page.getByLabel('Số điện thoại', { exact: false }).last()
    .fill(`098${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Hãng').fill('Toyota');
  await page.getByLabel('Dòng xe').fill('Vios');
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Lời khách mô tả')
    .fill('Xe kêu ở phanh khi đạp, điều hoà thổi yếu hơn trước');
  await page.getByLabel('Số km hiện tại').fill('45000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });

  // Lấy link tra cứu để đưa cho khách
  const trackingUrl = await page.locator('input[readonly].mono').inputValue();
  expect(trackingUrl).toContain('/tra-cuu/');

  // --- Lập báo giá 2 hạng mục ---
  await page.getByRole('link', { name: 'Lập báo giá' }).click();
  await page.getByRole('button', { name: 'Tạo báo giá mới' }).click();
  await expect(page.getByRole('heading', { name: 'Báo giá #1' })).toBeVisible();

  await page.getByRole('button', { name: 'Thêm Thay má phanh' }).click();
  await page.getByRole('button', { name: 'Thêm Vệ sinh hệ thống điều hoà' }).click();

  await page.getByRole('button', { name: /Phụ tùng \(/ }).click();
  await page.getByLabel('Gắn vào hạng mục công').selectOption({ label: 'Thay má phanh' });
  await page.getByRole('button', { name: 'Thêm Má phanh trước (bộ)' }).click();

  await page.getByRole('button', { name: 'Gửi khách duyệt' }).click();
  await expect(page.getByText('Đã gửi khách')).toBeVisible({ timeout: 15_000 });
  await shot(page, '20-demo-bao-gia-da-gui');

  // --- Phía khách: điện thoại ---
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  const mobileErrors = watchConsole(mobile);

  await mobile.goto(trackingUrl);
  await expect(mobile.getByText('Garage Thành Công')).toBeVisible();
  await expect(mobile.getByText('Xe kêu ở phanh khi đạp, điều hoà thổi yếu hơn trước')).toBeVisible();
  await shot(mobile, '21-demo-khach-mo-link');

  // 🔒 INV-Q-02: phụ tùng nằm trong hạng mục công, KHÔNG có công tắc riêng.
  //    Hai hạng mục công -> đúng 2 cặp nút Đồng ý/Không, không phải 3.
  await expect(mobile.getByRole('button', { name: 'Đồng ý' })).toHaveCount(2);
  await expect(mobile.getByText('Má phanh trước (bộ)')).toBeVisible();

  // Chưa chọn đủ thì chưa xác nhận được
  await expect(mobile.getByRole('button', { name: 'Xác nhận lựa chọn' })).toBeDisabled();

  // Khách: phanh thì làm, điều hoà để lần sau — đúng tình huống BC-02
  const brakeRow = mobile.locator('.choices li', { hasText: 'Thay má phanh' });
  const acRow = mobile.locator('.choices li', { hasText: 'Vệ sinh hệ thống điều hoà' });
  await brakeRow.getByRole('button', { name: 'Đồng ý' }).click();
  await acRow.getByRole('button', { name: 'Không' }).click();

  // Tổng phần đã chọn phải cập nhật NGAY khi bấm, không đợi xác nhận:
  // 412.500 (công thay má phanh) + 935.000 (bộ má phanh) = 1.347.500
  const selectedRow = mobile.locator('tr.grand.selected', { hasText: 'Phần bạn chọn' });
  await expect(selectedRow).toBeVisible();
  await expect(selectedRow.getByRole('cell', { name: '1.347.500đ' })).toBeVisible();
  await shot(mobile, '22-demo-khach-chon');

  await mobile.getByRole('button', { name: 'Xác nhận lựa chọn' }).click();

  // Mã xác thực — bản chạy thử hiện mã ngay trên màn hình
  await expect(mobile.getByText(/Mã xác thực đã gửi tới số/)).toBeVisible();
  const code = await mobile.locator('.alert.info strong.mono').innerText();
  expect(code).toMatch(/^\d{6}$/);
  await shot(mobile, '23-demo-nhap-otp');

  await mobile.getByLabel('Nhập mã 6 chữ số').fill(code);
  await mobile.getByRole('button', { name: 'Xác nhận', exact: true }).click();

  await expect(mobile.getByText('Đã ghi nhận phản hồi của bạn.')).toBeVisible({ timeout: 15_000 });
  // `exact` vì dòng tổng cũng có chữ "Bạn đã đồng ý"
  await expect(mobile.getByText('Đã đồng ý', { exact: true })).toBeVisible();
  await expect(mobile.getByText('Đã từ chối', { exact: true })).toBeVisible();
  await expect(mobile.getByText('Khách duyệt một phần')).toBeVisible();
  await shot(mobile, '24-demo-khach-da-duyet');

  // --- Quay lại phía nhân viên: trạng thái phải đã đổi ---
  await page.reload();
  await expect(page.getByText('Khách duyệt một phần')).toBeVisible({ timeout: 15_000 });
  // Hạng mục bị từ chối hiện gạch ngang, không biến mất — lần sau còn chào lại
  await expect(page.locator('tr.rejected')).toHaveCount(1);
  await shot(page, '25-demo-nhan-vien-thay-ket-qua');

  expect(consoleErrors, 'giao diện nhân viên phát sinh lỗi console').toEqual([]);
  expect(mobileErrors, 'giao diện khách phát sinh lỗi console').toEqual([]);

  await staff.close();
  await phone.close();
});

test('link tra cứu sai không lộ thông tin gì', async ({ page }) => {
  await page.goto(`/tra-cuu/${'z'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: 'Không mở được trang' })).toBeVisible();
  await expect(page.getByText(/không hợp lệ|hết hiệu lực/)).toBeVisible();
});
