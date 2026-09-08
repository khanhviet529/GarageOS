import Link from 'next/link';
import type { PublicNavItem, PublicSiteView } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import { loadNav } from '@/lib/site';
import css from './site-chrome.module.css';

/**
 * Chân trang — gồm luôn phần điều hướng phụ và dòng pháp lý.
 *
 * 🔒 Chỉ liệt kê những gì API công khai thật sự trả về. Bản dựng có thêm mạng
 *    xã hội, mã số thuế và số giấy phép kinh doanh; `PublicSiteView` không có
 *    ba trường đó, và một chân trang bịa số giấy phép là loại sai nguy hiểm hơn
 *    hẳn một chân trang ngắn. Đã ghi vào báo cáo bàn giao.
 */
/**
 * Hai cột liên kết của chân trang, mặc định khi tenant chưa cấu hình.
 * Khớp đúng bộ mà seed ghi vào `site_navigation`.
 */
const MAC_DINH: PublicNavItem[] = [
  { label: 'Xe đang bán', href: '/xe', columnIndex: 0, external: false },
  { label: 'Giá lăn bánh', href: '/#gia-lan-banh', columnIndex: 0, external: false },
  { label: 'Đăng ký lái thử', href: '/lien-he?nhu-cau=lai-thu', columnIndex: 0, external: false },
  { label: 'Tin tức', href: '/tin-tuc', columnIndex: 1, external: false },
  { label: 'Gửi yêu cầu tư vấn', href: '/lien-he', columnIndex: 1, external: false },
  { label: 'Hệ thống showroom', href: '/#chi-nhanh', columnIndex: 1, external: false },
];

/**
 * ⚠️ TIÊU ĐỀ cột chưa cấu hình được, chỉ liên kết bên dưới mới cấu hình được.
 *
 * `site_navigation` gắn `column_index` vào từng DÒNG, nên một tiêu đề cột sẽ
 * phải lặp lại trên mọi dòng của cột đó — và hai dòng ghi hai tiêu đề khác nhau
 * là chuyện chắc chắn xảy ra. Làm đúng cần một bảng riêng cho cột; chưa đáng ở
 * lát cắt này. Đã ghi vào STATUS.md.
 */
const TIEU_DE_COT = ['Sản phẩm', 'Hỗ trợ'] as const;

export async function SiteFooter({ site }: { site: PublicSiteView | null }): Promise<React.ReactElement> {
  const ten = site?.brandName ?? 'Showroom ô tô';
  const chinh = site?.publicBranches[0] ?? null;
  const tuDb = await loadNav('FOOTER');
  const muc = tuDb.length > 0 ? tuDb : MAC_DINH;

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

          {TIEU_DE_COT.map((tieuDe, cot) => {
            const cuaCot = muc.filter((m) => m.columnIndex === cot);
            // Cột rỗng thì không hiện tiêu đề trơ trọi.
            if (cuaCot.length === 0) return null;
            return (
              <div key={tieuDe} className={css.cot}>
                <h2>{tieuDe}</h2>
                <ul>
                  {cuaCot.map((m) => (
                    <li key={m.href + m.label}>
                      {m.external ? (
                        <a href={m.href} rel="noopener">{m.label}</a>
                      ) : (
                        <Link href={m.href}>{m.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

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
