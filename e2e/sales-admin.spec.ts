/**
 * 🔒 Sales Admin — kịch bản của NHÂN VIÊN, chạy trong trình duyệt thật.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * `apps/sales-admin/package.json` ghi `"test": "echo 'sales-admin: E2E chạy
 * riêng bằng playwright'"` — nhưng không có bài E2E nào tồn tại. Một dòng script
 * mô tả một quy trình không có thật, và nó xanh mỗi lượt CI.
 *
 * Ba luồng dưới đây là ba luồng vừa được sửa ở `0a64c4e`:
 *
 *   · SA-001 — hết phiên sau 15 phút không ai xử lý
 *   · MK-01  — xe đã đăng không còn đường sửa (không route nào tạo bản nháp)
 *   · SL-01  — lead ghi một phiên bản xe mà khách không chọn
 *
 * Bài kiểm ở tầng API đã chốt phần hợp đồng. Ở đây kiểm phần còn lại: người
 * dùng có THẤY và BẤM được không.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, expect, type Page } from '@playwright/test';

const ADMIN = process.env.SALES_ADMIN_URL ?? 'http://localhost:3004';

async function dangNhap(page: Page, phone = '0901000013'): Promise<void> {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel(/số điện thoại/i).fill(phone);
  await page.getByLabel(/mật khẩu/i).fill('demo1234');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

test.describe('Sales Admin', () => {
  test('SA-E01 — đăng nhập bằng tài khoản quản lý sales rồi vào được danh sách lead', async ({
    page,
  }) => {
    await dangNhap(page);
    await page.goto(`${ADMIN}/leads`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('SA-E02 — sai mật khẩu thì nói ra, không im lặng ở lại trang trắng', async ({ page }) => {
    await page.goto(`${ADMIN}/login`);
    await page.getByLabel(/số điện thoại/i).fill('0901000013');
    await page.getByLabel(/mật khẩu/i).fill('sai-mat-khau');
    await page.getByRole('button', { name: /đăng nhập/i }).click();

    await expect(page.locator('.error, [role="alert"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('SA-E03 — chưa đăng nhập mà mở thẳng /leads thì được nói rõ, và có đường đi tiếp', async ({
    page,
  }) => {
    /*
     * ⚠️ `SA-001` (5e71b16): trước bản sửa, phiên hết hạn để lại khung giao diện
     *    y như đang đăng nhập, còn mọi thao tác trả 401 kèm lỗi kỹ thuật.
     *
     * 💡 Bài này ban đầu đòi chuyển hướng về `/login`. Đọc kỹ `AppShell` thì
     *    thấy nó CỐ Ý không chuyển: nó hiện thông báo kèm link. Cách đó tốt hơn
     *    — người dùng giữ được URL họ định mở, và một cú chuyển trang tự động
     *    thì không phân biệt được với "trang này không tồn tại".
     *
     *    Nên bài kiểm sửa theo hợp đồng thật của sản phẩm, không bắt sản phẩm
     *    chạy theo kỳ vọng đầu tiên của bài kiểm.
     */
    await page.context().clearCookies();
    await page.goto(`${ADMIN}/leads`);

    await expect(page.getByText(/cần đăng nhập/i)).toBeVisible({ timeout: 15_000 });
    const link = page.getByRole('link', { name: /đăng nhập/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('SA-E04 — xe đã đăng vẫn tạo được bản nháp để sửa', async ({ page }) => {
    /*
     * 🔒 Đây là luồng mà nhánh landing KHÔNG có đường đi: sau lần publish đầu
     *    tiên, `draft_revision_id` về NULL và không route nào dựng lại được.
     *    Màn hình khi đó hiện câu "Chưa có bản nháp — publish lần đầu bằng dữ
     *    liệu hiện tại", một hướng dẫn mà làm theo thì nhận 422.
     *
     * `0a64c4e` thêm `POST /vehicle-products/:id/draft` và nút tương ứng.
     */
    await dangNhap(page, '0901000011'); // MARKETING_PUBLISHER
    await page.goto(`${ADMIN}/vehicles`);

    /*
     * ⚠️ Mốc vào ĐÚNG `aurora-e1`, không phải "xe đầu tiên trong danh sách".
     *
     * Bài này khẳng định bản nháp mang theo MÀU, mà seed chỉ khai màu cho
     * `aurora-e1`. Lấy xe đầu tiên thì kết quả phụ thuộc thứ tự sắp xếp: ở máy
     * này ra aurora và xanh, trên CI ra `meridian-x5` — xe không có màu nào —
     * rồi bài đỏ vì một lý do không liên quan đến thứ nó kiểm.
     */
    const xe = page.getByRole('link', { name: /aurora/i }).first();
    await expect(xe).toBeVisible();
    await xe.click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}$/);

    /*
     * ⚠️ Bản trước của bài này TỰ BỎ QUA phần nó kiểm, và xanh suốt nhiều tháng.
     *
     * Nó viết:
     *
     *     const formSoan = page.getByLabel(/tiêu đề/i);
     *     await expect(nutTaoNhap.or(formSoan).first()).toBeVisible();
     *     if (await nutTaoNhap.isVisible()) { … }
     *
     * Nút "Tạo bản nháp" KHÔNG tồn tại trong bản dựng giao diện hiện tại, nên
     * nhánh `if` không bao giờ chạy. Còn `getByLabel(/tiêu đề/i)` khớp cả nút
     * "Tiêu đề mức 2" trên thanh công cụ soạn thảo — luôn hiện, ở mọi trạng
     * thái. Phép `.or()` vì thế luôn đúng, và bài kiểm báo xanh mà chưa từng
     * bấm nút nào.
     *
     * 🔒 Hai chỗ sai cộng lại: một locator quá rộng, và một nhánh `if` không có
     *    vế `else` nào báo động. Cả hai đều là cách một bài kiểm đi VÒNG QUA
     *    vấn đề thay vì phát hiện nó.
     *
     * Bản này mốc vào hai NÚT loại trừ nhau theo trạng thái — có nháp thì "Lưu
     * nháp", chưa có thì "Tạo bản nháp" — nên không có trạng thái nào lọt qua mà
     * không bị khẳng định.
     */
    const nutTaoNhap = page.getByRole('button', { name: /^Tạo bản nháp$/ });
    const nutLuuNhap = page.getByRole('button', { name: /^Lưu nháp$/ });
    await expect(nutTaoNhap.or(nutLuuNhap).first()).toBeVisible({ timeout: 10_000 });

    if (await nutTaoNhap.isVisible().catch(() => false)) {
      await nutTaoNhap.click();
      // Sau khi tạo, nút đổi thành "Lưu nháp" và nhãn trạng thái hiện "Bản nháp".
      await expect(nutLuuNhap).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Bản nháp', { exact: true }).first()).toBeVisible();
    }

    /*
     * 🔒 Bản nháp phải mang theo NỘI DUNG của bản đang hiện, không phải một bản
     *    rỗng. Chép thiếu là biên tập viên sửa một chữ rồi xuất bản, và trang xe
     *    mất sạch màu — xem `cloneRevisionAsDraft`.
     */
    await page.getByRole('tab', { name: 'Màu sắc' }).click();
    const oTenMau = page.locator('input[id^="ten-mau-"]');
    await expect(oTenMau.first()).toBeVisible({ timeout: 15_000 });
    expect(await oTenMau.count()).toBeGreaterThan(0);
  });

  test('SA-E05 — lead từ landing hiện trong danh sách, và không bịa phiên bản xe', async ({
    page,
    request,
  }) => {
    /*
     * ⚠️ `SL-01`: khách KHÔNG chọn phiên bản vẫn bị gán phiên bản đứng đầu
     *    `sort_order` kèm tên và giá của nó, và màn chi tiết lead in thẳng ra
     *    "Xe quan tâm: … · Bản cao cấp". Tư vấn gọi lại chào đúng con số đó.
     *
     * Bài này gửi lead qua đúng đường khách đi — proxy same-origin của landing —
     * rồi mở màn lead bằng mắt nhân viên.
     */
    const ten = `Khách E2E SA ${Date.now().toString().slice(-6)}`;
    const landing = process.env.LANDING_URL ?? 'http://localhost:3003';

    const site = await request.get(`${landing}/api/public/site`);
    expect(site.ok()).toBeTruthy();
    const branchId = ((await site.json()) as { publicBranches: { id: string }[] })
      .publicBranches[0]!.id;

    const tao = await request.post(`${landing}/api/public/leads`, {
      data: {
        fullName: ten,
        phone: '0977000123',
        branchId,
        intent: 'TEST_DRIVE',
        consentAccepted: true,
      },
    });
    expect(tao.status(), await tao.text()).toBe(201);

    await dangNhap(page);
    await page.goto(`${ADMIN}/leads`);
    await expect(page.getByText(ten)).toBeVisible({ timeout: 15_000 });

    await page.getByText(ten).first().click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);

    // Khách không chọn xe nào, nên ô "Xe quan tâm" phải trống — không phải một
    // phiên bản do máy tự điền.
    await expect(page.getByText(/Bản (tiêu chuẩn|cao cấp|điện|xăng)/)).toHaveCount(0);
  });
});
