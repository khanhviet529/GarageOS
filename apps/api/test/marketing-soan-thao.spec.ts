/**
 * 🔒 Luồng soạn thảo nội dung marketing phải chạy được từ đầu đến cuối.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * `0056` cấp cho `garageos_app` đúng `INSERT` và `SELECT` trên các bảng bản
 * nháp, rồi `REVOKE DELETE` — như thể `UPDATE` đã có sẵn. Nó chưa bao giờ được
 * cấp. Mọi lời gọi sửa bản nháp vì thế trả 500 với
 * `permission denied for table …`:
 *
 *   PATCH /marketing/vehicle-products/:id/draft
 *   PATCH /marketing/vehicle-experiences/:id/draft
 *   PATCH /marketing/site-profile/:draftId
 *   PATCH /marketing/branch-public-profiles/:branchId/draft
 *   POST  /marketing/vehicle-products/:id/publish     (ghi content_hash)
 *
 * Đây là lần thứ hai cùng một lỗi xuất hiện — lần đầu ở `sales_lead` (LS-008).
 * Cả hai sống sót vì bài kiểm phân quyền chỉ phân biệt 403 với không-403, và
 * với nó thì 500 cũng là "quyền đã cho qua".
 *
 * Bài này hỏi câu mà không bài nào đang hỏi: **thao tác này có chạy được không?**
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const uniq = `${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;

let pool: Pool;
let token = '';
let branchA = '';
const slugDaTao: string[] = [];

async function dangNhap(phone: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
    body: JSON.stringify({ phone, password: 'demo1234' }),
  });
  const j = (await res.json()) as { accessToken?: string };
  assert.ok(j.accessToken, `không đăng nhập được ${phone}`);
  return j.accessToken;
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

async function taoProduct(hau: string): Promise<string> {
  const slug = `mk-test-${hau}-${uniq}`;
  const r = await goi('POST', '/api/v1/marketing/vehicle-products', {
    name: `Xe Thử ${hau}`,
    makeName: 'ThửHãng',
    modelName: 'ThửDòng',
    slug,
    summary: 'Tóm tắt thử nghiệm cho bài kiểm soạn thảo.',
    description: 'Mô tả thử nghiệm đủ dài để qua ràng buộc độ dài tối thiểu.',
  });
  assert.equal(r.status, 201, `tạo sản phẩm thất bại: ${JSON.stringify(r.body)}`);
  slugDaTao.push(slug);
  return r.body.id;
}

/**
 * Gắn một ảnh cover đã publish vào bản nháp của sản phẩm.
 *
 * ⚠️ Phải làm bằng SQL vì Phase 1 KHÔNG có endpoint gắn media: đường đi duy
 * nhất là job `pnpm media:import` chạy bằng operator credential (SRS mục 6.8).
 * Đó là quyết định có chủ ý — nhưng hệ quả là người soạn nội dung không tự
 * publish được một sản phẩm mới nếu không có kỹ thuật viên chạy job trước.
 */
async function ganAnhCover(productRevisionId: string): Promise<void> {
  const sha = createHash('sha256').update(`mk-${uniq}-${productRevisionId}`).digest('hex');
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
    [TENANT_A, `mk-asset-${uniq}-${productRevisionId.slice(0, 8)}`, `src/${sha}.svg`, sha, u[0]!.id],
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
     VALUES ($1,$2,$3,'POSTER','Ảnh bìa xe thử nghiệm',0,true)`,
    [TENANT_A, productRevisionId, a[0]!.id],
  );
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  token = await dangNhap('0901000011'); // MARKETING_PUBLISHER — có cả write và publish
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM branch WHERE tenant_id = $1 ORDER BY code LIMIT 1`,
    [TENANT_A],
  );
  branchA = rows[0]!.id;
});

after(async () => {
  if (slugDaTao.length > 0) {
    /*
     * Dọn theo đúng chiều phụ thuộc: con trỏ draft/published của `vehicle_product`
     * trỏ vào revision, còn revision con của variant trỏ ngược lên revision cha.
     * Gỡ con trỏ trước, rồi xoá từ lá lên gốc.
     */
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
      [`mk-asset-${uniq}-%`],
    );
    await pool.query(
      `DELETE FROM media_rendition WHERE asset_id IN
         (SELECT id FROM media_asset WHERE stable_key LIKE $1)`,
      [`mk-asset-${uniq}-%`],
    );
    await pool.query(`DELETE FROM media_asset WHERE stable_key LIKE $1`, [`mk-asset-${uniq}-%`]);
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
  await pool.query(`DELETE FROM audit_log WHERE entity_type = 'vehicle_product'
     AND created_at > now() - interval '10 minutes'`);
  await pool.end();
});

