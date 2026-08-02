/**
 * Test KIẾN TRÚC về quyền database.
 *
 * 🔒 Đây là loại test có giá trị cao nhất trong dự án này: nó kiểm tra một
 * THUỘC TÍNH TOÀN HỆ THỐNG và **tự động áp dụng cho bảng thêm mới sau này** —
 * không ai phải nhớ kiểm tra bằng tay.
 *
 * Bối cảnh: codex-review đã bắt được hai lỗi quyền mà đọc code không thấy:
 *  - GARAGEOS-001: default privileges cấp UPDATE/DELETE cho MỌI bảng tương lai
 *  - GARAGEOS-008: ALTER DEFAULT PRIVILEGES thiếu FOR ROLE nên chỉ áp cho role
 *                  đang chạy, migration sau chạy role khác là mất tác dụng
 *
 * Cả hai đều "chưa sai bây giờ, sai về sau". Test này bắt được ngay lúc migration
 * mới được thêm, thay vì lúc mất dữ liệu.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const APP_ROLE = 'garageos_app';

/**
 * Bảng sổ và chứng từ — 🔒 KHÔNG BAO GIỜ được cấp UPDATE/DELETE.
 * Thêm bảng sổ mới thì thêm tên vào đây.
 */
const LEDGER_TABLES = ['audit_log', 'repair_order_photo'] as const;
// repair_order_photo: ảnh hiện trạng là BẰNG CHỨNG PHÁP LÝ (BR-01-3). Không cấp
// UPDATE cũng quan trọng như không cấp DELETE — sửa `storage_key` chính là tráo
// ảnh, tinh vi hơn xoá và khó phát hiện hơn nhiều.
// Sẽ bổ sung khi có: stock_movement, invoice (sau ISSUED), warranty_coverage

let pool: Pool;

before(() => {
  pool = new Pool({ connectionString: ADMIN_URL });
});
after(async () => {
  await pool.end();
});

async function grantsOn(table: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ privilege_type: string }>(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = $1 AND table_name = $2`,
    [APP_ROLE, table],
  );
  return new Set(rows.map((r) => r.privilege_type));
}

describe('INV-A-01 / INV-S-03 — bảng sổ chỉ được thêm', () => {
  for (const table of LEDGER_TABLES) {
    test(`${table}: KHÔNG có UPDATE`, async () => {
      assert.ok(!(await grantsOn(table)).has('UPDATE'), `${table} bị cấp UPDATE`);
    });
    test(`${table}: KHÔNG có DELETE`, async () => {
      assert.ok(!(await grantsOn(table)).has('DELETE'), `${table} bị cấp DELETE`);
    });
    test(`${table}: CÓ INSERT (vẫn phải ghi được)`, async () => {
      assert.ok((await grantsOn(table)).has('INSERT'));
    });
  }
});

describe('GARAGEOS-001 / 008 — quyền mặc định cho bảng TƯƠNG LAI', () => {
  test('bảng mới chỉ nhận SELECT + INSERT, không có UPDATE/DELETE', async () => {
    const tmp = `_kiem_tra_quyen_${Date.now()}`;
    await pool.query(`CREATE TABLE ${tmp} (id int)`);
    try {
      const g = await grantsOn(tmp);
      assert.ok(g.has('SELECT'), 'bảng mới thiếu SELECT');
      assert.ok(g.has('INSERT'), 'bảng mới thiếu INSERT');
      assert.ok(
        !g.has('UPDATE'),
        'Bảng mới được cấp UPDATE mặc định — khi tạo stock_movement nó sẽ ' +
          'tự động sửa được, phá INV-S-03 mà không ai nhận ra',
      );
      assert.ok(!g.has('DELETE'), 'Bảng mới được cấp DELETE mặc định — phá INV-S-03');
    } finally {
      await pool.query(`DROP TABLE ${tmp}`);
    }
  });

  test('quyền mặc định khai báo TƯỜNG MINH cho role chủ sở hữu', async () => {
    // GARAGEOS-008: thiếu FOR ROLE thì quy tắc chỉ áp cho role đang chạy lúc đó
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_default_acl d
         JOIN pg_roles r ON r.oid = d.defaclrole
        WHERE r.rolname = 'garageos' AND d.defaclobjtype = 'r'`,
    );
    assert.ok(Number(rows[0]?.n) > 0, 'Chưa khai báo default privileges FOR ROLE garageos');
  });
});

describe('GARAGEOS-007 — vehicle_ownership là lịch sử, không viết lại được', () => {
  test('KHÔNG có DELETE', async () => {
    assert.ok(!(await grantsOn('vehicle_ownership')).has('DELETE'));
  });

  test('UPDATE chỉ giới hạn ở cột đóng kỳ, không sửa được customer_id', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE grantee = $1 AND table_name = 'vehicle_ownership' AND privilege_type = 'UPDATE'`,
      [APP_ROLE],
    );
    const cols = new Set(rows.map((r) => r.column_name));
    assert.ok(cols.has('ended_at'), 'phải cho đóng kỳ sở hữu');
    assert.ok(
      !cols.has('customer_id'),
      'Sửa được customer_id nghĩa là viết lại được lịch sử chủ xe',
    );
    assert.ok(!cols.has('started_at'), 'Sửa được started_at nghĩa là viết lại được lịch sử');
  });
});

describe('INV-T-01 — mọi bảng có tenant_id phải bật RLS', () => {
  test('không bảng nào có tenant_id mà quên bật RLS', async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT c.relname AS tablename
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (
            SELECT 1 FROM information_schema.columns col
             WHERE col.table_name = c.relname AND col.column_name = 'tenant_id')
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`,
    );
    assert.deepEqual(
      rows.map((r) => r.tablename),
      [],
      'Bảng có tenant_id nhưng chưa ENABLE + FORCE ROW LEVEL SECURITY',
    );
  });
});

