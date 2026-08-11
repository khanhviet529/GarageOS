import { Logger } from '@nestjs/common';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

/**
 * Tên migration mới nhất, do `build.mjs` nhúng vào lúc gói bundle.
 *
 * Ở môi trường phát triển (chạy bằng `tsx`) hằng số này KHÔNG tồn tại — nên mọi
 * chỗ đọc nó phải đi qua `typeof`, và rơi về đọc thư mục `infra/migrations`.
 */
declare const __MIGRATION_MONG_DOI__: string | undefined;

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

  if (laProduction && process.env.COOKIE_SECURE !== 'true') {
    loi.push('COOKIE_SECURE phải là true ở production — cookie phiên chỉ được đi qua HTTPS');
  }

  if (laProduction) {
    const origins = (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o !== '');

    if (origins.length === 0) {
      loi.push('WEB_ORIGIN phải liệt kê rõ domain web HTTPS ở production');
    }
    for (const origin of origins) {
      try {
        const url = new URL(origin);
        if (origin === '*' || url.protocol !== 'https:' || url.origin !== origin) {
          loi.push(`WEB_ORIGIN không hợp lệ ở production: ${origin}`);
        }
      } catch {
        loi.push(`WEB_ORIGIN không hợp lệ ở production: ${origin}`);
      }
    }
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

/**
 * 🔒 Từ chối khởi động khi DATABASE đi SAU code.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao cần
 *
 * Deploy và migration là hai đường tách rời, có chủ ý: `DATABASE_ADMIN_URL`
 * KHÔNG được có mặt ở runtime của API (`docs/DEPLOY.md`), nên API không tự chạy
 * migration được. Migration đi qua workflow riêng, bấm tay.
 *
 * Tách rời thì đúng, nhưng nó để lại một khe hở về THỨ TỰ: merge một thay đổi
 * gồm cả migration lẫn code đọc cột mới, Railway tự deploy code ngay, còn
 * migration thì chờ người bấm. Giữa hai mốc đó, API chạy trên schema cũ và trả
 * 500 ở đúng những đường vừa thêm — trong khi healthcheck `/health` vẫn XANH,
 * vì nó chỉ hỏi `SELECT current_user`.
 *
 * 💡 Cách sửa không phải là ép thứ tự — không có gì ép được, đó là hai hệ thống
 *    khác nhau. Cách sửa là làm cho thứ tự sai **không đi qua trong im lặng**:
 *    API chết ngay lúc khởi động, Railway giữ bản cũ đang chạy nhờ
 *    `restartPolicyType = "ON_FAILURE"`, và người deploy đọc được đúng câu cần
 *    làm tiếp thay vì đi đọc log 500.
 *
 * ⚠️ CHỈ kiểm database THIẾU migration, không kiểm chiều ngược lại. Database đi
 *    TRƯỚC code là chuyện bình thường và an toàn: migration của dự án chỉ-tiến,
 *    nên trong lúc rollout từng phần vẫn có instance cũ chạy song song với
 *    schema mới. Chặn chiều đó sẽ biến mọi lần rollback thành sự cố.
 */
export async function assertSchemaUpToDate(pool: Pool): Promise<void> {
  const mongDoi = migrationMongDoi();
  if (mongDoi === null) {
    /*
     * Không xác định được kỳ vọng thì cảnh báo rồi đi tiếp, không chặn.
     *
     * Đây là lớp AN TOÀN THÊM, không phải điều kiện để hệ thống chạy đúng. Chặn
     * khởi động vì không đọc được một thư mục sẽ biến một tiện ích thành một
     * điểm hỏng mới — đúng thứ nó sinh ra để tránh.
     */
    new Logger('KiemTraSchema').warn(
      'Không xác định được migration mong đợi — bỏ qua kiểm tra schema',
    );
    return;
  }

  let daChay: string | null = null;
  try {
    const { rows } = await pool.query<{ name: string | null }>(
      'SELECT max(name) AS name FROM schema_migration',
    );
    daChay = rows[0]?.name ?? null;
  } catch {
    throw new Error(
      'Không đọc được bảng `schema_migration` — database chưa chạy migration lần nào.\n' +
        'Chạy `pnpm db:migrate` (hoặc workflow "Production migration") trước khi khởi động API.',
    );
  }

  /*
   * So theo TÊN, không theo SỐ LƯỢNG.
   *
   * Đếm số dòng thì một database chạy đủ N migration nhưng thiếu đúng cái mới
   * nhất và thừa một cái khác vẫn đi qua. Tên migration có tiền tố số tăng dần
   * nên so chuỗi chính là so thứ tự thời gian.
   */
  if (daChay === null || daChay < mongDoi) {
    throw new Error(
      'Database đi SAU code, API từ chối khởi động:\n' +
        `  • bản build này cần:      ${mongDoi}\n` +
        `  • database đã chạy tới:   ${daChay ?? '(chưa có migration nào)'}\n\n` +
        'Chạy migration trước, rồi deploy lại.',
    );
  }
}

function migrationMongDoi(): string | null {
  // Bản bundle: hằng số đã được `build.mjs` nhúng lúc gói.
  if (typeof __MIGRATION_MONG_DOI__ === 'string') return __MIGRATION_MONG_DOI__;

  // Bản phát triển chạy bằng `tsx`: đọc thẳng thư mục migration.
  try {
    return (
      readdirSync(join(process.cwd(), '..', '..', 'infra', 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .at(-1) ?? null
    );
  } catch {
    return null;
  }
}
