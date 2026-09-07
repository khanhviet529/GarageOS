import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import type { ChiPhiTrangChu } from '@/lib/chi-phi';
import css from './phieu-chi-phi.module.css';

/**
 * Phiếu chi phí sở hữu — bằng chứng của lời hứa hậu mãi.
 *
 * 🔒 Ba thứ BẮT BUỘC in ra cùng con số, không được lược bớt cho gọn:
 *      · quãng đường mỗi năm  — không có nó thì chi phí vô nghĩa
 *      · tên bảng giá         — cho biết con số đến từ đâu
 *      · ngày hiệu lực        — cho biết con số còn hạn hay không
 *
 * 💡 Đây là điều làm khối này khác một khối marketing: nó tự nêu nguồn và tự
 *    mời khách đi kiểm tra. Con số này là bảng giá xưởng đang dùng để lập báo
 *    giá THẬT — khách mang nó tới quầy đối chiếu được.
 */
const dinhDang = (d: number): string => new Intl.NumberFormat('vi-VN').format(d);

export function PhieuChiPhi({
  du,
  tenXe,
  slug,
}: {
  du: ChiPhiTrangChu;
  tenXe: string;
  slug: string;
}): React.ReactElement {
  const { tomTat } = du;
  return (
    <div className={css.phieu}>
      <p className="nhan nhan-giay">Chi phí bảo dưỡng {tomTat.soNam} năm đầu</p>

      <p className={css.tong}>
        <b>{dinhDang(tomTat.tong)}</b>
        <span>₫</span>
      </p>

      <dl className={css.soLieu}>
        <div>
          <dt className="nhan nhan-mo-giay">Bình quân mỗi năm</dt>
          <dd>{dinhDang(tomTat.binhQuanMoiNam)} ₫</dd>
        </div>
        <div>
          <dt className="nhan nhan-mo-giay">Năm không phải chi gì</dt>
          <dd>{tomTat.soNamKhongTon} / {tomTat.soNam}</dd>
        </div>
        {tomTat.namDatNhat !== null && (
          <div>
            <dt className="nhan nhan-mo-giay">Năm tốn nhiều nhất</dt>
            <dd>Năm {tomTat.namDatNhat.nam} · {dinhDang(tomTat.namDatNhat.tong)} ₫</dd>
          </div>
        )}
        <div>
          <dt className="nhan nhan-mo-giay">Giá công mỗi giờ</dt>
          <dd>{dinhDang(du.giaCongMoiGio)} ₫</dd>
        </div>
      </dl>

      <p className={`uoc-tinh-giay ${css.nguon}`}>
        Tính cho {tenXe} ở {dinhDang(du.kmMoiNam)} km mỗi năm theo{' '}
        <strong>{du.tenBangGia}</strong>, hiệu lực từ {du.apDungTu}. Đây là bảng giá xưởng
        đang dùng để lập báo giá thật.
      </p>

      <p>
        <Link className={css.cta} href={`/xe/${slug}#chi-phi`}>
          Xem chi tiết từng năm
          <Icon ten="arrow-right" size={14} />
        </Link>
      </p>
    </div>
  );
}
