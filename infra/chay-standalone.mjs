/**
 * Chạy một app Next đã build ở chế độ `output: 'standalone'`.
 *
 * Dùng: node infra/chay-standalone.mjs <tên-app> <cổng>
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao KHÔNG dùng `next start`
 *
 * `apps/landing` và `apps/sales-admin` đều đặt `output: 'standalone'`, nhưng
 * script `start` của chúng lại là `next start`. Chính Next nói ra sự không khớp
 * đó mỗi lần khởi động — và không ai đọc, vì nó chỉ là một dòng cảnh báo:
 *
 *     ⚠ "next start" does not work with "output: standalone" configuration.
 *       Use "node .next/standalone/server.js" instead.
 *
 * ⚠️ Hậu quả đo được trên bản build của nhánh landing:
 *
 *       /                 -> 200      (trang tĩnh, prerender sẵn)
 *       /xe               -> 404
 *       /lien-he          -> 404
 *       /xe/vinfast-vf-3  -> 404
 *
 *    Trang chủ chạy được nên nhìn qua tưởng ổn. Mọi route render động — tức
 *    toàn bộ phần có dữ liệu — đều mất.
 *
 * 💡 Cảnh báo mà chương trình tự in ra về CHÍNH cấu hình của nó thì đáng đọc
 *    hơn phần lớn log. Ở đây nó nói đúng vấn đề, đúng cách sửa, và bị bỏ qua
 *    suốt một nhánh tính năng.
 *
 * Ngoài việc gọi đúng server, bản standalone còn cần hai thư mục mà Next CỐ Ý
 * không chép vào (tài liệu Next ghi rõ): `.next/static` và `public`. Thiếu
 * chúng thì trang lên nhưng không có CSS, JS hay ảnh.
 */
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const [ten, cong] = process.argv.slice(2);
if (ten === undefined || cong === undefined) {
  console.error('Dùng: node infra/chay-standalone.mjs <tên-app> <cổng>');
  process.exit(1);
}

const GOC = resolve(import.meta.dirname, '..');
const APP = join(GOC, 'apps', ten);
const STANDALONE = join(APP, '.next', 'standalone');

if (!existsSync(STANDALONE)) {
  console.error(`Chưa có bản standalone cho ${ten}. Chạy \`pnpm build\` trước.`);
  process.exit(1);
}

/*
 * `outputFileTracingRoot` trỏ vào gốc monorepo, nên cây standalone giữ nguyên
 * hình dạng `apps/<tên>/server.js`. Vẫn dò cả hai chỗ: nếu ai đó đổi cấu hình,
 * thông báo lỗi phải nói rõ hơn là một `MODULE_NOT_FOUND`.
 */
const ungVien = [
  join(STANDALONE, 'apps', ten, 'server.js'),
  join(STANDALONE, 'server.js'),
];
const server = ungVien.find((p) => existsSync(p));
if (server === undefined) {
  console.error(
    `Không tìm thấy server.js trong ${STANDALONE}.\n` +
      'Thường là do `outputFileTracingRoot` chỉ sai gốc — xem next.config.mjs.\n' +
      `Đã tìm ở:\n${ungVien.map((p) => `  ${p}`).join('\n')}`,
  );
  process.exit(1);
}

// Hai thư mục Next cố ý không chép — thiếu thì trang lên nhưng trắng trơn.
const thuMucServer = resolve(server, '..');
cpSync(join(APP, '.next', 'static'), join(thuMucServer, '.next', 'static'), {
  recursive: true,
});
if (existsSync(join(APP, 'public'))) {
  cpSync(join(APP, 'public'), join(thuMucServer, 'public'), { recursive: true });
}

const con = spawn(process.execPath, [server], {
  stdio: 'inherit',
  env: { ...process.env, PORT: cong, HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0' },
});
con.on('exit', (ma) => process.exit(ma ?? 1));
