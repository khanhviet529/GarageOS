import Link from 'next/link';
import type { PublicSiteView } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import css from './site-chrome.module.css';

/**
 * Chân trang — gồm luôn phần điều hướng phụ và dòng pháp lý.
 *
 * 🔒 Chỉ liệt kê những gì API công khai thật sự trả về. Bản dựng có thêm mạng
 *    xã hội, mã số thuế và số giấy phép kinh doanh; `PublicSiteView` không có
 *    ba trường đó, và một chân trang bịa số giấy phép là loại sai nguy hiểm hơn
 *    hẳn một chân trang ngắn. Đã ghi vào báo cáo bàn giao.
 */
export function SiteFooter({ site }: { site: PublicSiteView | null }): React.ReactElement {
  const ten = site?.brandName ?? 'Showroom ô tô';
  const chinh = site?.publicBranches[0] ?? null;

  return (
    <footer className={css.chanTrang}>
      <div className={`container ${css.chanTrangTrong}`}>
        <div className={css.luoi}>
          <div className={css.gioiThieu}>
            <Link href="/" className={css.thuongHieu}>
              <span className={css.dau} aria-hidden="true" />
              <span>{ten}</span>
            </Link>
            <p>Từ khoảnh khắc chọn xe đến mỗi lần bảo dưỡng sau này.</p>
          </div>

          <div className={css.cot}>
            <h2>Sản phẩm</h2>
            <ul>
              <li><Link href="/xe">Xe đang bán</Link></li>
              <li><Link href="/#gia-lan-banh">Giá lăn bánh</Link></li>
              <li><Link href="/lien-he?nhu-cau=lai-thu">Đăng ký lái thử</Link></li>
            </ul>
          </div>

          <div className={css.cot}>
            <h2>Hỗ trợ</h2>
            <ul>
              <li><Link href="/lien-he">Gửi yêu cầu tư vấn</Link></li>
              <li><Link href="/#chi-nhanh">Hệ thống showroom</Link></li>
            </ul>
          </div>

          <div className={css.cot}>
            <h2>Liên hệ</h2>
            <ul>
              {chinh?.phone != null && (
                <li className={css.dong}>
                  <Icon ten="phone" size={13} />
                  <a href={`tel:${chinh.phone}`}>{chinh.phone}</a>
                </li>
              )}
              {chinh?.address != null && (
                <li className={css.dong}>
                  <Icon ten="map-pin" size={13} />
                  <span>{chinh.address}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <p className={css.phapLy}>
          <span>{site?.legalName ?? ten}</span>
          <span>© {new Date().getFullYear()}</span>
        </p>
      </div>
    </footer>
  );
}
