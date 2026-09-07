import type { PublicProductSummary } from '@garageos/contracts';

export function powertrainLabel(powertrain: PublicProductSummary['powertrain']): string {
  if (powertrain === 'BEV') return 'Xe điện';
  if (powertrain === 'HYBRID') return 'Hybrid';
  return 'Xe xăng';
}

/**
 * Dạng NGẮN của loại động cơ, để ghép thành một dòng liệt kê.
 *
 * 💡 "6 mẫu VinFast và Hyundai · xe điện, hybrid, xe xăng" đọc lặp; câu cần là
 *    "điện, hybrid, xăng". Cùng một dữ kiện, hai vai trò khác nhau — nên hai
 *    hàm, chứ không phải một hàm rồi cắt chuỗi ở chỗ dùng.
 */
export function powertrainShort(powertrain: PublicProductSummary['powertrain']): string {
  if (powertrain === 'BEV') return 'điện';
  if (powertrain === 'HYBRID') return 'hybrid';
  return 'xăng';
}
