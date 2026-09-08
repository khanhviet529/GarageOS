import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageTitle } from '@garageos/domain';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ngayVN } from '@/features/gia-lan-banh/kieu';
import css from '@/features/tin-tuc/tin-tuc.module.css';
import { noIndex } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { loadArticles, loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * Trang Tin tức — DES-LS-002, bản dựng 1440 × 2802.
 *
 * 🔒 Chỉ bài ĐÃ CÔNG BỐ. Điều kiện đó nằm trong SQL của `publicList`
 *    (`JOIN article_revision ON r.id = a.published_revision_id`), không ở đây —
 *    lọc ở tầng hiển thị nghĩa là bản nháp vẫn đi qua dây mạng.
 */
export default async function TinTucPage(): Promise<React.ReactElement> {
  const [site, bai] = await Promise.all([loadSite(), loadArticles(24)]);
  const noiBat = bai.find((b) => b.featured) ?? null;
  const conLai = bai.filter((b) => b !== noiBat);

  return (
    <>
      <SiteHeader site={site} trang="tin-tuc" />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        <section className={css.dau}>
          <div className="container">
            <p className="nhan">Tin tức</p>
            <h1>Những gì đáng biết trước khi mua và sau khi mua</h1>
          </div>
        </section>

        {noiBat !== null && (
          <Link href={`/tin-tuc/${noiBat.slug}`} className={css.noiBat}>
            <div className={`container ${css.noiBatTrong}`}>
              <div className={css.noiBatAnh}>
                {noiBat.coverUrl !== null && (
                  <img src={noiBat.coverUrl} alt="" width={1280} height={800} loading="eager" />
                )}
              </div>
              <div>
                <p className="nhan">Bài nổi bật</p>
                <h2>{noiBat.title}</h2>
                {noiBat.excerpt !== null && <p>{noiBat.excerpt}</p>}
                <p className={css.meta}>
                  {noiBat.categoryName !== null && <span>{noiBat.categoryName}</span>}
                  {noiBat.publishedAt !== null && <span>{ngayVN(noiBat.publishedAt)}</span>}
                </p>
              </div>
            </div>
          </Link>
        )}

        <div className="container">
          {bai.length === 0 ? (
            <p className={css.rong}>Chưa có bài viết nào được đăng.</p>
          ) : (
            <div className={css.luoi}>
              {conLai.map((b) => (
                <Link key={b.slug} href={`/tin-tuc/${b.slug}`} className={css.the}>
                  <div className={css.theAnh}>
                    {b.coverUrl !== null && (
                      <img src={b.coverUrl} alt="" width={900} height={600} loading="lazy" />
                    )}
                  </div>
                  <p className={css.meta}>
                    {b.categoryName !== null && <span>{b.categoryName}</span>}
                    {b.publishedAt !== null && <span>{ngayVN(b.publishedAt)}</span>}
                  </p>
                  <h3>{b.title}</h3>
                  {b.excerpt !== null && <p>{b.excerpt}</p>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter site={site} />
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  const brand = site?.brandName ?? 'Showroom ô tô';
  return buildMetadata({
    site,
    title: buildPageTitle('Tin tức', brand),
    description: `Kinh nghiệm mua xe, chi phí sử dụng và tin tức từ ${brand}.`,
    path: '/tin-tuc',
  });
}
