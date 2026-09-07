import { fetchPublic, requestHost } from '@/lib/api';
import { TINH_MAC_DINH, type BocGia, type BocGiaDayDu } from '@/features/gia-lan-banh/kieu';

/**
 * Lấy bóc giá cho MỘT xe từ SSR. **Không bao giờ ném.**
 *
 * 🔒 Giá lăn bánh là thông tin BỔ SUNG của thẻ xe. Một tenant chưa khai biểu
 *    phí phải cho ra một thẻ thiếu một dòng, không phải một trang 500.
 */
export async function layBocGia(slug: string, provinceCode = TINH_MAC_DINH): Promise<BocGia | null> {
  try {
    const host = await requestHost();
    const tham = new URLSearchParams({ provinceCode });
    return await fetchPublic<BocGia>(
      host,
      `/vehicle-products/${encodeURIComponent(slug)}/gia-lan-banh?${tham.toString()}`,
    );
  } catch {
    return null;
  }
}

/**
 * Lấy bóc giá cho NHIỀU xe, song song.
 *
 * ⚠️ Sáu lượt gọi cho một trang. API chưa có endpoint trả giá lăn bánh hàng
 *    loạt theo danh sách xe; ghép ở đây là cách duy nhất hiện có để thẻ xe nói
 *    được con số mà thiết kế yêu cầu, thay vì bịa nó ở trình duyệt.
 */
export async function layBocGiaNhieuXe(
  slugs: string[],
  provinceCode = TINH_MAC_DINH,
): Promise<Map<string, BocGiaDayDu>> {
  const ketQua = await Promise.all(slugs.map(async (s) => [s, await layBocGia(s, provinceCode)] as const));
  const map = new Map<string, BocGiaDayDu>();
  for (const [slug, kq] of ketQua) {
    if (kq !== null && kq.reason === null) map.set(slug, kq);
  }
  return map;
}
