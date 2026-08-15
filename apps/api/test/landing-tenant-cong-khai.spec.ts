/**
 * 🔒 HÀNG RÀO: biên giới tenant của bề mặt CÔNG KHAI (landing bán xe).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao hàng rào này tồn tại
 *
 * Trước landing, mọi đường vào hệ thống đều đi qua JWT: `tenantId` nằm trong
 * token đã ký, và `INV-T-02` chỉ cần nói "đừng lấy tenant từ tham số request".
 *
 * Landing phá vỡ giả định đó. Người truy cập không có tài khoản, nên tenant
 * phải được suy ra từ **hostname**. Hostname lại là thứ client tự khai trong
 * một header. Toàn bộ độ an toàn của luồng này nằm ở chỗ: API tin hostname nào,
 * và vì lý do gì.
 *
 * Rà soát ngày 2026-08-14 (docs/reviews/2026-08-14-luong-tenant-public-landing.md)
 * tìm ra sáu vấn đề, trong đó hai cái cho phép chọn tenant bằng một header và
 * một cái biến canonical URL của cả site thành `https://null`. Không phát hiện
 * nào trong số đó bị bắt bởi test — vì không có test nào cho luồng này.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Nguyên tắc của bài này
 *
 * 1. Mỗi ca kiểm đúng MỘT mệnh đề, và mệnh đề đó phải nằm trong `INV-LS-*`.
 * 2. Ca nào kiểm hành vi "không được xảy ra" thì phải dựng được trạng thái xấu
 *    thật, không giả lập.
 * 3. Dữ liệu do bài này dựng lên đều mang hậu tố `uniq` và bị xoá ở `after()`.
 *    Bài quét trước đã học được điều này bằng cách để lại giữ chỗ ACTIVE và làm
 *    những test CHẲNG LIÊN QUAN đỏ ở lần chạy sau.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const APP_URL =
  process.env.DATABASE_URL ??
  'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

/** Host đã seed: TENANT_A ↔ localhost, TENANT_B ↔ garage-b.localhost */
const HOST_A = 'localhost';
const HOST_B = 'garage-b.localhost';

/** Slug sản phẩm đã publish của TENANT_A (seed) */
const SLUG_A = 'aurora-e1';

