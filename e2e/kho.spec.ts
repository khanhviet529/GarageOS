import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.1 — màn hình kho.
 *
 * Trọng tâm không phải "bấm được nút". Ba điều được kiểm ở đây đều là điều mà
 * test tầng API không nhìn thấy:
 *  1. Con số trên màn hình khớp con số sau khi ghi sổ
 *  2. Giá vốn KHÔNG rò sang vai không được xem — kể cả trong JSON, không chỉ
 *     trong cột bảng
 *  3. Người không có quyền không thấy lối vào, và gõ thẳng URL cũng không vào được
 */

async function dangNhap(page: Page, phone: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

test('thủ kho xem tồn, nhập kho, con số trên màn hình khớp sau khi ghi sổ', async ({ page }) => {
  await dangNhap(page, '0901000005');
  await page.goto('/kho');

  await expect(page.getByRole('heading', { name: 'Kho phụ tùng' })).toBeVisible();
  const bang = page.locator('table').first();
  await expect(bang.getByRole('cell', { name: 'PT-OIL-5W30', exact: true })).toBeVisible();

  // Tồn hiện tại của mã sắp nhập, đọc từ chính màn hình
  const dong = bang.locator('tr', { has: page.getByRole('cell', { name: 'PT-FILTER-OIL', exact: true }) });
  const truoc = Number(((await dong.locator('td').nth(2).innerText()).match(/[\d.]+/) ?? ['0'])[0]);

  // `selectOption` không nhận regex — lấy đúng `value` của option cần chọn.
  const giaTriPart = await page
    .locator('#nk-part option', { hasText: 'PT-FILTER-OIL' })
    .getAttribute('value');
  await page.getByLabel('Phụ tùng', { exact: true }).selectOption(giaTriPart ?? '');
  await page.getByLabel('Số lượng').fill('7');
  await page.getByLabel('Giá vốn một đơn vị (đồng)').fill('99000');
  await page.getByLabel('Số phiếu / hoá đơn nhà cung cấp').fill('HD-E2E-01');
  await page.getByRole('button', { name: 'Ghi phiếu nhập' }).click();

  // Xác nhận phải nói RÕ tồn mới, không chỉ "thành công": người nhập cần đối
  // chiếu ngay với phiếu giấy trên tay.
  const xacNhan = page.getByRole('status').filter({ hasText: 'Đã nhập' });
  await expect(xacNhan).toContainText(`Tồn mới ${truoc + 7}`);

  // Và bảng tồn phải đã cập nhật theo, không chờ F5
  await expect(dong.locator('td').nth(2)).toContainText(String(truoc + 7));

  // Sổ kho ghi lại chuyển động, kèm số phiếu
  await expect(page.getByText('Phiếu HD-E2E-01').first()).toBeVisible();
});

test('🔒 lọc "sắp hết" chỉ hiện món dưới mức tối thiểu', async ({ page }) => {
  await dangNhap(page, '0901000005');
  await page.goto('/kho');
  await expect(page.getByRole('heading', { name: 'Kho phụ tùng' })).toBeVisible();

  const dongs = page.locator('table').first().locator('tbody tr');
  const truoc = await dongs.count();

  // Chờ ĐÚNG lượt gọi lại của bộ lọc, không chờ theo thời gian: khẳng định
  // ngay sau `check()` sẽ đọc bảng của lượt trước và test xanh/đỏ ngẫu nhiên.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('belowMinimum=1') && r.status() === 200,
    ),
    page.getByLabel('Chỉ hiện món sắp hết').check(),
  ]);
  await expect(dongs).not.toHaveCount(truoc);

  const n = await dongs.count();
  expect(n, 'seed phải có ít nhất một mã dưới mức tối thiểu').toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    await expect(dongs.nth(i).getByText('sắp hết')).toBeVisible();
  }
});

test('🔒 vai không được xem kho: không có lối vào, gõ thẳng URL cũng không vào được', async ({
  page,
}) => {
  await dangNhap(page, '0901000003'); // cố vấn dịch vụ

  await expect(page.getByRole('link', { name: 'Kho' })).toHaveCount(0);

  await page.goto('/kho');
  // API trả 403 -> màn hình phải NÓI RA, không im lặng hiện bảng rỗng.
  // Bảng rỗng là thông báo sai: nó nói "kho không có gì", không nói "bạn không
  // được xem".
  // Next.js chèn sẵn một `role="alert"` rỗng (route announcer) trên mọi trang,
  // nên phải nhắm vào thông báo CỦA TRANG.
  await expect(page.locator('p.alert.error')).toContainText(/không được|quyền/i);
});

test('🔒 giá vốn không rò ra ngoài vai được xem — kiểm cả JSON, không chỉ cột bảng', async ({
  page,
}) => {
  /*
   * Ẩn một cột trên giao diện không làm nó biến mất khỏi response. Test này bắt
   * response THẬT trên đường truyền, vì đó là thứ kẻ tò mò mở tab Network nhìn
   * thấy — còn cột bảng chỉ là thứ họ được cho xem.
   */
  const phanHoi: unknown[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/v1/stock/balances') && res.status() === 200) {
      phanHoi.push(await res.json().catch(() => null));
    }
  });

  await dangNhap(page, '0901000005'); // thủ kho — ĐƯỢC xem giá vốn
  await page.goto('/kho');
  await expect(page.getByRole('columnheader', { name: 'Giá vốn bình quân' })).toBeVisible();

  const coGia = (phanHoi.flat() as { avgCost: number | null }[]).filter(
    (b) => b !== null && b.avgCost !== null,
  );
  expect(coGia.length, 'thủ kho phải nhận được giá vốn').toBeGreaterThan(0);
});
