/**
 * 🔒 Vòng đời nội dung marketing phải ĐI ĐƯỢC MỘT VÒNG, không chỉ đi được một chiều.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * `marketing-soan-thao.spec.ts` hỏi "thao tác này có chạy được không?" và đã bắt
 * được cả một lớp lỗi phân quyền. Nhưng nó hỏi từng thao tác MỘT LẦN, theo đúng
 * thứ tự thuận: tạo → sửa → publish.
 *
 * Mọi lỗi dưới đây chỉ lộ ra ở lần thứ HAI, hoặc khi đi ngược:
 *
 *   · publish rồi thì không còn đường sửa — không route nào dựng lại bản nháp
 *     cho sản phẩm, nên `PATCH …/draft` trả 404 vĩnh viễn
 *   · rollback trải nghiệm trả 500: số revision lấy từ bản nguồn (`SUPERSEDED`,
 *     tức bản CŨ) thay vì từ MAX, nên đụng `UNIQUE (…, revision_number)`
 *   · bấm "tạo bản nháp" hai lần trả 500 vì cùng lý do
 *
 * 💡 Một quy trình soạn thảo là một VÒNG: soạn, đăng, sửa, đăng lại, và lỡ tay
 *    thì quay về. Bài kiểm đi một chiều chỉ chứng minh được nửa vòng đầu — và
 *    nửa sau là nửa mà người dùng sống trong đó hằng ngày.
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
const slugDaTao: string[] = [];

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

/** Tạo sản phẩm + một phiên bản xe + ảnh cover — đủ điều kiện publish. */
async function taoProductPublishDuoc(hau: string): Promise<string> {
  const slug = `mk-vd-${hau}-${uniq}`;
  const r = await goi('POST', '/api/v1/marketing/vehicle-products', {
    name: `Xe vòng đời ${hau}`,
    makeName: 'ThửHãng',
    modelName: 'ThửDòng',
    slug,
    summary: 'Tóm tắt cho bài kiểm vòng đời nội dung.',
    description: 'Mô tả đủ dài để qua ràng buộc độ dài tối thiểu của revision.',
  });
  assert.equal(r.status, 201, `tạo sản phẩm thất bại: ${JSON.stringify(r.body)}`);
  slugDaTao.push(slug);
  const id = r.body.id as string;

  const bienThe = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/variants`, {
    name: 'Bản tiêu chuẩn',
    powertrain: 'ICE',
    modelYear: 2026,
    displayPrice: 500_000_000,
  });
  assert.equal(bienThe.status, 201, `tạo phiên bản thất bại: ${JSON.stringify(bienThe.body)}`);

  const { rows } = await pool.query<{ id: string }>(
    `SELECT draft_revision_id AS id FROM vehicle_product WHERE id = $1`,
    [id],
  );
  await ganAnhCover(rows[0]!.id);
  return id;
}

/** Ảnh cover phải gắn bằng SQL — Phase 1 không có endpoint gắn media. */
async function ganAnhCover(productRevisionId: string): Promise<void> {
  const sha = createHash('sha256').update(`vd-${uniq}-${productRevisionId}`).digest('hex');
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
    [TENANT_A, `vd-asset-${uniq}-${productRevisionId.slice(0, 8)}`, `src/${sha}.svg`, sha, u[0]!.id],
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
     VALUES ($1,$2,$3,'POSTER','Ảnh bìa xe vòng đời',0,true)`,
    [TENANT_A, productRevisionId, a[0]!.id],
  );
}

