/**
 * Bất biến ở mức LƯỢC ĐỒ — `pnpm test:invariants`.
 *
 * 🔒 Vì sao file này tồn tại:
 *
 * `.github/workflows/ci.yml` có một bước gắn nhãn "Job không được phép bỏ qua:
 * kiểm tra thuộc tính TOÀN HỆ THỐNG", chạy `pnpm test:invariants`. Nhưng script
 * đó trỏ vào **đúng cùng một tập test** với `pnpm test` — thêm 0 độ phủ. Bốn
 * thuộc tính mà `docs/14-testing-strategy.md` mục 6 hứa nó kiểm thì hai cái
 * không có một dòng test nào.
 *
 * Khác biệt của những test ở đây so với test thường: chúng không kiểm một tính
 * năng, chúng kiểm một QUY TẮC ÁP CHO MỌI BẢNG — kể cả bảng chưa được viết.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

let pool: Pool;

before(() => {
  pool = new Pool({ connectionString: ADMIN_URL });
});
after(async () => {
  await pool.end();
});

describe('🔒 INV-M-01 — mọi cột tiền là số nguyên (bigint)', () => {
  test('không cột tiền nào dùng numeric/float/real', async () => {
    /*
     * `docs/05-invariants.md` INV-M-01 và nguyên tắc #3 của CLAUDE.md: tiền
     * luôn là số nguyên, đơn vị đồng. `numeric(12,2)` hay `double precision`
     * lọt vào một migration là mở đường cho sai số làm tròn tích luỹ — loại lỗi
     * chỉ lộ ra ở bảng đối soát cuối tháng, khi không còn truy được nguồn.
     *
     * Đây đúng là test mà `docs/14` mục 6 gọi là "bắt được lỗi mà code review
     * dễ bỏ sót".
     */
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (column_name ~ '(amount|price|rate_per_hour|cost|_total)$'
               OR column_name ~ '^(sell_price|unit_price|labor_rate_per_hour)$')
          AND data_type NOT IN ('bigint', 'integer')
        ORDER BY table_name, column_name`,
    );

    assert.deepEqual(
      rows.map((r) => `${r.table_name}.${r.column_name} (${r.data_type})`),
      [],
      'Cột tiền không phải số nguyên — xem docs/adr/0003-money-as-integer.md',
    );
  });

  test('cột tiền có chặn trên trong vùng an toàn của JavaScript', async () => {
    // Bổ sung cho CAT-001: `bigint` chứa tới 2^63 còn JavaScript biểu diễn
    // chính xác tới 2^53-1. Cột tiền không có CHECK chặn trên là cột có thể
    // chứa giá trị đọc ra sai mà không ai báo.
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT c.table_name, c.column_name
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name IN ('labor_rate_per_hour', 'sell_price',
                                'credit_limit_amount', 'unit_price', 'total_amount')
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint con
              JOIN pg_class cl ON cl.oid = con.conrelid
             WHERE cl.relname = c.table_name
               AND con.contype = 'c'
               AND pg_get_constraintdef(con.oid) LIKE '%9007199254740991%'
               AND pg_get_constraintdef(con.oid) LIKE '%' || c.column_name || '%')
        ORDER BY 1, 2`,
    );
    assert.deepEqual(
      rows.map((r) => `${r.table_name}.${r.column_name}`),
      [],
      'Cột tiền thiếu CHECK <= Number.MAX_SAFE_INTEGER',
    );
  });
});

describe('🔒 INV-T-03 — mọi khoá ngoại đi kèm tenant_id', () => {
  test('không FK nào trỏ sang bảng có tenant_id mà thiếu tenant_id trong khoá', async () => {
    /*
     * FK một cột `REFERENCES vehicle(id)` cho phép một đơn của tenant A trỏ
     * sang xe của tenant B. RLS không cứu được: nó lọc theo dòng lúc ĐỌC, còn
     * đây là dữ liệu đã sai từ lúc GHI.
     *
     * `docs/14` mục 6 hứa test này. Trước đó chỉ có đúng MỘT ca thủ công
     * (`user_branch → branch`) trong `tenant-isolation.spec.ts`.
     */
    const { rows } = await pool.query<{ vi_pham: string }>(
      `SELECT con.conname || ': ' || src.relname || ' -> ' || tgt.relname AS vi_pham
         FROM pg_constraint con
         JOIN pg_class src ON src.oid = con.conrelid
         JOIN pg_class tgt ON tgt.oid = con.confrelid
         JOIN pg_namespace n ON n.oid = src.relnamespace
        WHERE con.contype = 'f' AND n.nspname = 'public'
          -- bảng ĐÍCH có cột tenant_id -> khoá bắt buộc phải gồm tenant_id
          AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = tgt.relname AND column_name = 'tenant_id')
          -- nhưng cột tenant_id KHÔNG nằm trong danh sách cột của khoá
          AND NOT EXISTS (
            SELECT 1 FROM unnest(con.conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             WHERE a.attname = 'tenant_id')
        ORDER BY 1`,
    );

    assert.deepEqual(
      rows.map((r) => r.vi_pham),
      [],
      'INV-T-03: khoá ngoại thiếu tenant_id — dữ liệu trỏ chéo tenant được',
    );
  });
});

describe('🔒 INV-T-01 — mọi bảng có tenant_id đều bật RLS FORCE', () => {
  test('không bảng nào quên', async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT c.relname AS tablename
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                       WHERE col.table_name = c.relname AND col.column_name = 'tenant_id')
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
        ORDER BY 1`,
    );
    assert.deepEqual(rows.map((r) => r.tablename), []);
  });
});

describe('🔒 Bảng sổ và chứng từ chỉ được THÊM', () => {
  test('audit_log và ảnh hiện trạng không có UPDATE lẫn DELETE', async () => {
    // Danh sách này lớn dần theo Phase: stock_movement (Phase 2),
    // invoice sau ISSUED (Phase 4), warranty_coverage (Phase 3).
    const BANG_SO = ['audit_log', 'repair_order_photo'];
    const { rows } = await pool.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'garageos_app'
          AND table_name = ANY($1)
          AND privilege_type IN ('UPDATE', 'DELETE')`,
      [BANG_SO],
    );
    assert.deepEqual(
      rows.map((r) => `${r.table_name}:${r.privilege_type}`),
      [],
      'Bảng sổ được cấp quyền sửa/xoá — sửa sai phải bằng CHỨNG TỪ ĐẢO',
    );
  });
});
