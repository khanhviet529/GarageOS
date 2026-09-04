import Link from 'next/link';
import type { PublicSiteView } from '@garageos/contracts';

export function Header({ site }: { site: PublicSiteView | null }): React.ReactElement {
  return (
    <header className="site-header">
      <a href="#main" className="skip-link">Bỏ qua điều hướng</a>
      <div className="container">
        <Link href="/" aria-label="Trang chủ" className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <span>{site?.brandName ?? 'Showroom ô tô'}</span>
        </Link>
        <nav aria-label="Điều hướng chính">
          <Link href="/">Trang chủ</Link>
          <Link href="/xe">Danh sách xe</Link>
          <Link href="/lien-he" className="nav-cta">Đăng ký lái thử</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ site }: { site: PublicSiteView | null }): React.ReactElement {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <strong>{site?.brandName ?? 'Showroom ô tô'}</strong>
          <p className="note">Từ khoảnh khắc chọn xe đến mỗi lần bảo dưỡng sau này — chúng tôi đồng hành cùng bạn.</p>
        </div>
        <div>
          {site !== null && site.publicBranches.length > 0 && (
            <ul>
              {site.publicBranches.map((b) => (
                <li key={b.id}>
                  {b.name}
                  {b.phone !== null && <> — <a href={`tel:${b.phone}`}>{b.phone}</a></>}
                </li>
              ))}
            </ul>
          )}
          <p className="note">Đăng ký lái thử và nhận báo giá miễn phí. Dữ liệu chỉ được dùng để tư vấn.</p>
        </div>
      </div>
    </footer>
  );
}
