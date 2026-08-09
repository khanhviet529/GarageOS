import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Phase 3 — màn hoá đơn trên chi tiết đơn (BC-07).
 *
 * Ba điều dưới đây chỉ tồn tại ở trình duyệt, và test API không với tới được:
 *
 *  1. **Thứ tự trên màn hình.** Bảng đối chiếu phải nằm TRƯỚC nút phát hành.
 *     API trả cả hai trong cùng một JSON nên nó không có khái niệm "trước";
 *     chỉ DOM mới nói được thu ngân nhìn thấy chênh lệch trước hay sau khi bấm.
 *  2. **Nút khoá theo lý do.** Server chặn phát hành khi thiếu lý do — nhưng
 *     người dùng gặp cái chặn đó dưới dạng một thông báo lỗi SAU khi đã bấm,
 *     tức là sau khi đã tưởng mình xong việc. Giao diện phải khoá từ trước.
 *  3. **Hoá đơn đã phát hành không còn nút sửa.** INV-M-03 là bất biến ở DB;
 *     ở đây kiểm rằng màn hình nói ra điều đó bằng cách KHÔNG có nút, chứ
 *     không phải bằng một lỗi 409 sau cú bấm.
 *
 * Dữ liệu lấy từ bốn cảnh seed dựng sẵn (`infra/seed.ts`, khối Phase 3), nên
 * không bộ test nào phải tự đi qua cả vòng đời đơn để có một hoá đơn để nhìn.
 *
 * 🔒 Bộ này KHÔNG bấm phát hành thật. Phát hành là một chiều: chạy lượt thứ hai
 *    mà chưa seed lại thì hoá đơn nháp không còn, và bài sẽ đỏ ở chỗ chẳng liên
 *    quan gì tới thứ nó định kiểm. Việc phát hành đã có `test/hoa-don.spec.ts`
 *    kiểm ở tầng API, nơi mỗi bài tự dựng lấy dữ liệu của mình.
 */

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, caret: 'initial' });
}

const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Tìm id đơn theo mã, qua API.
 *
 * Không có màn danh sách đơn nào lọc theo mã, và đơn đã bàn giao thì không còn
 * nằm ở "Xe trong xưởng" nữa — nên đường duy nhất tới `/don/<id>` của một đơn
 * seed cụ thể là hỏi thẳng API.
 */
async function idDon(request: APIRequestContext, ma: string): Promise<string> {
  const dn = await request.post(`${API}/api/v1/auth/login`, {
    // 🔒 Client dùng Bearer phải XIN token — mặc định máy chủ chỉ đặt cookie
    headers: { 'X-Auth-Mode': 'token' },
    data: { phone: '0901000006', password: 'demo1234' },
  });
  const { accessToken } = (await dn.json()) as { accessToken: string };
  // `open=false` để lấy CẢ đơn đã bàn giao: mặc định danh sách chỉ trả đơn
  // chưa hoàn tất, mà hai trong bốn cảnh seed đều đã giao xe xong
  const ds = await request.get(`${API}/api/v1/repair-orders?open=false`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await ds.json()) as
    | { items: { id: string; code: string }[] }
    | { id: string; code: string }[];
  const items = Array.isArray(body) ? body : body.items;
  const don = items.find((o) => o.code === ma);
  if (don === undefined) throw new Error(`Seed thiếu đơn ${ma} — chạy lại pnpm db:seed`);
  return don.id;
}

