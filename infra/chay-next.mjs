/**
 * Chạy một app Next với `.env` của GỐC MONOREPO.
 *
 * Dùng: node infra/chay-next.mjs <tên-app> <cổng>
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao cần lớp bọc này
 *
 * Next.js chỉ đọc `.env` trong THƯ MỤC DỰ ÁN CỦA CHÍNH NÓ (`apps/landing/.env`).
 * Kho này để cấu hình ở gốc monorepo, và `apps/api` nạp tường minh:
 *
 *     api      dev = tsx watch --env-file=../../.env src/main.ts
 *     landing  dev = next dev -p 3003          <- KHÔNG nạp gì
 *
 * ⚠️ Hậu quả đo được: tiến trình landing không có `EDGE_SIGNING_SECRET`, nên nó
 *    ký `x-garageos-original-host` bằng chuỗi rỗng. API ở chế độ mặc định
 *    (`signed`) từ chối, `resolvePublic()` trả null, và trang rơi về TRẠNG THÁI
 *    RỖNG hoàn toàn:
 *
 *      · header hiện "Showroom ô tô" thay vì tên thật của tenant
 *      · danh sách xe biến mất (mục đó chỉ hiện khi `products.length > 0`)
 *      · hero hiện hình trang trí CSS thay cho ảnh xe
 *
 *    Không có lỗi nào được ghi ra. Trang trông như một trang được thiết kế sơ
 *    sài, chứ không như một trang thiếu cấu hình — và đó là điều nguy hiểm:
 *    người xem sẽ đi sửa nhầm chỗ.
 *
 * 💡 Lỗi này sống sót vì tôi chạy landing bằng `dotenv-cli -e .env` trong lúc
 *    phát triển. Một cách chạy "riêng của người viết" luôn che mất việc lệnh
 *    chính thức không hoạt động.
 *
 * `process.loadEnvFile` có từ Node 20.12 — nạp thẳng vào `process.env`, và Next
 * đọc được từ đó. Không thêm dependency nào.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [ten, cong] = process.argv.slice(2);
if (ten === undefined || cong === undefined) {
  console.error('Dùng: node infra/chay-next.mjs <tên-app> <cổng>');
  process.exit(1);
}

const GOC = resolve(import.meta.dirname, '..');
const envGoc = join(GOC, '.env');

if (existsSync(envGoc)) {
  process.loadEnvFile(envGoc);
} else {
  /*
   * Không có `.env` thì đi tiếp — CI truyền cấu hình bằng biến môi trường.
   * Nhưng NÓI RA, vì ở máy dev thì thiếu file này gần như luôn là nguyên nhân
   * của một trang rỗng khó hiểu.
   */
  console.warn(
    `⚠️  Không thấy ${envGoc}. Nếu trang hiện "Showroom ô tô" và không có xe nào,\n` +
      '   đây là lý do: thiếu EDGE_SIGNING_SECRET nên API từ chối request của landing.\n' +
      '   Chạy: cp .env.example .env  rồi điền giá trị.',
  );
}

const con = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'dev', '-p', cong],
  { cwd: join(GOC, 'apps', ten), stdio: 'inherit', env: process.env, shell: true },
);
con.on('exit', (ma) => process.exit(ma ?? 1));