const uniq = `${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;

let admin: Pool;
let app: Pool;
let branchA = '';
let branchB = '';
let authorA = '';
/** Tenant dựng riêng cho ca alias mồ côi — không đụng dữ liệu seed */
let tenantLS = '';

const ALIAS_A = `alias-${uniq}.localhost`;
const HOST_PENDING = `pending-${uniq}.localhost`;
const HOST_DISABLED = `disabled-${uniq}.localhost`;
const LS_PRIMARY = `ls-primary-${uniq}.localhost`;
const LS_ALIAS = `ls-alias-${uniq}.localhost`;

function signHost(host: string): string {
  const secret = process.env.EDGE_SIGNING_SECRET ?? '';
  return createHmac('sha256', secret).update(host, 'utf8').digest('hex');
}

interface PublicCallOptions {
  /** `false` = cố tình KHÔNG ký, mô phỏng người lạ gọi thẳng API */
  sign?: boolean;
  /** chữ ký sai, để phân biệt "thiếu chữ ký" với "chữ ký hỏng" */
  badSignature?: boolean;
  body?: unknown;
  /** IP client giả — chỉ có tác dụng khi API tin proxy */
  forwardedFor?: string;
  method?: string;
}

async function callPublic(
  host: string,
  path: string,
  opts: PublicCallOptions = {},
): Promise<{ status: number; body: any; location: string | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-garageos-original-host': host,
  };
  if (opts.sign !== false) {
    headers['x-garageos-original-host-signature'] = opts.badSignature === true
      ? `${signHost(host).slice(0, -1)}0`
      : signHost(host);
  }
  if (opts.forwardedFor !== undefined) headers['x-forwarded-for'] = opts.forwardedFor;

  const res = await fetch(`${API}/api/v1/public${path}`, {
    method: opts.method ?? 'GET',
    headers,
    redirect: 'manual',
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, location: res.headers.get('location') };
}

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

function leadHopLe(branchId: string): Record<string, unknown> {
  return {
    fullName: 'Khách Thử Nghiệm',
    phone: '0912345678',
    branchId,
    intent: 'TEST_DRIVE',
    consentAccepted: true,
  };
}

before(async () => {
  admin = new Pool({ connectionString: ADMIN_URL });
  app = new Pool({ connectionString: APP_URL });

  const b = await admin.query<{ id: string; tenant_id: string }>(
    `SELECT id, tenant_id FROM branch WHERE tenant_id IN ($1,$2) ORDER BY tenant_id, code`,
    [TENANT_A, TENANT_B],
  );
  branchA = b.rows.find((r) => r.tenant_id === TENANT_A)!.id;
  branchB = b.rows.find((r) => r.tenant_id === TENANT_B)!.id;

  const u = await admin.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  authorA = u.rows[0]!.id;

  // Alias ACTIVE của TENANT_A — dùng cho ca redirect 308
  await admin.query(
    `INSERT INTO site_domain (tenant_id, hostname, status, is_primary)
     VALUES ($1,$2,'ACTIVE',false), ($1,$3,'PENDING',false), ($1,$4,'DISABLED',false)`,
    [TENANT_A, ALIAS_A, HOST_PENDING, HOST_DISABLED],
  );

  // Tenant riêng cho ca "xoá primary" — không được đụng vào seed
  const t = await admin.query<{ id: string }>(
    `INSERT INTO tenant (name) VALUES ($1) RETURNING id`,
    [`LS Test ${uniq}`],
  );
  tenantLS = t.rows[0]!.id;
  await admin.query(
    `INSERT INTO site_domain (tenant_id, hostname, status, is_primary)
     VALUES ($1,$2,'ACTIVE',true), ($1,$3,'ACTIVE',false)`,
    [tenantLS, LS_PRIMARY, LS_ALIAS],
  );
});

after(async () => {
  await admin.query(`DELETE FROM site_domain WHERE hostname = ANY($1)`, [
    [ALIAS_A, HOST_PENDING, HOST_DISABLED, LS_PRIMARY, LS_ALIAS],
  ]);
  if (tenantLS !== '') {
    await admin.query(`DELETE FROM tenant WHERE id = $1`, [tenantLS]);
  }
  await admin.query(
    `DELETE FROM vehicle_product_revision WHERE tenant_id = $1 AND name LIKE $2`,
    [TENANT_A, `LS Test%${uniq}%`],
  );
  await admin.query(`DELETE FROM vehicle_product WHERE tenant_id = $1 AND slug LIKE $2`, [
    TENANT_A,
    `ls-test-%-${uniq}`,
  ]);
  await admin.query(`DELETE FROM lead_activity WHERE tenant_id = ANY($1)`, [[TENANT_A, TENANT_B]]);
  await admin.query(`DELETE FROM sales_lead WHERE full_name = $1`, ['Khách Thử Nghiệm']);
  await admin.end();
  await app.end();
});

describe('INV-LS-01 — tenant của request công khai chỉ đến từ host đã được ký', () => {
  test('LS-T01 — host của tenant này không đọc được sản phẩm của tenant kia', async () => {
    const cua_minh = await callPublic(HOST_A, `/vehicle-products/${SLUG_A}`);
    assert.equal(cua_minh.status, 200, 'đối chứng: chính chủ phải đọc được');

    const cua_nguoi = await callPublic(HOST_B, `/vehicle-products/${SLUG_A}`);
    assert.equal(
      cua_nguoi.status,
      404,
      'host của tenant B đọc được sản phẩm của tenant A — RLS hoặc resolution đã hỏng',
    );
  });

  test('LS-T02 — host KHÔNG ký không được chọn tenant', async () => {
    const r = await callPublic(HOST_A, '/site', { sign: false });
    assert.equal(
      r.status,
      404,
      'API tin một header không ký — bất kỳ ai cũng chọn được tenant (LS-001)',
    );
  });

  test('LS-T03 — chữ ký sai một ký tự bị từ chối', async () => {
    const r = await callPublic(HOST_A, '/site', { badSignature: true });
    assert.equal(r.status, 404, 'chữ ký hỏng vẫn được chấp nhận');
  });

  test('LS-T04 — POST lead với host không ký không ghi được gì', async () => {
    const truoc = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sales_lead WHERE full_name = $1`,
      ['Khách Thử Nghiệm'],
    );
    const r = await callPublic(HOST_A, '/leads', {
      method: 'POST',
      sign: false,
      body: leadHopLe(branchA),
      forwardedFor: '203.0.113.201',
    });
    const sau = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sales_lead WHERE full_name = $1`,
      ['Khách Thử Nghiệm'],
    );

    assert.notEqual(r.status, 201, 'ghi được lead bằng host không ký');
    assert.equal(
      sau.rows[0]!.n,
      truoc.rows[0]!.n,
      'số lead thay đổi — người lạ bơm được dữ liệu vào tenant bất kỳ (LS-001)',
    );
  });
});

describe('INV-LS-04/11 — domain, canonical và alias', () => {
  test('LS-T05 — domain lạ, PENDING và DISABLED trả CÙNG một 404', async () => {
    const la = await callPublic(`khong-ton-tai-${uniq}.localhost`, '/site');
    const cho_duyet = await callPublic(HOST_PENDING, '/site');
    const da_tat = await callPublic(HOST_DISABLED, '/site');

    assert.equal(la.status, 404);
    assert.equal(cho_duyet.status, 404);
    assert.equal(da_tat.status, 404);

    /*
     * Phản hồi phải giống nhau tới mức không suy ra được domain nào "có thật
     * nhưng chưa bật" — chênh lệch đó đủ để dò xem đối thủ sắp mở site nào.
     *
     * `requestId` bị loại khỏi phép so: nó PHẢI khác nhau ở mỗi request (đó là
     * mục đích của nó), nên để nguyên thì bài kiểm luôn đỏ vì lý do sai.
     */
    const vanTay = (body: any): string =>
      JSON.stringify({ code: body?.code, message: body?.message });
    const chuan = vanTay(la.body);
    assert.equal(vanTay(cho_duyet.body), chuan, 'domain PENDING phân biệt được với domain lạ');
    assert.equal(vanTay(da_tat.body), chuan, 'domain DISABLED phân biệt được với domain lạ');
  });

  test('LS-T06 — alias ACTIVE redirect 308 về primary, giữ nguyên path', async () => {
    const r = await callPublic(ALIAS_A, `/vehicle-products/${SLUG_A}`);
    assert.equal(r.status, 308);
    assert.ok(
      r.location?.startsWith(`https://${HOST_A}`),
      `redirect sai đích: ${String(r.location)}`,
    );
    assert.ok(r.location?.includes(SLUG_A), 'redirect làm mất path đang xem');
  });

  test('LS-T07 — không xoá được domain primary khi tenant còn alias ACTIVE', async () => {
    await assert.rejects(
      () => admin.query(`DELETE FROM site_domain WHERE hostname = $1`, [LS_PRIMARY]),
      'xoá được primary, để lại alias ACTIVE mồ côi (LS-003)',
    );
  });

  test('LS-T08 — không có `null` nào chảy vào redirect hay canonical', async () => {
    /*
     * Nếu LS-T07 xanh thì trạng thái mồ côi không dựng được và ca này chỉ là
     * đối chứng. Nếu LS-T07 đỏ, primary đã bị xoá thật và đây là ca cho thấy
     * hậu quả: `LEFT JOIN` trả NULL, service dựng chuỗi `https://null`.
     */
    const r = await callPublic(LS_ALIAS, '/site');
    assert.ok(
      r.location === null || !r.location.includes('null'),
      `redirect trỏ vào host không tồn tại: ${String(r.location)}`,
    );
    if (r.status === 200) {
      assert.ok(
        !JSON.stringify(r.body).includes('://null'),
        'canonical origin là `https://null` — mọi thẻ canonical/sitemap của tenant này hỏng',
      );
    }
  });

  test('LS-T09 — hostname sai định dạng bị chặn ở tầng DB', async () => {
    /*
     * Giá trị này chảy thẳng vào `Location:` và vào canonical. `normalizeHostname()`
     * chỉ gác host ĐẾN TỪ request, không gác host GHI VÀO bảng — nên ràng buộc
     * phải nằm ở DB (nguyên tắc 1 của CLAUDE.md).
     */
    for (const xau of ['EVIL.COM', 'evil.com/path', 'evil com', '-evil.com', 'evil.com:8080']) {
      await assert.rejects(
        () =>
          admin.query(
            `INSERT INTO site_domain (tenant_id, hostname, status, is_primary)
             VALUES ($1,$2,'PENDING',false)`,
            [TENANT_A, xau],
          ),
        `hostname "${xau}" được ghi vào DB (LS-004)`,
      );
    }
  });
});

