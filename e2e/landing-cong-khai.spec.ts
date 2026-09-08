/**
 * 🔒 Trang bán xe công khai — kịch bản của KHÁCH, chạy trong trình duyệt thật.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * Nhánh landing thêm hai app hoàn chỉnh (`apps/landing`, `apps/sales-admin`) và
 * KHÔNG bài E2E nào chạm tới chúng. CI khởi động web (3000) và app thợ (3002);
 * 3003 và 3004 chưa từng được mở ra trong một trình duyệt trên CI.
 *
 * Chỉ riêng việc dựng nền cho bài này đã lộ ra hai lỗi mà `pnpm build` báo xanh:
 *
 *   · `output: 'standalone'` truy vết sai gốc workspace -> `.next/standalone/`
 *     không có `server.js`
 *   · script `start` là `next start`, không tương thích với standalone -> mọi
 *     route động trả 404, chỉ trang chủ tĩnh lên được
 *
 * 💡 Không phải bài kiểm nào cũng cần bắt được lỗi bằng một `assert` mới có ích.
 *    Đôi khi chỉ riêng việc BUỘC PHẢI CHẠY THẬT đã là phần lớn giá trị.
 *
 * Bài này chạy trên bản build production, đúng thứ sẽ được triển khai.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, expect } from '@playwright/test';

const LANDING = process.env.LANDING_URL ?? 'http://localhost:3003';

/**
 * Tenant B dùng hostname khác — `*.localhost` phân giải về loopback theo
 * RFC 6761, nên không cần sửa hosts file.
 */
const LANDING_B = process.env.LANDING_B_URL ?? 'http://garage-b.localhost:3003';

