/**
 * 🔒 HÀNG RÀO: lớp gọi API của app thợ phải khai đúng thứ API thật trả về.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao hàng rào này tồn tại
 *
 * Vòng `/codex-review` Phase 4 tìm ra `apps/mobile/src/lib/api.ts` khai
 * `batDau()` trả `{ segmentId }`, trong khi API trả `{ id }`. Không màn hình
 * nào đọc trường đó nên không có gì hỏng — và đó chính là chỗ nguy: một lời
 * khai kiểu SAI mà trình biên dịch vẫn cho qua, nằm chờ người đầu tiên tin nó.
 *
 * 💡 `apps/mobile` không import từ `apps/api`, nên TypeScript **không thể** bắt
 *    loại lệch này. Một lời khai kiểu ở phía client là một GIẢ ĐỊNH về máy chủ,
 *    và giả định thì phải kiểm bằng máy chủ thật.
 *
 * Dự án đã dính đúng họ lỗi này một lần: `apps/web/src/lib/api.ts` chép lại
 * bảng chuyển trạng thái thay vì import từ `packages/contracts` — vẫn còn nằm
 * trong phần nợ kỹ thuật của `STATUS.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Cách làm: gọi endpoint THẬT, so khoá phản hồi với khoá app thợ ĐANG khai
 *
 * Lời khai đọc thẳng từ `apps/mobile/src/lib/api.ts`, không chép tay vào bài
 * test. Chép tay thì bài test thành bản sao THỨ BA của cùng một hợp đồng, và nó
 * sẽ trôi cùng nhịp với bản nó định canh — đúng cái bệnh nó sinh ra để chữa.
 *
 * Phản hồi thì lấy từ máy chủ thật, không giả lập. Hai đầu đều là sự thật, và
 * bài test chỉ làm mỗi việc đặt chúng cạnh nhau.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const TENANT_A = '11111111-1111-1111-1111-111111111111';

let pool: Pool;
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

describe('🔒 Hợp đồng giữa app thợ và API', () => {
  const ids: Record<string, string> = {};

  before(async () => {
    pool = new Pool({ connectionString: ADMIN_URL });
    token = await dangNhap('0901000004');
  });

  after(async () => {
    if (ids.assignmentId !== undefined) {
      await pool.query(`DELETE FROM time_log WHERE work_assignment_id = $1`, [ids.assignmentId]);
      await pool.query(`DELETE FROM work_assignment WHERE id = $1`, [ids.assignmentId]);
    }
    await pool.end();
  });

  test('POST /time-logs/start trả đúng trường mà app thợ khai', async () => {
    /*
     * 🔒 Bài này dựng lấy việc của mình, không mượn việc CHỜ LÀM của seed.
     *
     * Seed có dựng sẵn vài việc chờ, nhưng bộ nào xếp lịch thì TIÊU MẤT một
     * cái — `STATUS.md` đã ghi đúng cái bẫy đó dưới tên "bộ E2E đói dữ liệu lẫn
     * nhau". Một hàng rào mà đỏ vì bộ chạy trước ăn mất dữ liệu là hàng rào
     * không ai tin nữa.
     *
     * Xếp ở TƯƠNG LAI xa để không đụng `no_bay_overlap` với lịch của seed.
     */
    const { rows: tho } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000004'`,
      [TENANT_A],
    );
    const { rows: ro } = await pool.query<{ id: string; branch_id: string }>(
      `SELECT id, branch_id FROM repair_order
        WHERE tenant_id = $1 AND status = 'IN_PROGRESS' ORDER BY code LIMIT 1`,
      [TENANT_A],
    );
    const { rows: bay } = await pool.query<{ id: string }>(
      `SELECT id FROM bay WHERE tenant_id = $1 AND branch_id = $2 ORDER BY code DESC LIMIT 1`,
      [TENANT_A, ro[0]!.branch_id],
    );
    const { rows: ql } = await pool.query<{ id: string }>(
      `SELECT ql.id FROM quotation_line ql JOIN quotation q ON q.id = ql.quotation_id
        WHERE q.repair_order_id = $1 AND ql.line_type = 'LABOR'
          AND NOT EXISTS (SELECT 1 FROM work_assignment w WHERE w.quotation_line_id = ql.id)
        ORDER BY ql.seq LIMIT 1`,
      [ro[0]!.id],
    );
    assert.ok(ql[0], 'seed hết hạng mục công chưa xếp — xem infra/seed.ts');

    /*
     * Đoạn giờ còn mở của lượt chạy trước (hoặc của một bộ test hỏng giữa
     * chừng) chặn mọi lần bấm bắt đầu sau đó: `no_timelog_overlap` coi đoạn
     * chưa đóng là kéo dài tới vô cùng. Đóng nó lại — đúng việc mà
     * `dong_ho_gio_bo_quen()` làm trong đời thật.
     */
    await pool.query(
      `UPDATE time_log SET ended_at = started_at + interval '1 hour', auto_closed = true,
                           pause_reason = 'SHIFT_END'
        WHERE technician_id = $1 AND ended_at IS NULL`,
      [tho[0]!.id],
    );
    await pool.query(
      `UPDATE work_assignment SET status = 'PAUSED'
        WHERE technician_id = $1 AND status = 'IN_PROGRESS'`,
      [tho[0]!.id],
    );

    const { rows: wa } = await pool.query<{ id: string }>(
      `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
                                    technician_id, bay_id, planned_start, planned_end,
                                    status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5, now() + interval '30 day', now() + interval '30 day 2 hour',
               'SCHEDULED', $4) RETURNING id`,
      [TENANT_A, ro[0]!.id, ql[0].id, tho[0]!.id, bay[0]!.id],
    );
    ids.assignmentId = wa[0]!.id;

    const res = await fetch(`${API}/api/v1/time-logs/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workAssignmentId: ids.assignmentId }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(res.status, 201, JSON.stringify(body));
    ids.timeLogId = body.id as string;

    /*
     * 🔒 Đọc lời khai từ chính mã nguồn mobile, không chép tay vào đây.
     *
     * Chép tay thì bài test trở thành bản sao THỨ BA của cùng một hợp đồng, và
     * nó sẽ trôi cùng nhịp với bản nó định canh. Đọc thẳng file mobile thì
     * người sửa mobile không thể sửa mà bài này không biết.
     */
    const src = readFileSync(
      join(process.cwd(), '..', 'mobile', 'src', 'lib', 'api.ts'),
      'utf8',
    );
    const khai = /batDau:[\s\S]{0,400}?goi<\{([^}]*)\}>/.exec(src);
    assert.ok(khai, 'không đọc được lời khai kiểu của batDau trong app thợ');
    const truongKhai = [...khai[1]!.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!);

    for (const t of truongKhai) {
      assert.ok(
        t in body,
        `app thợ khai \`${t}\` nhưng API trả về ${JSON.stringify(Object.keys(body))}`,
      );
    }
  });
});
