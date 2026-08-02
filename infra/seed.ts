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


/**
 * Danh mục hạng mục dịch vụ — lấy đúng bảng ví dụ trong BC-11 mục 2.1.
 *
 * 🔒 Đây là dữ liệu khiến `INV-V-01` kiểm chứng được BẰNG MẮT: mở màn lập báo
 * giá cho một xe thuần điện, danh sách phải KHÔNG có "thay dầu động cơ".
 */
const SERVICE_ITEMS: {
  code: string;
  name: string;
  category: string;
  hours: number;
  powertrains: string[];
  certs: string[];
  warrantyMonths: number;
}[] = [
  // --- Dùng chung cho mọi loại xe ---
  { code: 'SV-BRAKE-PAD', name: 'Thay má phanh', category: 'MAINTENANCE',
    hours: 1.5, powertrains: ['ICE', 'HYBRID', 'BEV'], certs: [], warrantyMonths: 6 },
  { code: 'SV-TIRE-ROT', name: 'Đảo lốp và cân bằng động', category: 'MAINTENANCE',
    hours: 1.0, powertrains: ['ICE', 'HYBRID', 'BEV'], certs: [], warrantyMonths: 0 },
  { code: 'SV-AC-CLEAN', name: 'Vệ sinh hệ thống điều hoà', category: 'MAINTENANCE',
    hours: 2.0, powertrains: ['ICE', 'HYBRID', 'BEV'], certs: [], warrantyMonths: 3 },
  { code: 'SV-SUSPENSION', name: 'Kiểm tra và siết gầm', category: 'REPAIR',
    hours: 2.5, powertrains: ['ICE', 'HYBRID', 'BEV'], certs: [], warrantyMonths: 6 },

  // --- Chỉ xe có động cơ đốt trong ---
  { code: 'SV-OIL-ENGINE', name: 'Thay dầu động cơ và lọc dầu', category: 'MAINTENANCE',
    hours: 0.8, powertrains: ['ICE', 'HYBRID'], certs: [], warrantyMonths: 0 },
  { code: 'SV-SPARK-PLUG', name: 'Thay bugi', category: 'MAINTENANCE',
    hours: 1.2, powertrains: ['ICE', 'HYBRID'], certs: [], warrantyMonths: 6 },
  { code: 'SV-TIMING-BELT', name: 'Thay dây curoa cam', category: 'REPAIR',
    hours: 4.0, powertrains: ['ICE', 'HYBRID'], certs: [], warrantyMonths: 12 },
  { code: 'SV-EXHAUST', name: 'Kiểm tra hệ thống xả và khí thải', category: 'DIAGNOSIS',
    hours: 1.0, powertrains: ['ICE', 'HYBRID'], certs: [], warrantyMonths: 0 },

  // --- Chỉ xe điện hoá (HYBRID + BEV) ---
  { code: 'SV-HV-SOH', name: 'Kiểm tra tình trạng pin cao áp (SoH)', category: 'HV_SYSTEM',
    hours: 1.5, powertrains: ['HYBRID', 'BEV'], certs: ['HV_ELECTRICAL'], warrantyMonths: 0 },
  { code: 'SV-HV-MODULE', name: 'Thay module pin cao áp', category: 'HV_SYSTEM',
    hours: 6.0, powertrains: ['HYBRID', 'BEV'], certs: ['HV_ELECTRICAL'], warrantyMonths: 24 },
  { code: 'SV-HV-INSUL', name: 'Kiểm tra rò điện và cách điện', category: 'HV_SYSTEM',
    hours: 2.0, powertrains: ['HYBRID', 'BEV'], certs: ['HV_ELECTRICAL'], warrantyMonths: 0 },
  { code: 'SV-HV-COOLANT', name: 'Bảo dưỡng hệ thống làm mát pin', category: 'HV_SYSTEM',
    hours: 2.5, powertrains: ['HYBRID', 'BEV'], certs: ['HV_ELECTRICAL'], warrantyMonths: 6 },
  { code: 'SV-FIRMWARE', name: 'Cập nhật phần mềm điều khiển', category: 'DIAGNOSIS',
    hours: 1.0, powertrains: ['HYBRID', 'BEV'], certs: ['EV_DIAGNOSTICS'], warrantyMonths: 0 },

  // --- Chỉ xe thuần điện ---
  { code: 'SV-CHARGE-PORT', name: 'Kiểm tra cổng sạc', category: 'HV_SYSTEM',
    hours: 1.0, powertrains: ['BEV'], certs: ['HV_ELECTRICAL'], warrantyMonths: 6 },
];

