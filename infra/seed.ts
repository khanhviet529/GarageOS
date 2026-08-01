/**
 * Seed dữ liệu phát triển.
 *
 * 🔒 Nguyên tắc (docs/14-testing-strategy.md mục 6):
 * seed phải đủ để MỌI màn hình có nội dung và MỌI báo cáo có số liệu.
 * Một tenant rỗng không kiểm chứng được gì.
 *
 * 🔒 Tạo 2 tenant để kiểm chứng cô lập bằng mắt, không chỉ bằng test.
 */
import { Client } from 'pg';
import { scryptSync, randomBytes } from 'node:crypto';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

/** Băm mật khẩu — scrypt (chuẩn Node, không cần phụ thuộc ngoài) */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const DEMO_PASSWORD = 'demo1234';

interface SeedUser {
  phone: string;
  fullName: string;
  roles: string[];
}

const USERS_A: SeedUser[] = [
  { phone: '0901000001', fullName: 'Nguyễn Văn Chủ', roles: ['OWNER'] },
  { phone: '0901000002', fullName: 'Trần Thị Quản Lý', roles: ['BRANCH_MANAGER'] },
  { phone: '0901000003', fullName: 'Lê Văn Cố Vấn', roles: ['SERVICE_ADVISOR'] },
  { phone: '0901000004', fullName: 'Phạm Văn Thợ', roles: ['TECHNICIAN'] },
  { phone: '0901000005', fullName: 'Hoàng Thị Kho', roles: ['STORE_KEEPER'] },
  { phone: '0901000006', fullName: 'Đỗ Thị Thu Ngân', roles: ['CASHIER'] },
];

const USERS_B: SeedUser[] = [
  { phone: '0902000001', fullName: 'Chủ Garage B', roles: ['OWNER'] },
];

async function main(): Promise<void> {
  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();

  console.log('Dọn dữ liệu seed cũ...');
  await db.query('DELETE FROM user_branch');
  await db.query('DELETE FROM refresh_token');
  await db.query('DELETE FROM audit_log');
  await db.query('DELETE FROM app_user');
  await db.query('DELETE FROM branch');
  await db.query('DELETE FROM tenant');

  console.log('Tạo tenant...');
  await db.query(
    `INSERT INTO tenant (id, name, tax_code, internal_labor_cost_per_hour)
     VALUES ($1, 'Garage Thành Công', '0101234567', 120000),
            ($2, 'Garage Đối Chứng',  '0107654321', 100000)`,
    [TENANT_A, TENANT_B],
  );

  console.log('Tạo chi nhánh...');
  const { rows: branchesA } = await db.query<{ id: string }>(
    `INSERT INTO branch (tenant_id, code, name, address, phone)
     VALUES ($1,'HN01','Chi nhánh Hà Nội','12 Giải Phóng, Hai Bà Trưng, Hà Nội','02411110001'),
            ($1,'HN02','Chi nhánh Long Biên','88 Nguyễn Văn Cừ, Long Biên, Hà Nội','02411110002'),
            ($1,'HCM01','Chi nhánh Sài Gòn','200 Điện Biên Phủ, Bình Thạnh, TP.HCM','02811110003')
     RETURNING id`,
    [TENANT_A],
  );
  await db.query(
    `INSERT INTO branch (tenant_id, code, name) VALUES ($1,'B01','Chi nhánh Đối Chứng')`,
    [TENANT_B],
  );

  console.log('Tạo người dùng...');
  const pwd = hashPassword(DEMO_PASSWORD);

  for (const u of USERS_A) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO app_user (tenant_id, phone, password_hash, full_name, roles)
       VALUES ($1,$2,$3,$4,$5::user_role[]) RETURNING id`,
      [TENANT_A, u.phone, pwd, u.fullName, u.roles],
    );
    const userId = rows[0]?.id;
    // Chủ chuỗi phạm vi toàn tenant -> gán mọi chi nhánh; còn lại gán chi nhánh 1
    const targets = u.roles.includes('OWNER') ? branchesA : branchesA.slice(0, 1);
    for (const b of targets) {
      await db.query(
        'INSERT INTO user_branch (tenant_id, user_id, branch_id) VALUES ($1,$2,$3)',
        [TENANT_A, userId, b.id],
      );
    }
  }

  for (const u of USERS_B) {
    await db.query(
      `INSERT INTO app_user (tenant_id, phone, password_hash, full_name, roles)
       VALUES ($1,$2,$3,$4,$5::user_role[])`,
      [TENANT_B, u.phone, pwd, u.fullName, u.roles],
    );
  }

  console.log('');
  console.log('  Xong. Tài khoản demo (mật khẩu: %s)', DEMO_PASSWORD);
  console.log('  ┌────────────┬──────────────────────┬─────────────────┐');
  for (const u of USERS_A) {
    console.log(
      '  │ %s │ %s │ %s │',
      u.phone.padEnd(10),
      u.fullName.padEnd(20),
      (u.roles[0] ?? '').padEnd(15),
    );
  }
  console.log('  └────────────┴──────────────────────┴─────────────────┘');
  console.log('  Tenant đối chứng (kiểm tra cô lập): 0902000001');

  await db.end();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
