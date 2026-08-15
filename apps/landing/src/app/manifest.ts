import type { MetadataRoute } from 'next';

/** Web app manifest — fallback platform cho mọi tenant (SEO-META-004). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Showroom ô tô',
    short_name: 'Showroom',
    description: 'Showroom ô tô chính hãng — giá niêm yết, đăng ký lái thử.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f5bb5',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
    ],
  };
}
