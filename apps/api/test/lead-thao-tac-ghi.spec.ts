/**
 * 🔒 Ba thao tác GHI của Sales Admin phải thật sự chạy được.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * `assignLead`, `transitionLead` và `addActivity` đều khoá dòng bằng
 * `requireLeadInScope(..., forUpdate = true)`, và câu truy vấn đó có `LEFT JOIN`
 * sang `app_user` cùng hai bảng revision. Postgres từ chối:
 *
 *   ERROR: FOR UPDATE cannot be applied to the nullable side of an outer join
 *
 * Cả ba trả 500 — không phải đôi lúc, mà mọi lần. Toàn bộ phần ghi của Kanban
 * lead chưa bao giờ hoạt động, và điều đó sống sót qua nhiều vòng review vì
 * không bài kiểm nào gọi vào chúng: ma trận quyền chỉ phân biệt 403 với
 * không-403, nên với nó thì 500 cũng là "quyền đã cho qua".
 *
 * Bài này canh mệnh đề đơn giản nhất có thể — **thao tác chạy được** — chính
 * vì đó là thứ không ai nghĩ tới việc kiểm.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const uniq = `${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;

let pool: Pool;
let branchA = '';
let advisorId = '';
let token = '';

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

async function taoLead(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sales_lead
       (tenant_id, branch_id, reference, full_name, phone_normalized,
        intent, source, consent_version, consented_at)
     VALUES ($1,$2,$3,'Khách Thao Tác','0913000111','TEST_DRIVE','LANDING',
             '2026-08-1', now())
     RETURNING id`,
    [TENANT_A, branchA, `TT-${uniq}-${Math.random().toString(36).slice(2, 8)}`],
  );
  return rows[0]!.id;
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  const { rows } = await pool.query<{ branch_id: string }>(
    `SELECT ub.branch_id
       FROM user_branch ub JOIN app_user u ON u.id = ub.user_id
      WHERE u.tenant_id = $1 AND u.phone = '0901000013' LIMIT 1`,
    [TENANT_A],
  );
  branchA = rows[0]!.branch_id;

  const { rows: adv } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000012'`,
    [TENANT_A],
  );
  advisorId = adv[0]!.id;
  token = await dangNhap('0901000013'); // SALES_MANAGER
});

after(async () => {
  await pool.query(`DELETE FROM lead_activity WHERE lead_id IN
     (SELECT id FROM sales_lead WHERE reference LIKE $1)`, [`TT-${uniq}-%`]);
  await pool.query(`DELETE FROM sales_lead WHERE reference LIKE $1`, [`TT-${uniq}-%`]);
  await pool.end();
});

describe('🔒 Thao tác ghi trên lead chạy được thật', () => {
  test('LT-T01 — gán lead cho tư vấn viên', async () => {
    const id = await taoLead();
    const r = await goi('POST', `/api/v1/sales/leads/${id}/assign`, {
      assigneeId: advisorId,
      version: 0,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<{ assigned_to: string }>(
      `SELECT assigned_to FROM sales_lead WHERE id = $1`,
      [id],
    );
    assert.equal(rows[0]!.assigned_to, advisorId);
  });

  test('LT-T02 — chuyển trạng thái lead', async () => {
    const id = await taoLead();
    const r = await goi('POST', `/api/v1/sales/leads/${id}/transition`, {
      to: 'CONTACTED',
      version: 0,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM sales_lead WHERE id = $1`,
      [id],
    );
    assert.equal(rows[0]!.status, 'CONTACTED');
  });

  test('LT-T03 — ghi hoạt động lên lead', async () => {
    const id = await taoLead();
    const r = await goi('POST', `/api/v1/sales/leads/${id}/activities`, {
      type: 'CONTACT_ATTEMPT',
      note: 'Đã gọi, khách hẹn cuối tuần',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM lead_activity
        WHERE lead_id = $1 AND type = 'CONTACT_ATTEMPT'`,
      [id],
    );
    assert.equal(rows[0]!.n, '1');
  });

  test('LT-T04 — sửa đồng thời: chỉ một lời gọi thắng, cái sau báo dữ liệu cũ', async () => {
    /*
     * Khoá dòng tồn tại là để canh đúng tình huống này. Hai người mở cùng một
     * lead trên Kanban và cùng bấm chuyển trạng thái: một người phải thắng,
     * người kia phải được bảo là tải lại — không phải cả hai cùng ghi đè nhau.
     */
    const id = await taoLead();
    const ketQua = await Promise.allSettled([
      goi('POST', `/api/v1/sales/leads/${id}/transition`, { to: 'CONTACTED', version: 0 }),
      goi('POST', `/api/v1/sales/leads/${id}/transition`, { to: 'QUALIFIED', version: 0 }),
    ]);
    const status = ketQua.map((k) => (k.status === 'fulfilled' ? k.value.status : 0));
    const thanhCong = status.filter((s) => s === 201).length;

    assert.equal(thanhCong, 1, `${thanhCong}/2 lời gọi cùng thắng — mã trạng thái: ${status.join(', ')}`);
    assert.ok(!status.includes(500), `có lời gọi trả 500: ${status.join(', ')}`);
  });
});
