import Link from 'next/link';
import type { PublicNavItem, PublicSiteView } from '@garageos/contracts';
import { loadNav } from '@/lib/site';
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
/**
 * Menu MẶC ĐỊNH khi tenant chưa cấu hình mục nào.
 *
 * 🔒 Không vẽ thanh điều hướng trống. `loadNav` trả rỗng cho CẢ HAI trường hợp
 *    "chưa cấu hình" và "gọi API hỏng", và hai trường hợp đó không phân biệt
 *    được ở đây — nhưng cách xử lý đúng thì giống nhau: một trang bán xe không
 *    có menu là một trang không đi đâu được.
 *
 * Bốn mục này khớp đúng bộ mà seed ghi vào `site_navigation`, nên đổi nguồn dữ
 * liệu không đổi cái người dùng nhìn thấy.
 */
const MAC_DINH: PublicNavItem[] = [
  { label: 'Xe đang bán', href: '/xe', columnIndex: 0, external: false },
  { label: 'Giá lăn bánh', href: '/#gia-lan-banh', columnIndex: 0, external: false },
  { label: 'Tin tức', href: '/tin-tuc', columnIndex: 0, external: false },
  { label: 'Liên hệ', href: '/lien-he', columnIndex: 0, external: false },
];

/** Mục nào đang mở — so theo phần đường dẫn, bỏ qua `?` và `#`. */
function dangMo(href: string, trang: TrangHienTai): boolean {
  const goc = href.split('?')[0]?.split('#')[0] ?? href;
  if (trang === 'xe') return goc === '/xe';
  if (trang === 'tin-tuc') return goc === '/tin-tuc';
  if (trang === 'lien-he') return goc === '/lien-he';
  return false;
}

export async function SiteHeader({
  site,
  tren = false,
  trang = null,
}: {
  site: PublicSiteView | null;
  /** `true` khi thanh nằm đè lên ảnh hero: nền bắt đầu trong suốt. */
  tren?: boolean;
  trang?: TrangHienTai;
}): Promise<React.ReactElement> {
  const tuDb = await loadNav('HEADER');
  const muc = tuDb.length > 0 ? tuDb : MAC_DINH;

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
          {muc.map((m) =>
            m.external ? (
              <a key={m.href + m.label} href={m.href} rel="noopener">{m.label}</a>
            ) : (
              <Link
                key={m.href + m.label}
                href={m.href}
                aria-current={dangMo(m.href, trang) ? 'page' : undefined}
              >
                {m.label}
              </Link>
            ),
          )}
          {/*
            CTA lái thử KHÔNG lấy từ dữ liệu: nó là nút hành động của trang bán
            xe, có kiểu riêng và luôn phải ở đó. Để nó cấu hình được nghĩa là cho
            phép gỡ mất đường chuyển đổi chính bằng một lần bấm nhầm.
          */}
          <Link href="/lien-he?nhu-cau=lai-thu" className={css.ctaDau}>Đăng ký lái thử</Link>
        </nav>
      </div>
    </header>
  );
}