async function docProduct(id: string): Promise<any> {
  const r = await goi('GET', `/api/v1/marketing/vehicle-products/${id}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

async function publish(id: string): Promise<{ status: number; body: any }> {
  const p = await docProduct(id);
  return goi('POST', `/api/v1/marketing/vehicle-products/${id}/publish`, {
    version: p.version,
  });
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
  if (slugDaTao.length > 0) {
    const dieuKien = `(SELECT id FROM vehicle_product WHERE slug = ANY($1))`;
    await pool.query(
      `UPDATE vehicle_product SET draft_revision_id = NULL, published_revision_id = NULL
        WHERE slug = ANY($1)`,
      [slugDaTao],
    );
    await pool.query(
      `UPDATE vehicle_experience SET draft_version_id = NULL, published_version_id = NULL
        WHERE product_id IN ${dieuKien}`,
      [slugDaTao],
    );
    await pool.query(
      `DELETE FROM vehicle_experience_version WHERE experience_id IN
         (SELECT id FROM vehicle_experience WHERE product_id IN ${dieuKien})`,
      [slugDaTao],
    );
    await pool.query(`DELETE FROM vehicle_experience WHERE product_id IN ${dieuKien}`, [slugDaTao]);
    await pool.query(
      `DELETE FROM vehicle_product_media WHERE product_revision_id IN
         (SELECT id FROM vehicle_product_revision WHERE product_id IN ${dieuKien})`,
      [slugDaTao],
    );
    await pool.query(
      `DELETE FROM media_publication WHERE rendition_id IN
         (SELECT r.id FROM media_rendition r JOIN media_asset a ON a.id = r.asset_id
           WHERE a.stable_key LIKE $1)`,
      [`vd-asset-${uniq}-%`],
    );
    await pool.query(
      `DELETE FROM media_rendition WHERE asset_id IN
         (SELECT id FROM media_asset WHERE stable_key LIKE $1)`,
      [`vd-asset-${uniq}-%`],
    );
    await pool.query(`DELETE FROM media_asset WHERE stable_key LIKE $1`, [`vd-asset-${uniq}-%`]);
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

describe('🔒 Nội dung đã đăng vẫn sửa được', () => {
  test('MK-T10 — publish rồi vẫn tạo được bản nháp mới và publish lần hai', async () => {
    const id = await taoProductPublishDuoc('vong');

    const pub1 = await publish(id);
    assert.equal(pub1.status, 201, `publish lần 1: ${JSON.stringify(pub1.body)}`);

    /*
     * ⚠️ Đây là chỗ nhánh landing từng đi vào ngõ cụt: sau publish,
     *    `draft_revision_id` về NULL và KHÔNG route nào dựng lại được. Sai một
     *    chữ trong mô tả xe là phải xoá sản phẩm và tạo lại — mất slug, tức mất
     *    URL công khai đã được đánh chỉ mục.
     */
    const nhap = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/draft`);
    assert.equal(nhap.status, 201, `không tạo lại được bản nháp: ${JSON.stringify(nhap.body)}`);

    const sua = await goi('PATCH', `/api/v1/marketing/vehicle-products/${id}/draft`, {
      version: 0,
      summary: 'Tóm tắt đã sửa sau khi xe được đăng công khai.',
    });
    assert.equal(sua.status, 200, `sửa bản nháp mới: ${JSON.stringify(sua.body)}`);

    // Trang công khai CHƯA đổi — bản nháp là bản nháp.
    const giua = await docProduct(id);
    assert.notEqual(
      giua.published.summary,
      'Tóm tắt đã sửa sau khi xe được đăng công khai.',
      'bản nháp đã rò ra trang công khai trước khi publish',
    );

    const pub2 = await publish(id);
    assert.equal(pub2.status, 201, `publish lần 2: ${JSON.stringify(pub2.body)}`);

    const sau = await docProduct(id);
    assert.equal(sau.published.summary, 'Tóm tắt đã sửa sau khi xe được đăng công khai.');
    assert.equal(
      sau.published.revisionNumber,
      2,
      'bản publish thứ hai phải mang số revision 2',
    );
  });

  test('MK-T11 — bấm "tạo bản nháp" hai lần trả về CÙNG một bản nháp', async () => {
    const id = await taoProductPublishDuoc('haiclick');
    assert.equal((await publish(id)).status, 201);

    const l1 = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/draft`);
    const l2 = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/draft`);
    assert.equal(l1.status, 201, JSON.stringify(l1.body));
    assert.equal(l2.status, 201, `lần bấm thứ hai vỡ: ${JSON.stringify(l2.body)}`);
    assert.equal(
      l2.body.draftId,
      l1.body.draftId,
      'lần bấm thứ hai dựng thêm một bản nháp nữa',
    );
  });

  test('MK-T12 — rollback sản phẩm khôi phục đúng nội dung bản trước', async () => {
    const id = await taoProductPublishDuoc('rbsp');
    assert.equal((await publish(id)).status, 201);

    await goi('POST', `/api/v1/marketing/vehicle-products/${id}/draft`);
    await goi('PATCH', `/api/v1/marketing/vehicle-products/${id}/draft`, {
      version: 0,
      summary: 'Bản thứ hai — nội dung này sẽ bị thu hồi.',
    });
    assert.equal((await publish(id)).status, 201);
    assert.equal(
      (await docProduct(id)).published.summary,
      'Bản thứ hai — nội dung này sẽ bị thu hồi.',
    );

    const rb = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/rollback`);
    assert.equal(rb.status, 201, `rollback vỡ: ${JSON.stringify(rb.body)}`);
    assert.equal(
      (await docProduct(id)).published.summary,
      'Tóm tắt cho bài kiểm vòng đời nội dung.',
      'rollback không đưa nội dung về bản trước',
    );
  });

  test('MK-T13 — rollback khi đang có bản nháp bị từ chối bằng lỗi NÓI ĐƯỢC, không phải 500', async () => {
    const id = await taoProductPublishDuoc('rbnhap');
    assert.equal((await publish(id)).status, 201);
    await goi('POST', `/api/v1/marketing/vehicle-products/${id}/draft`);
    await goi('PATCH', `/api/v1/marketing/vehicle-products/${id}/draft`, {
      version: 0,
      summary: 'Bản thứ hai để sinh ra một bản SUPERSEDED.',
    });
    assert.equal((await publish(id)).status, 201);

    // Giờ có bản cũ để khôi phục VÀ một bản nháp đang soạn dở.
    const nhap = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/draft`);
    assert.equal(nhap.status, 201);

    const rb = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/rollback`);
    assert.equal(rb.status, 422, `phải là lỗi nghiệp vụ: ${JSON.stringify(rb.body)}`);
    assert.match(
      rb.body.error.message as string,
      /bản nháp/i,
      'thông báo phải nói ra vướng mắc thật: đang có bản nháp',
    );
  });
});

describe('🔒 Vòng đời trải nghiệm 360', () => {
  test('MK-T14 — rollback trải nghiệm sau hai lần publish không vỡ', async () => {
    const id = await taoProductPublishDuoc('tn');
    const ex = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/experiences`, {
      kind: 'EXTERIOR_SPIN',
      label: 'Xoay ngoại thất',
      config: { frames: 24 },
    });
    assert.equal(ex.status, 201, JSON.stringify(ex.body));
    const eid = ex.body.id as string;

    const docTN = async (): Promise<any> => {
      const r = await goi('GET', `/api/v1/marketing/vehicle-products/${id}/experiences`);
      return r.body.find((x: any) => x.id === eid);
    };

    const pub = async (): Promise<{ status: number; body: any }> =>
      goi('POST', `/api/v1/marketing/vehicle-experiences/${eid}/publish`, {
        version: (await docTN()).version,
      });

    assert.equal((await pub()).status, 201, 'publish trải nghiệm lần 1');
    const cl = await goi('POST', `/api/v1/marketing/vehicle-experiences/${eid}/draft`);
    assert.equal(cl.status, 201, JSON.stringify(cl.body));
    assert.equal((await pub()).status, 201, 'publish trải nghiệm lần 2');

    /*
     * ⚠️ Trước bản sửa, dòng này trả 500. Số revision mới được tính là
     *    "bản SUPERSEDED + 1" = 2, mà revision 2 đang là bản PUBLISHED:
     *
     *      ERROR: duplicate key value violates unique constraint
     *             "vehicle_experience_version_tenant_id_experience_id_revision_key"
     *
     *    Không phải trường hợp biên — rollback ĐẦU TIÊN của MỌI trải nghiệm đều
     *    rơi vào đây.
     */
    const rb = await goi('POST', `/api/v1/marketing/vehicle-experiences/${eid}/rollback`);
    assert.equal(rb.status, 201, `rollback trải nghiệm vỡ: ${JSON.stringify(rb.body)}`);

    const { rows } = await pool.query<{ n: string; trung: string }>(
      `SELECT COUNT(*)::text AS n,
              (COUNT(*) - COUNT(DISTINCT revision_number))::text AS trung
         FROM vehicle_experience_version WHERE experience_id = $1`,
      [eid],
    );
    assert.equal(rows[0]!.trung, '0', 'có hai bản mang cùng một số revision');
    assert.equal(rows[0]!.n, '3', 'rollback phải sinh đúng một bản mới');
  });

  test('MK-T15 — kind không sửa được qua config, danh sách và manifest không nói khác nhau', async () => {
    const id = await taoProductPublishDuoc('kind');
    const ex = await goi('POST', `/api/v1/marketing/vehicle-products/${id}/experiences`, {
      kind: 'EXTERIOR_SPIN',
      label: 'Xoay ngoại thất',
      /*
       * ⚠️ Client nhét `kind` khác vào `config`. Trước bản sửa, phần rải đặt
       *    SAU nên config thắng cột — và từ đó danh sách trên trang xe (đọc cột)
       *    với trình xem (đọc config) mô tả hai loại trải nghiệm khác nhau.
       */
      config: { kind: 'INTERIOR_PANORAMA', frames: 24 },
    });
    assert.equal(ex.status, 201, JSON.stringify(ex.body));

    const { rows } = await pool.query<{ cot: string; cfg: string }>(
      `SELECT e.kind AS cot, v.config->>'kind' AS cfg
         FROM vehicle_experience e
         JOIN vehicle_experience_version v ON v.id = e.draft_version_id
        WHERE e.id = $1`,
      [ex.body.id],
    );
    assert.equal(rows[0]!.cot, 'EXTERIOR_SPIN');
    assert.equal(
      rows[0]!.cfg,
      'EXTERIOR_SPIN',
      'config ghi đè được cột kind — danh sách và trình xem sẽ nói khác nhau',
    );
  });
});
