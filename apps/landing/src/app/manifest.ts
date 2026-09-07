import type { MetadataRoute } from 'next';

/** Web app manifest — fallback platform cho mọi tenant (SEO-META-004). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Showroom ô tô',
    short_name: 'Showroom',
    description: 'Showroom ô tô chính hãng — giá niêm yết, đăng ký lái thử.',
    start_url: '/',
    display: 'standalone',
    /*
     * Khớp theme mặc định DARK CINEMATIC: `background_color` là tông nền sâu
     * nhất của trang, `theme_color` là màu hành động.
     *
     * ⚠️ Hai giá trị này KHÔNG đọc được biến CSS — manifest là JSON, chạy ngoài
     *    ngữ cảnh trang. Nên chúng là bản sao thủ công của `--surface-0` và
     *    `--action`, và phải được sửa cùng lúc khi hai token đó đổi. Đây là chỗ
     *    duy nhất trong landing mà màu buộc phải viết cứng.
     */
    background_color: '#0a0b0c',
    theme_color: '#d6301f',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
    ],
  };
}
