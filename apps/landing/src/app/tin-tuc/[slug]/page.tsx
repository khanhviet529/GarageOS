import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublicArticleDetail } from '@garageos/contracts';
import { buildPageTitle } from '@garageos/domain';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ngayVN } from '@/features/gia-lan-banh/kieu';
import css from '@/features/tin-tuc/tin-tuc.module.css';
import { VanBanGiau } from '@/features/tin-tuc/van-ban-giau';
import { fetchPublic, noIndex, requestHost } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function layBai(slug: string): Promise<PublicArticleDetail | null> {
  try {
    const host = await requestHost();
    return await fetchPublic<PublicArticleDetail>(host, `/articles/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export default async function ArticlePage({ params }: PageProps): Promise<React.ReactElement> {
  const { slug } = await params;
  const [site, bai] = await Promise.all([loadSite(), layBai(slug)]);

  /*
   * 🔒 Bài chưa publish và bài không tồn tại đều ra 404, cùng một trang.
   *
   * Phân biệt hai trường hợp là nói với người lạ rằng "có một bài tên này nhưng
   * bạn chưa được đọc" — tức là để lộ nội dung sắp đăng qua chính mã trạng thái.
   */
  if (bai === null) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: bai.title,
    description: bai.excerpt ?? undefined,
    image: bai.coverUrl ?? undefined,
    datePublished: bai.publishedAt ?? undefined,
    publisher: site === null ? undefined : { '@type': 'Organization', name: site.brandName },
  };

  return (
    <>
      <SiteHeader site={site} trang="tin-tuc" />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      {/*
        `<` đổi thành `\u003c` — cùng cách với trang chủ và trang xe. Tiêu đề bài
        do biên tập viên gõ, nên một chuỗi `</script>` trong tiêu đề sẽ đóng thẻ
        sớm và mọi thứ sau đó thành HTML thật.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }}
      />
      <main id="main" tabIndex={-1}>
        <article>
          <header className={css.baiDau}>
            <div className="container">
              <p className={css.meta}>
                {bai.categoryName !== null && <span>{bai.categoryName}</span>}
                {bai.publishedAt !== null && (
                  <time dateTime={bai.publishedAt}>{ngayVN(bai.publishedAt)}</time>
                )}
              </p>
              <h1>{bai.title}</h1>
              {bai.excerpt !== null && <p className={css.baiTomTat}>{bai.excerpt}</p>}
            </div>
          </header>

          {bai.coverUrl !== null && (
            <div className="container">
              <div className={css.baiAnh}>
                <img src={bai.coverUrl} alt="" width={1680} height={720} fetchPriority="high" />
              </div>
            </div>
          )}

          <div className={`${css.than} man-giay`}>
            <div className="container">
              <div className={css.thanTrong}>
                <VanBanGiau doc={bai.bodyDocument} />
                {bai.tags.length > 0 && (
                  <div className={css.the2}>
                    {bai.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </article>
      </main>
      <SiteFooter site={site} />
    </>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [site, bai] = await Promise.all([loadSite(), layBai(slug)]);
  const brand = site?.brandName ?? 'Showroom ô tô';
  if (bai === null) {
    return buildMetadata({
      site,
      title: buildPageTitle('Không tìm thấy bài viết', brand),
      description: 'Bài viết không tồn tại hoặc chưa được đăng.',
      path: `/tin-tuc/${slug}`,
      noindex: true,
    });
  }
  return buildMetadata({
    site,
    title: buildPageTitle(bai.seoTitle ?? bai.title, brand),
    description: bai.seoDescription ?? bai.excerpt ?? `Bài viết từ ${brand}.`,
    path: `/tin-tuc/${bai.slug}`,
  });
}
