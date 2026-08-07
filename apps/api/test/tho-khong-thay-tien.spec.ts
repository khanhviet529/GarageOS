/**
 * 🔒 Phase 4.5 — thợ KHÔNG thấy bất kỳ số tiền nào.
 *
 * `docs/02-actors-and-permissions.md` mục 2.3 nói thẳng: job card của thợ chỉ
 * có hạng mục, phụ tùng cần lắp, định mức giờ, ghi chú. "Không được: thấy bất
 * kỳ số tiền nào."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao test này QUÉT thay vì liệt kê
 *
 * Bản đầu của lát cắt này định kiểm vài endpoint mà tôi nghi ngờ. Quét toàn bộ
 * thì tìm ra BA chỗ rò, trong đó hai chỗ không ai nghĩ tới:
 *
 *   · GET /quotations/:id            — KHÔNG có kiểm tra vai nào cả
 *   · GET /repair-orders/:id/quotations — như trên
 *   · GET /catalog/vehicle/:id       — trả giá bán và đơn giá giờ công
 *
 * Hai chỗ đầu không nhìn ra được bằng cách đọc code: cái sai nằm ở chỗ VẮNG
 * MẶT một dòng `assertCan`, mà chỗ vắng mặt thì không có gì để đọc.
 *
 * Đây là lần thứ tư trong dự án mà quét toàn bộ tìm ra thứ đọc tay bỏ sót
 * (xem STATUS.md: "Danh sách chỉ bảo vệ được những gì người viết đã nghĩ ra").
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Test này còn là HÀNG RÀO cho tương lai
 *
 * Mỗi endpoint mới thêm vào `DUONG_DAN` là một dòng. Quên thêm thì test không
 * bắt được — nên phần cuối có một kiểm tra đối chiếu: mọi route `@Get` trong
 * mã nguồn phải có mặt trong danh sách này.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

let pool: Pool;
let tokenTho = '';
let tokenCoVan = '';

async function goi(
  path: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function dangNhap(phone: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: 'demo1234' }),
  });
  const j = (await res.json()) as { accessToken?: string };
  assert.ok(j.accessToken, `không đăng nhập được ${phone}`);
  return j.accessToken;
}

/**
 * Tên trường nghi mang tiền.
 *
 * Cùng một biểu thức với `packages/db/test/schema-invariants.spec.ts` — nếu
 * hai chỗ dùng hai định nghĩa "cột tiền" khác nhau thì một trong hai luôn có
 * lỗ.
 */
const LA_TIEN = /(amount|price|cost|ratePerHour|rate_per_hour|_total|Total)$/i;

/** Đi hết cây JSON, trả về mọi trường mang số tiền KHÁC 0 */
function timTien(o: unknown, duongDan = '', ra: string[] = []): string[] {
  if (o === null || o === undefined) return ra;
  if (Array.isArray(o)) {
    o.forEach((v, i) => timTien(v, `${duongDan}[${i}]`, ra));
    return ra;
  }
  if (typeof o !== 'object') return ra;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const dd = duongDan === '' ? k : `${duongDan}.${k}`;
    // 0 và null được coi là "đã lược" — đó là cách service che tiền đi
    if (LA_TIEN.test(k) && typeof v === 'number' && v !== 0) ra.push(`${dd} = ${v}`);
    else timTien(v, dd, ra);
  }
  return ra;
}

let duongDan: string[] = [];

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenTho = await dangNhap('0901000004');
  tokenCoVan = await dangNhap('0901000003');

  const { rows: ro } = await pool.query<{ id: string; vehicle_id: string }>(
    `SELECT id, vehicle_id FROM repair_order WHERE code = 'RO-DEMO-0001'`,
  );
  assert.ok(ro[0], 'seed thiếu đơn demo RO-DEMO-0001');
  const { rows: q } = await pool.query<{ id: string }>(
    `SELECT id FROM quotation WHERE repair_order_id = $1 LIMIT 1`,
    [ro[0]!.id],
  );
  const { rows: wa } = await pool.query<{ id: string }>(
    `SELECT id FROM work_assignment LIMIT 1`,
  );
  // Gợi ý thợ cần một hạng mục CÔNG đã duyệt và một mốc giờ
  const { rows: ql } = await pool.query<{ id: string }>(
    `SELECT ql.id FROM quotation_line ql
      WHERE ql.line_type = 'LABOR' AND ql.status = 'APPROVED' LIMIT 1`,
  );
  const homNay = new Date().toISOString().slice(0, 10);

  duongDan = [
    '/api/v1/auth/me',
    '/api/v1/repair-orders?open=true',
    `/api/v1/repair-orders/${ro[0]!.id}`,
    `/api/v1/quotations/${q[0]!.id}`,
    `/api/v1/repair-orders/${ro[0]!.id}/quotations`,
    `/api/v1/repair-orders/${ro[0]!.id}/assignments`,
    `/api/v1/repair-orders/${ro[0]!.id}/supplements`,
    `/api/v1/catalog/vehicle/${ro[0]!.vehicle_id}`,
    `/api/v1/assignments?date=${homNay}`,
    '/api/v1/assignments/pending-work',
    '/api/v1/assignments/quality',
    '/api/v1/bays',
    '/api/v1/supplements',
    '/api/v1/stock/balances',
    '/api/v1/stock/movements',
    '/api/v1/stock/parts',
    '/api/v1/stock/pending-issues',
    '/api/v1/warehouses',
    '/api/v1/vehicles/lookup?plate=30A12345',
    ...(wa[0] === undefined ? [] : [`/api/v1/assignments/${wa[0].id}/time`]),
    ...(ql[0] === undefined
      ? []
      : [
          `/api/v1/assignments/technician-options?quotationLineId=${ql[0].id}` +
            `&plannedStart=${encodeURIComponent(new Date().toISOString())}`,
        ]),
  ];
});

