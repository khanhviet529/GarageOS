/**
 * 🔒 Trang HAI phải khác trang MỘT, và giá trên thẻ xe phải là giá có thật.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * Ba lỗi dưới đây cùng một họ: chúng đều đi qua mọi bài kiểm hiện có, vì mọi
 * bài kiểm hiện có chỉ nhìn TRANG ĐẦU TIÊN của một danh sách NGẮN.
 *
 *   · `PublicLandingService.listProducts` nhận `cursor`, trả `nextCursor`, và
 *     KHÔNG dùng `cursor` trong câu SQL. Mọi trang đều là trang một.
 *   · `SalesService.listLeads` để lọt chuỗi `$#` vào SQL — trang hai trả 500
 *     với `syntax error at or near "$"`.
 *   · Thẻ xe ghép `MIN(giá)` với `MIN(loại động cơ)` từ hai hàng khác nhau, nên
 *     quảng cáo một chiếc xe không tồn tại ở một mức giá không tồn tại.
 *
 * 💡 Một API trả `nextCursor` là đang NÓI RẰNG phân trang hoạt động. Bài kiểm
 *    không đi hết một vòng phân trang thì không kiểm được lời nói đó.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const HOST_A = 'localhost';
const uniq = `${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;

let pool: Pool;
let token = '';
const slugDaTao: string[] = [];

function kyHost(host: string): string {
  const secret = process.env.EDGE_SIGNING_SECRET ?? '';
  return createHmac('sha256', secret).update(host, 'utf8').digest('hex');
}

async function congKhai(duong: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${duong}`, {
    headers: {
      'x-garageos-original-host': HOST_A,
      'x-garageos-original-host-signature': kyHost(HOST_A),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

async function goi(
  method: string,
  duong: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${duong}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Mode': 'token',
      Authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

/**
 * Dựng một xe đã publish, với các phiên bản cho trước.
 *
 * `bienThe` xếp CỐ Ý sao cho phiên bản rẻ nhất KHÔNG phải phiên bản đứng đầu
 * bảng chữ cái theo `powertrain`, và cũng không phải phiên bản có `sort_order`
 * nhỏ nhất — đó là hình dạng làm lộ ra lỗi ghép hai phép MIN.
 */
async function dungXeDaDang(
  hau: string,
  bienThe: { name: string; powertrain: string; displayPrice: number | null; sortOrder: number }[],
): Promise<string> {
  const slug = `pt-${hau}-${uniq}`;
  const r = await goi('POST', '/api/v1/marketing/vehicle-products', {
    name: `Xe phân trang ${hau}`,
    makeName: 'ThửHãng',
    modelName: 'ThửDòng',
    slug,
    summary: `Tóm tắt xe ${hau} cho bài kiểm phân trang.`,
    description: 'Mô tả đủ dài để qua ràng buộc độ dài tối thiểu của revision.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  slugDaTao.push(slug);
  const id = r.body.id as string;

  for (const v of bienThe) {
    const res = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/variants`, {
      name: v.name,
      powertrain: v.powertrain,
      modelYear: 2026,
      displayPrice: v.displayPrice,
      sortOrder: v.sortOrder,
    });
    assert.equal(res.status, 201, `tạo phiên bản ${v.name}: ${JSON.stringify(res.body)}`);
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT draft_revision_id AS id FROM vehicle_product WHERE id = $1`,
    [id],
  );
  await ganAnhCover(rows[0]!.id);

  const p = await goi('GET', `/api/v1/marketing/vehicle-products/${id}`);
  const pub = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/publish`, {
    version: p.body.version,
  });
  assert.equal(pub.status, 201, `publish ${hau}: ${JSON.stringify(pub.body)}`);
  return id;
}

async function ganAnhCover(productRevisionId: string): Promise<void> {
  const sha = createHash('sha256').update(`pt-${uniq}-${productRevisionId}`).digest('hex');
  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000011'`,
    [TENANT_A],
  );
  const { rows: a } = await pool.query<{ id: string }>(
    `INSERT INTO media_asset (tenant_id, stable_key, kind, status, source_storage_key,
                              source_sha256, source_mime, byte_size, width, height,
                              license, license_owner, created_by)
     VALUES ($1,$2,'IMAGE','READY',$3,$4,'image/svg+xml',1024,1200,750,
             'CC0','Bài kiểm',$5)
     RETURNING id`,
    [TENANT_A, `pt-asset-${uniq}-${productRevisionId.slice(0, 8)}`, `src/${sha}.svg`, sha, u[0]!.id],
  );
  const { rows: r } = await pool.query<{ id: string }>(
    `INSERT INTO media_rendition (tenant_id, asset_id, profile, format, mime,
                                  width, height, storage_key, content_sha256, byte_size, visibility)
     VALUES ($1,$2,'POSTER','svg','image/svg+xml',1200,750,$3,$4,1024,'PUBLIC')
     RETURNING id`,
    [TENANT_A, a[0]!.id, `${TENANT_A}/${sha}.svg`, sha],
  );
  await pool.query(
    `INSERT INTO media_publication (tenant_id, rendition_id, public_storage_key,
                                    public_content_sha256, status, verified_at)
     VALUES ($1,$2,$3,$4,'READY', now())`,
    [TENANT_A, r[0]!.id, `${TENANT_A}/${sha}.svg`, sha],
  );
  await pool.query(
    `INSERT INTO vehicle_product_media (tenant_id, product_revision_id, media_asset_id,
                                        role, alt_text, sort_order, is_cover)
     VALUES ($1,$2,$3,'POSTER','Ảnh bìa xe phân trang',0,true)`,
    [TENANT_A, productRevisionId, a[0]!.id],
  );
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
    body: JSON.stringify({ phone: '0901000011', password: 'demo1234' }),
  });
  const j = (await res.json()) as { accessToken?: string };
  assert.ok(j.accessToken, 'không đăng nhập được MARKETING_PUBLISHER');
  token = j.accessToken;
});

