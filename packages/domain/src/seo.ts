/**
 * Logic thuần cho SEO — SRS SEO (2026-08-12-landing-seo-srs.md).
 * Indexability do ROUTE/STATUS/ENVIRONMENT quyết định, không do client gửi.
 */

/** Tiêu đề theo template `{pageTitle} | {brandName}` — SEO-META-002. */
export function buildPageTitle(pageTitle: string, brandSuffix: string): string {
  const p = pageTitle.trim();
  const b = brandSuffix.trim();
  return b.length === 0 ? p : `${p} | ${b}`;
}

/**
 * Môi trường không phải production phát `noindex` — SEO-META-006.
 * Dev/CI/staging không được index, cũng không canonical về production.
 */
export function shouldNoIndex(environment: string): boolean {
  return environment !== 'production';
}

/**
 * Canonical URL tuyệt đối từ primary origin — SEO-URL-001/002.
 * `path` phải bắt đầu bằng `/`; query không phải một phần canonical.
 */
export function canonicalUrl(primaryOrigin: string, path: string): string {
  const origin = primaryOrigin.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}
