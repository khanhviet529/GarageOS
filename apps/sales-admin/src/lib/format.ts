/**
 * Định dạng hiển thị — KHÔNG chứa nghiệp vụ tính toán.
 *
 * 🔒 Tiền trong hệ là số nguyên đơn vị đồng (`bigint`). Ở đây chỉ ĐỌC ra chữ;
 *    mọi phép cộng trừ nhân chia đã xong ở `packages/domain` trước khi tới đây.
 *    Đừng bao giờ tính tiền trong tầng hiển thị.
 */

const NGAY = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });
const NGAY_DAY_DU = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const GIO = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
const SO = new Intl.NumberFormat('vi-VN');

export function soNguyen(n: number): string {
  return SO.format(n);
}

/** Tiền đồng, không phần thập phân — đồng không có đơn vị nhỏ hơn. */
export function tien(dong: bigint | number): string {
  return `${SO.format(typeof dong === 'bigint' ? Number(dong) : dong)} ₫`;
}

export function ngay(iso: string): string {
  return NGAY_DAY_DU.format(new Date(iso));
}

export function ngayNgan(iso: string | Date): string {
  return NGAY.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function gioPhut(iso: string): string {
  return GIO.format(new Date(iso));
}

/** "3 giờ trước", "2 ngày trước" — mốc thời gian tương đối cho dòng thời gian. */
export function khoangCach(iso: string, moc: Date = new Date()): string {
  const phut = Math.round((moc.getTime() - new Date(iso).getTime()) / 60000);
  if (phut < 1) return 'vừa xong';
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.round(phut / 60);
  if (gio < 24) return `${gio} giờ trước`;
  const ng = Math.round(gio / 24);
  return ng < 30 ? `${ng} ngày trước` : ngay(iso);
}

/** Số giờ đã trôi qua kể từ mốc — dùng để đếm lead tồn quá hạn. */
export function gioKeTu(iso: string, moc: Date = new Date()): number {
  return (moc.getTime() - new Date(iso).getTime()) / 3600000;
}
