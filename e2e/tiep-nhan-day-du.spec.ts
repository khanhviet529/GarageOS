import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

/**
 * Chụp màn hình với `caret: 'initial'`.
 *
 * Mặc định Playwright chèn `style="caret-color: transparent"` vào các ô nhập để
 * ảnh chụp ổn định. Nếu ảnh được chụp TRƯỚC khi React hydrate, thuộc tính chèn
 * thêm đó làm React báo hydration mismatch — và bộ chặn lỗi console của ta bắt
 * đúng cái nhiễu do chính công cụ test tạo ra.
 */
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

/**
 * Về màn tiếp nhận và CHỜ HYDRATE XONG.
 *
 * Tên người dùng ở thanh trên do useEffect vẽ, nên nó là mốc chắc chắn React đã
 * gắn xong sự kiện. Gõ trước mốc này thì input được điều khiển bởi React sẽ bị
 * đặt lại rỗng khi hydrate — test trông như lỗi ngẫu nhiên.
 */
async function gotoIntake(page: Page) {
  await page.getByRole('link', { name: 'Tiếp nhận xe' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tra cứu biển số' })).toBeVisible();
}

/** Tạo khách + xe mới rồi dừng ở form tiếp nhận */
async function createVehicle(page: Page, plate: string) {
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Phạm Văn Chủ Xe');
  await page.getByLabel('Số điện thoại', { exact: false }).last()
    .fill(`096${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Hãng').fill('Mazda');
  await page.getByLabel('Dòng xe').fill('CX-5');
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });
}

test('tiếp nhận đầy đủ: mô tả, số km, tài sản → tạo đơn → xem chi tiết → thấy trong xưởng', async ({ page }) => {
  const consoleErrors = watchConsole(page);
  await login(page);

  const plate = `60B-${Date.now().toString().slice(-5)}`;
  await createVehicle(page, plate);

  await expect(page.getByRole('heading', { name: 'Tiếp nhận xe' })).toBeVisible();
  await shot(page, '7-form-tiep-nhan');

  await page.getByLabel('Lời khách mô tả').fill('Xe kêu lạch cạch phía trước bên trái khi qua ổ gà');
  await page.getByLabel('Số km hiện tại').fill('42000');
  await page.getByLabel('Mức xăng (%)').fill('35');
  await page.getByLabel('Người mang xe đến').fill('Nguyễn Văn Tài Xế');

  // Tài sản: Enter phải THÊM tài sản chứ không gửi cả form
  await page.getByLabel('Tài sản trên xe').fill('Túi xách da màu nâu');
  await page.getByLabel('Tài sản trên xe').press('Enter');
  await expect(page.getByRole('heading', { name: 'Tiếp nhận xe' })).toBeVisible();
  await page.getByLabel('Tài sản trên xe').fill('Giấy đăng kiểm');
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.getByText('Giấy đăng kiểm')).toBeVisible();

  await shot(page, '8-tiep-nhan-da-dien');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();

  // --- Chi tiết đơn ---
  await expect(page).toHaveURL(/\/don\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const code = await page.locator('h2.mono').first().innerText();
  expect(code).toMatch(/^RO-\d{8}-\d{4}$/);

  await expect(page.getByText('Xe kêu lạch cạch phía trước bên trái khi qua ổ gà')).toBeVisible();
  await expect(page.getByText('42.000 km')).toBeVisible();
  await expect(page.getByText('Túi xách da màu nâu')).toBeVisible();
  await expect(page.getByText('Nguyễn Văn Tài Xế')).toBeVisible();
  await shot(page, '9-chi-tiet-don');

  // Link tra cứu phải có sẵn ngay, không đợi Phase 1.5
  const link = await page.locator('input[readonly].mono').inputValue();
  expect(link).toContain('/tra-cuu/');
  expect(link.split('/tra-cuu/')[1]!.length).toBeGreaterThanOrEqual(43);

  // --- Danh sách xe trong xưởng ---
  await page.getByRole('link', { name: 'Xe trong xưởng' }).click();
  await expect(page.getByRole('cell', { name: code })).toBeVisible();
  await shot(page, '10-xe-trong-xuong');

  expect(consoleErrors, 'giao diện phát sinh lỗi console').toEqual([]);
});

test('🔒 INV-V-03: xe đang có đơn mở thì không tiếp nhận lại được, và báo rõ đơn nào', async ({ page }) => {
  await login(page);

  const plate = `60C-${Date.now().toString().slice(-5)}`;
  await createVehicle(page, plate);
  await page.getByLabel('Lời khách mô tả').fill('Bảo dưỡng định kỳ');
  await page.getByLabel('Số km hiện tại').fill('1000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });
  const code = await page.locator('h2.mono').first().innerText();

  // Tiếp nhận lại chính xe đó
  await gotoIntake(page);
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByLabel('Lời khách mô tả').fill('Khách quay lại vì lỗi khác');
  await page.getByLabel('Số km hiện tại').fill('1100');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();

  const alert = page.locator('form [role="alert"]');
  await expect(alert).toBeVisible();
  // Thông báo phải nêu MÃ đơn đang mở, nếu không cố vấn phải đi tìm bằng tay
  await expect(alert).toContainText(code);
  await shot(page, '11-don-dang-mo');
});

test('🔒 INV-V-04: số km lùi hiện cảnh báo NGAY khi gõ và bắt chọn lý do', async ({ page }) => {
  await login(page);

  const plate = `60D-${Date.now().toString().slice(-5)}`;
  await createVehicle(page, plate);

  // Đơn đầu đưa số km của xe lên 90.000
  await page.getByLabel('Lời khách mô tả').fill('Thay dầu định kỳ');
  await page.getByLabel('Số km hiện tại').fill('90000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });

  await gotoIntake(page);
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  // Số km lần trước hiện ở cả thẻ hồ sơ xe lẫn dòng gợi ý dưới ô nhập
  await expect(page.getByText('90.000 km').first()).toBeVisible();

  await page.getByLabel('Số km hiện tại').fill('80000');

  // Cảnh báo hiện NGAY, không đợi bấm lưu — người dùng đang đứng cạnh đồng hồ
  const warn = page.getByRole('alert').filter({ hasText: 'Số km nhỏ hơn lần trước' });
  await expect(warn).toBeVisible();
  await expect(page.getByLabel('Lý do')).toBeVisible();
  await shot(page, '12-canh-bao-km-lui');
});