after(async () => {
  // Lead của bài này nhận ra nhờ hậu tố `uniq` trong tên — dọn trước sản phẩm.
  await pool.query(
    `DELETE FROM lead_activity WHERE lead_id IN
       (SELECT id FROM sales_lead WHERE full_name LIKE $1)`,
    [`%${uniq}%`],
  );
  await pool.query(`DELETE FROM sales_lead WHERE full_name LIKE $1`, [`%${uniq}%`]);

  if (slugDaTao.length > 0) {
    const dieuKien = `(SELECT id FROM vehicle_product WHERE slug = ANY($1))`;
    await pool.query(
      `UPDATE vehicle_product SET draft_revision_id = NULL, published_revision_id = NULL
        WHERE slug = ANY($1)`,
      [slugDaTao],
    );
    await pool.query(
      `DELETE FROM vehicle_product_media WHERE product_revision_id IN
         (SELECT id FROM vehicle_product_revision WHERE product_id IN ${dieuKien})`,
      [slugDaTao],
    );
    await pool.query(
      `DELETE FROM media_publication WHERE rendition_id IN
         (SELECT r.id FROM media_rendition r JOIN media_asset a ON a.id = r.asset_id
           WHERE a.stable_key LIKE $1)`,
      [`pt-asset-${uniq}-%`],
    );
    await pool.query(
      `DELETE FROM media_rendition WHERE asset_id IN
         (SELECT id FROM media_asset WHERE stable_key LIKE $1)`,
      [`pt-asset-${uniq}-%`],
    );
    await pool.query(`DELETE FROM media_asset WHERE stable_key LIKE $1`, [`pt-asset-${uniq}-%`]);
    await pool.query(
      `DELETE FROM vehicle_variant_revision WHERE product_revision_id IN
         (SELECT id FROM vehicle_product_revision WHERE product_id IN ${dieuKien})`,
      [slugDaTao],
    );
    await pool.query(`DELETE FROM vehicle_variant WHERE product_id IN ${dieuKien}`, [slugDaTao]);
    await pool.query(
      `DELETE FROM vehicle_product_revision WHERE product_id IN ${dieuKien}`,
      [slugDaTao],
    );
    await pool.query(`DELETE FROM vehicle_product WHERE slug = ANY($1)`, [slugDaTao]);
  }
  await pool.end();
});

