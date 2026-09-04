import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import css from './man-hero.module.css';

/**
 * Màn 1 · Hero.
 *
 * 🔒 Tiêu đề là LỜI HỨA CỦA ĐẠI LÝ, không phải tên một chiếc xe. Catalog có hai
 *    hãng, nên hero khoá vào một mẫu là cách đuổi khách của hãng kia đi trong
 *    giây đầu tiên (DES-LS-002 §2b).
 *
 * 🔒 Dòng dưới tiêu đề trả lời câu "ở đây có xe tôi cần không?" trong hai giây.
 *    Nó thay cho bộ chọn mẫu xe đã bị gỡ khi dựng theo mô hình màn hình — rẻ
 *    hơn, và không cướp chỗ của lời hứa chính.
 *
 * ⚠️ Mọi con số trong dòng đó ĐẾM ĐƯỢC từ dữ liệu: số mẫu, tên hãng, loại động
 *    cơ và số chi nhánh đều đến từ API. Không có chỗ nào viết tay một con số.
 */
export function ManHero({
  anhUrl,
  anhAlt,
  ghiChuAnh,
  soMau,
  hangXe,
  loaiDongCo,
  soChiNhanh,
  tenChiNhanh,
}: {
  anhUrl: string | null;
  anhAlt: string;
  ghiChuAnh: string;
  soMau: number;
  hangXe: string[];
  loaiDongCo: string[];
  soChiNhanh: number;
  tenChiNhanh: string[];
}): React.ReactElement {
  const pham = [
    soMau > 0 ? `${soMau} mẫu ${hangXe.join(' và ')}` : null,
    loaiDongCo.length > 0 ? loaiDongCo.join(', ') : null,
    soChiNhanh > 0 ? `giao từ ${soChiNhanh} showroom` : null,
  ].filter((x): x is string => x !== null);

  return (
    <section className={`${css.man} man-anh`} aria-labelledby="hero-tieu-de">
      <div className={css.anh}>
        {anhUrl !== null ? (
          <img className="troi" src={anhUrl} alt={anhAlt} width={2560} height={1440} fetchPriority="high" />
        ) : (
          <div className={css.trong}>
            <Icon ten="car" size={120} />
            <p className={css.ghiChuAnh}>{ghiChuAnh}</p>
          </div>
        )}
      </div>

      <div className={`container ${css.chu}`}>
        <div>
          {tenChiNhanh.length > 0 && (
            <p className="nhan">{soChiNhanh} showroom · {tenChiNhanh.join(' · ')}</p>
          )}
          <h1 id="hero-tieu-de" className={css.loiHua}>Giá lăn bánh, không phải giá niêm yết.</h1>
          {pham.length > 0 && <p className={css.pham}>{pham.join(' · ')}.</p>}
          <div className={css.nut}>
            <Link className="nut" href="/lien-he?nhu-cau=lai-thu">Đăng ký lái thử</Link>
            <Link className="nut nut-vien" href="#gia-lan-banh">Xem giá lăn bánh</Link>
          </div>
        </div>
        <p className={css.cuon} aria-hidden="true">
          <span>Cuộn</span>
          <Icon ten="chevron-down" size={20} />
        </p>
      </div>
    </section>
  );
}
