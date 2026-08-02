import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

/**
 * Lỗi console của trình duyệt là thứ dễ tích tụ nhất mà không ai nhận ra: mỗi
 * lần thêm màn hình mới lại thêm một cảnh báo hydrate/key trùng. Bắt ngay ở đây
 * để nó không thành nợ.
 */
function watchConsole(page: import('@playwright/test').Page): string[] {
  const errs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}

const PLATE = `51K-${Date.now().toString().slice(-3)}.${Date.now().toString().slice(-2)}`;

test('luồng tiếp nhận: đăng nhập → tra biển → tạo xe mới → tra lại thấy xe', async ({ page }) => {
  const consoleErrors = watchConsole(page);

  // --- Đăng nhập ---
  await page.goto('/dang-nhap');
  await expect(page.getByRole('heading', { name: 'GarageOS' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/1-dang-nhap.png`, fullPage: true });

  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: 'Tra cứu biển số' })).toBeVisible();
  // Vai trò hiện bằng tiếng Việt, không phải hằng số trong mã nguồn
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/2-tiep-nhan-rong.png`, fullPage: true });

  // --- Tra biển chưa có ---
  await page.getByLabel('Biển số xe').fill(PLATE);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByRole('heading', { name: /Chưa có hồ sơ/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/3-khong-tim-thay.png`, fullPage: true });

  // --- Tạo khách + xe điện ---
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Trần Thị Kiểm Thử');
  await page.getByLabel('Số điện thoại', { exact: false }).last().fill(`097${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Loại động cơ').selectOption('BEV');

  // 🔒 ADR-0004: chọn xe điện thì trường dung lượng pin PHẢI hiện ra
  await expect(page.getByLabel('Dung lượng pin (kWh)')).toBeVisible();
  await page.getByLabel('Hãng').fill('VinFast');
  await page.getByLabel('Dòng xe').fill('VF8');
  await page.getByLabel('Dung lượng pin (kWh)').fill('42');
  await page.screenshot({ path: `${SHOTS}/4-form-tao-moi.png`, fullPage: true });

  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();

  // --- Tra lại: phải thấy hồ sơ ---
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Điện', { exact: true })).toBeVisible();
  await expect(page.getByText('VinFast VF8')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/5-tim-thay-xe.png`, fullPage: true });

  expect(consoleErrors, 'giao diện phát sinh lỗi console').toEqual([]);
});

test('🔒 ADR-0004: xe xăng KHÔNG hiện trường dung lượng pin', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  // Chờ tên người dùng hiện ra: nó do useEffect vẽ, nên đây là mốc chắc chắn
  // React đã hydrate. Gõ trước mốc này thì form submit kiểu HTML thuần và mất state.
  await expect(page.getByText('Lê Văn Cố Vấn')).toBeVisible();

  await page.getByLabel('Biển số xe').fill(`99Z-${Date.now().toString().slice(-5)}`);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();

  // Mặc định ICE -> không có trường pin. Dẫn dắt đúng thay vì báo lỗi sau.
  await expect(page.getByLabel('Dung lượng pin (kWh)')).toHaveCount(0);
  await page.getByLabel('Loại động cơ').selectOption('HYBRID');
  await expect(page.getByLabel('Dung lượng pin (kWh)')).toBeVisible();
});

test('sai mật khẩu hiện thông báo, không lộ chi tiết nội bộ', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('saibetroi123');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  // Next chèn sẵn một <div role="alert"> rỗng để đọc tên route -> phải khoanh
  // vùng trong form, nếu không locator dính hai phần tử.
  const alert = page.locator('form [role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/không đúng/i);
  for (const leak of ['SELECT', 'app_user', 'node_modules', 'at Object']) {
    await expect(alert).not.toContainText(leak);
  }
  await page.screenshot({ path: `${SHOTS}/6-sai-mat-khau.png`, fullPage: true });
});

/**
 * 🔒 WEB-001 (codex-review) — Bấm "Chọn" ở danh sách gợi ý phải tra ĐÚNG biển
 * được chọn. Nếu hàm tra cứu đọc state cũ, nó sẽ tra lại biển gõ nhầm và màn
 * hình đứng yên — nhân viên sẽ tưởng gợi ý hỏng rồi tạo hồ sơ trùng, đúng thứ
 * mà cả tính năng này sinh ra để chặn.
 *
 * Test này ĐỎ trước khi sửa.
 */
test('🔒 WEB-001: chọn biển gợi ý thì tra đúng biển đó, không tra lại biển gõ nhầm', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();

  // Tạo một xe có thật để có cái mà gợi ý
  const seed = Date.now().toString().slice(-5);
  const real = `43C-${seed}`;
  await page.getByLabel('Biển số xe').fill(real);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Nguyễn Văn Gợi Ý');
  await page.getByLabel('Số điện thoại', { exact: false }).last().fill(`098${Date.now().toString().slice(-7)}`);
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });

  // Gõ nhầm một ký tự cuối -> phải ra gợi ý
  const typo = real.slice(0, -1) + (real.endsWith('9') ? '8' : '9');
  await page.getByLabel('Biển số xe').fill(typo);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByRole('heading', { name: /Không khớp chính xác/ })).toBeVisible();

  await page.getByRole('button', { name: 'Chọn' }).first().click();

  // Phải nhảy sang hồ sơ của biển ĐƯỢC CHỌN
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible();
  await expect(page.getByText('Nguyễn Văn Gợi Ý')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Không khớp chính xác/ })).toHaveCount(0);
});
