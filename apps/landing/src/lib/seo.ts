import type { Metadata } from 'next';
import type { PublicSiteView } from '@garageos/contracts';
import { requestHost, noIndex, productionEnvironment } from '@/lib/api';

/**
 * Metadata động theo site — SEO-URL-001/002, SEO-META-001/002/004.
 *
 * Canonical tuyệt đối từ primary origin (không lấy từ Host chưa xác minh), OG +
 * Twitter cùng một nguồn dữ liệu. Indexability do route/env quyết định, không
 * do client gửi.
 */
export interface SeoInput {
  site: PublicSiteView | null;
  title: string;
  description: string;
  path: string;
  image?: string | null;
  /** Force noindex (vd trang filter) — ghi đè cả môi trường production */
  noindex?: boolean;
}

export async function buildMetadata(input: SeoInput): Promise<Metadata> {
  const { site, title, description, path, image, noindex } = input;
  const scheme = productionEnvironment() ? 'https' : 'http';
  const origin = site?.primaryOrigin ?? `${scheme}://${await requestHost()}`;
  const canonical = `${origin}${path}`;
  const index = !noIndex() && noindex !== true;
  const ogImage = image ?? null;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: site?.brandName ?? undefined,
      locale: 'vi_VN',
      type: 'website',
      ...(ogImage !== null ? { images: [{ url: ogImage, alt: title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage !== null ? { images: [ogImage] } : {}),
    },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}
