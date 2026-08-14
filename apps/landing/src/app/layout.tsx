import type { Metadata } from 'next';
import { requestHost, productionEnvironment } from '@/lib/api';
import { loadSite } from '@/lib/site';
import './globals.css';

/**
 * Layout gốc — metadata động theo tenant/domain (SEO-META-002/004).
 * metadataBase theo primary origin thật, KHÔNG cứng localhost.
 * Title do từng trang cung cấp đầy đủ (kèm brand), layout chỉ đặt default.
 */
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
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
