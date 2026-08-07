import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Kiểm tra accessibility tự động trên MỌI màn hình.
 *
 * Vì sao đáng có: vòng rà soát tìm ra lỗi nặng nhất của giao diện là hai nút
 * "Đồng ý"/"Không" trên trang khách không có tên riêng theo hạng mục — khách
 * dùng trình đọc màn hình chỉ nghe "Đồng ý, nút — Không, nút — Đồng ý, nút" và
 * không biết mình đang duyệt hạng mục nào. Đây là màn hình QUYẾT ĐỊNH CHI TIỀN.
 *
 * Bằng chứng cho thấy test cũ không bắt được: chính E2E hiện có phải viết
 * `locator('.choices li', { hasText: 'Thay má phanh' })` — tức là chọn theo
 * class CSS vì tên trợ năng không phân biệt được. Test đó VÒNG QUA vấn đề thay
 * vì phát hiện nó.
 *
 * Từ đây, mọi hồi quy tương tự bị bắt tự động.
 */
async function login(page: Page) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();
}

/** Chỉ soi các quy tắc WCAG A/AA — bỏ qua khuyến nghị chủ quan */
const soi = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

function moTa(vi: { id: string; nodes: { target: unknown[] }[] }[]): string {
  return vi.map((v) => `${v.id} (${v.nodes.length} chỗ)`).join(', ');
}

test('trang đăng nhập không có lỗi accessibility', async ({ page }) => {
  await page.goto('/dang-nhap');
  const kq = await soi(page).analyze();
  expect(moTa(kq.violations), moTa(kq.violations)).toBe('');
});

test('màn tiếp nhận xe không có lỗi accessibility', async ({ page }) => {
  await login(page);
  const kq = await soi(page).analyze();
  expect(moTa(kq.violations), moTa(kq.violations)).toBe('');
});

test('danh sách xe trong xưởng không có lỗi accessibility', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Xe trong xưởng' }).click();
  await expect(page.getByRole('heading', { name: /Xe trong xưởng/ })).toBeVisible();
  const kq = await soi(page).analyze();
  expect(moTa(kq.violations), moTa(kq.violations)).toBe('');
});

test('🔒 trang khách duyệt báo giá không có lỗi accessibility', async ({ browser }) => {
  // Màn hình quan trọng nhất: khách quyết định chi tiền, trên điện thoại,
  // có thể đang dùng trình đọc màn hình.
  const staff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await staff.newPage();
  await login(page);

  const plate = `77A-${Date.now().toString().slice(-5)}`;
  await page.getByLabel('Biển số xe').fill(plate);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByRole('button', { name: 'Tạo khách hàng và xe mới' }).click();
  await page.getByLabel('Họ tên').fill('Ngô Thị Trợ Năng');
  await page.getByLabel('Số điện thoại', { exact: false }).last()
    .fill(`095${Date.now().toString().slice(-7)}`);
  await page.getByRole('button', { name: /Lưu khách hàng và xe/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã có hồ sơ xe' })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Lời khách mô tả').fill('Kiểm tra tổng thể trước chuyến đi');
  await page.getByLabel('Số km hiện tại').fill('20000');
  await page.getByRole('button', { name: 'Tạo đơn tiếp nhận' }).click();
  await expect(page).toHaveURL(/\/don\//, { timeout: 15_000 });
  const trackingUrl = await page.locator('input[readonly].mono').inputValue();

  await page.getByRole('link', { name: 'Lập báo giá' }).click();
  await page.getByRole('button', { name: 'Tạo báo giá mới' }).click();
  await page.getByRole('button', { name: 'Thêm Thay má phanh' }).click();
  await page.getByRole('button', { name: 'Gửi khách duyệt' }).click();
  await expect(page.getByText('Đã gửi khách')).toBeVisible({ timeout: 15_000 });

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const mobile = await phone.newPage();
  await mobile.goto(trackingUrl);
  await expect(mobile.getByText('Garage Thành Công')).toBeVisible();

  const kq = await soi(mobile).analyze();
  expect(moTa(kq.violations), moTa(kq.violations)).toBe('');

  // Và nút duyệt phải có tên riêng theo hạng mục — đây là thứ axe không bắt
  // được (nút CÓ tên, chỉ là tên trùng nhau) nhưng lại là lỗi nặng nhất.
  await expect(
    mobile.getByRole('button', { name: 'Đồng ý làm: Thay má phanh' }),
  ).toBeVisible();

  await staff.close();
  await phone.close();
});

test('màn kho không có lỗi accessibility', async ({ page }) => {
  // Đăng nhập bằng thủ kho, không phải cố vấn: cố vấn không có quyền xem kho
  // nên sẽ chỉ soi được một thông báo lỗi — tức là soi nhầm màn hình.
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000005');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));

  await page.goto('/kho');
  await expect(page.getByRole('columnheader', { name: 'Mã' })).toBeVisible();

  const kq = await soi(page).analyze();
  expect(moTa(kq.violations), moTa(kq.violations)).toBe('');
});

test('màn lịch xưởng không có lỗi accessibility', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000002');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));

  await page.goto('/lich-xuong');
  await expect(page.getByRole('columnheader', { name: 'Khoang' })).toBeVisible();

  const kq = await soi(page).analyze();
  expect(moTa(kq.violations), moTa(kq.violations)).toBe('');
});
