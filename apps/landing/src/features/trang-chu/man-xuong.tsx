import { Icon } from '@/components/ui/icon';
import { PhieuChiPhi } from '@/features/trang-chu/phieu-chi-phi';
import type { ChiPhiTrangChu } from '@/lib/chi-phi';
import css from './man-xuong.module.css';

const DIEM = [
  'Báo giá gửi trước, duyệt từng hạng mục',
  'Nhìn được xe đang ở khoang nào, thợ nào phụ trách',
  'Lịch sử bảo dưỡng theo xe, không mất khi đổi chủ',
];

/**
 * Màn 5 · Xưởng dịch vụ.
 *
 * 🔒 Bản dựng Pencil để cột phải là ba dòng cam kết. Ở đây cột phải là PHIẾU
 *    CHI PHÍ — một khối GIẤY đặt giữa màn tối.
 *
 *    Lý do: quy tắc "tối cho cảm xúc, sáng cho con số" (§1) và câu "mỗi lời hứa
 *    phải có bằng chứng đứng ngay sau nó" (§2). Ba dòng cam kết là ba lời hứa
 *    nữa chồng lên lời hứa của tiêu đề; con số bảo dưỡng năm năm — lấy từ chính
 *    bảng giá xưởng đang xuất hoá đơn — là thứ duy nhất ở màn này khách kiểm
 *    chứng được. Ba dòng cam kết vẫn còn, nhưng lùi xuống dưới đoạn văn.
 */
export function ManXuong({
  anhUrl,
  anhAlt,
  chiPhi,
  xe,
}: {
  anhUrl: string | null;
  anhAlt: string;
  chiPhi: ChiPhiTrangChu | null;
  xe: { name: string; slug: string } | null;
}): React.ReactElement {
  return (
    <section className={`${css.man} man-anh`} aria-labelledby="xuong-tieu-de">
      <div className={css.anh}>
        {anhUrl !== null ? (
          <img src={anhUrl} alt={anhAlt} width={2560} height={1440} loading="lazy" />
        ) : (
          <div className={css.trong}>
            <Icon ten="wrench" size={120} />
            <p className={css.ghiChuAnh}>Ảnh khoang sửa chữa · chụp thật tại xưởng · 2560 × 1440</p>
          </div>
        )}
      </div>

      <div className={`container ${css.chu}`}>
        <div className="hien">
          <p className="nhan">Hậu mãi</p>
          <h2 id="xuong-tieu-de">Mua xe và bảo dưỡng tại cùng một nơi</h2>
          <p className={css.dan}>
            Xe mua tại đây có hồ sơ trong hệ thống xưởng ngay từ lúc bàn giao. Qua mùa nồm,
            qua mùa mưa — mỗi lần vào xưởng đều biết xe đang ở khoang nào và ai phụ trách.
          </p>
          <ul className={css.diem}>
            {DIEM.map((d) => (
              <li key={d}><Icon ten="check" size={15} />{d}</li>
            ))}
          </ul>
        </div>

        <div className="hien hien-2">
          {chiPhi !== null && xe !== null ? (
            <PhieuChiPhi du={chiPhi} tenXe={xe.name} slug={xe.slug} />
          ) : (
            <p className={css.cho}>
              Con số chi phí bảo dưỡng xuất hiện khi showroom công bố bảng giá xưởng cho mẫu xe này.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
