import type { Metadata } from 'next';
import type { PublicSiteView } from '@garageos/contracts';
import { canonicalUrl } from '@garageos/domain';
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
  /*
   * 🔒 Đi qua `canonicalUrl` của `packages/domain`, không tự ghép chuỗi.
   *
   * Ghép tay `${origin}${path}` sinh URL hỏng ở hai đầu: `primaryOrigin` có
   * dấu `/` cuối thì ra `https://x.vn//xe`, `path` thiếu `/` đầu thì ra
   * `https://x.vnxe`. Google coi mỗi biến thể là một URL riêng, và canonical
   * hỏng là thứ SEO-URL-001 sinh ra để chống.
   *
   * ⚠️ Hàm `canonicalUrl` đã tồn tại, đã có test, và trước bản sửa này KHÔNG
   *    AI GỌI — trong khi bản ghép tay ở đây thì đang chạy và không có test
   *    nào. Đúng khuôn "hai bản cài đặt của một quy tắc" mà dự án đã dính hai
   *    lần (bảng chuyển trạng thái chép ở web, `segmentId` ở app thợ): bản
   *    được kiểm không chạy, bản chạy không được kiểm.
   */
  const canonical = canonicalUrl(origin, path);
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
