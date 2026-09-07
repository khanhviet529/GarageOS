import type { ChiPhiSoHuuView } from '@garageos/contracts';
import { tomTatChiPhi, type TomTatChiPhi } from '@garageos/domain';
import { requestHost, fetchPublic } from '@/lib/api';

/**
 * 15 000 km/năm — mức trung bình dùng làm mặc định khi khách chưa chọn gì.
 * Trang PHẢI in con số này ra: một chi phí bảo dưỡng không kèm quãng đường là
 * một con số không kiểm chứng được.
 */
export const KM_MOI_NAM_MAC_DINH = 15000;

/**
 * Ngày hiệu lực của bảng giá, ở dạng người Việt đọc được, theo giờ Việt Nam.
 *
 * 🔒 Múi giờ là `Asia/Ho_Chi_Minh`, KHÔNG phải múi giờ của máy chạy render.
 *
 * ⚠️ API trả `ápDụngTừ` dưới dạng ISO có Z, ví dụ `2025-12-31T17:00:00.000Z`.
 *    In thẳng ra thì khách thấy một timestamp máy, và nó còn LỆCH NGÀY: 17:00Z là
 *    01/01/2026 ở Việt Nam, không phải 31/12/2025. Cả khối phiếu chi phí tồn tại
 *    để con số kiểm chứng được, nên một ngày hiệu lực sai làm hỏng đúng điều nó
 *    khẳng định.
 *
 * 💡 Ghim múi giờ thay vì để mặc định vì đây là render phía SERVER — nếu không,
 *    múi giờ của máy chủ quyết định ngày mà khách đọc. `playwright.config.ts` ghim
 *    cùng múi giờ này, với cùng lý do: "ngày làm việc của một xưởng là ngày ở nơi
 *    xưởng đứng".
 */
function ngayVietNam(iso: string): string {
  const d = new Date(iso);
  // Chuỗi không phải ngày hợp lệ thì trả lại nguyên văn: thà hiện thứ khó đọc
  // còn hơn hiện "Invalid Date".
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

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
      apDungTu: ngayVietNam(v['ápDụngTừ']),
      giaCongMoiGio: v.giaCongMoiGio,
      kmMoiNam: v.kmMoiNam,
    };
  } catch {
    return null;
  }
}