after(async () => {
  await pool.end();
});

describe('🔒 INV — thợ không thấy bất kỳ số tiền nào', () => {
  test('quét MỌI endpoint đọc bằng token thợ, không trường nào mang tiền', async () => {
    const roRi: string[] = [];

    for (const d of duongDan) {
      const r = await goi(d, tokenTho);
      // 403 là kết quả tốt: thợ không được vào thì không có gì để rò
      if (r.status === 403 || r.status >= 400) continue;

      const tien = timTien(r.body);
      if (tien.length > 0) {
        roRi.push(`${d}\n      ${tien.slice(0, 5).join('\n      ')}`);
      }
    }

    assert.deepEqual(
      roRi,
      [],
      'Endpoint rò số tiền cho thợ — docs/02 mục 2.3:\n  ' + roRi.join('\n  '),
    );
  });

  test('ĐỐI CHỨNG: cố vấn dịch vụ VẪN thấy tiền ở những chỗ đó', async () => {
    /*
     * Không có vế này thì test trên chỉ chứng minh "có gì đó chặn", chưa chứng
     * minh việc chặn là ĐÚNG NGƯỜI. Một lỗi cấu hình làm mọi vai đều không thấy
     * tiền cũng sẽ làm test kia xanh — trong khi cả xưởng không lập được báo
     * giá nữa.
     */
    const coTien: string[] = [];
    for (const d of duongDan) {
      const r = await goi(d, tokenCoVan);
      if (r.status >= 400) continue;
      if (timTien(r.body).length > 0) coTien.push(d);
    }

    assert.ok(
      coTien.length >= 2,
      `cố vấn cũng không thấy tiền ở đâu (${coTien.length} endpoint) — ` +
        'nhiều khả năng đã chặn nhầm cả vai được phép',
    );
  });

  test('🔒 hàng rào: mọi route @Get trong mã nguồn đều có trong danh sách quét', async () => {
    /*
     * Endpoint mới thêm mà quên đưa vào `duongDan` thì bài quét bỏ sót nó, và
     * test vẫn xanh — đúng kiểu "test vòng qua vấn đề thay vì phát hiện nó" đã
     * ghi ở docs/reviews.
     *
     * Đối chiếu với mã nguồn để chuyện đó không xảy ra âm thầm.
     */
    const thuMuc = join(process.cwd(), 'src');
    const routes = new Set<string>();

    const quet = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) quet(p);
        else if (e.name.endsWith('.controller.ts')) {
          const src = readFileSync(p, 'utf8');
          for (const m of src.matchAll(/@Get\('([^']*)'\)/g)) routes.add(m[1] ?? '');
        }
      }
    };
    quet(thuMuc);

    /*
     * Bỏ qua những route KHÔNG dành cho người dùng nội bộ:
     *  · `health`  — không có dữ liệu nghiệp vụ
     *  · `:token`  — trang tra cứu công khai của KHÁCH, khách ĐƯỢC thấy tiền
     *  · `me`      — hồ sơ người đăng nhập
     */
    const boQua = new Set(['health', ':token', 'me']);

    const thieu: string[] = [];
    for (const r of routes) {
      if (boQua.has(r)) continue;
      // So khớp thô: phần tĩnh đầu tiên của route phải xuất hiện trong danh sách
      const phanTinh = r.split('/').filter((x) => x !== '' && !x.startsWith(':'));
      const co = duongDan.some((d) => phanTinh.every((t) => d.includes(t)));
      if (!co) thieu.push(r);
    }

    assert.deepEqual(
      thieu,
      [],
      'Route mới chưa được đưa vào bài quét tiền — thêm vào `duongDan` của test này',
    );
  });
});
