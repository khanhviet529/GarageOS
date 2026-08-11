import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 🔒 Nhúng tên migration MỚI NHẤT mà bản build này trông đợi.
 *
 * Vì sao phải nhúng thay vì đọc thư mục lúc chạy: image production chỉ chép
 * `dist/`, không mang theo `infra/migrations/`. Runtime không có gì để đọc, nên
 * con số phải được chốt tại thời điểm build — đúng lúc mã nguồn và migration
 * còn nằm cạnh nhau.
 *
 * Dùng cho `assertSchemaUpToDate()` ở `src/common/startup-checks.ts`.
 */
const thuMucMigration = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', 'infra', 'migrations',
);
const migrationMoiNhat = readdirSync(thuMucMigration)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .at(-1);

if (migrationMoiNhat === undefined) {
  throw new Error('Khong tim thay migration nao — ban build se khong kiem duoc schema');
}
console.log(`Migration trong doi: ${migrationMoiNhat}`);

/*
 * 🔒 Gói API thành MỘT file chạy được bằng `node`.
 *
 * Vì sao cần: các package dùng chung (`@garageos/contracts`, `domain`, `db`) trỏ
 * `main` vào `src/index.ts` — TypeScript thô. `tsx` hiểu được, `node` thì không.
 * Nên `tsc -p tsconfig.build.json` biên dịch đúng phần `apps/api` nhưng sản phẩm
 * vẫn `import '@garageos/db'` và Node ném ERR_MODULE_NOT_FOUND ngay khi khởi
 * động.
 *
 * Nói cách khác: script `start` đã tồn tại từ Phase 0 và CHƯA BAO GIỜ chạy được.
 * Không ai phát hiện vì CI khởi động API bằng `tsx watch` — đúng lỗ hổng mà vòng
 * rà soát nêu ra, và bản sửa CI của đợt 3 làm nó lộ ngay lập tức.
 *
 * Chọn gói (bundle) thay vì cho từng package một bước build riêng:
 *  - Ít bộ phận chuyển động hơn: không cần `exports` có điều kiện, không cần
 *    watch-build cho vòng lặp phát triển.
 *  - Sản phẩm không còn phụ thuộc workspace nào — chép một file là chạy.
 *
 * ⚠️ Đánh đổi: mất khả năng nạp module động của Nest. Dự án không dùng
 *    microservices hay websockets nên các phụ thuộc tuỳ chọn đó được khai
 *    `external` để esbuild không đi tìm.
 */
const optionalNestDeps = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  'class-transformer',
  'class-validator',
  'cache-manager',
  '@fastify/static',
  '@fastify/view',
];

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/main.cjs',
  sourcemap: true,
  // `pg` và `bcrypt`-like dùng binding gốc; để nguyên trong node_modules
  external: ['pg-native', ...optionalNestDeps],
  define: { __MIGRATION_MONG_DOI__: JSON.stringify(migrationMoiNhat) },
  logLevel: 'info',
});