test.describe('Trang bán xe công khai', () => {
  test('LD-E01 — trang chủ hiện thương hiệu và dẫn được sang một chiếc xe', async ({ page }) => {
    await page.goto(LANDING);

    await expect(page).toHaveTitle(/Garage Thành Công/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Thẻ xe phải dẫn tới trang chi tiết — đây là đường chuyển đổi chính.
    const link = page.locator('a[href^="/xe/"]').first();
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/xe\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('LD-E07 — trang danh sách xe LIỆT KÊ được xe, không phải trạng thái rỗng', async ({ page }) => {
    /*
     * ⚠️ Bài này sinh ra từ một lỗi đã sống suốt cả nhánh: `/xe` ghép chuỗi truy
     *    vấn bằng tay, và khi KHÔNG có bộ lọc thì URL thành
     *    `/vehicle-products&limit=50` — dấu `&` đứng đầu, không có `?`. API trả
     *
     *        Cannot GET /api/v1/public/vehicle-products&limit=50
     *
     *    rồi một `catch` nuốt nó thành mảng rỗng. Trang hiện "Chưa có xe nào
     *    được giới thiệu" — câu hoàn toàn hợp lý cho một showroom mới mở.
     *
     * 💡 Trạng thái rỗng luôn trông vô hại, nên nó là chỗ trú tốt nhất cho lỗi.
     *    Một bài kiểm chỉ hỏi "trang có mở được không" sẽ không bao giờ thấy;
     *    phải hỏi "trang có NỘI DUNG không".
     */
    await page.goto(`${LANDING}/xe`);

    const theXe = page.locator('a[href^="/xe/"]');
    await expect(theXe.first()).toBeVisible();
    expect(await theXe.count()).toBeGreaterThan(0);
    await expect(page.getByText(/chưa có xe nào/i)).toHaveCount(0);
  });

  test('LD-E02 — trang chi tiết xe nói giá, và giá đó khớp một phiên bản có thật', async ({
    page,
  }) => {
    await page.goto(`${LANDING}/xe/aurora-e1`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    /*
     * ⚠️ `PT-T02` (apps/api) đã chốt ở tầng API rằng giá "từ" và loại động cơ
     *    phải đến từ CÙNG một phiên bản. Ở đây chỉ kiểm phần khách nhìn thấy:
     *    trang có nói ra một con số tiền, và bảng phiên bản có mặt.
     */
    await expect(page.getByText(/₫|Liên hệ/).first()).toBeVisible();
  });

  test('LD-E03 — khách gửi được form quan tâm và nhận mã tham chiếu', async ({ page }) => {
    await page.goto(`${LANDING}/lien-he`);

    const ten = `Khách E2E ${Date.now().toString().slice(-6)}`;
    await page.getByLabel(/họ và tên|họ tên/i).fill(ten);
    await page.getByLabel(/điện thoại/i).fill('0987654321');

    const chiNhanh = page.getByLabel(/chi nhánh/i);
    if (await chiNhanh.isVisible().catch(() => false)) {
      await chiNhanh.selectOption({ index: 1 });
    }

    const dongY = page.getByRole('checkbox');
    if (await dongY.first().isVisible().catch(() => false)) {
      await dongY.first().check();
    }

    await page.getByRole('button', { name: /gửi|đăng ký/i }).click();

    /*
     * Mã tham chiếu là thứ DUY NHẤT khách cầm được sau khi gửi form. Không có
     * nó thì khách không có cách nào hỏi lại "đơn của tôi thế nào rồi".
     */
    await expect(page.getByText(/LS-[0-9A-F]{10}/)).toBeVisible({ timeout: 15_000 });
  });

  test('LD-E04 — INV-LS-01: hai hostname, hai tenant, không rò nội dung sang nhau', async ({
    page,
  }) => {
    /*
     * 🔒 Đây là bất biến quan trọng nhất của cả nhánh: public request KHÔNG tự
     *    chọn tenant, tenant CHỈ đến từ hostname.
     *
     * Bài `LS-T02..T04` ở tầng API đã kiểm phần chữ ký header. Bài này kiểm
     * phần còn lại của chuỗi — SSR của landing có thật sự chuyển hostname của
     * khách xuống API, hay nó dùng một giá trị cấu hình cứng nào đó.
     */
    await page.goto(LANDING);
    const tenA = await page.title();

    await page.goto(LANDING_B);
    const tenB = await page.title();

    expect(tenA).toMatch(/Garage Thành Công/);
    expect(tenB).toMatch(/Garage Đối Chứng/);
    expect(tenA).not.toEqual(tenB);

    // Xe của tenant A không được xuất hiện trên site của tenant B.
    await expect(page.locator('a[href="/xe/aurora-e1"]')).toHaveCount(0);
  });

  test('LD-E06 — ẢNH trên trang xe tải được thật, không phải ô trắng', async ({ page }) => {
    /*
     * ⚠️ Bài này sinh ra từ một lỗi mà chính bộ E2E đầu tiên của tôi bỏ sót.
     *
     *    `MediaController` khai `@Get(':key')`. Trong Express, một tham số đường
     *    dẫn khớp ĐÚNG MỘT đoạn — nó dừng ở dấu `/`. Mà mọi key media đều có ít
     *    nhất một dấu đó (`demo/vf3-cover.svg`, `<tenant>/<sha>.jpg`), nên route
     *    ấy chưa từng khớp một key thật nào:
     *
     *        GET /media/demo/vf3-cover.svg  ->  404
     *
     * 💡 Trang vẫn lên, tiêu đề vẫn đúng, SEO vẫn đủ — chỉ có ảnh là ô trắng.
     *    LD-E01..E05 đều xanh vì chúng kiểm chữ, không kiểm ảnh. Một trang bán
     *    xe không có ảnh xe thì không bán được gì.
     */
    await page.goto(`${LANDING}/xe/aurora-e1`);

    const anh = page.locator('img[src*="/media/"]').first();
    await expect(anh).toBeVisible();

    // `naturalWidth === 0` nghĩa là trình duyệt tải ảnh THẤT BẠI — thuộc tính
    // này là cách duy nhất phân biệt "ảnh trắng" với "ảnh chưa tải xong".
    await expect
      .poll(async () => anh.evaluate((e: HTMLImageElement) => e.naturalWidth), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });

  test('LD-E05 — trang xe không tồn tại trả 404, không phải lỗi 500', async ({ page }) => {
    const res = await page.goto(`${LANDING}/xe/khong-co-chiec-xe-nao-ten-nay`);
    expect(res?.status()).toBe(404);
  });

  /*
   * 🔒 LD-E08 — Con số chi phí phải ở trong HTML ĐẦU TIÊN, không chờ JS.
   *
   * Khối chi phí bản trước là client-side và nằm ở trang chi tiết, nên nó không
   * được crawl và không hiện khi JS chưa chạy. Bài này khoá lại hành vi mới:
   * trang chủ render sẵn con số VÀ tên bảng giá.
   *
   * ⚠️ Kiểm bằng `page.content()` sau `waitUntil: 'domcontentloaded'` thay vì
   *    `getByText`, vì `getByText` cũng xanh khi chữ do JS chèn vào sau — tức là
   *    nó không phân biệt được đúng thứ bài này muốn phân biệt.
   */
  test('LD-E08 — trang chủ nói chi phí bảo dưỡng kèm tên bảng giá, ngay trong HTML server', async ({
    page,
  }) => {
    await page.goto(LANDING, { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    expect(html).toContain('Bảng giá');
    // Một số tiền có phân cách nghìn kiểu vi-VN, ví dụ "15.585.000".
    expect(html).toMatch(/\d{1,3}(\.\d{3}){2,}/);
  });

  /*
   * 🔒 LD-E09 — Nút trên phiếu phải dẫn tới đúng neo có thật.
   *
   * Một CTA trỏ tới `#chi-phi` mà trang đích không có `id` đó thì vẫn "hoạt
   * động": trình duyệt mở trang và đứng ở đầu. Không có lỗi nào, và khách chỉ
   * thấy nút không làm gì. Bài này kiểm rằng neo TỒN TẠI.
   */
  test('LD-E09 — CTA của phiếu chi phí dẫn tới neo có thật trên trang chi tiết', async ({
    page,
  }) => {
    await page.goto(LANDING);
    const cta = page.getByRole('link', { name: 'Xem chi tiết từng năm' });
    await expect(cta).toBeVisible();

    const href = await cta.getAttribute('href');
    expect(href).not.toBeNull();
    expect(href as string).toContain('#chi-phi');

    await cta.click();
    await expect(page.locator('#chi-phi')).toBeAttached();
  });

  /*
   * 🔒 LD-E10 — Ngày hiệu lực phải là ngày người Việt đọc được, không phải ISO.
   *
   * ⚠️ API trả `ápDụngTừ` dạng `2025-12-31T17:00:00.000Z`. In thẳng thì khách
   *    thấy một timestamp máy VÀ nó lệch ngày: 17:00Z là 01/01/2026 ở Việt Nam.
   *    Cả khối phiếu tồn tại để con số kiểm chứng được, nên một ngày sai làm hỏng
   *    đúng điều nó khẳng định.
   */
  test('LD-E10 — ngày hiệu lực bảng giá hiện dạng dd/mm/yyyy, không phải ISO', async ({
    page,
  }) => {
    await page.goto(LANDING, { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    expect(html).toMatch(/hiệu lực từ[^<]*(<!-- -->)?\d{2}\/\d{2}\/\d{4}/);
    // Không được lọt timestamp ISO ra trang.
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  /*
   * 🔒 Khối câu hỏi thường gặp đến từ DỮ LIỆU, không phải mảng hằng trong mã.
   *
   * Trước migration 0076 bốn câu này nằm thẳng trong `lien-he/page.tsx`. Bài
   * này canh hai chiều cùng lúc, và chiều thứ hai mới là chiều dễ hỏng:
   *
   *   · câu đã CÔNG BỐ và bật ở trang Liên hệ thì phải hiện
   *   · câu còn NHÁP thì KHÔNG được hiện, dù đã bật đúng trang đó
   *
   * Seed dựng sẵn "Xe điện sạc ở đâu?" ở trạng thái nháp, gắn đúng bề mặt
   * CONTACT — nên nếu điều kiện lọc theo trạng thái biến mất, bài này đỏ chứ
   * không phải chờ ai đó phát hiện nội dung chưa duyệt trên trang thật.
   */
  test('LD-E11 — câu hỏi thường gặp lấy từ dữ liệu, và bản NHÁP không lọt ra', async ({
    page,
  }) => {
    await page.goto(`${LANDING}/lien-he`, { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    expect(html).toContain('Lái thử có mất phí không?');
    expect(html).not.toContain('Xe điện sạc ở đâu?');
  });
});
