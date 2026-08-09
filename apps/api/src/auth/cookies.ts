/**
 * Cookie phiên — thay cho việc để token trong `localStorage`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao đổi
 *
 * `localStorage` đọc được bằng JavaScript. Một lỗ XSS duy nhất ở bất kỳ đâu
 * trên trang — một thư viện phụ thuộc bị chèn mã, một chỗ render nội dung
 * người dùng nhập — là kẻ tấn công lấy được token và dùng nó ở máy của họ,
 * suốt 15 phút, với đầy đủ quyền của người đang đăng nhập.
 *
 * Cookie `HttpOnly` thì JavaScript **không đọc được**. XSS vẫn có thể gọi API
 * thay người dùng (không có cách nào chống điều đó bằng cách lưu token), nhưng
 * nó không mang được token ra khỏi trình duyệt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Cái giá phải trả: CSRF
 *
 * Trình duyệt tự gửi cookie theo mọi request tới đúng tên miền, kể cả request
 * do một trang khác kích hoạt. Đó chính là CSRF, và nó là lý do người ta từng
 * chuyển sang `localStorage` ngay từ đầu.
 *
 * `docs/13-nfr.md` mục bảo mật chốt hướng: **SameSite cookie + kiểm tra cho
 * thao tác ghi**. Ở đây làm cả hai:
 *
 *   · `SameSite=Lax` — trình duyệt không gửi cookie kèm POST/PUT/DELETE khởi
 *     phát từ site khác. Đây là lớp chặn chính, và nó chặn ở tầng trình duyệt
 *     chứ không phải tầng ứng dụng.
 *   · Kiểm `Origin` cho mọi request GHI xác thực bằng cookie — xem
 *     `kiemTraNguonGhi()`. Lớp thứ hai, phòng khi trình duyệt cũ không hiểu
 *     SameSite.
 *
 * 🔒 Refresh token đặt `Path` hẹp hơn access token: nó chỉ cần đi tới đúng
 *    nhóm endpoint `auth`. Mọi request nghiệp vụ khác không mang nó theo, nên
 *    bề mặt lộ ra nhỏ hơn hẳn.
 */
import { ErrorCode } from '@garageos/contracts';
import { BusinessError } from '../common/errors';

export const COOKIE_ACCESS = 'gos_at';
export const COOKIE_REFRESH = 'gos_rt';

const DUONG_DAN_REFRESH = '/api/v1/auth';

/** Đọc một cookie từ header thô — không kéo thêm phụ thuộc chỉ để tách chuỗi */
export function docCookie(header: string | undefined, ten: string): string | undefined {
  if (header === undefined) return undefined;
  for (const phan of header.split(';')) {
    const i = phan.indexOf('=');
    if (i === -1) continue;
    if (phan.slice(0, i).trim() === ten) return decodeURIComponent(phan.slice(i + 1).trim());
  }
  return undefined;
}

/**
 * `Secure` bật theo môi trường, KHÔNG bật cứng.
 *
 * Bật cứng thì cookie không bao giờ tới được `http://localhost` và cả bộ E2E
 * đăng nhập không nổi — người sửa sẽ tắt nó đi và quên bật lại. Đọc từ biến
 * môi trường thì production bật, máy dev tắt, và không ai phải nhớ gì.
 */
function coSecure(): boolean {
  return (process.env['COOKIE_SECURE'] ?? '') === 'true';
}

function dungCookie(
  ten: string,
  giaTri: string,
  giaySong: number,
  duongDan: string,
): string {
  const phan = [
    `${ten}=${encodeURIComponent(giaTri)}`,
    `Path=${duongDan}`,
    `Max-Age=${giaySong}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (coSecure()) phan.push('Secure');
  return phan.join('; ');
}

/** Xoá cookie: cùng tên, cùng Path, hết hạn ngay */
function xoaCookie(ten: string, duongDan: string): string {
  const phan = [`${ten}=`, `Path=${duongDan}`, 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (coSecure()) phan.push('Secure');
  return phan.join('; ');
}

export function cookieDangNhap(accessToken: string, refreshToken: string): string[] {
  /*
   * Access token sống 15 phút (docs/13-nfr.md), nhưng cookie để 30 ngày —
   * bằng tuổi refresh token.
   *
   * 💡 Không phải nhầm lẫn. Hạn thật của access token nằm TRONG JWT và do máy
   *    chủ kiểm; cookie chỉ là cái túi đựng. Nếu túi hết hạn sớm hơn, trình
   *    duyệt vứt token đi và client mất luôn đường biết rằng nó cần refresh —
   *    người dùng bị đá về màn đăng nhập thay vì được gia hạn im lặng.
   */
  const BA_MUOI_NGAY = 30 * 24 * 60 * 60;
  return [
    dungCookie(COOKIE_ACCESS, accessToken, BA_MUOI_NGAY, '/'),
    dungCookie(COOKIE_REFRESH, refreshToken, BA_MUOI_NGAY, DUONG_DAN_REFRESH),
  ];
}

export function cookieDangXuat(): string[] {
  return [xoaCookie(COOKIE_ACCESS, '/'), xoaCookie(COOKIE_REFRESH, DUONG_DAN_REFRESH)];
}

/**
 * 🔒 Chặn CSRF cho thao tác GHI xác thực bằng cookie.
 *
 * Chỉ áp khi token đến TỪ COOKIE. Request mang `Authorization: Bearer` không
 * bị ảnh hưởng: trình duyệt không tự gắn header đó, nên chúng miễn nhiễm CSRF
 * theo bản chất — và app thợ dùng đúng đường đó.
 *
 * ⚠️ Thiếu `Origin` thì TỪ CHỐI, không phải cho qua. Mọi trình duyệt hiện đại
 *    đều gửi `Origin` với request ghi cross-origin; một request ghi không có
 *    `Origin` mà lại có cookie phiên là thứ đáng chặn chứ không đáng tin.
 */
export function kiemTraNguonGhi(
  method: string,
  origin: string | undefined,
  nguonChoPhep: string[],
): void {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  if (origin === undefined || !nguonChoPhep.includes(origin)) {
    throw new BusinessError(
      ErrorCode.FORBIDDEN,
      'Yêu cầu ghi không có nguồn hợp lệ — bị chặn để chống CSRF',
    );
  }
}

/** Danh sách nguồn được phép, đọc từ cùng biến môi trường mà CORS dùng */
export function nguonChoPhep(): string[] {
  return (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000,http://localhost:3002')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}
