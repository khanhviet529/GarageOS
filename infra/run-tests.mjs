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
/*
 * 🔒 Trên CI, BẮT lấy output thay vì để nó trôi thẳng ra stdout.
 *
 * Log của GitHub Actions cần token mới đọc được. Nên khi test đỏ trên CI, thứ
 * duy nhất nhìn thấy từ bên ngoài là "exited (1)" — không tên bài, không thông
 * điệp. Đã mất một buổi dựng lại toàn bộ điều kiện CI ở máy local chỉ để đoán.
 *
 * Annotation của check-run thì đọc được CÔNG KHAI. Nên ở đây in lại các dòng
 * `not ok` dưới dạng `::error::`, và GitHub biến chúng thành annotation.
 *
 * Vẫn in nguyên output ra stdout: người có quyền đọc log không mất gì.
 */
const tenCI = process.env.CI === 'true';
const r = spawnSync(
  'npx',
  ['tsx', '--test', '--test-concurrency=1', ...files],
  tenCI
    ? { encoding: 'utf8', shell: true }
    : { stdio: 'inherit', shell: true },
);

if (tenCI) {
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);

  if ((r.status ?? 1) !== 0) {
    const dong = out.split('\n');
    for (const [i, l] of dong.entries()) {
      // `not ok 12 - tên bài` — bỏ qua dòng của suite cha, chúng chỉ nói
      // "N subtests failed" và không thêm thông tin gì.
      const m = /^\s*not ok \d+ - (.+)$/.exec(l);
      if (m === null || /subtest/.test(dong[i + 4] ?? '')) continue;
      // Thông điệp lỗi nằm ở khối YAML ngay dưới, trong trường `error:`
      const ctx = dong.slice(i + 1, i + 12).join('\n');
      const loi = /error:\s*(?:\|-?\s*\n)?\s*'?(.+?)'?\s*$/m.exec(ctx);
      const chiTiet = loi === null ? '' : ` — ${loi[1]}`;
      console.log(`::error title=Test đỏ::${m[1]}${chiTiet}`.replace(/\r/g, ''));
    }
  }
}

process.exit(r.status ?? 1);
