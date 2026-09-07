import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Icon } from '@/components/ui/icon';
import { loadSite } from '@/lib/site';
import css from './not-found.module.css';

const LOI_TAT = [
  { href: '/xe', label: 'Xe đang bán' },
  { href: '/#gia-lan-banh', label: 'Giá lăn bánh' },
  { href: '/lien-he?nhu-cau=lai-thu', label: 'Đăng ký lái thử' },
  { href: '/lien-he', label: 'Liên hệ' },
];

/**
 * Lỗi 404.
 *
 * 🔒 Ô tìm là một biểu mẫu GET THẬT trỏ về `/xe`, nơi có bộ lọc theo tên. Một ô
 *    tìm không dẫn tới đâu trên chính trang báo "đường này không dẫn tới đâu" là
 *    một trò đùa mà khách phải trả giá.
 *
 * 🔒 Giọng: không "hãy", không "chúng tôi". Trang 404 KHÔNG nhận lỗi về mình —
 *    đường dẫn hỏng, không phải người dùng sai. (Trang 500 thì ngược lại, và ở
 *    đó "chúng tôi" được phép.)
 */
export default async function NotFound(): Promise<React.ReactElement> {
  const site = await loadSite();

  return (
    <>
      <SiteHeader site={site} />
      <main id="main" tabIndex={-1} className={`${css.man} man-anh`}>
        <div className={`container ${css.luoi}`}>
          <div className={css.chu}>
            <p className="nhan">Lỗi 404</p>
            <h1>Đường này không dẫn tới đâu cả.</h1>
            <p className={css.dan}>
              Trang được tìm không còn, hoặc đường dẫn đã đổi. Nếu đang tìm một mẫu xe, gõ tên
              vào ô dưới.
            </p>

            <form className={css.tim} action="/xe" method="get" role="search">
              <label className="visually-hidden" htmlFor="tim-xe">Tên mẫu xe</label>
              <input id="tim-xe" name="q" type="search" placeholder="Tên xe, ví dụ “Aurora E1”" />
              <button className="nut" type="submit">
                <Icon ten="search" />
                Tìm
              </button>
            </form>

            <div className={css.loiTat}>
              <p className="nhan nhan-mo">Hoặc đi thẳng tới</p>
              <p className={css.loiTatDs}>
                {LOI_TAT.map((l) => (
                  <Link key={l.href} className="chip" href={l.href}>{l.label}</Link>
                ))}
              </p>
            </div>
          </div>

          <div className={css.anh}>
            <Icon ten="car" size={140} />
            <p className={css.ghiChuAnh}>Ảnh 404 · xe đỗ cuối con đường cụt · 1600 × 1200</p>
          </div>
        </div>
      </main>
      <SiteFooter site={site} />
    </>
  );
}
