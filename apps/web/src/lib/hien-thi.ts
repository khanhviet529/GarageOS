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

/**
 * Sáu chặng của con đường sửa xe, gom từ mười một trạng thái.
 *
 * 🔒 Gom ở đây là chuyện TRÌNH BÀY, không phải chuyện nghiệp vụ: máy trạng
 * thái thật vẫn nằm ở `packages/contracts` và ở trigger database. Bảng này chỉ
 * trả lời "đang ở đoạn nào của con đường" — câu hỏi mà cố vấn phải trả lời cho
 * khách qua điện thoại trong ba giây, và là câu duy nhất khách quan tâm khi mở
 * link tra cứu.
 *
 * Dùng chung giữa màn nội bộ và trang khách để hai bên không bao giờ vẽ ra hai
 * tiến độ khác nhau cho cùng một chiếc xe. NHÃN thì khác nhau — nội bộ nói
 * "Khách duyệt", trang khách nói "Bạn đã duyệt" — nên nhãn nằm ở chỗ dùng.
 */
export const CHANG_GOM: readonly (readonly RepairOrderStatus[])[] = [
  ['RECEIVED', 'DIAGNOSING'],
  ['QUOTED'],
  ['AWAITING_APPROVAL'],
  ['IN_PROGRESS', 'AWAITING_PARTS'],
  ['QUALITY_CHECK'],
  ['AWAITING_PAYMENT', 'AWAITING_DELIVERY', 'DELIVERED'],
];

/** Chặng hiện tại, `-1` khi trạng thái nằm ngoài con đường (đơn đã huỷ) */
export function chiSoChang(status: string): number {
  return CHANG_GOM.findIndex((c) => c.includes(status as RepairOrderStatus));
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
