import Link from 'next/link';
import type { LandingPageDocument, LandingSection, PublicProductSummary, PublicSiteView } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import { powertrainLabel } from '@/lib/utils/vehicle';
import css from './landing-page-renderer.module.css';

/**
 * Một trình dựng cho cả tài liệu đã xuất bản lẫn bản xem trước bằng token.
 *
 * 🔒 Mọi chữ trong khối đến từ TÀI LIỆU, không từ mã. Trang chủ đã thiết kế có
 *    chữ cố định vì nó là một bài kể chuyện đã chốt; trang này thì biên tập viên
 *    soạn, nên một dòng chữ viết cứng ở đây sẽ lặng lẽ đè lên thứ họ vừa nhập.
 *
 * 🔒 INV-LS-10: không nhận HTML/CSS/JS tự do. Bảy hình dạng khối, mỗi khối nhận
 *    chữ thuần và một liên kết — bề mặt XSS chạy trên chính domain của khách thì
 *    không rào lại an toàn được.
 */
const NEN: Record<string, string | undefined> = { light: css.giay, dark: css.toi, brand: css.anh };
const NHIP: Record<string, string | undefined> = { compact: css.gon, spacious: css.rong };

function lop(section: LandingSection, them?: string): string {
  return [
    css.khoi ?? '',
    NEN[section.appearance.theme] ?? css.giay ?? '',
    NHIP[section.appearance.spacing] ?? '',
    section.appearance.alignment === 'center' ? css.giua ?? '' : '',
    them ?? '',
  ].filter((c) => c !== '').join(' ');
}

function nhanTheme(section: LandingSection): string {
  return section.appearance.theme === 'light' ? 'nhan nhan-giay' : 'nhan';
}

function nutTheme(section: LandingSection): string {
  return section.appearance.theme === 'light' ? 'nut nut-giay' : 'nut';
}

function gia(p: PublicProductSummary): string {
  return p.displayPrice === null ? 'Liên hệ' : `${p.displayPrice.toLocaleString('vi-VN')} ₫`;
}

