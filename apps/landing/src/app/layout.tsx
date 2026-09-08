import type { Metadata } from 'next';
import { Be_Vietnam_Pro, IBM_Plex_Mono } from 'next/font/google';
import { requestHost, productionEnvironment } from '@/lib/api';
import { bienCssLanding } from '@garageos/domain';
import { loadSite } from '@/lib/site';
import './globals.css';

const giaoDien = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ui-vn',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono-vn',
});

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  const scheme = productionEnvironment() ? 'https' : 'http';
  const origin = site?.primaryOrigin ?? `${scheme}://${await requestHost()}`;
  const brand = site?.brandName ?? 'Showroom ô tô';

  return {
    metadataBase: new URL(origin),
    title: brand,
    description: 'Showroom ô tô chính hãng — giá niêm yết, đăng ký lái thử, hậu mãi trọn đời.',
    openGraph: { siteName: brand, locale: 'vi_VN', type: 'website' },
    icons: { icon: '/icon.svg', apple: '/apple-icon.svg' },
    manifest: '/manifest.webmanifest',
  };
}

/**
 * Bảng màu của tenant, đặt thẳng lên `<html>`.
 *
 * 🔒 Dán thành `style` inline chứ không phải một thẻ `<style>`: biến khai ở
 *    `:root` trong `tokens.css` và biến khai inline trên chính `<html>` là hai
 *    nguồn cho cùng một tên, và inline luôn thắng — không cần `!important`,
 *    không phụ thuộc thứ tự stylesheet, và không có chuỗi CSS nào do máy chủ
 *    sinh ra đi vào trang.
 *
 * 🔒 Bốn giá trị này đi thẳng vào CSS, nên thứ giữ chúng an toàn là ràng buộc
 *    hex ở migration 0083 — không phải việc màn quản trị chỉ cho chọn bằng
 *    bảng màu. Một chuỗi như `red;background:url(…)` không tồn tại được
 *    trong cột đó.
 *
 * ⚠️ Chưa lưu bảng màu thì KHÔNG đặt biến nào. Đặt lại đúng giá trị mặc định
 *    nghe có vẻ vô hại, nhưng nó khoá cứng bốn token vào giá trị hôm nay: sửa
 *    `tokens.css` sau này sẽ không có tác dụng với bất kỳ tenant nào.
 */
function bienTheme(site: Awaited<ReturnType<typeof loadSite>>): React.CSSProperties | undefined {
  if (site?.theme == null) return undefined;
  const { boGoc, ...mau } = site.theme;
  return bienCssLanding(mau, boGoc) as React.CSSProperties;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const site = await loadSite();
  return (
    <html
      lang="vi"
      className={`${giaoDien.variable} ${mono.variable}`}
      style={bienTheme(site)}
    >
      <body>{children}</body>
    </html>
  );
}
