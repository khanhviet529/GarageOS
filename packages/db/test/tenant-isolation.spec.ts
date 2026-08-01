/**
 * INV-T-01 / INV-T-02 / INV-T-03 / INV-A-01 — cô lập tenant và nhật ký bất biến.
 *
 * 🔒 Đây là test QUAN TRỌNG NHẤT của Phase 0. Nếu nó đỏ, toàn bộ mô hình
 * multi-tenant vô hiệu và không có gì khác đáng tin.
 *
 * ⚠️ Test này CHỈ có ý nghĩa khi chạy trên PostgreSQL thật. SQLite và các DB
 * in-memory không có Row-Level Security — test sẽ xanh giả.
 *
 * Chạy: pnpm db:up && pnpm db:migrate && pnpm --filter @garageos/db test
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { TenantAwareDb, createAppPool } from '../src/tenant-client.ts';
import type { ActorContext } from '@garageos/contracts';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

let adminPool: Pool;
let appPool: Pool;
let db: TenantAwareDb;

const actorA: ActorContext = {
  tenantId: TENANT_A,
  userId: '33333333-3333-3333-3333-333333333333',
  roles: ['OWNER'],
  branchIds: [],
};
const actorB: ActorContext = { ...actorA, tenantId: TENANT_B };

before(async () => {
  adminPool = new Pool({ connectionString: ADMIN_URL });
  appPool = createAppPool();
  db = new TenantAwareDb(appPool);

  // Dọn và dựng dữ liệu bằng quyền admin (bỏ qua RLS — có chủ đích)
  await adminPool.query(`DELETE FROM branch WHERE tenant_id IN ($1,$2)`, [TENANT_A, TENANT_B]);
  await adminPool.query(`DELETE FROM tenant WHERE id IN ($1,$2)`, [TENANT_A, TENANT_B]);
  await adminPool.query(
    `INSERT INTO tenant (id, name) VALUES ($1,'Garage A'), ($2,'Garage B')`,
    [TENANT_A, TENANT_B],
  );
  await adminPool.query(
    `INSERT INTO branch (tenant_id, code, name) VALUES ($1,'A1','Chi nhánh A1'), ($2,'B1','Chi nhánh B1')`,
    [TENANT_A, TENANT_B],
  );
});

after(async () => {
  await adminPool.query(`DELETE FROM branch WHERE tenant_id IN ($1,$2)`, [TENANT_A, TENANT_B]);
  await adminPool.query(`DELETE FROM tenant WHERE id IN ($1,$2)`, [TENANT_A, TENANT_B]);
  await adminPool.end();
  await appPool.end();
});

describe('Điều kiện tiên quyết', () => {
  test('role ứng dụng KHÔNG được là superuser hoặc có BYPASSRLS', async () => {
    // Nếu test này đỏ, mọi test cô lập bên dưới đều vô nghĩa (xanh giả).
    await db.assertNotPrivileged();
  });
});

describe('INV-T-01 — cô lập tenant', () => {
  test('không đặt app.tenant_id thì không thấy dòng nào', async () => {
    const client = await appPool.connect();
    try {
      const { rows } = await client.query<{ n: string }>('SELECT count(*) AS n FROM branch');
      assert.equal(rows[0]?.n, '0', 'Không có ngữ cảnh tenant mà vẫn đọc được dữ liệu');
    } finally {
      client.release();
    }
  });

  test('tenant A chỉ thấy dữ liệu của A', async () => {
    const names = await db.withTenant(actorA, async (tx) => {
      const { rows } = await tx.query<{ name: string }>('SELECT name FROM branch');
      return rows.map((r) => r.name);
    });
    assert.deepEqual(names, ['Chi nhánh A1']);
  });

  test('tenant B chỉ thấy dữ liệu của B', async () => {
    const names = await db.withTenant(actorB, async (tx) => {
      const { rows } = await tx.query<{ name: string }>('SELECT name FROM branch');
      return rows.map((r) => r.name);
    });
    assert.deepEqual(names, ['Chi nhánh B1']);
  });

  test('truy vấn thẳng bằng tenant_id của B khi đang là A vẫn không rò rỉ', async () => {
    const n = await db.withTenant(actorA, async (tx) => {
      const { rows } = await tx.query<{ n: string }>(
        'SELECT count(*) AS n FROM branch WHERE tenant_id = $1',
        [TENANT_B],
      );
      return rows[0]?.n;
    });
    assert.equal(n, '0', 'Rò rỉ dữ liệu tenant khác qua điều kiện WHERE tường minh');
  });

  test('GHI dữ liệu cho tenant khác bị RLS chặn', async () => {
    await assert.rejects(
      db.withTenant(actorA, (tx) =>
        tx.query(`INSERT INTO branch (tenant_id, code, name) VALUES ($1,'HACK','lậu')`, [
          TENANT_B,
        ]),
      ),
      /row-level security/i,
    );
  });

  test('SỬA dữ liệu tenant khác không ảnh hưởng dòng nào', async () => {
    const affected = await db.withTenant(actorA, async (tx) => {
      const r = await tx.query(`UPDATE branch SET name = 'bị sửa' WHERE tenant_id = $1`, [
        TENANT_B,
      ]);
      return r.rowCount;
    });
    assert.equal(affected, 0);

    const { rows } = await adminPool.query<{ name: string }>(
      'SELECT name FROM branch WHERE tenant_id = $1',
      [TENANT_B],
    );
    assert.equal(rows[0]?.name, 'Chi nhánh B1', 'Dữ liệu tenant B đã bị sửa');
  });

  test('XOÁ dữ liệu tenant khác không ảnh hưởng dòng nào', async () => {
    const affected = await db.withTenant(actorA, async (tx) => {
      const r = await tx.query('DELETE FROM branch WHERE tenant_id = $1', [TENANT_B]);
      return r.rowCount;
    });
    assert.equal(affected, 0);
  });
});

describe('INV-T-03 — khoá ngoại phức hợp chặn trỏ chéo tenant', () => {
  test('không tạo được user_branch trỏ sang chi nhánh của tenant khác', async () => {
    const { rows: bRows } = await adminPool.query<{ id: string }>(
      'SELECT id FROM branch WHERE tenant_id = $1',
      [TENANT_B],
    );
    const branchOfB = bRows[0]?.id;
    assert.ok(branchOfB, 'thiếu dữ liệu chuẩn bị');

    const { rows: uRows } = await adminPool.query<{ id: string }>(
      `INSERT INTO app_user (tenant_id, phone, password_hash, full_name, roles)
       VALUES ($1,'0900000001','x','Người A', ARRAY['OWNER']::user_role[])
       RETURNING id`,
      [TENANT_A],
    );
    const userOfA = uRows[0]?.id;

    await assert.rejects(
      adminPool.query(
        'INSERT INTO user_branch (tenant_id, user_id, branch_id) VALUES ($1,$2,$3)',
        [TENANT_A, userOfA, branchOfB],
      ),
      /violates foreign key constraint/i,
    );

    await adminPool.query('DELETE FROM app_user WHERE id = $1', [userOfA]);
  });
});

describe('INV-A-01 — nhật ký thao tác chỉ thêm', () => {
  test('role ứng dụng không XOÁ được audit_log', async () => {
    await assert.rejects(
      db.withTenant(actorA, (tx) => tx.query('DELETE FROM audit_log')),
      /permission denied/i,
    );
  });

  test('role ứng dụng không SỬA được audit_log', async () => {
    await assert.rejects(
      db.withTenant(actorA, (tx) => tx.query(`UPDATE audit_log SET action = 'x'`)),
      /permission denied/i,
    );
  });
});
