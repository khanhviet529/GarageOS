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

/** Tiếp nhận một xe mới với loại động cơ cho trước, dừng ở trang chi tiết đơn */
async function intake(page: Page, powertrain: 'ICE' | 'HYBRID' | 'BEV', plate: string) {
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Vũ Thị Danh Mục');
  await page.getByLabel('Số điện thoại', { exact: false }).last()
    .fill(`093${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Loại động cơ').selectOption(powertrain);
  if (powertrain !== 'ICE') {
    await page.getByLabel('Dung lượng pin (kWh)').fill('42');
  }
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Lời khách mô tả').fill('Khách yêu cầu kiểm tra tổng thể trước chuyến đi xa');
  await page.getByLabel('Số km hiện tại').fill('15000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Hạng mục áp dụng cho xe này' })).toBeVisible();
}

test('🔒 INV-V-01: xe thuần điện không thấy hạng mục động cơ đốt trong', async ({ page }) => {
  const consoleErrors = watchConsole(page);
  await login(page);
  await intake(page, 'BEV', `29E-${Date.now().toString().slice(-5)}`);

  const catalog = page.locator('.card', { hasText: 'Hạng mục áp dụng cho xe này' });

  // Không có nghĩa là KHÔNG XUẤT HIỆN, không phải bị làm mờ
  await expect(catalog.getByText('SV-OIL-ENGINE')).toHaveCount(0);
  await expect(catalog.getByText('SV-SPARK-PLUG')).toHaveCount(0);
  await expect(catalog.getByText('Thay dầu động cơ và lọc dầu')).toHaveCount(0);

  // Hạng mục riêng của xe điện phải có, kèm chứng chỉ bắt buộc
  await expect(catalog.getByText('SV-CHARGE-PORT')).toBeVisible();
  await expect(catalog.getByText('Kiểm tra tình trạng pin cao áp (SoH)')).toBeVisible();
  await expect(catalog.getByText('An toàn điện cao áp').first()).toBeVisible();

  // Hạng mục dùng chung vẫn còn — xe điện vẫn có má phanh
  await expect(catalog.getByText('Thay má phanh')).toBeVisible();

  await shot(page, '13-danh-muc-xe-dien');
  expect(consoleErrors, 'giao diện phát sinh lỗi console').toEqual([]);
});

test('🔒 INV-V-01: xe hybrid thấy CẢ hạng mục động cơ LẪN hạng mục pin', async ({ page }) => {
  await login(page);
  await intake(page, 'HYBRID', `29H-${Date.now().toString().slice(-5)}`);

  const catalog = page.locator('.card', { hasText: 'Hạng mục áp dụng cho xe này' });
  // Ca dễ làm sai nhất: coi hybrid như "một loại xe điện" thì mất hết hạng mục
  // động cơ, mà xe hybrid vẫn có động cơ xăng thật.
  await expect(catalog.getByText('Thay dầu động cơ và lọc dầu')).toBeVisible();
  await expect(catalog.getByText('Kiểm tra tình trạng pin cao áp (SoH)')).toBeVisible();
  // Nhưng cổng sạc thì chỉ xe thuần điện mới có
  await expect(catalog.getByText('SV-CHARGE-PORT')).toHaveCount(0);

  await shot(page, '14-danh-muc-hybrid');
});

test('🔒 INV-V-01: xe xăng không thấy hạng mục hệ thống cao áp', async ({ page }) => {
  await login(page);
  await intake(page, 'ICE', `29X-${Date.now().toString().slice(-5)}`);

  const catalog = page.locator('.card', { hasText: 'Hạng mục áp dụng cho xe này' });
  await expect(catalog.getByText('Hệ thống cao áp')).toHaveCount(0);
  await expect(catalog.getByText('SV-HV-SOH')).toHaveCount(0);
  await expect(catalog.getByText('Thay dầu động cơ và lọc dầu')).toBeVisible();

  // Tiền công phải hiện thành số nguyên đồng, không có phần thập phân
  await expect(catalog.getByText('375.000đ').first()).toBeVisible();

  await shot(page, '15-danh-muc-xe-xang');
});