describe('🔒 Phân trang danh sách xe công khai', () => {
  test('PT-T01 — trang hai trả xe KHÁC trang một, và đi hết được danh sách', async () => {
    // Ba xe là đủ: limit = 1 thì phải đi qua ba trang riêng biệt.
    for (const h of ['a', 'b', 'c']) {
      await dungXeDaDang(h, [
        { name: 'Bản tiêu chuẩn', powertrain: 'ICE', displayPrice: 500_000_000, sortOrder: 0 },
      ]);
    }

    const daThay: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 30; i += 1) {
      const q: string = cursor === null
        ? '/api/v1/public/vehicle-products?limit=1'
        : `/api/v1/public/vehicle-products?limit=1&cursor=${encodeURIComponent(cursor)}`;
      const r = await congKhai(q);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      for (const it of r.body.items as { slug: string }[]) daThay.push(it.slug);
      cursor = r.body.nextCursor as string | null;
      if (cursor === null) break;
    }

    assert.equal(cursor, null, 'đi 30 vòng vẫn chưa hết — con trỏ không tiến');
    const trung = daThay.length - new Set(daThay).size;
    assert.equal(trung, 0, `có ${trung} xe lặp lại giữa các trang: ${daThay.join(', ')}`);
    for (const h of ['a', 'b', 'c']) {
      assert.ok(
        daThay.includes(`pt-${h}-${uniq}`),
        `đi hết phân trang mà vẫn sót xe pt-${h}-${uniq}`,
      );
    }
  });

  test('PT-T02 — giá và loại động cơ trên thẻ xe đến từ CÙNG một phiên bản', async () => {
    /*
     * Bản điện đắt hơn, bản xăng rẻ hơn.
     *
     * ⚠️ Trước bản sửa: MIN(giá) lấy 500 triệu của bản XĂNG, còn
     *    MIN(powertrain::text) lấy 'BEV' vì B đứng trước I trong bảng chữ cái.
     *    Thẻ xe hiện "Xe điện · từ 500.000.000 ₫" — sai cả hai vế cùng lúc.
     */
    await dungXeDaDang('gia', [
      { name: 'Bản điện', powertrain: 'BEV', displayPrice: 2_000_000_000, sortOrder: 0 },
      { name: 'Bản xăng', powertrain: 'ICE', displayPrice: 500_000_000, sortOrder: 1 },
    ]);

    let xe: any = null;
    let cursor: string | null = null;
    for (let i = 0; i < 30 && xe === null; i += 1) {
      const q: string = cursor === null
        ? '/api/v1/public/vehicle-products?limit=20'
        : `/api/v1/public/vehicle-products?limit=20&cursor=${encodeURIComponent(cursor)}`;
      const r = await congKhai(q);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      xe = (r.body.items as any[]).find((x) => x.slug === `pt-gia-${uniq}`) ?? null;
      cursor = r.body.nextCursor as string | null;
      if (cursor === null) break;
    }
    assert.ok(xe !== null, 'không tìm thấy xe vừa đăng trong danh sách công khai');

    assert.equal(xe.displayPrice, 500_000_000, 'giá "từ" phải là giá rẻ nhất');
    assert.equal(
      xe.powertrain,
      'ICE',
      'loại động cơ phải là của chính phiên bản rẻ nhất — nếu không thì thẻ xe quảng cáo một chiếc xe không tồn tại',
    );
  });
});

