/**
 * Ánh xạ trạng thái nghiệp vụ sang sắc thái thị giác — MỘT chỗ duy nhất.
 *
 * 🔒 Vì sao không để mỗi màn tự chọn màu: cùng một trạng thái mà màn danh sách
 * tô vàng còn màn chi tiết tô xanh thì người dùng học sai. Và khi bảng trạng
 * thái ở `packages/contracts` thêm một giá trị mới, chỉ có một chỗ phải sửa —
 * TypeScript sẽ chỉ đúng vào nó vì `Record` ở đây là toàn phần.
 *
 * 🔒 Màu KHÔNG BAO GIỜ là kênh thông tin duy nhất: mọi chỗ dùng đều kèm nhãn
 * chữ (`REPAIR_ORDER_STATUS_LABEL`). Sắc thái chỉ để mắt quét nhanh.
 */
import type { RepairOrderStatus } from '@garageos/contracts';

export type Tone = 'ok' | 'warn' | 'danger' | 'brand' | 'trung';

export const TONE_TRANG_THAI: Record<RepairOrderStatus, Tone> = {
  RECEIVED: 'trung',
  DIAGNOSING: 'trung',
  QUOTED: 'warn',
  AWAITING_APPROVAL: 'warn',
  AWAITING_PARTS: 'warn',
  IN_PROGRESS: 'brand',
  QUALITY_CHECK: 'brand',
  AWAITING_PAYMENT: 'warn',
  AWAITING_DELIVERY: 'ok',
  DELIVERED: 'ok',
  CANCELLED: 'danger',
};

export function toneTrangThai(status: string): Tone {
  return TONE_TRANG_THAI[status as RepairOrderStatus] ?? 'trung';
}

/** Giờ:phút theo giờ Việt Nam — dùng cho mốc trong ngày */
export function gioPhut(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Cùng ngày với hôm nay (theo giờ trình duyệt) */
export function laHomNay(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

/** Số giờ đã trôi qua kể từ mốc */
export function soGioTu(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