describe('🔒 Soạn thảo catalog chạy được thật', () => {
  test('MK-T01 — sửa bản nháp sản phẩm', async () => {
    const id = await taoProduct('patch');
    const r = await goi('PATCH', `/api/v1/marketing/vehicle-products/${id}/draft`, {
      version: 0,
      name: 'Xe Thử đã đổi tên',
      summary: 'Tóm tắt mới sau khi sửa bản nháp.',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const { rows } = await pool.query<{ name: string }>(
      `SELECT r.name FROM vehicle_product_revision r
         JOIN vehicle_product p ON p.draft_revision_id = r.id
        WHERE p.id = $1`,
      [id],
    );
    assert.equal(rows[0]!.name, 'Xe Thử đã đổi tên');
  });

  test('MK-T02 — publish sản phẩm, bản published trỏ đúng nội dung', async () => {
    const id = await taoProduct('publish');

    /*
     * Sản phẩm không có phiên bản nào thì không publish được
     * (`PRODUCT_NOT_PUBLISHABLE`) — đúng quy tắc: một trang xe không có phiên
     * bản là một trang không có gì để bán.
     */
    const bienThe = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/variants`, {
      name: 'Bản Tiêu Chuẩn',
      powertrain: 'BEV',
      modelYear: 2026,
      displayPrice: 500_000_000,
    });
    assert.equal(bienThe.status, 201, JSON.stringify(bienThe.body));

    /*
     * Lấy version từ GET chứ không giả định 0: `marketing_set_product_draft()`
     * trỏ con trỏ draft bằng một UPDATE, nên `touch_row()` đã tăng version
     * ngay trong lúc tạo. Đây là hành vi đúng — bài kiểm phải đi đúng đường
     * client thật đi.
     */
    const truoc = await goi('GET', `/api/v1/marketing/vehicle-products/${id}`);
    await ganAnhCover(truoc.body.draft.id);

    const chiTiet = await goi('GET', `/api/v1/marketing/vehicle-products/${id}`);
    assert.equal(chiTiet.status, 200, JSON.stringify(chiTiet.body));

    const r = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/publish`, {
      version: chiTiet.body.version,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<{ status: string; published_at: Date | null }>(
      `SELECT r.status, r.published_at FROM vehicle_product_revision r
         JOIN vehicle_product p ON p.published_revision_id = r.id
        WHERE p.id = $1`,
      [id],
    );
    assert.equal(rows.length, 1, 'không có bản published nào được trỏ tới');
    assert.equal(rows[0]!.status, 'PUBLISHED');
    assert.notEqual(rows[0]!.published_at, null);
  });

  test('MK-T03 — sửa bản nháp hồ sơ trang', async () => {
    const hienTai = await goi('GET', '/api/v1/marketing/site-profile');
    assert.equal(hienTai.status, 200, JSON.stringify(hienTai.body));
    const draft = hienTai.body?.draft;
    assert.ok(draft?.id, 'không có bản nháp hồ sơ trang để sửa');

    const r = await goi('PATCH', `/api/v1/marketing/site-profile/${draft.id}`, {
      version: draft.version,
      brandName: `Thương hiệu thử ${uniq}`,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const { rows } = await pool.query<{ brand_name: string }>(
      `SELECT brand_name FROM site_profile WHERE id = $1`,
      [draft.id],
    );
    assert.equal(rows[0]!.brand_name, `Thương hiệu thử ${uniq}`);

    // Trả lại tên cũ để không ảnh hưởng bài kiểm khác đọc landing
    await goi('PATCH', `/api/v1/marketing/site-profile/${draft.id}`, {
      version: draft.version + 1,
      brandName: draft.brandName,
    });
  });

  test('MK-T04 — sửa bản nháp hồ sơ chi nhánh công khai', async () => {
    const r = await goi(
      'PATCH',
      `/api/v1/marketing/branch-public-profiles/${branchA}/draft`,
      { version: 0, publicName: `Chi nhánh thử ${uniq}` },
    );
    assert.ok(
      r.status === 200 || r.status === 409,
      `nhận ${r.status}: ${JSON.stringify(r.body)}`,
    );
  });

  test('MK-T05 — bản đã publish không sửa được bằng role ứng dụng', async () => {
    /*
     * Đối chứng cho việc cấp `UPDATE`: quyền được mở ra để sửa BẢN NHÁP, và
     * lớp chặn thật là trigger `chan_sua_version_bat_bien` — không phải việc
     * thiếu quyền một cách tình cờ.
     */
    const id = await taoProduct('batbien');
    await goi('POST', `/api/v1/marketing/vehicle-products/${id}/variants`, {
      name: 'Bản Tiêu Chuẩn',
      powertrain: 'BEV',
      modelYear: 2026,
    });
    const truoc = await goi('GET', `/api/v1/marketing/vehicle-products/${id}`);
    await ganAnhCover(truoc.body.draft.id);
    const ct = await goi('GET', `/api/v1/marketing/vehicle-products/${id}`);
    const pub = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/publish`, {
      version: ct.body.version,
    });
    assert.equal(pub.status, 201, `chưa publish được thì bài kiểm bất biến vô nghĩa: ${JSON.stringify(pub.body)}`);

    const app = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos',
    });
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await assert.rejects(
        () =>
          client.query(
            `UPDATE vehicle_product_revision SET name = 'Sửa trộm'
              WHERE id = (SELECT published_revision_id FROM vehicle_product WHERE id = $1)`,
            [id],
          ),
        'sửa được bản đã publish (INV-LS-07)',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await app.end();
    }
  });
});