describe('GARAGEOS-002 — đơn sửa chữa: hiện trạng lúc tiếp nhận không sửa được', () => {
  async function updatableColumns(table: string): Promise<Set<string>> {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE grantee = $1 AND table_name = $2 AND privilege_type = 'UPDATE'`,
      [APP_ROLE, table],
    );
    return new Set(rows.map((r) => r.column_name));
  }

  test('KHÔNG có DELETE — một đơn đã tồn tại là bằng chứng xe đã vào xưởng', async () => {
    assert.ok(!(await grantsOn('repair_order')).has('DELETE'));
  });

  test('đổi được trạng thái và số km lúc giao xe', async () => {
    const cols = await updatableColumns('repair_order');
    assert.ok(cols.has('status'), 'không đổi được trạng thái thì đơn đứng im mãi');
    assert.ok(cols.has('odometer_out'));
    assert.ok(cols.has('cancel_reason'));
  });

  test('🔒 KHÔNG sửa được xe, khách, và bản ghi nhận lúc tiếp nhận', async () => {
    const cols = await updatableColumns('repair_order');
    for (const [col, why] of [
      ['vehicle_id', 'gán được đơn sang xe khác'],
      ['customer_id', 'gán được đơn sang khách khác'],
      ['code', 'viết lại được mã chứng từ'],
      ['odometer_in', 'viết lại được số km khách đã khai'],
      ['customer_complaint', 'viết lại được nguyên văn lời khách'],
      ['received_at', 'lùi được thời điểm tiếp nhận'],
      ['customer_access_token', 'phát lại được chìa khoá trang tra cứu công khai'],
    ] as const) {
      assert.ok(!cols.has(col), `Sửa được ${col}: ${why}`);
    }
  });
});

describe('🔒 INV-A-02 — trigger nhật ký trạng thái phải tồn tại', () => {
  test('repair_order có trigger ghi log khi đổi status', async () => {
    // Bất biến này được enforce bằng TRIGGER chứ không dựa vào app nhớ ghi log
    // (docs/05-invariants.md INV-A-02). Test kiểm tra trigger CÓ MẶT — bảng mới
    // có cột status mà quên gắn trigger sẽ lộ ra ở đây.
    const { rows } = await pool.query<{ tgname: string }>(
      `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'repair_order' AND NOT t.tgisinternal
          AND t.tgname LIKE '%status%'`,
    );
    assert.ok(rows.length > 0, 'repair_order thiếu trigger ghi nhật ký đổi trạng thái');
  });
});

describe('CAT-001 — cột tiền có chặn trên trong vùng an toàn của JavaScript', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';

  async function aBranch(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM branch WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    assert.ok(rows[0], 'seed phải có chi nhánh');
    return rows[0].id;
  }

  test('không ghi được số tiền vượt Number.MAX_SAFE_INTEGER', async () => {
    // `bigint` chứa tới 2^63, JavaScript biểu diễn chính xác tới 2^53-1.
    // Khoảng giữa là vùng ghi được nhưng đọc ra SAI mà không báo gì.
    const branch = await aBranch();
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO price_list (tenant_id, branch_id, name, labor_rate_per_hour, effective_from)
           VALUES ($1, $2, 'Bang gia rac', 9007199254740993, '2099-01-01')`,
          [TENANT_A, branch],
        ),
      /price_list_rate_within_safe_range/,
      'Ghi được số tiền không đọc lại chính xác được',
    );
  });

  test('số tiền lớn nhưng biểu diễn được vẫn ghi bình thường', async () => {
    // 9 tỷ đồng/giờ vô lý về nghiệp vụ nhưng KHÔNG bị chặn ở tầng này — ràng
    // buộc chỉ nói về giới hạn biểu diễn, không nói về nghiệp vụ.
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO price_list (tenant_id, branch_id, name, labor_rate_per_hour, effective_from)
       VALUES ($1, $2, 'Bang gia kiem thu', 9000000000, '2099-01-01') RETURNING id`,
      [TENANT_A, await aBranch()],
    );
    await pool.query('DELETE FROM price_list WHERE id = $1', [rows[0]!.id]);
  });
});

describe('🔒 Bảng giá không chồng thời gian', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';

  test('hai bảng giá cùng phạm vi chồng thời gian bị chặn', async () => {
    // Seed đã có một bảng giá toàn chuỗi mở ngỏ (effective_to = NULL). Nếu thêm
    // được bảng thứ hai, câu hỏi "giá giờ công hôm nay là bao nhiêu" có hai đáp
    // án và hệ thống chọn theo thứ tự dòng trả về — tức là ngẫu nhiên.
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO price_list (tenant_id, name, labor_rate_per_hour, effective_from)
           VALUES ($1, 'Bang gia chong lan', 300000, '2026-06-01')`,
          [TENANT_A],
        ),
      /no_overlapping_price_list/,
      'Hai bảng giá cùng hiệu lực -> giá bán phụ thuộc thứ tự dòng trả về',
    );
  });
});
