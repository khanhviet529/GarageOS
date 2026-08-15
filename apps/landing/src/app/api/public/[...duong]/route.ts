import { createHmac } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { normalizeHostname } from '@garageos/domain';

/**
 * Cầu nối same-origin giữa TRÌNH DUYỆT và public API.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao route này phải tồn tại
 *
 * API xác định tenant từ `x-garageos-original-host`, và ở chế độ mặc định
 * (`EDGE_HOST_TRUST=signed`) nó chỉ tin header đó khi kèm chữ ký HMAC. Bí mật
 * ký nằm ở server — trình duyệt KHÔNG có, và không được có.
 *
 * ⚠️ Trước bản sửa, hai chỗ trong landing gọi thẳng API từ trình duyệt và gửi
 *    header host KHÔNG ký:
 *
 *      · `lead-form.tsx`  -> POST /api/v1/public/leads
 *      · `showroom.tsx`   -> GET  /api/v1/public/.../experiences/...
 *
 *    Cả hai nhận 404 `SITE_NOT_FOUND`. Đo được trên bản build production, khách
 *    điền đủ form rồi bấm gửi:
 *
 *        alert: Không tìm thấy trang
 *
 *    Đó là ĐIỂM CHUYỂN ĐỔI DUY NHẤT của một trang bán xe, và thông báo lỗi
 *    không hề nói rằng việc gửi đã thất bại vì cấu hình.
 *
 * 💡 Thiết kế cũ đúng ở tầng ý tưởng — "production có edge ký hộ" — nhưng nó
 *    đẩy một mắt xích bắt buộc ra ngoài kho mã. Thứ không nằm trong kho thì
 *    không chạy được ở máy dev, không kiểm được trên CI, và không ai biết nó
 *    hỏng cho tới khi khách thật bấm nút.
 *
 * Đi qua đây thì trình duyệt gọi CÙNG origin với trang, còn việc ký là việc của
 * server — giống hệt nhau ở dev, CI và production. Không cần CORS, và trình
 * duyệt không cần biết API nằm ở đâu.
 * ─────────────────────────────────────────────────────────────────────────
 */

const API_BASE = (process.env['LANDING_INTERNAL_API'] ?? 'http://localhost:3001').replace(
  /\/+$/,
  '',
);

/**
 * 🔒 Danh sách trắng, khớp toàn phần.
 *
 * Nếu không, route này thành proxy mở vào MỌI endpoint của API — gồm cả những
 * endpoint cần đăng nhập — và nó tự ký cho mỗi request đi qua. Một cây cầu thì
 * phải biết nó bắc tới đâu.
 */
const DUONG_CHO_PHEP: { method: 'GET' | 'POST'; mau: RegExp }[] = [
  { method: 'GET', mau: /^site$/ },
  { method: 'GET', mau: /^vehicle-products$/ },
  { method: 'GET', mau: /^vehicle-products\/[a-z0-9-]+$/ },
  { method: 'GET', mau: /^vehicle-products\/[a-z0-9-]+\/experiences\/[a-z0-9-]+$/ },
  { method: 'GET', mau: /^vehicle-products\/[a-z0-9-]+\/chi-phi-so-huu$/ },
  { method: 'POST', mau: /^leads$/ },
];

function kyHost(host: string): string {
  const secret = process.env['EDGE_SIGNING_SECRET'] ?? '';
  return createHmac('sha256', secret).update(host, 'utf8').digest('hex');
}

async function chuyenTiep(
  req: NextRequest,
  duong: string[],
  method: 'GET' | 'POST',
): Promise<Response> {
  const tuongDoi = duong.join('/');
  if (!DUONG_CHO_PHEP.some((d) => d.method === method && d.mau.test(tuongDoi))) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Không tìm thấy trang' } },
      { status: 404 },
    );
  }

  /*
   * Host của KHÁCH, không phải host cấu hình sẵn — đây chính là thứ quyết định
   * tenant, nên nó phải đi từ request thật (INV-LS-01).
   */
  const host = normalizeHostname(req.headers.get('host') ?? '');
  if (host === null) {
    return NextResponse.json(
      { error: { code: 'SITE_NOT_FOUND', message: 'Không tìm thấy trang' } },
      { status: 404 },
    );
  }

  const url = new URL(`${API_BASE}/api/v1/public/${tuongDoi}`);
  for (const [k, v] of req.nextUrl.searchParams) url.searchParams.append(k, v);

  /*
   * 🔒 Chuyển tiếp IP khách. `LeadRateLimitGuard` đếm theo (hostname, IP); thiếu
   * dòng này thì mọi khách mang IP của tiến trình landing và cả trang chia nhau
   * MỘT hạn mức — đúng lỗi mà `LS-T15` sinh ra để canh.
   */
  const ipKhach =
    req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  const res = await fetch(url, {
    method,
    headers: {
      'x-garageos-original-host': host,
      'x-garageos-original-host-signature': kyHost(host),
      accept: 'application/json',
      ...(ipKhach === '' ? {} : { 'x-forwarded-for': ipKhach }),
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: await req.text() } : {}),
    cache: 'no-store',
  });

  const than = await res.text();
  return new Response(than, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ duong: string[] }> },
): Promise<Response> {
  return chuyenTiep(req, (await ctx.params).duong, 'GET');
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ duong: string[] }> },
): Promise<Response> {
  return chuyenTiep(req, (await ctx.params).duong, 'POST');
}
