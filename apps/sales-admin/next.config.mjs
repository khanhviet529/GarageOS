import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 🔒 Gốc truy vết phải chỉ TƯỜNG MINH vào gốc monorepo.
 *
 * ⚠️ `output: 'standalone'` bắt Next truy vết dependency từ "workspace root".
 *    Next tự đoán gốc đó bằng cách tìm lockfile đi ngược lên — và khi máy có
 *    một lockfile lạc ở thư mục người dùng, nó chọn nhầm:
 *
 *      Next.js inferred your workspace root, but it may not be correct.
 *      We detected multiple lockfiles and selected the directory of
 *      C:\Users\DELL\package-lock.json as the root directory.
 *
 *    Hậu quả đo được: `.next/standalone/` chỉ chứa `AppData/` và
 *    `package.json`, KHÔNG có `server.js`. `pnpm build` vẫn báo thành công.
 *
 * 💡 Một bản build "xanh" mà sản phẩm của nó không chạy được là kiểu hỏng tệ
 *    nhất — nó tiêu diệt đúng tín hiệu mà ta dựa vào để biết mình ổn.
 */
const GOC_MONOREPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {import('next').NextConfig} */
export default {
  // Allows isolated verification builds without racing a running local dev server.
  distDir: process.env.GARAGEOS_NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * 🔒 API đi CÙNG ORIGIN với trang, qua rewrite của Next.
   *
   * Cookie phiên đặt `SameSite=Lax` (`apps/api/src/auth/cookies.ts`) — lớp
   * chống CSRF chính, chặn ngay ở tầng trình duyệt. Cái giá của nó: trình duyệt
   * KHÔNG gửi cookie kèm request cross-site.
   *
   * ⚠️ Ở dev, web và API cùng `localhost` nên không ai thấy điều đó. Trên
   *    production, front-end ở `*.vercel.app` còn API ở `*.onrender.com` là hai
   *    site khác nhau — và hỏng theo kiểu tệ nhất để lần:
   *
   *      đăng nhập trả 200 kèm Set-Cookie, mọi lời gọi sau nhận 401,
   *      màn hình đá về trang đăng nhập mà không nói gì về cookie.
   *
   * 💡 Hai lối ra: nới cookie thành `SameSite=None`, hoặc đưa API về cùng
   *    origin. Cách đầu vứt bỏ lớp bảo vệ của trình duyệt để đổi lấy mười lăm
   *    phút; cách sau giữ nguyên cả hai lớp — SameSite vẫn chặn, và
   *    `kiemTraNguonGhi()` vẫn kiểm `Origin` cho mọi thao tác ghi.
   *
   * 🔒 Dùng rewrite chứ không viết route proxy tay: rewrite chuyển tiếp nguyên
   *    vẹn mọi method, mọi loại body, cookie cả hai chiều — không có danh sách
   *    method nào để quên cập nhật. (Landing thì khác: proxy của nó phải KÝ
   *    host bằng HMAC, việc mà rewrite không làm được.)
   *
   * ⚠️ `ADMIN_INTERNAL_API` đọc lúc máy chủ khởi động, KHÔNG phải `NEXT_PUBLIC_*`. Nó
   *    không đi vào bundle, nên đổi địa chỉ API không phải build lại.
   * ═══════════════════════════════════════════════════════════════════════
   */
  async rewrites() {
    const api = (process.env.ADMIN_INTERNAL_API ?? 'http://localhost:3001').replace(/\/+$/, '');
    return [{ source: '/api/v1/:duong*', destination: `${api}/api/v1/:duong*` }];
  },

  output: 'standalone',
  outputFileTracingRoot: GOC_MONOREPO,
  transpilePackages: ['@garageos/contracts', '@garageos/domain'],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
