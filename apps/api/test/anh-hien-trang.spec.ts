/**
 * 🔒 Ảnh hiện trạng — Phase 4.3.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao tính năng này quan trọng hơn vẻ ngoài của nó
 *
 * `STATUS.md` để mục 4.3 ở trạng thái 🟡 với ghi chú: "giao diện đang hiện cảnh
 * báo thay vì giả vờ có". Bảng `repair_order_photo` đã dựng từ migration 0006,
 * `getById` đã đọc nó — nhưng KHÔNG endpoint nào ghi vào. Suốt 4 phase, ô ảnh
 * trên màn đơn luôn rỗng.
 *
 * Ảnh hiện trạng là bằng chứng mạnh nhất khi khách khiếu nại một vết trầy không
 * do xưởng gây ra. Không có nó, tranh chấp đó không có trọng tài.
 *
 * Bài này kiểm cả ba lớp: quyền, nội dung, và nơi lưu.
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
let tokenCoVan = '';
let tokenTho = '';
let tokenThuKho = '';
let orderId = '';
const anhDaTao: string[] = [];

/** PNG 1×1 thật — đủ để qua kiểm chữ ký, đủ nhỏ để không làm chậm bài. */
const PNG_THAT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
  token: string,
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

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenCoVan = await dangNhap('0901000003'); // SERVICE_ADVISOR
  tokenTho = await dangNhap('0901000004'); // TECHNICIAN
  tokenThuKho = await dangNhap('0901000005'); // STORE_KEEPER

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM repair_order WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
    [TENANT_A],
  );
  orderId = rows[0]!.id;
});

after(async () => {
  if (anhDaTao.length > 0) {
    await pool.query('DELETE FROM repair_order_photo WHERE id = ANY($1::uuid[])', [anhDaTao]);
  }
  await pool.end();
});

describe('🔒 Tải ảnh hiện trạng', () => {
  test('AH-T01 — cố vấn tải được ảnh, và ảnh lấy lại được qua /media', async () => {
    const r = await goi(tokenCoVan, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
      phase: 'INTAKE',
      contentType: 'image/png',
      dataBase64: PNG_THAT.toString('base64'),
      caption: `Vết trầy cửa trái ${uniq}`,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    anhDaTao.push(r.body.id);

    /*
     * 🔒 Key phải content-addressed: `<tenant>/<sha256>.<ext>`.
     *
     * Không phải quy ước cho đẹp — `MediaController` lấy ETag TỪ CHÍNH key này
     * và phát `Cache-Control: immutable`. Key không mang hash thì hoặc mất ETag,
     * hoặc tệ hơn, cache một nội dung dưới một khoá có thể đổi.
     */
    const sha = createHash('sha256').update(PNG_THAT).digest('hex');
    assert.equal(r.body.storageKey, `${TENANT_A}/${sha}.png`);

    const anh = await fetch(`${API}/media/${r.body.storageKey}`);
    assert.equal(anh.status, 200, 'ảnh vừa tải lên không lấy lại được');
    assert.equal(anh.headers.get('content-type'), 'image/png');
    assert.equal(anh.headers.get('etag'), `"${sha}"`);
    const lay = Buffer.from(await anh.arrayBuffer());
    assert.ok(lay.equals(PNG_THAT), 'nội dung lấy về khác nội dung đã gửi');
  });

  test('AH-T02 — ảnh hiện trong chi tiết đơn', async () => {
    const r = await goi(tokenCoVan, 'GET', `/api/v1/repair-orders/${orderId}`);
    assert.equal(r.status, 200);
    const co = (r.body.photos as { caption: string | null }[]).some(
      (p) => p.caption === `Vết trầy cửa trái ${uniq}`,
    );
    assert.ok(co, 'ảnh đã tải lên không xuất hiện ở chi tiết đơn');
  });

  test('AH-T03 — THỢ tải được ảnh', async () => {
    /*
     * Người đứng cạnh chiếc xe lúc phát hiện vết trầy là người thợ. Bắt họ đi
     * tìm cố vấn để chụp hộ là cách chắc chắn khiến tấm ảnh đó không bao giờ
     * được chụp.
     */
    const r = await goi(tokenTho, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
      phase: 'IN_PROGRESS',
      contentType: 'image/png',
      dataBase64: PNG_THAT.toString('base64'),
      caption: `Thợ chụp ${uniq}`,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    anhDaTao.push(r.body.id);
  });

  test('AH-T04 — thủ kho KHÔNG tải được', async () => {
    const r = await goi(tokenThuKho, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
      phase: 'INTAKE',
      contentType: 'image/png',
      dataBase64: PNG_THAT.toString('base64'),
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test('AH-T05 — tệp KHÔNG phải ảnh bị từ chối, dù khai là image/png', async () => {
    /*
     * ⚠️ `contentType` do client khai, và nó quyết định đuôi file máy chủ ghi ra
     *    — tức nó chảy thẳng vào header `Content-Type` khi ảnh được phục vụ lại
     *    từ cùng origin với API. Một tệp HTML khai là PNG mà lọt qua sẽ được trả
     *    về kèm `Content-Type: image/png`.
     *
     * `nosniff` đã chặn đường đó ở tầng khác, nhưng một lớp bảo vệ duy nhất là
     * một lớp không ai kiểm được.
     */
    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    const r = await goi(tokenCoVan, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
      phase: 'INTAKE',
      contentType: 'image/png',
      dataBase64: html.toString('base64'),
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.message as string, /không khớp loại ảnh/i);
  });

  test('AH-T06 — SVG không nằm trong danh sách được phép', async () => {
    // SVG chạy được `<script>`, và ảnh được phục vụ từ cùng origin với API.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
    const r = await goi(tokenCoVan, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
      phase: 'INTAKE',
      contentType: 'image/svg+xml',
      dataBase64: svg.toString('base64'),
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('AH-T07 — giai đoạn ngoài bảng bị từ chối', async () => {
    const r = await goi(tokenCoVan, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
      phase: 'KHONG_CO_GIAI_DOAN_NAY',
      contentType: 'image/png',
      dataBase64: PNG_THAT.toString('base64'),
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('AH-T08 — đơn của tenant khác trả 404, không phải 403', async () => {
    /*
     * 404 chứ không 403: một mã lỗi phân biệt "không có quyền" với "không tồn
     * tại" là một kênh rò rỉ — nó xác nhận rằng đơn đó có thật.
     */
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM repair_order WHERE tenant_id <> $1 LIMIT 1`,
      [TENANT_A],
    );
    if (rows[0] === undefined) return;
    const r = await goi(tokenCoVan, 'POST', `/api/v1/repair-orders/${rows[0].id}/photos`, {
      phase: 'INTAKE',
      contentType: 'image/png',
      dataBase64: PNG_THAT.toString('base64'),
    });
    assert.equal(r.status, 404, JSON.stringify(r.body));
  });

  test('AH-T09 — hai lần gửi cùng một ảnh dùng chung một file, nhưng là hai lần ghi nhận', async () => {
    const gui = async (): Promise<any> =>
      goi(tokenCoVan, 'POST', `/api/v1/repair-orders/${orderId}/photos`, {
        phase: 'AFTER',
        contentType: 'image/png',
        dataBase64: PNG_THAT.toString('base64'),
        caption: `Trùng nội dung ${uniq}`,
      });

    const a = await gui();
    const b = await gui();
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    anhDaTao.push(a.body.id, b.body.id);

    assert.equal(a.body.storageKey, b.body.storageKey, 'key content-addressed phải trùng');
    assert.notEqual(a.body.id, b.body.id, 'mỗi lần chụp là một lần ghi nhận riêng');
  });
});
