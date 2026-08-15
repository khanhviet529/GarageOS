/**
 * 🔒 Xoá dữ liệu cá nhân của lead mà không phá truy vết — `INV-LS-15`, LS-006.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Bài này canh một mệnh đề dễ bị hiểu sai theo cả hai chiều
 *
 * Chiều thứ nhất: "đã xoá" phải là xoá THẬT. Một cột `redacted_at` được đặt
 * trong khi số điện thoại vẫn nằm nguyên trong bảng còn tệ hơn không có gì —
 * hệ thống báo cáo đã thực hiện quyền của chủ thể dữ liệu, và không ai đi kiểm
 * lại một việc đã được báo là xong.
 *
 * Chiều thứ hai: xoá KHÔNG được lan sang phần không phải dữ liệu cá nhân. Lead
 * nối một khoản chi quảng cáo với một chiếc xe đã bán; xoá cả dòng làm thủng
 * thống kê chuyển đổi theo cách không ai phát hiện, vì con số chỉ đơn giản nhỏ
 * đi chứ không sai rõ ràng.
 *
 * Chính sách đã chốt 2026-08-14: tombstone, giữ dòng, thời hạn lưu 24 tháng.
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
const HO_TEN = `Khách Lưu Trữ ${uniq}`;
const TOMBSTONE = '(đã xoá theo yêu cầu)';

let pool: Pool;
let branchA = '';
let tokenManager = '';
let tokenAdvisor = '';

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
  duong: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${duong}`, {
    method: 'POST',
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

/** Một lead thật trong DB — `soThang` = tuổi của lead tính bằng tháng. */
async function taoLead(soThang = 0): Promise<{ id: string; reference: string }> {
  const { rows } = await pool.query<{ id: string; reference: string }>(
    `INSERT INTO sales_lead
       (tenant_id, branch_id, reference, full_name, phone_normalized, email,
        intent, message, source, consent_version, consented_at, created_at)
     VALUES ($1,$2,$3,$4,'0912345678',$5,'TEST_DRIVE','Xin báo giá xe','LANDING',
             '2026-08-1', now(), now() - make_interval(months => $6))
     RETURNING id, reference`,
    [
      TENANT_A,
      branchA,
      `LT-${uniq}-${Math.random().toString(36).slice(2, 8)}`,
      HO_TEN,
      `khach.${uniq}@example.test`,
      soThang,
    ],
  );
  return rows[0]!;
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  /*
   * 🔒 Chi nhánh phải là chi nhánh mà SALES_MANAGER thuộc về, không phải "chi
   * nhánh đầu tiên theo mã". `scopeForAction` cho manager phạm vi BRANCH, nên
   * lead dựng ở chi nhánh khác sẽ trả 404 vì PHẠM VI — và bài kiểm sẽ đỏ với
   * lý do không liên quan gì tới thứ nó định canh. Cùng cái bẫy đã ghi ở
   * `ma-tran-quyen.spec.ts`.
   */
  const { rows } = await pool.query<{ id: string }>(
    `SELECT ub.branch_id AS id
       FROM user_branch ub
       JOIN app_user u ON u.id = ub.user_id
      WHERE u.tenant_id = $1 AND u.phone = '0901000013'
      LIMIT 1`,
    [TENANT_A],
  );
  branchA = rows[0]!.id;
  tokenManager = await dangNhap('0901000013'); // SALES_MANAGER
  tokenAdvisor = await dangNhap('0901000012'); // SALES_ADVISOR
});

after(async () => {
  await pool.query(`DELETE FROM lead_activity WHERE lead_id IN
     (SELECT id FROM sales_lead WHERE reference LIKE $1)`, [`LT-${uniq}-%`]);
  await pool.query(`DELETE FROM sales_lead WHERE reference LIKE $1`, [`LT-${uniq}-%`]);
  await pool.end();
});

