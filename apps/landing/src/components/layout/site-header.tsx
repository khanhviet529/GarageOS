import Link from 'next/link';
import type { PublicSiteView } from '@garageos/contracts';
import css from './site-chrome.module.css';

export type TrangHienTai = 'trang-chu' | 'xe' | 'tin-tuc' | 'lien-he' | null;

/**
 * Điều hướng — DES-LS-002 §5. Tesla: thanh TRONG SUỐT nằm trên ảnh hero, chỉ
 * đặc lại khi cuộn qua hero. Không mega-menu, không dropdown nhiều tầng.
 *
 * 🔒 Mục menu chỉ được thêm khi trang đích CÓ THẬT. Bản dựng có sáu mục; ở đây
 *    bốn, vì bốn mục đó có trang thật. Một mục dẫn tới 404 tệ hơn hẳn một menu
 *    ngắn: menu ngắn là một sự thật, còn 404 là một lời hứa hỏng — và khách
 *    không phân biệt được "trang lỗi" với "showroom hết bài viết".
 *
 * "Tin tức" vào menu ở lát cắt này vì `/tin-tuc` vừa có thật (migration 0077).
 * Trang vẫn hiện đàng hoàng khi chưa có bài nào: nó nói "Chưa có bài viết nào
 * được đăng", chứ không phải một trang lỗi.
 */
export function SiteHeader({
  site,
  tren = false,
  trang = null,
}: {
  site: PublicSiteView | null;
  /** `true` khi thanh nằm đè lên ảnh hero: nền bắt đầu trong suốt. */
  tren?: boolean;
  trang?: TrangHienTai;
}): React.ReactElement {
  return (
    <header className={tren ? `${css.dauTrang} ${css.tren}` : css.dauTrang}>
      <a href="#main" className="skip-link">Bỏ qua điều hướng</a>
      <div className={`container ${css.thanh}`}>
        <Link
          href="/"
          className={css.thuongHieu}
          aria-current={trang === 'trang-chu' ? 'page' : undefined}
        >
          <span className={css.dau} aria-hidden="true" />
          <span>{site?.brandName ?? 'Showroom ô tô'}</span>
        </Link>
        <nav className={css.dieuHuong} aria-label="Điều hướng chính">
          <Link href="/xe" aria-current={trang === 'xe' ? 'page' : undefined}>Xe đang bán</Link>
          <Link href="/#gia-lan-banh">Giá lăn bánh</Link>
          <Link href="/tin-tuc" aria-current={trang === 'tin-tuc' ? 'page' : undefined}>Tin tức</Link>
          <Link href="/lien-he" aria-current={trang === 'lien-he' ? 'page' : undefined}>Liên hệ</Link>
          <Link href="/lien-he?nhu-cau=lai-thu" className={css.ctaDau}>Đăng ký lái thử</Link>
        </nav>
      </div>
    </header>
  );
}
