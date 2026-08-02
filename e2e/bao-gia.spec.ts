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

async function login(page: Page) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();
}

/** Tiếp nhận một xe mới rồi mở màn lập báo giá */
async function intakeAndOpenQuotation(page: Page, powertrain: 'ICE' | 'BEV', plate: string) {
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Đặng Văn Báo Giá');
  await page.getByLabel('Số điện thoại', { exact: false }).last()
    .fill(`094${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Loại động cơ').selectOption(powertrain);
  if (powertrain !== 'ICE') await page.getByLabel('Dung lượng pin (kWh)').fill('42');
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Lời khách mô tả').fill('Khách yêu cầu bảo dưỡng và báo giá trước khi làm');
  await page.getByLabel('Số km hiện tại').fill('30000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });

  await page.getByRole('link', { name: 'Lập báo giá' }).click();
  await expect(page.getByRole('heading', { name: 'Lập báo giá' })).toBeVisible();
}

test('lập báo giá: chọn công + phụ tùng → tổng khớp → gửi khách → giá đóng băng', async ({ page }) => {
  const consoleErrors = watchConsole(page);
  await login(page);
  await intakeAndOpenQuotation(page, 'ICE', `36A-${Date.now().toString().slice(-5)}`);

  await page.getByRole('button', { name: 'Tạo báo giá mới' }).click();
  await expect(page.getByRole('heading', { name: 'Báo giá #1' })).toBeVisible();
  await shot(page, '16-bao-gia-rong');

  // --- Thêm hạng mục công ---
  // Panel bên phải là báo giá đang hình thành; bên trái là danh mục để chọn.
  // Phải khoanh vùng, nếu không tên hạng mục khớp ở cả hai bảng.
  const draft = page.locator('.card', { has: page.getByRole('heading', { name: 'Báo giá #1' }) });

  await page.getByRole('button', { name: 'Thêm Thay dầu động cơ và lọc dầu' }).click();
  // `exact` là bắt buộc: ô chứa nút xoá có tên trợ năng "Bỏ <tên hạng mục>",
  // nên tìm không chính xác sẽ khớp hai ô.
  await expect(
    draft.getByRole('cell', { name: 'Thay dầu động cơ và lọc dầu', exact: true }),
  ).toBeVisible();

  // --- Thêm phụ tùng, gắn vào hạng mục công vừa thêm ---
  await page.getByRole('button', { name: /Phụ tùng \(/ }).click();
  await page.getByLabel('Gắn vào hạng mục công').selectOption({ label: 'Thay dầu động cơ và lọc dầu' });
  await page.getByRole('button', { name: 'Thêm Dầu động cơ 5W-30 (1 lít)' }).click();

  // Dòng phụ tùng phải hiện thụt vào dưới dòng công cha
  await expect(draft.getByText('↳')).toBeVisible();

  // 0,8h × 250.000 = 200.000, +10% = 220.000
  // 1 lít × 185.000 = 185.000, +10% = 203.500
  // Tổng cộng: 220.000 (công) + 203.500 (dầu) = 423.500
  await expect(draft.getByText('423.500đ')).toBeVisible();
  await shot(page, '17-bao-gia-da-chon');

  // --- Gửi khách ---
  await page.getByRole('button', { name: 'Gửi khách duyệt' }).click();
  await expect(page.getByText('Đã gửi khách')).toBeVisible({ timeout: 15_000 });

  // 🔒 INV-Q-05: gửi rồi thì không còn bảng chọn để sửa nữa
  await expect(page.getByRole('button', { name: 'Gửi khách duyệt' })).toHaveCount(0);
  await expect(page.getByText(/Có hiệu lực đến/)).toBeVisible();
  await shot(page, '18-bao-gia-da-gui');

  expect(consoleErrors, 'giao diện phát sinh lỗi console').toEqual([]);
});

test('🔒 INV-V-01: màn lập báo giá xe điện không chào bán hạng mục động cơ', async ({ page }) => {
  await login(page);
  await intakeAndOpenQuotation(page, 'BEV', `36E-${Date.now().toString().slice(-5)}`);
  await page.getByRole('button', { name: 'Tạo báo giá mới' }).click();
  await expect(page.getByRole('heading', { name: 'Báo giá #1' })).toBeVisible();

  // Hạng mục động cơ không có mặt để mà bấm nhầm
  await expect(page.getByRole('button', { name: /Thêm Thay dầu động cơ/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Thêm Kiểm tra tình trạng pin cao áp/ })).toBeVisible();

  await page.getByRole('button', { name: /Thêm Kiểm tra tình trạng pin cao áp/ }).click();
  // 1,5h × 250.000 = 375.000, +10% = 412.500
  // Hiện ở cả cột thành tiền lẫn dòng tổng cộng
  await expect(page.getByText('412.500đ').first()).toBeVisible();
  await shot(page, '19-bao-gia-xe-dien');
});

test('báo giá rỗng không gửi được', async ({ page }) => {
  await login(page);
  await intakeAndOpenQuotation(page, 'ICE', `36B-${Date.now().toString().slice(-5)}`);
  await page.getByRole('button', { name: 'Tạo báo giá mới' }).click();
  await expect(page.getByRole('button', { name: 'Gửi khách duyệt' })).toBeDisabled();
});
