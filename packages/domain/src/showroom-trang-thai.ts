import type { AvailabilityStatus, PromotionState } from '@garageos/contracts';

/**
 * Trạng thái suy ra của ưu đãi và của khả năng giao xe.
 *
 * Cả hai đều là **suy ra từ dữ liệu, không lưu**. Lưu một trạng thái suy ra
 * nghĩa là có lúc nó cũ hơn dữ liệu sinh ra nó, và không ai biết lúc nào.
 */

/* ================================ Ưu đãi ==================================== */

export interface UuDaiThoiGian {
  isEnabled: boolean;
  startsAt: Date;
  endsAt: Date | null;
}

/**
 * 🔒 `INV-LS-19`: ưu đãi hết hạn biến mất bằng **điều kiện truy vấn**, không
 *    bằng job dọn dẹp. Hàm này là bản dùng chung cho cả tầng đọc lẫn giao diện
 *    admin — cùng một định nghĩa, không có bản thứ hai.
 *
 * Bốn trạng thái, và thứ tự kiểm tra ở đây là có chủ ý:
 *
 *   1. `DA_TAT`   — người tắt. Quyết định của người thắng đồng hồ.
 *   2. `DA_HEN`   — chưa tới ngày bắt đầu. Không hiện trên landing, nhưng trong
 *                   admin phải nhìn thấy được, nếu không biên tập viên hẹn ưu
 *                   đãi tháng sau sẽ tưởng hệ thống nuốt mất.
 *   3. `HET_HAN`  — qua ngày kết thúc.
 *   4. `DANG_CHAY`
 */
export function trangThaiUuDai(uuDai: UuDaiThoiGian, bayGio: Date): PromotionState {
  if (!uuDai.isEnabled) return 'DA_TAT';
  if (bayGio < uuDai.startsAt) return 'DA_HEN';
  if (uuDai.endsAt !== null && bayGio >= uuDai.endsAt) return 'HET_HAN';
  return 'DANG_CHAY';
}

/** Chỉ ưu đãi `DANG_CHAY` mới được ra landing. */
export function uuDaiHienCongKhai<T extends UuDaiThoiGian>(danhSach: readonly T[], bayGio: Date): T[] {
  return danhSach.filter((u) => trangThaiUuDai(u, bayGio) === 'DANG_CHAY');
}

/* ============================= Tồn và giao xe =============================== */

export interface KhaNangGiaoTaiChiNhanh {
  branchId: string;
  branchName: string;
  status: AvailabilityStatus;
  leadTimeDaysMin: number | null;
  leadTimeDaysMax: number | null;
}

export interface NhanKhaNangGiao {
  status: AvailabilityStatus;
  /** Số chi nhánh đạt trạng thái tốt nhất. */
  branchCount: number;
  /** Nhãn đầy đủ, LUÔN nêu phạm vi. */
  label: string;
  leadTimeDaysMin: number | null;
  leadTimeDaysMax: number | null;
}

/** Tốt nhất trước: sẵn xe > sắp về > đặt hàng > tạm ngừng. */
const THU_TU: AvailabilityStatus[] = ['SAN_XE', 'SAP_VE', 'DAT_HANG', 'TAM_NGUNG'];

/**
 * Gộp khai báo của nhiều chi nhánh thành **một** nhãn cho thẻ xe.
 *
 * 🔒 Nhãn phải nói phạm vi: *"Sẵn xe tại 3 chi nhánh"*, không phải *"Sẵn xe"*
 *    trơ trọi. Một nhãn không nêu phạm vi là một phát biểu không kiểm được —
 *    khách ở Đà Nẵng đọc "Sẵn xe" rồi lái 15 km tới nơi mới biết xe nằm ở Hà Nội.
 *
 * 🔒 `INV-LS-17`: không có chỗ nào trong hàm này chạm tới số lượng xe, vì mô
 *    hình không có cột số lượng. Đếm ở đây là đếm **chi nhánh**, không phải xe.
 */
export function nhanKhaNangGiao(danhSach: readonly KhaNangGiaoTaiChiNhanh[]): NhanKhaNangGiao | null {
  if (danhSach.length === 0) return null;

  const totNhat = THU_TU.find((s) => danhSach.some((d) => d.status === s));
  if (totNhat === undefined) return null;

  const trung = danhSach.filter((d) => d.status === totNhat);
  const min = trung.reduce<number | null>((m, d) => (d.leadTimeDaysMin === null ? m : m === null ? d.leadTimeDaysMin : Math.min(m, d.leadTimeDaysMin)), null);
  const max = trung.reduce<number | null>((m, d) => (d.leadTimeDaysMax === null ? m : m === null ? d.leadTimeDaysMax : Math.max(m, d.leadTimeDaysMax)), null);

  const soChiNhanh = trung.length;
  const pham = soChiNhanh === danhSach.length ? 'mọi chi nhánh' : `${soChiNhanh} chi nhánh`;

  const label =
    totNhat === 'SAN_XE'
      ? `Sẵn xe tại ${pham}`
      : totNhat === 'TAM_NGUNG'
        ? 'Tạm ngừng nhận đặt'
        : min === null
          ? `${totNhat === 'SAP_VE' ? 'Sắp về' : 'Đặt hàng'} tại ${pham}`
          : `${totNhat === 'SAP_VE' ? 'Sắp về' : 'Đặt hàng'} · ${min}–${max} ngày`;

  return { status: totNhat, branchCount: soChiNhanh, label, leadTimeDaysMin: min, leadTimeDaysMax: max };
}