const PARTS: {
  sku: string;
  name: string;
  unit: string;
  category: string;
  highVoltage: boolean;
  price: number;
  warrantyMonths: number;
  warrantyKm: number | null;
}[] = [
  { sku: 'PT-OIL-5W30', name: 'Dầu động cơ 5W-30 (1 lít)', unit: 'lít', category: 'Dầu nhớt',
    highVoltage: false, price: 185_000, warrantyMonths: 0, warrantyKm: null },
  { sku: 'PT-FILTER-OIL', name: 'Lọc dầu động cơ', unit: 'cái', category: 'Lọc',
    highVoltage: false, price: 120_000, warrantyMonths: 6, warrantyKm: 10_000 },
  { sku: 'PT-BRAKE-PAD-F', name: 'Má phanh trước (bộ)', unit: 'bộ', category: 'Phanh',
    highVoltage: false, price: 850_000, warrantyMonths: 12, warrantyKm: 20_000 },
  { sku: 'PT-SPARK-PLUG', name: 'Bugi iridium', unit: 'cái', category: 'Đánh lửa',
    highVoltage: false, price: 240_000, warrantyMonths: 12, warrantyKm: 30_000 },
  { sku: 'PT-CABIN-FILTER', name: 'Lọc gió điều hoà', unit: 'cái', category: 'Lọc',
    highVoltage: false, price: 195_000, warrantyMonths: 6, warrantyKm: null },
  // 🔒 Phụ tùng cao áp: đánh dấu riêng vì nó chi phối quy trình an toàn
  { sku: 'PT-HV-MODULE', name: 'Module pin cao áp', unit: 'cái', category: 'Pin cao áp',
    highVoltage: true, price: 28_500_000, warrantyMonths: 24, warrantyKm: 50_000 },
  { sku: 'PT-HV-COOLANT', name: 'Dung dịch làm mát pin (1 lít)', unit: 'lít', category: 'Pin cao áp',
    highVoltage: true, price: 420_000, warrantyMonths: 0, warrantyKm: null },
  { sku: 'PT-CHARGE-PORT', name: 'Cụm cổng sạc', unit: 'cái', category: 'Pin cao áp',
    highVoltage: true, price: 6_800_000, warrantyMonths: 12, warrantyKm: null },
];

async function main(): Promise<void> {
  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();

  console.log('Dọn dữ liệu seed cũ...');
  // 🔒 Thứ tự xoá phải NGƯỢC chiều khoá ngoại. Thêm bảng mới mà quên thêm vào
  //    đây thì `pnpm db:seed` gãy — và gãy ở giữa chừng, sau khi đã xoá một
  //    nửa dữ liệu. Danh sách này là một phần của việc thêm bảng.
  for (const table of [
    'repair_order_asset',
    'repair_order_photo',
    'repair_order',
    'doc_counter',
    'price_list_item',
    'price_list',
    'part',
    'service_item',
    'vehicle_ownership',
    'vehicle',
    'customer',
    'user_branch',
    'refresh_token',
    'audit_log',
    'app_user',
    'branch',
    'tenant',
  ]) {
    await db.query(`DELETE FROM ${table}`);
  }

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

  console.log('Tạo danh mục dịch vụ và phụ tùng...');
  for (const t of [TENANT_A, TENANT_B]) {
    for (const item of SERVICE_ITEMS) {
      await db.query(
        `INSERT INTO service_item (tenant_id, code, name, category, standard_hours,
                                   applicable_powertrains, required_certifications,
                                   warranty_months)
         VALUES ($1,$2,$3,$4,$5,$6::powertrain[],$7::text[],$8)`,
        [t, item.code, item.name, item.category, item.hours,
         item.powertrains, item.certs, item.warrantyMonths],
      );
    }

    const partIds = new Map<string, string>();
    for (const p of PARTS) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO part (tenant_id, sku, name, unit, category, is_high_voltage,
                           warranty_months, warranty_kilometers, min_stock_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [t, p.sku, p.name, p.unit, p.category, p.highVoltage,
         p.warrantyMonths, p.warrantyKm, 5],
      );
      partIds.set(p.sku, rows[0]!.id);
    }

    // Bảng giá toàn chuỗi, hiệu lực từ đầu năm, chưa đóng kỳ
    const { rows: plRows } = await db.query<{ id: string }>(
      `INSERT INTO price_list (tenant_id, name, labor_rate_per_hour, effective_from)
       VALUES ($1, 'Bảng giá 2026', $2, '2026-01-01T00:00:00+07:00') RETURNING id`,
      [t, t === TENANT_A ? 250_000 : 200_000],
    );
    const priceListId = plRows[0]!.id;

    for (const p of PARTS) {
      await db.query(
        `INSERT INTO price_list_item (price_list_id, tenant_id, part_id, sell_price)
         VALUES ($1,$2,$3,$4)`,
        [priceListId, t, partIds.get(p.sku), p.price],
      );
    }
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
