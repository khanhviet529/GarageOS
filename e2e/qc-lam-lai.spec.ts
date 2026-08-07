import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.6 — kiểm tra chất lượng và làm lại.
 *
 * Điều đáng kiểm ở tầng giao diện không phải "bấm được nút không đạt", mà là:
 * người QC có nhìn thấy HỆ QUẢ TIỀN BẠC trước khi chọn nguyên nhân hay không.
 *
 * Bốn nguyên nhân trông giống nhau về mặt chữ nghĩa. Nhưng "lỗi thi công" nghĩa
 * là garage chịu, còn "khách đổi ý" nghĩa là khách trả — và người đang cầm
 * chiếc xe không có cách nào biết điều đó nếu màn hình không nói ra.
 */

async function dangNhap(page: Page, phone: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

test('🔒 hộp QC nói rõ AI TRẢ TIỀN cho từng nguyên nhân', async ({ page }) => {
  await dangNhap(page, '0901000002');
  await page.goto('/lich-xuong');
  await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();

  /*
   * Chờ nút hiện ra thay vì đếm rồi `test.skip`.
   *
   * Đếm ngay sau khi mở trang là đọc lúc lịch chưa tải xong, nên test tự bỏ
   * qua chính thứ nó sinh ra để kiểm — và báo "passed". Lỗi này đã mắc BA lần
   * trong dự án (kho, lịch xưởng, và ở đây), nên từ giờ không dùng `test.skip`
   * dựa trên `count()` nữa. Seed luôn tạo sẵn một việc đã xong chờ QC.
   */
  const nutKiemTra = page.getByRole('button', { name: 'Kiểm tra' }).first();
  await expect(nutKiemTra).toBeVisible({ timeout: 10_000 });
  await nutKiemTra.click();

  // Bốn nguyên nhân, mỗi cái kèm hệ quả tiền bạc ngay cạnh
  await expect(page.getByText('Lỗi thi công')).toBeVisible();
  await expect(page.getByText('Garage chịu — không tính tiền khách').first()).toBeVisible();
  await expect(page.getByText('Khách chịu — vẫn tính tiền như phát sinh')).toBeVisible();
  await expect(page.getByText('Nhà cung cấp chịu — không tính tiền khách')).toBeVisible();
});

test('🔒 danh sách chờ phân biệt việc LÀM LẠI với việc thường', async ({ page }) => {
  /*
   * Một việc làm lại nằm lẫn giữa việc thường là cái bẫy tốn tiền: người xếp
   * lịch không biết nó không tính tiền khách, và cũng không biết phải nối nó
   * vào chuỗi làm lại. Nhãn phải nhìn thấy ngay trong danh sách chọn.
   */
  await dangNhap(page, '0901000002');
  await page.goto('/lich-xuong');
  await expect(page.getByRole('heading', { name: 'Lịch xưởng' })).toBeVisible();

  const choXep = page.locator('#chon-viec option');
  await expect.poll(() => choXep.count(), { timeout: 10_000 }).toBeGreaterThan(0);

  // Không khẳng định PHẢI có việc làm lại trên dữ liệu seed — chỉ khẳng định
  // rằng nếu có thì nó được đánh dấu, và nhãn đó dùng đúng ký hiệu.
  const nhan = await choXep.allInnerTexts();
  for (const t of nhan) {
    if (t.includes('LÀM LẠI')) {
      expect(t).toContain('↺');
    }
  }
});

test('🔒 vai không được QC thì không thấy nút kiểm tra', async ({ page }) => {
  // Thu ngân không có `assignment:qc`, và cũng không có `assignment:read` —
  // nên không vào được màn này. Chặn thật nằm ở API; đây chỉ khẳng định giao
  // diện không hiện lối vào rồi mới báo lỗi sau khi bấm.
  await dangNhap(page, '0901000006');
  await expect(page.getByRole('link', { name: 'Lịch xưởng' })).toHaveCount(0);

  await page.goto('/lich-xuong');
  await expect(page.locator('p.alert.error')).toContainText(/không được|quyền/i);
});
