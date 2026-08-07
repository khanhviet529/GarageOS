import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.5 — bấm giờ công trên lịch xưởng.
 *
 * Điều đáng kiểm ở tầng này không phải "bấm được nút" (API test đã lo), mà là:
 * màn hình có nói RÕ con số nào dùng để tính tiền khách và con số nào để đo
 * năng suất hay không.
 *
 * BC-06 mục 6 xếp "tính tiền khách theo giờ thực tế" là sai lầm nặng nhất. Một
 * màn hình chỉ hiện "đã làm 2,5 giờ" mà không nói nó KHÔNG phải cơ sở tính tiền
 * là màn hình mời người dùng hiểu sai — và người hiểu sai ở đây là người đứng
 * trước mặt khách.
 *
 * 🔒 `describe.serial` và MỘT lần xếp lịch dùng chung cho cả ba test.
 *
 * Bản đầu để mỗi test tự xếp một việc, và hai test sau đỏ: seed chỉ có hai hạng
 * mục chờ phân công, test thứ ba không còn gì để xếp. Test tranh nhau dữ liệu
 * seed là một dạng phụ thuộc ẩn giữa các test — nó đỏ theo THỨ TỰ CHẠY, không
 * theo tính đúng đắn của code.
 */

async function dangNhap(page: Page, phone: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

/**
 * Mở bảng giờ công của việc thuộc ĐÚNG thợ này.
 *
 * 🔒 Không dùng `.first()`. Bản đầu làm vậy và đỏ khi chạy cả bộ: `lich-xuong.spec.ts`
 * cũng xếp việc, nên ô đầu tiên trên lịch có thể thuộc thợ khác — và nút "Bắt
 * đầu làm" không hiện, vì đúng ra nó không được hiện.
 *
 * Test đỏ vì nhắm sai mục tiêu, không vì code sai. Nhắm theo TÊN THỢ thì ý định
 * của test khớp với điều nó khẳng định.
 */
async function moGioCong(page: Page, tenTho: string): Promise<void> {
  await page.goto('/lich-xuong');
  await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();

  const oViec = page.locator('.viec', { hasText: tenTho }).first();
  await expect(oViec).toBeVisible({ timeout: 10_000 });
  await oViec.getByRole('button', { name: 'Giờ công' }).click();
  await expect(page.getByRole('heading', { name: /^Giờ công ·/ })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('Giờ công', () => {
  test('quản lý xếp việc cho thợ Phạm Văn Thợ', async ({ page }) => {
    await dangNhap(page, '0901000002');
    await page.goto('/lich-xuong');
    await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();

    const choXep = page.locator('#chon-viec option');
    await expect.poll(() => choXep.count(), { timeout: 10_000 }).toBeGreaterThan(1);

    const giaTri = await choXep.nth(1).getAttribute('value');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('technician-options') && r.status() === 200),
      page.locator('#chon-viec').selectOption(giaTri ?? ''),
    ]);

    // Chọn đúng thợ để test sau kiểm được phần "việc của tôi"
    const tho = page.locator('#chon-tho option', { hasText: 'Phạm Văn Thợ' });
    await expect(tho.first()).toHaveCount(1);
    const idTho = await tho.first().getAttribute('value');
    await page.locator('#chon-tho').selectOption(idTho ?? '');

    await page.getByRole('button', { name: 'Xếp lịch' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã xếp lịch' })).toBeVisible();
  });

  test('🔒 màn giờ công nói RÕ con số nào tính tiền, con số nào đo năng suất', async ({ page }) => {
    await dangNhap(page, '0901000002');
    await moGioCong(page, 'Phạm Văn Thợ');

    // Ba nhãn này là toàn bộ giá trị của màn hình. Thiếu một cái là mời hiểu sai.
    await expect(page.getByText('Định mức — cơ sở tính tiền khách')).toBeVisible();
    await expect(page.getByText('Thực tế — cơ sở đo năng suất')).toBeVisible();
    await expect(page.getByText('Năng suất (định mức / thực tế)')).toBeVisible();
  });

  test('🔒 quản lý KHÔNG thấy nút bấm giờ cho việc của thợ khác', async ({ page }) => {
    /*
     * Quản lý xếp lịch cho thợ, nhưng người bấm giờ phải là người làm. Nút không
     * hiện chỉ là tiện dụng; chặn thật ở `assertOwnAssignment` và ở trigger
     * `kiem_tra_bam_gio()` — nhưng một nút bấm vào là báo lỗi cũng là giao diện
     * tệ.
     */
    await dangNhap(page, '0901000002');
    await moGioCong(page, 'Phạm Văn Thợ');
    await expect(page.getByRole('button', { name: 'Bắt đầu làm' })).toHaveCount(0);
  });

  test('thợ bấm bắt đầu rồi tạm dừng: đoạn được ghi kèm lý do', async ({ page }) => {
    await dangNhap(page, '0901000004');
    await moGioCong(page, 'Phạm Văn Thợ');

    const batDau = page.getByRole('button', { name: 'Bắt đầu làm' });
    await expect(batDau).toBeVisible();
    await batDau.click();

    // Đang chạy: nhãn phải nói ra, vì con số thực tế đang tăng
    await expect(page.getByText('đang chạy')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'đang làm' })).toBeVisible();

    await page.locator('#ly-do-dung').selectOption('WAITING_PARTS');
    await page.getByRole('button', { name: 'Tạm dừng' }).click();

    await expect(page.getByRole('cell', { name: 'Chờ phụ tùng' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bắt đầu làm' })).toBeVisible();
  });
});
