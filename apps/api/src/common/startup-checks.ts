import { Logger } from '@nestjs/common';

/**
 * 🔒 Kiểm tra cấu hình TRƯỚC khi mở cổng.
 *
 * Cùng triết lý với `assertNotPrivileged()`: một hệ thống cấu hình sai phải
 * **từ chối khởi động**, không được chạy được. Chạy được với cấu hình sai là
 * kịch bản tệ nhất — nó trông như đang hoạt động, và không ai đi tìm.
 *
 * Vòng rà soát bảo mật chỉ ra: `.env.example` đặt sẵn
 * `JWT_ACCESS_SECRET=doi-gia-tri-nay-trong-production`, dài 32 ký tự nên **qua
 * được** kiểm tra độ dài duy nhất đang có. Người triển khai làm đúng theo hướng
 * dẫn ("copy .env.example sang .env") và quên đổi dòng đó thì bất kỳ ai đọc
 * repo cũng tự ký được token với `tid` của bất kỳ garage nào — và RLS mở cửa
 * đúng như thiết kế, vì token hoàn toàn hợp lệ.
 */
const SECRET_MAU = [
  'doi-gia-tri-nay-trong-production',
  'change-me',
  'changeme',
  'secret',
  'ci-access-secret-khong-dung-that',
  'ci-refresh-secret-khong-dung-that',
];

const DO_DAI_TOI_THIEU = 32;

export function assertSecretsUsable(): void {
  const log = new Logger('KiemTraCauHinh');
  const loi: string[] = [];

  for (const ten of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = process.env[ten] ?? '';

    if (v === '') {
      loi.push(`${ten} chưa được đặt`);
      continue;
    }
    if (SECRET_MAU.includes(v)) {
      loi.push(`${ten} đang là giá trị mẫu công khai trong repo`);
      continue;
    }
    // Ngưỡng cũ là 16 — quá thấp để có ý nghĩa với HMAC-SHA256.
    if (v.length < DO_DAI_TOI_THIEU) {
      loi.push(`${ten} chỉ dài ${v.length} ký tự, cần ít nhất ${DO_DAI_TOI_THIEU}`);
    }
  }

  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    // Dùng chung một bí mật nghĩa là access token và refresh token thay thế
    // nhau được — refresh token sống 30 ngày sẽ dùng làm access token được.
    loi.push('JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau');
  }

  const laProduction = process.env.NODE_ENV === 'production';

  if (laProduction && process.env.OTP_DEV_ECHO === 'true') {
    loi.push(
      'OTP_DEV_ECHO=true ở production — mã xác thực của khách sẽ nằm ngay trong ' +
        'response HTTP, ai có link tra cứu cũng tự duyệt được báo giá thay khách',
    );
  }

  const rateLimit = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? '5');
  if (laProduction && rateLimit > 20) {
    loi.push(
      `LOGIN_RATE_LIMIT_MAX=${rateLimit} ở production — chống dò mật khẩu gần như ` +
        'vô hiệu (docs/13-nfr.md yêu cầu khoá tạm sau 5 lần sai)',
    );
  } else if (rateLimit > 20) {
    log.warn(
      `LOGIN_RATE_LIMIT_MAX=${rateLimit} — chỉ chấp nhận được ở môi trường test.`,
    );
  }

  if (loi.length > 0) {
    throw new Error(
      'Cấu hình không an toàn, API từ chối khởi động:\n' +
        loi.map((l) => `  • ${l}`).join('\n') +
        '\n\nSinh bí mật mới bằng: openssl rand -base64 48',
    );
  }
}
