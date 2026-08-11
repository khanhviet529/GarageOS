import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Lần đầu mở web dev còn phải biên dịch route chi tiết đơn; 30 giây không đủ
// trên Windows chậm dù thao tác nghiệp vụ bên trong đều hoàn tất nhanh.
test.setTimeout(60_000);

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, caret: 'initial' });
}

async function login(page: Page) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  // Header nạp thông tin người dùng từ localStorage bằng effect; route đích là
  // tín hiệu đăng nhập hoàn tất ổn định hơn và không phụ thuộc thứ tự render.
  await expect(page.getByRole('heading', { name: 'Tra cứu biển số' })).toBeVisible();
}

/**
 * 🔒 Header phải hiện ĐÚNG tên và ĐÚNG nhãn vai — cho NHIỀU vai, không chỉ một.
 *
 * Vì sao bài này tồn tại, và vì sao nó kiểm ba tài khoản:
 *
 * `login()` ở trên từng khẳng định thẳng chuỗi "Lê Văn Cố Vấn · Cố vấn dịch vụ"
 * ngay sau khi bấm đăng nhập. Nó chập chờn — header nạp hồ sơ bằng effect nên
 * đôi lúc chưa kịp render — nên khẳng định đó bị đổi thành "đã tới đúng trang".
 * Đổi như vậy làm hết chập chờn, nhưng cũng làm KHÔNG CÒN BÀI NÀO kiểm header.
 *
 * ⚠️ Và đó đúng là chỗ dự án từng thủng: `ROLE_LABEL` ở web sai 3 trong 6 khoá
 *    suốt Phase 1 (`MANAGER` thay vì `BRANCH_MANAGER`, `WAREHOUSE_KEEPER` thay
 *    vì `STORE_KEEPER`, `ACCOUNTANT` thay vì `CASHIER`). Nó sống sót vì MỌI bài
 *    E2E đều đăng nhập bằng cố vấn dịch vụ — vai duy nhất có nhãn đúng.
 *
 * 💡 Nên bài này không chỉ trả lại khẳng định cũ: nó kiểm ba vai khác nhau, và
 *    hai trong ba chính là hai vai từng sai nhãn. Khôi phục nguyên trạng sẽ để
 *    lại đúng cái lỗ đã từng cho lỗi đi qua.
 */
test('🔒 header hiện đúng tên và nhãn vai cho từng vai', async ({ page }) => {
  const taiKhoan = [
    { sdt: '0901000003', ten: 'Lê Văn Cố Vấn', vai: 'Cố vấn dịch vụ' },
    { sdt: '0901000005', ten: 'Hoàng Thị Kho', vai: 'Thủ kho' },
    { sdt: '0901000006', ten: 'Đỗ Thị Thu Ngân', vai: 'Thu ngân' },
  ];

  for (const tk of taiKhoan) {
    await page.goto('/dang-nhap');
    await page.getByLabel('Số điện thoại').fill(tk.sdt);
    await page.getByLabel('Mật khẩu').fill('demo1234');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    /*
     * Chờ CHÍNH chuỗi cần kiểm, thay vì chờ điều gì khác rồi mới kiểm nó.
     *
     * Đây là cách xử lý đúng cho việc render bằng effect: Playwright tự thử lại
     * tới khi hết thời gian. Bản cũ chập chờn không phải vì khẳng định sai, mà
     * vì nó đọc DOM đúng một lần ngay sau cú bấm.
     */
    await expect(page.getByText(`${tk.ten} · ${tk.vai}`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/dang-nhap/, { timeout: 15_000 });
  }
});

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
  await expect(page.getByRole('button', { name: 'Mở quy trình hủy đơn' })).toBeVisible();
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

test('hủy đơn xem trước tác động, bắt buộc ghi lý do rồi lập quyết toán', async ({ page }) => {
  await login(page);
  await intake(page, `43H-${Date.now().toString().slice(-5)}`);

  await page.getByRole('button', { name: 'Mở quy trình hủy đơn' }).click();

  await expect(page.getByLabel('Phân loại')).toBeVisible();
  // Chưa ghi diễn giải thì chưa xác nhận được
  await expect(page.getByRole('button', { name: 'Xác nhận hủy và lập quyết toán' })).toBeDisabled();

  await page.getByLabel('Phân loại').selectOption('GARAGE_UNABLE');
  await page.getByLabel('Lý do hủy').fill('Xe cần thiết bị chuyên dụng xưởng chưa có');
  await page.getByRole('button', { name: 'Xác nhận hủy và lập quyết toán' }).click();

  await expect(page.getByText('Chờ khách xác nhận')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Tổng quyết toán')).toBeVisible();
  await shot(page, '29-huy-don');
});