describe('INV-LS-05/07 — chỉ nội dung đã publish ra công khai, và nó bất biến', () => {
  test('LS-T10 — sản phẩm chưa publish trả 404, đã archive trả 410', async () => {
    const chuaPublish = `ls-test-draft-${uniq}`;
    await admin.query(
      `INSERT INTO vehicle_product (tenant_id, stable_key, slug, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4)`,
      [TENANT_A, `ls-draft-${uniq}`, chuaPublish, authorA],
    );
    const r1 = await callPublic(HOST_A, `/vehicle-products/${chuaPublish}`);
    assert.equal(r1.status, 404, 'bản nháp rò ra công khai');

    const daArchive = `ls-test-archived-${uniq}`;
    await admin.query(
      `INSERT INTO vehicle_product (tenant_id, stable_key, slug, lifecycle_status, created_by, updated_by)
       VALUES ($1,$2,$3,'ARCHIVED',$4,$4)`,
      [TENANT_A, `ls-arch-${uniq}`, daArchive, authorA],
    );
    const r2 = await callPublic(HOST_A, `/vehicle-products/${daArchive}`);
    assert.equal(r2.status, 410, 'sản phẩm đã ngừng giới thiệu phải trả 410, không phải 404');
  });

  test('LS-T11 — role ứng dụng không sửa được bản nội dung đã publish', async () => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await assert.rejects(
        () =>
          client.query(
            `UPDATE site_profile SET brand_name = 'Bị sửa trộm' WHERE status = 'PUBLISHED'`,
          ),
        'sửa được bản đã publish bằng role ứng dụng (INV-LS-07)',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});

describe('INV-LS-06/14 — phạm vi và quyền của nhánh bán xe', () => {
  test('LS-T12 — lead không nhận branchId của tenant khác', async () => {
    const r = await callPublic(HOST_A, '/leads', {
      method: 'POST',
      body: leadHopLe(branchB),
      forwardedFor: '203.0.113.202',
    });
    assert.notEqual(r.status, 201, 'ghi được lead vào chi nhánh của tenant khác');

    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sales_lead WHERE branch_id = $1 AND full_name = $2`,
      [branchB, 'Khách Thử Nghiệm'],
    );
    assert.equal(rows[0]!.n, '0');
  });

  test('LS-T13 — vai marketing không chạm được dữ liệu vận hành xưởng', async () => {
    /*
     * `MARKETING_EDITOR` trong seed ĐƯỢC gán chi nhánh HN01 — hợp lý về mặt tổ
     * chức, người làm marketing cũng thuộc một chi nhánh nào đó. Hệ quả là
     * `branchScope()` không lọc họ ra: nếu endpoint không kiểm vai, họ nhận
     * đúng dữ liệu vận hành của chi nhánh mình.
     *
     * Vì thế bài này không chỉ đòi "khác 200" mà còn đếm số dòng rò ra — một
     * mảng rỗng và một mảng có dữ liệu là hai mức độ khác hẳn nhau, và thông
     * báo lỗi phải nói rõ đang ở mức nào.
     */
    const token = await dangNhap('0901000010'); // MARKETING_EDITOR
    const sai: string[] = [];
    for (const duong of ['/api/v1/parts', '/api/v1/invoices', '/api/v1/repair-orders']) {
      const res = await fetch(`${API}${duong}`, {
        headers: { 'X-Auth-Mode': 'token', Authorization: `Bearer ${token}` },
      });
      if (res.status === 403 || res.status === 404) continue;

      const body = (await res.json().catch(() => null)) as unknown;
      const soDong = Array.isArray(body)
        ? body.length
        : Array.isArray((body as { items?: unknown[] })?.items)
          ? (body as { items: unknown[] }).items.length
          : -1;
      sai.push(`${duong} → ${res.status}, ${soDong} bản ghi`);
    }
    assert.deepEqual(
      sai,
      [],
      `vai marketing chạm được dữ liệu vận hành xưởng (INV-LS-14):\n  ${sai.join('\n  ')}`,
    );
  });
});

describe('NFR-SEC-002 — giới hạn tần suất form lead', () => {
  test('LS-T14 — honeypot không ghi gì nhưng vẫn trả như thành công', async () => {
    const r = await callPublic(HOST_A, '/leads', {
      method: 'POST',
      body: { ...leadHopLe(branchA), fullName: 'Bot Thử Nghiệm', honeypot: 'x' },
      forwardedFor: '203.0.113.203',
    });
    assert.equal(r.status, 201, 'bot biết ngay mình bị phát hiện');
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sales_lead WHERE full_name = $1`,
      ['Bot Thử Nghiệm'],
    );
    assert.equal(rows[0]!.n, '0', 'lead của bot được ghi vào DB');
  });

  /*
   * Ca này chạy CUỐI vì nó cố ý tiêu nhiều lượt gửi.
   *
   * Landing chạy sau CDN/edge. Nếu API không tin `X-Forwarded-For`, `req.ip` là
   * IP của edge — giống nhau cho mọi khách — nên toàn bộ người dùng của toàn bộ
   * tenant chia nhau một hạn mức. Đó không phải "chặn chưa đủ chặt", đó là tự
   * chặn chính mình ở đúng điểm chuyển đổi duy nhất của trang.
   */
  test('LS-T15 — mỗi IP khách có hạn mức riêng, không dùng chung IP của edge', async () => {
    const gioiHan = Number(process.env.LEAD_RATE_LIMIT_MAX ?? 10);
    const soLuot = gioiHan + 4;
    const ketQua: number[] = [];
    for (let i = 0; i < soLuot; i += 1) {
      const r = await callPublic(HOST_A, '/leads', {
        method: 'POST',
        body: { ...leadHopLe(branchA), fullName: `Khách Thử Nghiệm` },
        forwardedFor: `198.51.100.${i + 10}`,
      });
      ketQua.push(r.status);
    }
    const biChan = ketQua.filter((s) => s === 429).length;
    assert.equal(
      biChan,
      0,
      `${biChan}/${soLuot} request từ ${soLuot} IP KHÁC NHAU bị chặn — ` +
        'hạn mức đang tính theo IP của edge chứ không phải của khách (LS-002)',
    );
  });
});
