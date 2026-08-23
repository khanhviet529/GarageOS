import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import { requestHost, productionEnvironment } from '@/lib/api';
import { loadSite } from '@/lib/site';
import './globals.css';

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
      className={`${giaoDien.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