describe('🔒 Phân trang danh sách lead', () => {
  test('PT-T03 — trang hai của danh sách lead không vỡ', async () => {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
      body: JSON.stringify({ phone: '0901000013', password: 'demo1234' }),
    });
    const tokenSales = ((await res.json()) as { accessToken: string }).accessToken;

    /*
     * ⚠️ Con trỏ dựng tay là đủ: lỗi nằm ở việc DỰNG CÂU SQL, nên nó nổ ngay khi
     *    có bất kỳ con trỏ nào — không cần dữ liệu thật để tái hiện.
     *
     *      error: syntax error at or near "$"
     */
    const r = await fetch(
      `${API}/api/v1/sales/leads?limit=2&cursor=${encodeURIComponent(
        `2026-08-14T00:00:00.000Z_${TENANT_A}`,
      )}`,
      { headers: { Authorization: `Bearer ${tokenSales}`, 'X-Auth-Mode': 'token' } },
    );
    const body = await r.json();
    assert.equal(r.status, 200, `danh sách lead trang hai vỡ: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray((body as { items: unknown[] }).items), 'thiếu mảng items');
  });

  test('PT-T04 — đi hết phân trang lead không bỏ sót ai', async () => {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
      body: JSON.stringify({ phone: '0901000013', password: 'demo1234' }),
    });
    const tokenSales = ((await res.json()) as { accessToken: string }).accessToken;

    const { rows: bRows } = await pool.query<{ id: string }>(
      `SELECT b.id FROM branch b
         JOIN user_branch ub ON ub.branch_id = b.id
         JOIN app_user u ON u.id = ub.user_id
        WHERE u.phone = '0901000013' AND b.tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    const branchId = bRows[0]!.id;

    /*
     * 🔒 Ba lead này dựng bằng SQL, KHÔNG qua endpoint công khai.
     *
     * ⚠️ `LeadRateLimitGuard` cho 10 lượt mỗi (hostname, IP) trong 10 phút, và
     *    bộ đếm nằm trong BỘ NHỚ tiến trình API — nó sống qua nhiều lượt chạy
     *    test liên tiếp. Bản đầu của bài này gọi endpoint thật ba lần; chạy cả
     *    bộ ba lượt trong mười phút là hạn mức cạn, và bài đỏ với `RATE_LIMITED`
     *    chứ không phải vì phân trang sai.
     *
     * 💡 Bài này kiểm PHÂN TRANG, không kiểm việc tạo lead. Dữ liệu dựng sẵn thì
     *    dựng bằng con đường rẻ nhất — đúng như `lead-thao-tac-ghi.spec.ts` và
     *    `lead-luu-tru.spec.ts` vẫn làm. `PT-T05` mới là bài phải đi qua endpoint
     *    thật, và nó chỉ tốn một lượt.
     */
    const tenDaTao: string[] = [];
    for (const i of [1, 2, 3]) {
      const ten = `Khách phân trang ${uniq}-${i}`;
      await pool.query(
        `INSERT INTO sales_lead
           (tenant_id, branch_id, reference, full_name, phone_normalized,
            intent, source, consent_version, consented_at)
         VALUES ($1,$2,$3,$4,$5,'TEST_DRIVE','LANDING','2026-08-1', now())`,
        [TENANT_A, branchId, `PT-${uniq}-${i}`, ten, `09${uniq.slice(0, 6)}${i}`.slice(0, 10)],
      );
      tenDaTao.push(ten);
    }

    /*
     * ⚠️ `limit=1` ép mỗi ranh giới trang thành một lần chuyển con trỏ. Trước bản
     *    sửa, mỗi lần chuyển nuốt đúng một lead — và một lead biến mất là một
     *    khách hàng không ai gọi lại.
     */
    const daThay: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 60; i += 1) {
      const q: string = cursor === null
        ? '/api/v1/sales/leads?limit=1'
        : `/api/v1/sales/leads?limit=1&cursor=${encodeURIComponent(cursor)}`;
      const rr = await fetch(`${API}${q}`, {
        headers: { Authorization: `Bearer ${tokenSales}`, 'X-Auth-Mode': 'token' },
      });
      const thoBody = await rr.text();
      assert.equal(rr.status, 200, `trang ${i}: ${thoBody}`);
      const b = JSON.parse(thoBody) as { items: { fullName: string }[]; nextCursor: string | null };
      for (const it of b.items) daThay.push(it.fullName);
      cursor = b.nextCursor;
      if (cursor === null) break;
    }
    assert.equal(cursor, null, 'đi 60 vòng vẫn chưa hết — con trỏ không tiến');

    for (const ten of tenDaTao) {
      assert.ok(daThay.includes(ten), `đi hết phân trang mà vẫn sót lead "${ten}"`);
    }
    const trung = daThay.length - new Set(daThay).size;
    assert.equal(trung, 0, `có ${trung} lead lặp lại giữa các trang`);
  });

  test('PT-T05 — khách KHÔNG chọn phiên bản thì lead không tự gán một phiên bản', async () => {
    const id = await dungXeDaDang('khongchon', [
      { name: 'Bản điện', powertrain: 'BEV', displayPrice: 2_000_000_000, sortOrder: 0 },
      { name: 'Bản xăng', powertrain: 'ICE', displayPrice: 500_000_000, sortOrder: 1 },
    ]);
    const { rows: bRows } = await pool.query<{ id: string }>(
      `SELECT id FROM branch WHERE tenant_id = $1 ORDER BY code LIMIT 1`,
      [TENANT_A],
    );

    const ten = `Khách không chọn ${uniq}`;
    const r = await fetch(`${API}/api/v1/public/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-garageos-original-host': HOST_A,
        'x-garageos-original-host-signature': kyHost(HOST_A),
      },
      body: JSON.stringify({
        fullName: ten,
        phone: `097${uniq.slice(0, 7)}`.slice(0, 10),
        branchId: bRows[0]!.id,
        productId: id,
        intent: 'TEST_DRIVE',
        consentAccepted: true,
      }),
    });
    assert.equal(r.status, 201, await r.text());

    const { rows } = await pool.query<{ variant_id: string | null; snap: any }>(
      `SELECT variant_id, catalog_context_snapshot AS snap
         FROM sales_lead WHERE full_name = $1`,
      [ten],
    );
    assert.equal(rows.length, 1, 'không tìm thấy lead vừa tạo');
    /*
     * ⚠️ Trước bản sửa, chỗ này là phiên bản đứng đầu `sort_order` — "Bản điện",
     *    giá 2 tỷ. Màn chi tiết lead in ra "Xe quan tâm: … · Bản điện", và tư vấn
     *    gọi lại chào đúng con số đó. Khách chưa từng nói thế.
     */
    assert.equal(rows[0]!.variant_id, null, 'lead bị gán một phiên bản khách không chọn');
    assert.equal(rows[0]!.snap.variantName, null, 'snapshot ghi tên một phiên bản khách không chọn');
    assert.equal(
      Number(rows[0]!.snap.priceFrom),
      500_000_000,
      'giá "từ" trong snapshot phải trùng con số khách nhìn thấy trên thẻ xe',
    );

    await pool.query(`DELETE FROM lead_activity WHERE lead_id IN
       (SELECT id FROM sales_lead WHERE full_name = $1)`, [ten]);
    await pool.query(`DELETE FROM sales_lead WHERE full_name = $1`, [ten]);
  });
});
