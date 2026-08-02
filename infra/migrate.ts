/**
 * Trình chạy migration — SQL viết tay, chỉ tiến, không rollback.
 *
 * Vì sao không dùng `prisma migrate`: Prisma không tạo được exclusion
 * constraint, RLS policy, partial index có biểu thức, hay trigger — tức là
 * phần lớn bất biến của hệ thống. Xem docs/adr/0007-prisma-plus-raw-sql.md
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, 'migrations');

const DATABASE_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Map<string, string>(
    (await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migration',
    )).rows.map((r) => [r.name, r.checksum]),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    // 🔒 Chuẩn hoá xuống dòng TRƯỚC khi băm.
    // Git trên Windows đổi LF <-> CRLF khi checkout, làm checksum lệch dù nội
    // dung không đổi -> guard "migration chỉ tiến" báo động giả và chặn cả
    // migration mới. Dùng fromCharCode để tránh mọi vấn đề escape của công cụ.
    const CR = String.fromCharCode(13);
    const normalized = sql.split(CR).join('');
    const checksum = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    const previous = applied.get(file);

    if (previous !== undefined) {
      // 🔒 Migration đã chạy không được sửa nội dung — sửa sai bằng migration mới.
      if (previous !== checksum) {
        throw new Error(
          `Migration ${file} đã chạy nhưng nội dung đã thay đổi ` +
            `(${previous} -> ${checksum}). Migration chỉ tiến: hãy tạo file mới.`,
        );
      }
      continue;
    }

    process.stdout.write(`  → ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)',
        [file, checksum],
      );
      await client.query('COMMIT');
      console.log('ok');
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('LỖI');
      throw err;
    }
  }

  console.log(
    ran === 0
      ? 'Không có migration mới.'
      : `Đã chạy ${ran} migration.`,
  );
  await client.end();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
