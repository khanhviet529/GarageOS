import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, caret: 'initial' });
}

async function login(page: Page) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();
}

async function intake(page: Page, plate: string) {
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Lý Thị Trạng Thái');
  await page.getByLabel('Số điện thoại', { exact: false }).last()
    .fill(`092${Date.now().toString().slice(-7)}`);
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Lời khách mô tả').fill('Kiểm tra tổng thể trước khi đi xa');
  await page.getByLabel('Số km hiện tại').fill('70000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });
}

test('🔒 chỉ hiện những bước hợp lệ, và đi hết vòng đời tới giao xe', async ({ page }) => {
  await login(page);
  await intake(page, `43T-${Date.now().toString().slice(-5)}`);

  const actions = page.locator('.card', { has: page.getByRole('heading', { name: 'Bước tiếp theo' }) });

  // Từ "Đã tiếp nhận" chỉ có hai đường: bắt đầu kiểm tra, hoặc huỷ.
  // Nút không hợp lệ KHÔNG xuất hiện — không phải bị làm mờ.
  await expect(actions.getByRole('button', { name: 'Bắt đầu kiểm tra' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Huỷ đơn' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Giao xe cho khách' })).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Bắt đầu sửa' })).toHaveCount(0);
  await shot(page, '26-buoc-tiep-theo');

  // Đi hết vòng đời
  for (const label of [
    'Bắt đầu kiểm tra',
    'Chuyển về lập báo giá',
    'Gửi khách duyệt',
    'Bắt đầu sửa',
    'Chuyển kiểm tra chất lượng',
    'Đạt — chuyển thanh toán',
    'Đã thu tiền — chờ giao xe',
  ]) {
    await actions.getByRole('button', { name: label }).click();
    await expect(actions.getByRole('button', { name: label })).toHaveCount(0);
  }

  // Giao xe cần thêm số km ra
  await actions.getByRole('button', { name: 'Giao xe cho khách' }).click();
  await expect(page.getByLabel('Số km lúc giao xe')).toBeVisible();
  await expect(page.getByText('Lúc nhận: 70.000 km')).toBeVisible();
  await page.getByLabel('Số km lúc giao xe').fill('70150');
  await shot(page, '27-giao-xe');
  await page.getByRole('button', { name: 'Xác nhận giao xe' }).click();

  // Trạng thái cuối: không còn nút nào
  await expect(page.getByText('Đơn đã ở trạng thái cuối')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/tạo.*đơn mới.*không mở lại đơn này/)).toBeVisible();
  await shot(page, '28-trang-thai-cuoi');
});

test('huỷ đơn bắt buộc chọn nhóm lý do và ghi diễn giải', async ({ page }) => {
  await login(page);
  await intake(page, `43H-${Date.now().toString().slice(-5)}`);

  const actions = page.locator('.card', { has: page.getByRole('heading', { name: 'Bước tiếp theo' }) });
  await actions.getByRole('button', { name: 'Huỷ đơn' }).click();

  await expect(page.getByLabel('Nhóm lý do')).toBeVisible();
  // Chưa ghi diễn giải thì chưa xác nhận được
  await expect(page.getByRole('button', { name: 'Xác nhận huỷ đơn' })).toBeDisabled();

  await page.getByLabel('Nhóm lý do').selectOption('GARAGE_UNABLE');
  await page.getByLabel('Diễn giải').fill('Xe cần thiết bị chuyên dụng xưởng chưa có');
  await page.getByRole('button', { name: 'Xác nhận huỷ đơn' }).click();

  await expect(page.getByText('Đơn đã ở trạng thái cuối')).toBeVisible({ timeout: 15_000 });
  await shot(page, '29-huy-don');
});