export function LandingPageRenderer({
  document,
  products,
  site,
}: {
  document: LandingPageDocument;
  products: PublicProductSummary[];
  site: PublicSiteView | null;
}): React.ReactElement {
  return (
    <>
      {document.sections.filter((s) => s.enabled).map((section) => {
        switch (section.type) {
          case 'hero':
            return (
              <section key={section.id} className={lop(section, css.hero)} aria-labelledby={section.id}>
                <div className="container">
                  <p className={nhanTheme(section)}>{section.content.eyebrow ?? site?.brandName ?? ''}</p>
                  <h1 id={section.id}>{section.content.title}</h1>
                  {section.content.description !== undefined && (
                    <p className={css.than}>{section.content.description}</p>
                  )}
                  {section.content.cta !== undefined && (
                    <p className={css.nut}>
                      <Link className={nutTheme(section)} href={section.content.cta.href}>
                        {section.content.cta.label}
                      </Link>
                    </p>
                  )}
                </div>
              </section>
            );

          case 'vehicleShowcase': {
            const chon = products.filter((p) => section.content.productIds.includes(p.id));
            const ds = chon.length > 0 ? chon : products;
            if (section.appearance.variant === 'featured') {
              const xe = ds[0];
              if (xe === undefined) return null;
              return (
                <section key={section.id} className={lop(section, css.noiBat)} aria-labelledby={section.id}>
                  <div className={css.noiBatAnh}>
                    {xe.coverUrl !== null
                      ? <img src={xe.coverUrl} alt={xe.coverAlt ?? xe.name} width={2560} height={1440} loading="lazy" />
                      : <Icon ten="car" size={160} />}
                  </div>
                  <div className={`container ${css.noiBatChu}`}>
                    <p className={nhanTheme(section)}>{section.content.eyebrow ?? section.content.title}</p>
                    <h2 id={section.id} className={css.noiBatTen}>{xe.name}</h2>
                    <p className={css.nut}>
                      <Link className={nutTheme(section)} href={section.content.cta?.href ?? `/xe/${xe.slug}`}>
                        {section.content.cta?.label ?? `Khám phá ${xe.modelName}`}
                        <Icon ten="arrow-right" />
                      </Link>
                    </p>
                  </div>
                </section>
              );
            }
            return (
              <section key={section.id} className={lop(section)} aria-labelledby={section.id}>
                <div className="container">
                  {section.content.eyebrow !== undefined && (
                    <p className={nhanTheme(section)}>{section.content.eyebrow}</p>
                  )}
                  <h2 id={section.id}>{section.content.title}</h2>
                  <div className={css.luoi}>
                    {ds.map((p) => (
                      <Link key={p.id} href={`/xe/${p.slug}`} className={`${css.o} hien`}>
                        <span className={css.oAnh}>
                          {p.coverUrl !== null
                            ? <img src={p.coverUrl} alt={p.coverAlt ?? p.name} width={1000} height={625} loading="lazy" />
                            : <Icon ten="car" size={56} />}
                        </span>
                        <h3>{p.name}</h3>
                        <p className={css.oPhu}>{p.makeName} · {powertrainLabel(p.powertrain)}</p>
                        <p className={css.oGia}><span>Niêm yết</span><b>{gia(p)}</b></p>
                      </Link>
                    ))}
                  </div>
                  {section.content.cta !== undefined && (
                    <p className={css.nut}>
                      <Link className={nutTheme(section)} href={section.content.cta.href}>
                        {section.content.cta.label}
                      </Link>
                    </p>
                  )}
                </div>
              </section>
            );
          }

          case 'journey':
            /*
             * Tài liệu chỉ mang một tiêu đề cho khối này. Hiện tiêu đề đó cùng
             * các mẫu xe đang bán làm chặng — KHÔNG dựng "bốn bước sở hữu" viết
             * cứng: DES-LS-002 §2 đã gỡ khối đó vì nội dung rỗng (chọn xe → lái
             * thử → nhận xe → bảo dưỡng chính là cách mua ô tô vốn dĩ diễn ra).
             */
            return (
              <section key={section.id} className={lop(section)} aria-labelledby={section.id}>
                <div className="container">
                  <h2 id={section.id}>{section.content.title}</h2>
                  <ol className={css.chang}>
                    {products.slice(0, 4).map((p) => (
                      <li key={p.id}>
                        <p className={nhanTheme(section)}>{powertrainLabel(p.powertrain)}</p>
                        <h3><Link href={`/xe/${p.slug}`}>{p.name}</Link></h3>
                        <p>{p.summary}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            );

          case 'imageText':
            return (
              <section key={section.id} className={lop(section)} aria-labelledby={section.id}>
                <div className="container">
                  {section.content.eyebrow !== undefined && (
                    <p className={nhanTheme(section)}>{section.content.eyebrow}</p>
                  )}
                  <h2 id={section.id}>{section.content.title}</h2>
                  <p className={css.doanVan}>{section.content.body}</p>
                  {section.content.cta !== undefined && (
                    <p className={css.nut}>
                      <Link className={nutTheme(section)} href={section.content.cta.href}>
                        {section.content.cta.label}
                      </Link>
                    </p>
                  )}
                </div>
              </section>
            );

          case 'trust':
            return (
              <section key={section.id} className={lop(section)} aria-labelledby={section.id}>
                <div className="container">
                  <h2 id={section.id}>{section.content.title}</h2>
                  {section.content.body !== undefined && <p className={css.than}>{section.content.body}</p>}
                  {site !== null && site.publicBranches.length > 0 && (
                    <ul className={css.chang}>
                      {site.publicBranches.map((b) => (
                        <li key={b.id}>
                          <h3>{b.name}</h3>
                          {b.address !== null && <p>{b.address}</p>}
                          {b.phone !== null && <p><a href={`tel:${b.phone}`}>{b.phone}</a></p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );

          case 'richText':
            return (
              <section key={section.id} className={lop(section)} aria-labelledby={section.content.title === undefined ? undefined : section.id}>
                <div className="container">
                  {section.content.title !== undefined && <h2 id={section.id}>{section.content.title}</h2>}
                  <p className={css.doanVan}>{section.content.body}</p>
                </div>
              </section>
            );

          case 'cta':
            return (
              <section key={section.id} className={lop(section)} aria-labelledby={section.id}>
                <div className="container">
                  <h2 id={section.id}>{section.content.title}</h2>
                  {section.content.body !== undefined && <p className={css.than}>{section.content.body}</p>}
                  <p className={css.nut}>
                    <Link className={nutTheme(section)} href={section.content.cta.href}>
                      {section.content.cta.label}
                    </Link>
                  </p>
                </div>
              </section>
            );
        }
      })}
    </>
  );
}
