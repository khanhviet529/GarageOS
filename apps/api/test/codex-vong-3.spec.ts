/**
 * 🔒 Kiểm chứng bốn phát hiện của Codex — vòng review Phase 2.2 → 2.7.
 *
 *   R-001  job đóng giờ hộ không hạ trạng thái phân công khỏi IN_PROGRESS
 *   R-002  `dong_ho_gio_bo_quen()` là SECURITY DEFINER, không lọc tenant
 *   R-003  `releaseReservationsForOrder` khoá không theo thứ tự `part_id`
 *   R-004  kết quả duyệt báo giá bổ sung suy ra từ SỐ TIỀN, không từ số dòng
 *
 * Ba bài đầu chạy thẳng ở tầng SQL: chúng nói về hành vi của hàm trong database,
 * và đi vòng qua HTTP chỉ thêm nhiễu chứ không thêm bằng chứng.
 *
 * ⚠️ R-002 dùng kết nối của ỨNG DỤNG (`garageos_app`), không dùng kết nối quản
 *    trị. Chạy bằng quyền quản trị thì RLS bị bỏ qua vì lý do khác, và bài test
 *    sẽ "chứng minh" một điều nó không hề đo.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const NHAN = `CDX3${Date.now().toString().slice(-8)}`;

let admin: Pool;
let app: Pool;

describe('🔒 Kiểm chứng bốn phát hiện của Codex — Phase 2.2 → 2.7', () => {
  const ids: Record<string, string> = {};

  before(async () => {
    admin = new Pool({ connectionString: ADMIN_URL, max: 10 });
    app = new Pool({ connectionString: APP_URL, max: 10 });

    /*
     * Một phân công ĐANG LÀM với một đoạn giờ mở từ 20 tiếng trước — đúng cảnh
     * "thợ quên bấm kết thúc rồi đi về" mà `dong_ho_gio_bo_quen()` sinh ra để
     * dọn.
     *
     * 🔒 Thợ RIÊNG của bài test, không mượn thợ của seed.
     *
     * Một đoạn giờ CHƯA ĐÓNG có khoảng thời gian kéo tới vô cùng, nên nó chồng
     * lên MỌI đoạn giờ khác của cùng người thợ — kể cả đoạn nằm sau nó.
     * `no_timelog_overlap` từ chối ngay, và bài test đỏ vì fixture chứ không
     * phải vì thứ nó định kiểm. Dựng thợ riêng thì không có gì để đụng.
     */
    const { rows: tho } = await admin.query<{ id: string }>(
      `INSERT INTO app_user (tenant_id, phone, password_hash, full_name, roles)
       VALUES ($1, $2, 'x', $3, ARRAY['TECHNICIAN']::user_role[]) RETURNING id`,
      [TENANT_A, `0399${NHAN.slice(-6)}`, `Tho kiem chung ${NHAN}`],
    );
    ids.thoId = tho[0]!.id;
    const { rows: ro } = await admin.query<{ id: string; branch_id: string }>(
      `SELECT id, branch_id FROM repair_order
        WHERE tenant_id = $1 AND status = 'IN_PROGRESS' ORDER BY code LIMIT 1`,
      [TENANT_A],
    );
    ids.orderId = ro[0]!.id;
    const { rows: bay } = await admin.query<{ id: string }>(
      `SELECT id FROM bay WHERE tenant_id = $1 AND branch_id = $2 ORDER BY code LIMIT 1`,
      [TENANT_A, ro[0]!.branch_id],
    );
    const { rows: ql } = await admin.query<{ id: string }>(
      `SELECT ql.id FROM quotation_line ql JOIN quotation q ON q.id = ql.quotation_id
        WHERE q.repair_order_id = $1 AND ql.line_type = 'LABOR'
          AND NOT EXISTS (SELECT 1 FROM work_assignment w WHERE w.quotation_line_id = ql.id)
        ORDER BY ql.seq LIMIT 1`,
      [ids.orderId],
    );
    assert.ok(ql[0], 'seed hết hạng mục công chưa xếp — bài này cần một cái');

    const { rows: wa } = await admin.query<{ id: string }>(
      `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
                                    technician_id, bay_id, planned_start, planned_end,
                                    status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5, now() - interval '3 day', now() - interval '3 day' + interval '2 hour',
               'IN_PROGRESS', $4) RETURNING id`,
      [TENANT_A, ids.orderId, ql[0].id, ids.thoId, bay[0]!.id],
    );
    ids.assignmentId = wa[0]!.id;
    const { rows: tl } = await admin.query<{ id: string }>(
      `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id, started_at,
                             entered_by_user_id, note)
       VALUES ($1,$2,$3, now() - interval '20 hour', $3, $4) RETURNING id`,
      [TENANT_A, ids.assignmentId, ids.thoId, NHAN],
    );
    ids.timeLogId = tl[0]!.id;
  });

  after(async () => {
    await admin.query(`DELETE FROM time_log WHERE work_assignment_id = $1`, [ids.assignmentId]);
    await admin.query(`DELETE FROM work_assignment WHERE id = $1`, [ids.assignmentId]);
    await admin.query(`DELETE FROM app_user WHERE id = $1`, [ids.thoId]);
    await admin.end();
    await app.end();
  });

  test('R-002: đóng giờ hộ KHÔNG được chạm dữ liệu của tenant khác', async () => {
    /*
     * Codex: `dong_ho_gio_bo_quen()` khai báo `SECURITY DEFINER`, chủ hàm là
     * `garageos` (SUPERUSER, BYPASSRLS), và câu UPDATE bên trong chỉ lọc
     * `ended_at IS NULL` — không lọc `tenant_id`.
     *
     * 💡 Cách kiểm rẻ nhất và cũng dứt khoát nhất: đặt `app.tenant_id` sang
     *    tenant ĐỐI CHỨNG rồi gọi hàm. Tenant đó không có đoạn giờ nào; nếu
     *    hàm vẫn đóng đoạn giờ của tenant A thì nó đang ghi xuyên tenant, và
     *    không cần dựng cả một xưởng thứ hai để chứng minh điều đó.
     */
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_B]);
      await c.query('SELECT dong_ho_gio_bo_quen(8)');
      await c.query('COMMIT');
    } finally {
      c.release();
    }

    const { rows } = await admin.query<{ ended_at: string | null }>(
      `SELECT ended_at FROM time_log WHERE id = $1`,
      [ids.timeLogId],
    );
    assert.equal(
      rows[0]!.ended_at,
      null,
      'một tenant vừa đóng đoạn giờ đang chạy của tenant KHÁC — INV-T-01',
    );
  });

  test('R-001: đóng giờ hộ xong thì phân công không được kẹt ở IN_PROGRESS', async () => {
    /*
     * Codex: hàm đóng `time_log` nhưng để `work_assignment` nguyên IN_PROGRESS.
     * `one_active_assignment_per_tech` là unique index trên
     * (tenant_id, technician_id) WHERE status = 'IN_PROGRESS' — nên người thợ
     * đó không bắt đầu được việc nào khác nữa.
     *
     * Đây là kịch bản hằng ngày, không phải trường hợp biên: thợ làm xong, đi
     * về, quên bấm. Sáng hôm sau đến làm thì hệ thống từ chối.
     */
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await c.query('SELECT dong_ho_gio_bo_quen(8)');
      await c.query('COMMIT');
    } finally {
      c.release();
    }

    const { rows: tl } = await admin.query<{ ended_at: string | null; auto_closed: boolean }>(
      `SELECT ended_at, auto_closed FROM time_log WHERE id = $1`,
      [ids.timeLogId],
    );
    assert.notEqual(tl[0]!.ended_at, null, 'đoạn giờ bỏ quên chưa được đóng');
    assert.equal(tl[0]!.auto_closed, true);

    const { rows: wa } = await admin.query<{ status: string }>(
      `SELECT status FROM work_assignment WHERE id = $1`,
      [ids.assignmentId],
    );
    assert.notEqual(
      wa[0]!.status,
      'IN_PROGRESS',
      'đoạn giờ đã đóng nhưng phân công vẫn ĐANG LÀM — thợ này không bấm được việc nào khác nữa',
    );
  });

  test('R-003: nhả giữ chỗ phải khoá theo thứ tự part_id tăng dần', async () => {
    /*
     * Codex: `releaseReservationsForOrder` là một `UPDATE … WHERE
     * repair_order_id = $1`, nên PostgreSQL khoá các dòng theo thứ tự KẾ HOẠCH
     * chọn ra — không theo `part_id`.
     *
     * 🔒 `CLAUDE.md` bảng "Khoá và đồng thời" nói rõ: mọi đường giữ chỗ / xuất
     *    kho khoá theo **thứ tự `part_id` tăng dần**. Đây không phải sở thích
     *    của reviewer, đây là quy tắc của chính dự án.
     *
     * Deadlock không tái hiện được một cách tất định, nên bài này kiểm thứ mà
     * mã nguồn PHẢI có: câu lệnh nhả chỗ có sắp thứ tự khoá hay không. Một bài
     * kiểm cấu trúc nói đúng điều nó đo, còn hơn một bài kiểm đồng thời xanh
     * đỏ thất thường mà không kết luận được gì.
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/stock/reserve-parts.ts'), 'utf8');
    const ham = src.slice(src.indexOf('export async function releaseReservationsForOrder'));
    const than = ham.slice(0, ham.indexOf('\n}'));

    assert.match(
      than,
      /ORDER BY\s+part_id/,
      'nhả giữ chỗ không sắp theo part_id — thứ tự khoá khác với đường xuất kho, đủ điều kiện deadlock',
    );
    assert.match(than, /FOR UPDATE/, 'không khoá tường minh thì thứ tự khoá do kế hoạch quyết định');
  });

  test('R-004: duyệt báo giá bổ sung xét theo SỐ DÒNG, không theo số tiền', async () => {
    /*
     * Codex: `onSupplementQuotationResponded(tx, orderId, approvedAmount > 0)`.
     * Một báo giá bổ sung chỉ gồm hạng mục BẢO HÀNH có `line_total = 0`; khách
     * bấm duyệt, nhưng tổng tiền duyệt vẫn bằng 0 → phát sinh bị đánh dấu
     * REJECTED và những việc đang chờ nó không bao giờ được chạy tiếp.
     *
     * 💡 Đúng ngay bên trên đã có sẵn câu đếm dòng theo trạng thái. Tín hiệu
     *    đúng nằm trong tầm tay; code chỉ chọn nhầm tín hiệu.
     *
     * Kiểm ở mức cấu trúc vì kịch bản đầy đủ cần dựng cả một vòng duyệt báo giá
     * bổ sung qua OTP, và điều sai nằm gọn trong MỘT biểu thức.
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/public/public-tracking.service.ts'), 'utf8');

    const goi = /onSupplementQuotationResponded\(\s*tx,\s*[^,]+,\s*([^)]+)\)/.exec(src);
    assert.ok(goi, 'không tìm thấy lời gọi onSupplementQuotationResponded');
    assert.doesNotMatch(
      goi[1]!,
      /Amount/,
      `cờ duyệt suy ra từ số tiền (\`${goi[1]!.trim()}\`) — dòng bảo hành trị giá 0đ được duyệt sẽ bị hiểu là từ chối`,
    );
  });
});
