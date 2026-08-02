/**
 * Chạy test cross-platform.
 *
 * Vì sao cần: `tsx --test src/*.test.ts` phụ thuộc shell mở rộng glob. Trên
 * Windows, turbo/pnpm chạy script qua cmd.exe — KHÔNG có globbing — nên lệnh
 * tìm không ra file và test im lặng không chạy.
 *
 * Liệt kê file thủ công cũng nguy hiểm: thêm test mới mà quên khai báo thì test
 * tồn tại nhưng không bao giờ chạy. Runner này tự quét thư mục.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('Dùng: node infra/run-tests.mjs <thư-mục> [thư-mục...]');
  process.exit(1);
}

const files = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  // Nhận cả FILE cụ thể, không chỉ thư mục — `test:invariants` cần trỏ đúng một
  // file, nếu không nó lại chạy trùng với `test` như bản trước.
  if (dir.endsWith('.ts')) {
    files.push(dir);
    continue;
  }
  for (const f of readdirSync(dir, { recursive: true })) {
    const name = String(f);
    if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) files.push(join(dir, name));
  }
}

if (files.length === 0) {
  console.error(`Không tìm thấy file test nào trong: ${dirs.join(', ')}`);
  process.exit(1);  // 🔒 Không có test = lỗi, không phải "xanh"
}

console.log(`Chạy ${files.length} file test`);

/*
 * 🔒 `--test-concurrency=1` — chạy TUẦN TỰ từng file.
 *
 * Mặc định `node --test` chạy các file song song theo số lõi CPU. Đây là test
 * TÍCH HỢP: chúng dùng chung MỘT database và MỘT tiến trình API, nên chạy song
 * song là để chúng giẫm lên nhau. Ví dụ thật đã xảy ra: một test đóng bảng giá
 * hiện hành rồi mở bảng giá mới; trong khoảnh khắc giữa hai lệnh đó, mọi test
 * khác đang đọc bảng giá đều nhận "chưa có bảng giá nào đang hiệu lực".
 *
 * Lỗi kiểu này xanh trên máy này và đỏ trên CI chỉ vì số lõi khác nhau — loại
 * lỗi tốn nhiều thời gian nhất để chẩn đoán. Đổi lấy vài giây chạy lâu hơn là
 * đánh đổi rẻ.
 */
const r = spawnSync(
  'npx',
  ['tsx', '--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit', shell: true },
);
process.exit(r.status ?? 1);
