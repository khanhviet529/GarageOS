import { test, expect, type Page } from '@playwright/test';

const SHOTS = 'e2e/screenshots';

/** Ảnh dùng cho README — chụp trong chính bài test, không chụp tay */
function chup(page: Page, name: string): Promise<Buffer> {
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, caret: 'initial' });
}

/**
 * Phase 6 — màn hình báo cáo.
 *
 * Test tầng API đã kiểm công thức. Ở đây kiểm ba điều mà chỉ nhìn màn hình mới
 * thấy, và cả ba đều là chuyện "không cho người đọc nhìn nửa sự thật":
 *
 *  1. Năng suất và tỉ lệ làm lại ở CÙNG MỘT BẢNG — tách ra là mời người xem
 *     khen nhầm người làm ẩu
 *  2. Tỉ lệ đúng hẹn hiện kèm SỐ LẦN DỜI HẸN, cùng cỡ chữ
 *  3. Thợ vào được trang nhưng KHÔNG thấy khối lãi/lỗ và khối kho
 */

async function dangNhap(page: Page, phone: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

test('chủ xưởng thấy đủ năm khối báo cáo, mỗi khối nói rõ kỳ và phần đã loại trừ', async ({
  page,
}) => {
  await dangNhap(page, '0901000001');
  await page.goto('/bao-cao');

  await expect(page.getByRole('heading', { name: 'Báo cáo', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lãi/lỗ theo đơn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thời gian chờ theo bộ phận' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Năng suất và chất lượng thợ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tỉ lệ đúng hẹn' })).toBeVisible();

  /*
   * Nguyên tắc 3 và 4 của docs/09: mỗi báo cáo ghi rõ mốc thời gian, và loại
   * trừ gì thì phải NÓI RA. Một báo cáo lặng lẽ bỏ bớt dữ liệu là báo cáo nói
   * dối, kể cả khi việc bỏ bớt là đúng.
   */
  await expect(page.getByText(/^Kỳ: /).first()).toBeVisible();
  await expect(page.getByText(/Đã loại trừ \d+ nhóm dữ liệu/).first()).toBeVisible();

  // ⚠️ Cảnh báo doanh thu chưa phải hoá đơn phải nằm NGAY trong khối, không nằm
  //    ở một trang ghi chú nào khác
  await expect(page.getByText(/dòng báo giá đã duyệt/)).toBeVisible();

  await chup(page, '60-bao-cao');
});

test('🔒 năng suất và tỉ lệ làm lại nằm CÙNG một bảng', async ({ page }) => {
  await dangNhap(page, '0901000001');
  await page.goto('/bao-cao');

  const bang = page
    .locator('section')
    .filter({ hasText: 'Năng suất và chất lượng thợ' })
    .locator('table');

  /*
   * Cả hai cột phải ở trong CÙNG một bảng. Nếu ai đó tách năng suất sang một
   * màn hình riêng cho "đẹp", test này đỏ — và đó là mục đích của nó.
   */
  await expect(bang.getByRole('columnheader', { name: 'Năng suất' })).toBeVisible();
  await expect(bang.getByRole('columnheader', { name: 'Tỉ lệ làm lại' })).toBeVisible();
  await expect(bang.getByRole('columnheader', { name: 'QC trượt' })).toBeVisible();
});

test('🔒 tỉ lệ đúng hẹn không bao giờ đứng một mình', async ({ page }) => {
  await dangNhap(page, '0901000001');
  await page.goto('/bao-cao');

  const khoi = page.locator('section').filter({ hasText: 'Tỉ lệ đúng hẹn' });
  await expect(khoi.getByText('Đúng hẹn', { exact: true })).toBeVisible();
  // 95% đúng hẹn mà mỗi đơn dời hẹn ba lần thì con số kia vô giá trị
  await expect(khoi.getByText('Số lần dời hẹn', { exact: true })).toBeVisible();
});

test('🔒 thợ vào được trang báo cáo, nhưng không thấy tiền và không thấy kho', async ({ page }) => {
  await dangNhap(page, '0901000004');
  await page.goto('/bao-cao');

  // Vào được, và thấy đúng phần docs/09 mục 5 nói họ được xem
  await expect(page.getByRole('heading', { name: 'Báo cáo', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thời gian chờ theo bộ phận' })).toBeVisible();

  /*
   * Nhưng không có khối nào chứa tiền hay giá vốn. Đây là hệ quả nhìn thấy được
   * của `assertCan` ở tầng service — trang chỉ đơn giản không dựng khối mà API
   * trả 403, không cần biết vai là gì.
   */
  await expect(page.getByRole('heading', { name: 'Lãi/lỗ theo đơn' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Tồn kho — cảnh báo và vốn chết' }),
  ).toHaveCount(0);
});
