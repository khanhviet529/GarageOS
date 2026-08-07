import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.3 — màn lịch xưởng.
 *
 * Điều đáng kiểm ở tầng này không phải "xếp được lịch" (API test đã lo), mà là:
 * người dùng có ĐƯỢC BIẾT vì sao một lựa chọn bị chặn hay không. Một danh sách
 * ngắn đi không lời giải thích khiến quản lý nghĩ hệ thống hỏng rồi tìm đường
 * lách — và đường lách ở đây dẫn tới việc xếp người không có chứng chỉ vào
 * việc trên hệ thống 400V.
 */

async function dangNhap(page: Page, phone: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

test('quản lý mở được lịch xưởng và thấy các khoang', async ({ page }) => {
  await dangNhap(page, '0901000002');
  await page.getByRole('link', { name: 'Lịch xưởng' }).click();

  await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Khoang 1/ })).toBeVisible();

  // 🔒 Khoang có vùng an toàn cao áp phải nhìn ra được ngay trên lịch: điều
  //    phối cần biết ô nào dùng được cho xe điện TRƯỚC khi kéo việc vào đó.
  await expect(page.getByRole('rowheader', { name: /cao áp/ })).toBeVisible();
});

test('🔒 thợ thiếu chứng chỉ hiện ra kèm LÝ DO, không bị ẩn đi', async ({ page }) => {
  await dangNhap(page, '0901000002');
  await page.goto('/lich-xuong');
  await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();

  // Chờ danh sách việc chờ nạp xong. Đếm ngay sẽ đọc lúc select mới có mỗi
  // dòng "— chọn hạng mục —", và test tự bỏ qua chính thứ nó sinh ra để kiểm.
  const choXep = page.locator('#chon-viec option');
  await expect.poll(() => choXep.count(), { timeout: 10_000 }).toBeGreaterThan(1);

  // Chọn hạng mục đầu tiên và chờ danh sách thợ nạp xong
  const giaTri = await choXep.nth(1).getAttribute('value');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('technician-options') && r.status() === 200),
    page.locator('#chon-viec').selectOption(giaTri ?? ''),
  ]);

  const tho = page.locator('#chon-tho option');
  await expect.poll(() => tho.count()).toBeGreaterThan(1);

  // Người nào không chọn được thì phải NÓI RÕ vì sao, ngay trong nhãn
  const biChan = tho.locator('[disabled]');
  const n = await biChan.count();
  for (let i = 0; i < n; i += 1) {
    await expect(biChan.nth(i)).toContainText(/—/);
  }
});

test('🔒 vai không được xem lịch thì không có lối vào', async ({ page }) => {
  await dangNhap(page, '0901000006'); // thu ngân
  await expect(page.getByRole('link', { name: 'Lịch xưởng' })).toHaveCount(0);

  await page.goto('/lich-xuong');
  await expect(page.locator('p.alert.error')).toContainText(/không được|quyền/i);
});

test('thợ xem được lịch nhưng không xếp được việc cho mình', async ({ page }) => {
  await dangNhap(page, '0901000004');
  await expect(page.getByRole('link', { name: 'Lịch xưởng' })).toBeVisible();

  await page.goto('/lich-xuong');
  await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();

  // Danh sách việc chờ là API riêng và thợ ĐƯỢC đọc; điều thợ không làm được là
  // bấm nút xếp. Kiểm ở tầng API (assignment.spec.ts) vì đó mới là chốt chặn
  // thật — ở đây chỉ khẳng định màn hình không sập với vai này.
  await expect(page.locator('p.alert.error')).toHaveCount(0);
});
