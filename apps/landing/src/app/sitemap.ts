import type { MetadataRoute } from 'next';
import { requestHost, fetchPublic, noIndex } from '@/lib/api';
import { loadSite } from '@/lib/site';
import type { PublicProductSummary } from '@garageos/contracts';

export const dynamic = 'force-dynamic';

/**
 * Sitemap theo primary domain — P1-LND-011: chỉ chứa published canonical URL,
 * không chứa draft/filter/cross-tenant route. Dev/CI trả rỗng (không index).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (noIndex()) return [];

  const site = await loadSite();
  if (site === null) return [];
  const base = site.primaryOrigin;

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/xe`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/lien-he`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  /*
   * 🔒 Đi HẾT catalog bằng con trỏ, không lấy đúng một trang.
   *
   * Bản trước gọi `?limit=50` một lần. Máy chủ chặn `limit` ở 50
   * (`public-landing.service.ts`), nên showroom có hơn 50 mẫu xe thì sitemap
   * THIẾU phần còn lại — và thiếu trong im lặng: không log, không lỗi, file
   * vẫn hợp lệ.
   *
   * Với một nhánh mà toàn bộ mục đích là SEO, một sitemap thiếu là thứ đắt
   * nhất có thể hỏng mà vẫn trông như đang chạy tốt: Google không báo "bạn
   * quên 30 xe", nó chỉ đơn giản là không biết chúng tồn tại.
   */
  const TRAN_URL = 5_000;
  try {
    const host = await requestHost();
    let cursor: string | null = null;
    let daDay = false;

    do {
      const duong: string = `/vehicle-products?limit=50${
        cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
      }`;
      const res: { items: PublicProductSummary[]; nextCursor: string | null } =
        await fetchPublic<{ items: PublicProductSummary[]; nextCursor: string | null }>(
          host,
          duong,
        );

      for (const p of res.items) {
        entries.push({ url: `${base}/xe/${p.slug}`, changeFrequency: 'weekly', priority: 0.8 });
      }

      cursor = res.nextCursor;
      if (entries.length >= TRAN_URL) {
        daDay = true;
        break;
      }
    } while (cursor !== null);

    /*
     * ⚠️ Chạm trần thì NÓI RA. Chuẩn sitemap cho tối đa 50.000 URL mỗi file;
     * trần 5.000 ở đây là để một lỗi phân trang không biến thành vòng lặp vô
     * hạn. Cắt bớt mà im lặng thì đúng bằng lỗi vừa sửa, chỉ ở ngưỡng khác.
     */
    if (daDay) {
      console.warn(
        `[sitemap] chạm trần ${TRAN_URL} URL — catalog lớn hơn thế, cần chia sitemap theo chỉ mục`,
      );
    }
  } catch {
    // Không có catalog thì sitemap vẫn chứa route tĩnh
  }

  return entries;
}
