import {
  ACTION_LABEL,
  ErrorCode,
  canDo,
  type ActorContext,
  type PermissionAction,
} from '@garageos/contracts';
import { BusinessError } from './errors';

/**
 * 🔒 Ba câu hỏi phải hỏi theo đúng thứ tự trước mọi thao tác ghi:
 *   1. Đúng tenant chưa?      -> RLS lo (hạ tầng, không quên được)
 *   2. Đúng phạm vi chưa?     -> `branchScope()`
 *   3. Đúng vai chưa?         -> `assertCan()`
 *
 * Thiếu câu 3 thì hai câu đầu chỉ chặn được người ngoài, không chặn được người
 * trong. Xem `packages/contracts/src/permissions.ts` để biết vì sao dự án này
 * học được điều đó bằng cách làm sai trước.
 */
export function assertCan(actor: ActorContext, action: PermissionAction): void {
  if (!canDo(actor.roles, action)) {
    throw new BusinessError(
      ErrorCode.FORBIDDEN,
      `Vai trò của bạn không được ${ACTION_LABEL[action]}.`,
    );
  }
}

export interface BranchScope {
  /** Mệnh đề SQL với `$#` là chỗ để thay số thứ tự tham số, hoặc rỗng nếu phạm vi TENANT */
  sql: string;
  params: string[];
}

/**
 * 🔒 Phạm vi chi nhánh — `docs/02-actors-and-permissions.md` mục 1.
 *
 * `OWNER` phạm vi TENANT: thấy mọi chi nhánh. Các vai còn lại phạm vi BRANCH.
 *
 * RLS KHÔNG cứu được ở đây: các chi nhánh nằm chung một tenant, nên biết UUID là
 * đọc được. Đây là hàm dùng chung cố ý — bản trước nằm riêng trong
 * `RepairOrderService`, và module báo giá viết sau đó không hưởng được nó, mở
 * lại đúng lỗ hổng đã sửa (codex-review GARAGEOS-001).
 *
 * @param alias bí danh của bảng có cột `branch_id` trong câu truy vấn
 */
export function branchScope(actor: ActorContext, alias = 'ro'): BranchScope {
  if (actor.roles.includes('OWNER')) return { sql: '', params: [] };
  return { sql: `${alias}.branch_id = ANY($#)`, params: [...actor.branchIds] };
}

/**
 * Ghép mệnh đề phạm vi vào một câu truy vấn đã có sẵn tham số.
 *
 * Trả về mệnh đề `AND …` đã đánh đúng số thứ tự tham số, và đẩy tham số vào
 * mảng. Gom vào một chỗ để không ai phải tự đếm `$2`/`$3` — đếm nhầm thì hoặc
 * lỗi cú pháp (thấy ngay) hoặc lọc nhầm cột (không thấy bao giờ).
 */
export function appendBranchScope(
  actor: ActorContext,
  params: unknown[],
  alias = 'ro',
): string {
  const scope = branchScope(actor, alias);
  if (scope.sql === '') return '';
  params.push(scope.params);
  return ` AND ${scope.sql.replace('$#', `$${params.length}`)}`;
}

/**
 * 🔒 Phạm vi SELF — thợ chỉ thấy việc CỦA MÌNH.
 *
 * `docs/02-actors-and-permissions.md` mục 1 xếp `TECHNICIAN` vào phạm vi
 * `SELF`, nhưng suốt Phase 1–2 vai này dùng nhờ phạm vi `BRANCH` vì chưa có
 * bảng phân công để mà lọc. STATUS.md ghi lại như một khoản nợ, hẹn "thu hẹp
 * khi có `work_assignment`".
 *
 * Nợ đó lộ ra ngay khi app thợ chạy: màn hình hiện việc của CẢ CHI NHÁNH, và
 * thợ bấm "Bắt đầu" trên việc của người khác thì nhận lỗi
 * `WRONG_TECHNICIAN` từ trigger ở 0030 — một thông báo đúng nhưng vô nghĩa với
 * người dùng, vì họ không hiểu vì sao việc đó lại nằm trong danh sách của mình.
 *
 * KHÔNG thu hẹp nếu người dùng còn vai khác cho phép nhìn rộng hơn: một quản
 * lý kiêm thợ vẫn phải thấy cả xưởng để điều phối.
 */
const VAI_NHIN_RONG = ['SERVICE_ADVISOR', 'STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'];

export function appendSelfScope(
  actor: ActorContext,
  params: unknown[],
  cot = 'wa.technician_id',
): string {
  const chiLaTho =
    actor.roles.includes('TECHNICIAN') && !actor.roles.some((r) => VAI_NHIN_RONG.includes(r));
  if (!chiLaTho) return '';
  params.push(actor.userId);
  return ` AND ${cot} = $${params.length}`;
}
