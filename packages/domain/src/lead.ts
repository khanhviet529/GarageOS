import {
  LeadStatus,
  canTransitionLead,
  type LeadTransitionInput,
} from '@garageos/contracts';

/**
 * Logic thuần cho lead — state machine Phase 1 (SRS mục 9) và chuẩn hoá số
 * điện thoại Việt Nam (SRS mục 8.3). Không import framework.
 */

/**
 * Chuẩn hoá số điện thoại Việt Nam — P1-UT-001.
 *
 * Bỏ ký tự không phải số, đổi `84`/`+84` về `0`, chấp nhận 10–11 chữ số bắt đầu
 * bằng `0` (di động 10, cố định 10–11). Trả null nếu không hợp lệ.
 */
export function normalizeVnPhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  if (!/^0[0-9]{9,10}$/.test(digits)) return null;
  return digits;
}

/**
 * Kiểm chứng transition lead — SRS mục 9.
 *
 * - `LOST` bắt buộc có `lostReason` từ allow-list.
 * - Chuyển trạng thái ngoài bảng chuyển bị từ chối.
 * Trả thông báo lỗi tiếng Việt hoặc null nếu hợp lệ.
 */
export function validateLeadTransition(
  from: LeadStatus,
  input: LeadTransitionInput,
): string | null {
  if (!canTransitionLead(from, input.to)) {
    return `Không thể chuyển lead từ trạng thái hiện tại sang trạng thái yêu cầu`;
  }
  if (input.to === 'LOST' && input.lostReason === undefined) {
    return 'Chuyển sang Mất bắt buộc chọn lý do';
  }
  if (input.to !== 'LOST' && input.lostReason !== undefined) {
    return 'Lý do mất chỉ áp dụng khi chuyển sang Mất';
  }
  return null;
}

/** Trạng thái đã đóng — không sửa assignment/status/activity nữa (SRS mục 9). */
export function isLeadClosed(status: LeadStatus): boolean {
  return status === 'LOST';
}
