/**
 * Tailwind CSS v4 chạy như một plugin PostCSS — không còn `tailwind.config.js`.
 *
 * 🔒 Toàn bộ cấu hình (bảng màu, thang chữ, bo góc) nằm trong `@theme` của
 * `src/app/globals.css`. Đặt ở đó vì token của dự án vốn đã là CSS variable:
 * một nguồn duy nhất, không có bản sao JavaScript lệch dần theo thời gian.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
