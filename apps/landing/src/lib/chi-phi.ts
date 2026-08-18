import type { ChiPhiSoHuuView } from '@garageos/contracts';
import { tomTatChiPhi, type TomTatChiPhi } from '@garageos/domain';
import { requestHost, fetchPublic } from '@/lib/api';

/**
 * 15 000 km/năm — mức trung bình dùng làm mặc định khi khách chưa chọn gì.
 * Trang PHẢI in con số này ra: một chi phí bảo dưỡng không kèm quãng đường là
 * một con số không kiểm chứng được.
 */
export const KM_MOI_NAM_MAC_DINH = 15000;

export interface ChiPhiTrangChu {
  tomTat: TomTatChiPhi;
  tenBangGia: string;
  apDungTu: string;
  giaCongMoiGio: number;
  kmMoiNam: number;
}

/**
 * Lấy chi phí sở hữu cho trang chủ. **Không bao giờ ném.**
 *
 * 🔒 `fetchPublic` ném khi API trả lỗi. Trang chủ là trang quan trọng nhất của
 *    tenant, và khối chi phí là một phần BỔ SUNG của nó. Nếu một tenant chưa cấu
 *    hình bảng giá hoặc lịch bảo dưỡng, kết quả đúng là trang chủ hiện thiếu một
 *    khối — không phải trang chủ trả 500.
 *
 * 💡 Đây cũng là lý do hàm trả `null` chứ không trả một object rỗng: người gọi
 *    buộc phải xử lý trường hợp không có dữ liệu, thay vì vô tình render số 0.
 */
export async function layChiPhiTrangChu(slug: string): Promise<ChiPhiTrangChu | null> {
  try {
    const host = await requestHost();
    const duong =
      `/vehicle-products/${encodeURIComponent(slug)}/chi-phi-so-huu` +
      `?kmMoiNam=${KM_MOI_NAM_MAC_DINH}&soNam=5`;
    const v = await fetchPublic<ChiPhiSoHuuView>(host, duong);

    const tomTat = tomTatChiPhi({
      soNam: v.soNam,
      tong: v.tong,
      soNamKhongTon: v.soNamKhongTon,
      soSanhXeXang: v.soSanhXeXang,
      theoNam: v.theoNam.map((n) => ({ nam: n.nam, tong: n.tong })),
    });
    if (tomTat === null) return null;

    return {
      tomTat,
      tenBangGia: v.tenBangGia,
      // Tên trường trong contract có dấu tiếng Việt — giữ đúng như vậy khi đọc.
      apDungTu: v['ápDụngTừ'],
      giaCongMoiGio: v.giaCongMoiGio,
      kmMoiNam: v.kmMoiNam,
    };
  } catch {
    return null;
  }
}