describe('INV-LS-15 — redact xoá PII và chỉ PII', () => {
  test('LR-T01 — sau redact, không còn dấu vết nào của người đó trong dòng', async () => {
    const lead = await taoLead();
    const r = await goi(`/api/v1/sales/leads/${lead.id}/redact`, tokenManager, {
      reason: 'SUBJECT_REQUEST',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT full_name, phone_normalized, email, message, redacted_at, redact_reason
         FROM sales_lead WHERE id = $1`,
      [lead.id],
    );
    const sau = rows[0]!;
    assert.equal(sau.full_name, TOMBSTONE);
    assert.equal(sau.phone_normalized, '');
    assert.equal(sau.email, null);
    assert.equal(sau.message, null, 'lời nhắn của khách có thể chứa tên và số điện thoại');
    assert.notEqual(sau.redacted_at, null);
    assert.equal(sau.redact_reason, 'SUBJECT_REQUEST');
  });

  test('LR-T02 — dòng và toàn bộ truy vết chuyển đổi ở lại', async () => {
    const lead = await taoLead();
    await goi(`/api/v1/sales/leads/${lead.id}/redact`, tokenManager, {
      reason: 'SUBJECT_REQUEST',
    });

    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT id, reference, status, branch_id, intent, source, created_at
         FROM sales_lead WHERE id = $1`,
      [lead.id],
    );
    assert.equal(rows.length, 1, 'dòng bị xoá — thống kê chuyển đổi thủng một lỗ im lặng');
    assert.equal(rows[0]!.reference, lead.reference);
    assert.equal(rows[0]!.intent, 'TEST_DRIVE');

    const { rows: act } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM lead_activity WHERE lead_id = $1`,
      [lead.id],
    );
    assert.ok(Number(act[0]!.n) > 0, 'lịch sử hoạt động biến mất theo');
  });

  test('LR-T03 — nhật ký của việc xoá không trở thành bản sao cuối cùng của dữ liệu', async () => {
    const lead = await taoLead();
    await goi(`/api/v1/sales/leads/${lead.id}/redact`, tokenManager, {
      reason: 'SUBJECT_REQUEST',
    });

    const { rows } = await pool.query<{ note: string | null; metadata: unknown }>(
      `SELECT note, metadata FROM lead_activity WHERE lead_id = $1`,
      [lead.id],
    );
    const tatCa = JSON.stringify(rows);
    assert.ok(!tatCa.includes(HO_TEN), 'họ tên vừa xoá nằm lại trong nhật ký');
    assert.ok(!tatCa.includes('0912345678'), 'số điện thoại vừa xoá nằm lại trong nhật ký');
  });

  test('LR-T04 — gọi lại lần hai không đổi dấu thời gian đã ghi', async () => {
    const lead = await taoLead();
    const lan1 = await goi(`/api/v1/sales/leads/${lead.id}/redact`, tokenManager, {
      reason: 'SUBJECT_REQUEST',
    });
    const lan2 = await goi(`/api/v1/sales/leads/${lead.id}/redact`, tokenManager, {
      reason: 'INVALID_DATA',
    });

    assert.equal(lan2.status, 201);
    assert.equal(lan2.body.redactedAt, lan1.body.redactedAt, 'bấm hai lần tạo hai sự thật');
    assert.equal(lan1.body.daRedactTruocDo, false);
    assert.equal(lan2.body.daRedactTruocDo, true);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM lead_activity WHERE lead_id = $1 AND type = 'NOTE'`,
      [lead.id],
    );
    assert.equal(rows[0]!.n, '1', 'mỗi lần bấm lại ghi thêm một dòng nhật ký');
  });

  test('LR-T08 — tư vấn viên không tự xoá được dữ liệu cá nhân', async () => {
    /*
     * Ma trận quyền đã canh điều này bằng một id giả. Ca này dùng lead THẬT mà
     * tư vấn viên có thể đọc được, nên nó chứng minh thêm một bước: quyền chặn
     * TRƯỚC khi chạm dữ liệu, chứ không phải chặn nhờ dữ liệu tình cờ không tồn
     * tại.
     */
    const lead = await taoLead();
    const r = await goi(`/api/v1/sales/leads/${lead.id}/redact`, tokenAdvisor, {
      reason: 'SUBJECT_REQUEST',
    });
    assert.ok(r.status === 403 || r.status === 404, `nhận ${r.status}`);

    const { rows } = await pool.query<{ redacted_at: Date | null }>(
      `SELECT redacted_at FROM sales_lead WHERE id = $1`,
      [lead.id],
    );
    assert.equal(rows[0]!.redacted_at, null, 'tư vấn viên xoá được dữ liệu cá nhân');
  });

  test('LR-T05 — DB không cho đánh dấu đã xoá trong khi PII còn nguyên', async () => {
    /*
     * Ràng buộc này canh chính tầng ứng dụng. Không có nó, một lỗi ở service
     * làm hệ thống BÁO CÁO đã thực hiện quyền của chủ thể dữ liệu trong khi số
     * điện thoại vẫn nằm nguyên trong bảng — và không ai đi kiểm lại một việc
     * đã được báo là xong.
     */
    const lead = await taoLead();
    await assert.rejects(
      () => pool.query(`UPDATE sales_lead SET redacted_at = now() WHERE id = $1`, [lead.id]),
      'đánh dấu được là đã xoá mà không xoá gì (INV-LS-15)',
    );
  });
});

describe('Thời hạn lưu trữ — 24 tháng cho lead không chuyển đổi', () => {
  test('LR-T06 — job dọn lead quá hạn và không chạm lead còn hạn', async () => {
    const quaHan = await taoLead(30);
    const conHan = await taoLead(3);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT redact_expired_sales_leads(24)::text AS n`,
    );
    assert.ok(Number(rows[0]!.n) >= 1, 'job không dọn gì');

    const { rows: sau } = await pool.query<{ id: string; redacted_at: Date | null }>(
      `SELECT id, redacted_at FROM sales_lead WHERE id = ANY($1)`,
      [[quaHan.id, conHan.id]],
    );
    const cua = (id: string): Date | null => sau.find((r) => r.id === id)!.redacted_at;
    assert.notEqual(cua(quaHan.id), null, 'lead 30 tháng tuổi chưa bị dọn');
    assert.equal(cua(conHan.id), null, 'lead 3 tháng tuổi bị dọn oan');
  });

  test('LR-T07 — job ghi đúng lý do dọn, không phải lý do do người nhập', async () => {
    const quaHan = await taoLead(30);
    await pool.query(`SELECT redact_expired_sales_leads(24)`);

    const { rows } = await pool.query<{ redact_reason: string | null }>(
      `SELECT redact_reason FROM sales_lead WHERE id = $1`,
      [quaHan.id],
    );
    assert.equal(rows[0]!.redact_reason, 'RETENTION_EXPIRED');
  });

  /*
   * ⚠️ CHƯA KIỂM ĐƯỢC: lead đã `WON` phải được loại khỏi job dọn — người đã
   * mua xe thì hồ sơ sống theo vòng đời khách hàng, không theo vòng đời của
   * cái form họ điền hai năm trước.
   *
   * `WON` không nằm trong enum `lead_status` của Phase 1, nên không dựng được
   * trạng thái đó để kiểm. Hàm đã viết điều kiện qua `status::text` để nó tự có
   * hiệu lực khi Phase 2 thêm giá trị (migration 0061).
   *
   * 🔒 Việc phải làm cùng lúc với Phase 2: bỏ ghi chú này và viết ca kiểm thật.
   * Một điều kiện chưa bao giờ khớp dòng nào là một điều kiện chưa bao giờ được
   * chạy thử.
   */
});