async function dangNhap(page: Page, phone: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

test('🔒 bảng đối chiếu đứng TRƯỚC nút phát hành và nói lý do từng dòng', async ({
  page,
  request,
}) => {
  const id = await idDon(request, 'RO-DEMO-0300');
  await dangNhap(page, '0901000006');
  await page.goto(`/don/${id}`);

  const hop = page.locator('section.card', { has: page.getByRole('heading', { name: 'Hoá đơn' }) });
  await expect(hop.getByRole('heading', { name: 'Đối chiếu báo giá và thực tế' })).toBeVisible({
    timeout: 15_000,
  });

  // Ba dòng, ba lý do khác nhau — bảng phải phân biệt được chúng
  await expect(hop.getByText('Phát sinh sau báo giá')).toBeVisible();
  await expect(hop.getByText('Thực tế khác báo giá')).toBeVisible();

  /*
   * Thứ tự thật trong DOM, không phải "cả hai đều hiện".
   *
   * `Node.compareDocumentPosition` trả về bit 4 (DOCUMENT_POSITION_FOLLOWING)
   * khi phần tử kia đứng SAU trong tài liệu. Đây là cách duy nhất khẳng định
   * "bảng nằm trên nút" mà không phụ thuộc vào toạ độ pixel — toạ độ đổi theo
   * cỡ màn hình, thứ tự tài liệu thì không.
   */
  const bangTruocNut = await page.evaluate(() => {
    const bang = document.evaluate(
      "//h4[contains(., 'Đối chiếu báo giá và thực tế')]",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    const nut = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Phát hành hoá đơn'),
    );
    if (bang === null || nut === undefined) return null;
    return (bang.compareDocumentPosition(nut) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(bangTruocNut).toBe(true);

  await shot(page, '40-hoa-don-doi-chieu');
});

test('🔒 lệch quá ngưỡng: nút phát hành khoá tới khi có lý do đủ dài', async ({ page, request }) => {
  const id = await idDon(request, 'RO-DEMO-0300');
  await dangNhap(page, '0901000006');
  await page.goto(`/don/${id}`);

  const hop = page.locator('section.card', { has: page.getByRole('heading', { name: 'Hoá đơn' }) });
  const nut = hop.getByRole('button', { name: 'Phát hành hoá đơn' });
  await expect(nut).toBeVisible({ timeout: 15_000 });

  // Cảnh báo phải nói CẢ con số lệch LẪN ngưỡng — "vượt ngưỡng" không có
  // ngưỡng bên cạnh thì người đọc không biết lệch bao nhiêu là nhiều
  const canhBao = hop.locator('.alert.warn');
  await expect(canhBao).toContainText('20%');
  await expect(canhBao).toContainText('5%');

  await expect(nut).toBeDisabled();

  /*
   * Lý do quá ngắn vẫn phải khoá.
   *
   * Đây mới là chỗ đáng kiểm: "ok" là một lý do, về mặt kỹ thuật. Ngưỡng 10 ký
   * tự không chặn được người cố tình, nhưng chặn được người đang vội — và người
   * đang vội mới là trường hợp thường gặp.
   */
  const oLyDo = hop.getByLabel('Lý do chênh lệch');
  await oLyDo.fill('ok');
  await expect(nut).toBeDisabled();

  await oLyDo.fill('Mở ra thấy phải thay thêm bộ lọc, đã gọi báo khách lúc 14h');
  await expect(nut).toBeEnabled();

  await shot(page, '41-hoa-don-vuot-nguong');
});

test('🔒 hoá đơn đã phát hành: không còn nút sửa, và hiện đã thu theo TỪNG DÒNG', async ({
  page,
  request,
}) => {
  /*
   * Đơn RO-DEMO-0200 là cảnh bảo hiểm: một dòng 2.500.000 được trả từ HAI
   * nguồn — 2.000.000 của bảo hiểm và 500.000 mức khấu trừ khách chịu. Cột
   * "Đã thu" của dòng đó phải hiện đủ 2.500.000, vì đó là bằng chứng nhìn thấy
   * được rằng phân bổ đi tới DÒNG chứ không tới hoá đơn.
   */
  const id = await idDon(request, 'RO-DEMO-0200');
  await dangNhap(page, '0901000006');
  await page.goto(`/don/${id}`);

  const hop = page.locator('section.card', { has: page.getByRole('heading', { name: 'Hoá đơn' }) });
  await expect(hop.getByRole('heading', { name: /INV-DEMO-0200/ })).toBeVisible({
    timeout: 15_000,
  });

  // Không nút nào sửa được gì nữa
  await expect(hop.getByRole('button', { name: 'Phát hành hoá đơn' })).toHaveCount(0);
  await expect(hop.getByRole('button', { name: /Dựng lại/ })).toHaveCount(0);
  await expect(hop.getByRole('button', { name: /Lập hoá đơn/ })).toHaveCount(0);

  const dongSon = hop.locator('tr', { hasText: 'Sơn lại cản trước' });
  await expect(dongSon).toHaveCount(1);
  // Cột cuối là "Đã thu" — phải bằng đủ thành tiền, dù tiền đến từ hai phiếu
  // thu khác nhau của hai người trả khác nhau
  await expect(dongSon.locator('td.phai').last()).toHaveText('2.500.000đ');

  await shot(page, '42-hoa-don-da-phat-hanh');
});

test('🔒 vai không xem được tiền thì không thấy hộp hoá đơn', async ({ page, request }) => {
  /*
   * Thợ không có `invoice:read`. Chặn thật nằm ở API; ở đây khẳng định giao
   * diện KHÔNG hiện một hộp hoá đơn rỗng kèm nút bấm được — trả 403 rồi vẫn vẽ
   * nút ra là mời người dùng bấm vào một thứ chắc chắn hỏng.
   */
  const id = await idDon(request, 'RO-DEMO-0300');
  await dangNhap(page, '0901000004');
  await page.goto(`/don/${id}`);

  // Thợ có thể không mở được cả trang đơn — cả hai kết cục đều đạt, miễn là
  // không có nút phát hành nào hiện ra
  await expect(page.getByRole('button', { name: 'Phát hành hoá đơn' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Lập hoá đơn/ })).toHaveCount(0);
});
