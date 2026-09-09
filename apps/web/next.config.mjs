/** @type {import('next').NextConfig} */
export default {
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
   * ⚠️ `WEB_INTERNAL_API` đọc lúc máy chủ khởi động, KHÔNG phải `NEXT_PUBLIC_*`. Nó
   *    không đi vào bundle, nên đổi địa chỉ API không phải build lại.
   * ═══════════════════════════════════════════════════════════════════════
   */
  async rewrites() {
    const api = (process.env.WEB_INTERNAL_API ?? 'http://localhost:3001').replace(/\/+$/, '');
    return [{ source: '/api/v1/:duong*', destination: `${api}/api/v1/:duong*` }];
  },

  // Dùng chung package trong monorepo — Next phải transpile vì chúng là TS thô
  transpilePackages: ['@garageos/contracts', '@garageos/domain'],

  webpack(config) {
    // Các package dùng chung viết theo chuẩn ESM của Node (tsconfig NodeNext), nên
    // import nội bộ của chúng ghi đuôi `.js` dù file thật là `.ts`. Node/tsx hiểu
    // quy ước này, webpack thì không -> phải khai báo ánh xạ đuôi tường minh.
    // Bỏ dòng này thì apps/web sập ngay khi import bất kỳ package chung nào.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
