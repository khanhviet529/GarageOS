import type { Metadata } from 'next';
import { Archivo_Narrow, Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import { requestHost, productionEnvironment } from '@/lib/api';
import { loadSite } from '@/lib/site';
import './globals.css';

/*
 * Ba giọng chữ, không có giọng thứ tư.
 *
 * 🔒 Cả ba PHẢI có subset `vietnamese`. Bản tham chiếu dùng Inter Tight cho giọng
 *    display, nhưng Inter Tight chỉ có `latin-ext` — các ký tự tiếng Việt xếp
 *    tầng (ặ ệ ộ ớ ừ) nằm ở U+1EA0–1EF9 nên sẽ rơi về font dự phòng ngay giữa một
 *    tiêu đề, không lỗi build, không lỗi lint.
 *
 * 💡 Archivo Narrow là chính font mà bản tham chiếu đã xếp làm dự phòng cho Inter
 *    Tight, nên chọn nó giữ đúng ý định thiết kế — condensed, grotesque, chịu
 *    được chữ hoa cỡ lớn — và nó CÓ tiếng Việt.
 */
const display = Archivo_Narrow({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display-vn',
});

const giaoDien = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ui-vn',
});

const mono = JetBrains_Mono({
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html
      lang="vi"
      className={`${display.variable} ${giaoDien.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
