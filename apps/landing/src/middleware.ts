import { NextResponse, type NextRequest } from 'next/server';

/**
 * Chuyển hướng cấu hình được — `site_redirect` (migration 0078).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 CHỈ chạy trên đường dẫn KHÔNG khớp route nào có sẵn.
 *
 * Middleware nằm trước mọi request, nên một lượt gọi API ở đây là một lượt gọi
 * thêm cho MỌI trang. Kiểm trong tiến trình trước — bốn route landing và tiền tố
 * của chúng — rồi mới hỏi máy chủ. Trang bình thường vì thế không tốn gì; chỉ
 * đường dẫn lạ mới trả giá, và đường dẫn lạ vốn đã sắp thành 404.
 *
 * ⚠️ Danh sách `CO_SAN` phải mở rộng cùng lúc với mỗi route landing mới. Quên nó
 *    thì route mới đi qua một lượt tra chuyển hướng thừa ở mỗi request — chậm,
 *    nhưng không sai. Hướng hỏng an toàn.
 */
const CO_SAN = [
  /^\/$/,
  /^\/xe(\/|$)/,
  /^\/tin-tuc(\/|$)/,
  /^\/lien-he(\/|$)/,
  // Bề mặt kỹ thuật: proxy công khai, xem thử, tài nguyên Next.
  /^\/api(\/|$)/,
  /^\/preview(\/|$)/,
  /^\/__preview(\/|$)/,
  /^\/_next(\/|$)/,
];

/**
 * Ký host bằng Web Crypto, không phải `node:crypto`.
 *
 * Middleware chạy ở edge runtime — `node:crypto` không có ở đó. `crypto.subtle`
 * cho ra cùng một HMAC-SHA256, chỉ khác API.
 *
 * ⚠️ Không có bí mật thì KHÔNG ký, trả `null`.
 *
 *    `crypto.subtle.importKey` với khoá rỗng ném `DOMException`, và ở đây nó rơi
 *    vào `catch` chung rồi biến thành "không có chuyển hướng". Đo được: máy dev
 *    không đặt `EDGE_SIGNING_SECRET` (API chạy `EDGE_HOST_TRUST=host` nên không
 *    cần), và mọi chuyển hướng im lặng không chạy — không lỗi, không log, chỉ là
 *    404 như cũ. Đúng loại hỏng mà `catch` rộng sinh ra.
 */
async function kyHost(host: string, secret: string): Promise<string | null> {
  if (secret === '') return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(host));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  if (CO_SAN.some((r) => r.test(path))) return NextResponse.next();

  const base = process.env['LANDING_INTERNAL_API'] ?? 'http://localhost:3001';
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  if (host === '') return NextResponse.next();

  try {
    const chuKy = await kyHost(host, process.env['EDGE_SIGNING_SECRET'] ?? '');
    const res = await fetch(
      `${base}/api/v1/public/redirect?path=${encodeURIComponent(path)}`,
      {
        headers: {
          'x-garageos-original-host': host,
          ...(chuKy === null ? {} : { 'x-garageos-original-host-signature': chuKy }),
          accept: 'application/json',
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) return NextResponse.next();
    const kq = (await res.json()) as { to: string | null; statusCode: number | null };
    if (kq.to === null) return NextResponse.next();

    /*
     * Đích tương đối thì dựng URL tuyệt đối từ CHÍNH request, không từ một biến
     * môi trường: landing chạy sau proxy, và một origin cứng sẽ đá khách sang
     * tên miền khác ở môi trường staging.
     */
    const dich = kq.to.startsWith('/') ? new URL(kq.to, req.nextUrl.origin) : new URL(kq.to);
    return NextResponse.redirect(dich, kq.statusCode === 302 ? 302 : 301);
  } catch {
    /*
     * API hỏng thì đi tiếp và để trang tự trả 404. Chặn cả trang vì bảng chuyển
     * hướng không tra được là biến một lỗi phụ thành một lỗi toàn phần.
     */
    return NextResponse.next();
  }
}

export const config = {
  /*
   * Bỏ qua tệp tĩnh ngay ở tầng matcher — chúng không bao giờ là đích của một
   * chuyển hướng nội dung, và đây là chỗ rẻ nhất để loại chúng.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[a-z0-9]+$).*)'],
};
