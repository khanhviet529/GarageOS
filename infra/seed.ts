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

// Mật khẩu demo đọc từ môi trường được, để bản chạy thử cho người ngoài xem
// không dùng chuỗi đã công khai trong repo.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'demo1234';

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

/**
 * 🔒 Chặn chạy seed nhầm môi trường.
 *
 * `main()` bắt đầu bằng việc XOÁ SẠCH mọi bảng, kể cả `audit_log` — bảng mà
 * INV-A-01 tuyên bố là chỉ-thêm (role migration bỏ qua được điều đó). Không có
 * `WHERE`, không hỏi xác nhận. `DATABASE_ADMIN_URL` là biến môi trường thường,
 * nên chỉ cần một `.env` trỏ staging là `pnpm db:seed` xoá toàn bộ mọi tenant —
 * rồi tạo lại tài khoản chủ chuỗi với mật khẩu đã công khai trong repo.
 *
 * Chặn theo host là chặn ở đúng chỗ: người vận hành phải nói tường minh rằng họ
 * biết mình đang làm gì.
 */
function assertMoiTruongAnToan(url: string): void {
  const host = new URL(url).hostname;
  const laCucBo = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host);

  if (laCucBo || process.env.SEED_ALLOW_REMOTE === 'yes-toi-hieu-se-xoa-sach') {
    return;
  }
  throw new Error(
    [
      `Tu choi seed: DATABASE_ADMIN_URL tro toi "${host}", khong phai may cuc bo.`,
      'Seed XOA SACH moi bang cua moi tenant truoc khi tao lai du lieu mau.',
      'Neu that su muon: SEED_ALLOW_REMOTE=yes-toi-hieu-se-xoa-sach',
    ].join(String.fromCharCode(10)),
  );
}

async function main(): Promise<void> {
  assertMoiTruongAnToan(ADMIN_URL);

  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();

  console.log('Dọn dữ liệu seed cũ...');
  // 🔒 Thứ tự xoá phải NGƯỢC chiều khoá ngoại. Thêm bảng mới mà quên thêm vào
  //    đây thì `pnpm db:seed` gãy — và gãy ở giữa chừng, sau khi đã xoá một
  //    nửa dữ liệu. Danh sách này là một phần của việc thêm bảng.
  // 🔒 Toàn bộ phần dọn + tạo lại nằm trong MỘT giao dịch. Bản trước không có,
  //    nên khi `DELETE FROM repair_order` bị khoá ngoại của `quotation` chặn,
  //    script chết sau khi đã xoá xong hai bảng đầu — database ở trạng thái nửa
  //    vời, chỉ cứu được bằng `pnpm db:reset`.
  await db.query('BEGIN');

  /*
   * TRUNCATE thay vì DELETE, và MỘT câu cho tất cả bảng.
   *
   * Hai lý do, cả hai đều là bài học từ chính dự án này:
   *
   * 1. `DELETE FROM quotation_line` kích trigger `trg_qline_no_add_remove` —
   *    trigger đúng (INV-Q-05: không bớt dòng khỏi báo giá đã gửi khách) nhưng
   *    nó chặn luôn việc dọn dẹp. TRUNCATE không kích trigger dòng.
   *
   * 2. Liệt kê tất cả trong MỘT câu, KHÔNG dùng CASCADE: nếu quên một bảng có
   *    khoá ngoại trỏ vào, PostgreSQL báo lỗi và NÊU TÊN bảng đó. CASCADE thì
   *    im lặng xoá luôn — tức là quên một bảng sẽ không bao giờ bị phát hiện.
   */
  await db.query(`TRUNCATE
    work_assignment, bay, user_certification, certification,
    stock_reservation, stock_movement, stock_balance, warehouse,
    otp_challenge, quotation_line, quotation,
    repair_order_asset, repair_order_photo, repair_order, doc_counter,
    price_list_item, price_list, part, service_item,
    vehicle_ownership, vehicle, customer,
    user_branch, refresh_token, audit_log, app_user, branch, tenant
    RESTART IDENTITY`);

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

  /*
   * Kho và tồn đầu kỳ — Phase 2.1.
   *
   * 🔒 Tồn đầu kỳ đi qua `stock_movement` với `ref_type = 'OPENING'`, KHÔNG
   * `INSERT` thẳng `stock_balance`. Đó là quy tắc ở docs/10 mục 5 và EC-M-01,
   * và từ migration 0025 thì cũng là điều duy nhất làm được — `stock_balance`
   * chỉ nhận ghi từ trigger.
   *
   * Giá vốn đặt bằng ~70% giá bán để bảng lãi/lỗ ở Phase 6 có số thật để hiển
   * thị, thay vì mọi đơn đều lãi 100%.
   */
  console.log('Tạo kho và tồn đầu kỳ...');
  const khoIds: string[] = [];
  for (const [i, b] of branchesA.entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO warehouse (tenant_id, branch_id, code, name, is_default)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [TENANT_A, b.id, `KHO-${String(i + 1).padStart(2, '0')}`, 'Kho chính'],
    );
    khoIds.push(rows[0]!.id);
  }
  const { rows: khoB } = await db.query<{ id: string }>(
    `INSERT INTO warehouse (tenant_id, branch_id, code, name, is_default)
     SELECT $1, id, 'KHO-B01', 'Kho đối chứng', true FROM branch WHERE tenant_id = $1
     RETURNING id`,
    [TENANT_B],
  );

  const { rows: thuKho } = await db.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND 'STORE_KEEPER' = ANY(roles) LIMIT 1`,
    [TENANT_A],
  );
  const { rows: nguoiB } = await db.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_B],
  );

  // Kho chi nhánh 1 đủ hàng; chi nhánh 2 để MỘT mã dưới mức tối thiểu, để màn
  // cảnh báo sắp hết hàng có dữ liệu thật thay vì luôn rỗng khi demo.
  const TON_DAU_KY: Record<string, number> = {
    'PT-OIL-5W30': 120, 'PT-FILTER-OIL': 40, 'PT-BRAKE-PAD-F': 12,
    'PT-SPARK-PLUG': 60, 'PT-CABIN-FILTER': 25,
    'PT-HV-MODULE': 2, 'PT-HV-COOLANT': 18, 'PT-CHARGE-PORT': 3,
  };
  for (const [ti, t] of [TENANT_A, TENANT_B].entries()) {
    const khoCuaTenant = ti === 0 ? khoIds : [khoB[0]!.id];
    const nguoiGhi = ti === 0 ? thuKho[0]!.id : nguoiB[0]!.id;
    const { rows: parts } = await db.query<{ id: string; sku: string }>(
      'SELECT id, sku FROM part WHERE tenant_id = $1',
      [t],
    );
    for (const [ki, kho] of khoCuaTenant.entries()) {
      for (const p of parts) {
        const goc = TON_DAU_KY[p.sku] ?? 10;
        // Kho thứ hai trở đi giữ 1/4 lượng -> có mã tụt dưới min_stock_level (5)
        const luong = ki === 0 ? goc : Math.max(1, Math.round(goc / 4));
        const gia = PARTS.find((x) => x.sku === p.sku)?.price ?? 100_000;
        await db.query(
          `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type,
                                       quantity, unit_cost, ref_type, reason,
                                       created_by_user_id)
           VALUES ($1,$2,$3,'RECEIPT',$4,$5,'OPENING','Tồn đầu kỳ chuyển từ sổ Excel',$6)`,
          [t, kho, p.id, luong, Math.round(gia * 0.7), nguoiGhi],
        );
      }
    }
  }

  /*
   * Khoang và chứng chỉ — Phase 2.3.
   *
   * 🔒 Chỉ MỘT khoang có `HV_SAFE_ZONE`, và chỉ MỘT thợ có chứng chỉ cao áp.
   * Dựng dư ra thì mọi phân công đều hợp lệ và hai bất biến an toàn (INV-W-03,
   * INV-W-07) không bao giờ được nhìn thấy trong bản demo — trong khi chúng
   * chính là phần đáng xem nhất của lát cắt này.
   */
  console.log('Tạo khoang và chứng chỉ...');
  const CHUNG_CHI = [
    { code: 'HV_ELECTRICAL', name: 'An toàn điện cao áp' },
    { code: 'EV_DIAGNOSTICS', name: 'Chẩn đoán xe điện' },
  ];
  const certIds = new Map<string, string>();
  for (const c of CHUNG_CHI) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO certification (tenant_id, code, name) VALUES ($1,$2,$3) RETURNING id`,
      [TENANT_A, c.code, c.name],
    );
    certIds.set(c.code, rows[0]!.id);
  }

  const { rows: thoList } = await db.query<{ id: string; phone: string }>(
    `SELECT id, phone FROM app_user WHERE tenant_id = $1 AND 'TECHNICIAN' = ANY(roles)
      ORDER BY phone`,
    [TENANT_A],
  );
  // Thợ đầu tiên có đủ hai chứng chỉ; những người sau KHÔNG — để màn gợi ý thợ
  // có cả trường hợp "không chọn được, và đây là lý do".
  const thoCaoAp = thoList[0];
  if (thoCaoAp !== undefined) {
    for (const c of CHUNG_CHI) {
      await db.query(
        `INSERT INTO user_certification (tenant_id, user_id, certification_id, issued_at, expires_at)
         VALUES ($1,$2,$3, now() - interval '1 year', now() + interval '2 years')`,
        [TENANT_A, thoCaoAp.id, certIds.get(c.code)],
      );
    }
  }

  for (const [i, b] of branchesA.entries()) {
    const khoangs =
      i === 0
        ? [
            { code: `K${i + 1}-01`, name: 'Khoang 1 — cầu nâng', caps: ['LIFT'] },
            { code: `K${i + 1}-02`, name: 'Khoang 2 — cầu nâng', caps: ['LIFT'] },
            {
              code: `K${i + 1}-03`,
              name: 'Khoang 3 — vùng an toàn cao áp',
              caps: ['LIFT', 'HV_SAFE_ZONE', 'EV_CHARGER'],
            },
          ]
        : [{ code: `K${i + 1}-01`, name: 'Khoang 1 — cầu nâng', caps: ['LIFT'] }];
    for (const k of khoangs) {
      await db.query(
        `INSERT INTO bay (tenant_id, branch_id, code, name, capabilities)
         VALUES ($1,$2,$3,$4,$5)`,
        [TENANT_A, b.id, k.code, k.name, k.caps],
      );
    }
  }

  /*
   * Một đơn demo đã được khách duyệt — Phase 2.3.
   *
   * Không có nó thì màn "Lịch xưởng" luôn rỗng trên dữ liệu seed: người xem
   * demo mở ra thấy "không còn hạng mục nào chờ phân công" và không hiểu màn
   * hình này để làm gì. Một test E2E cũng phải tự bỏ qua vì không có gì để
   * kiểm — mà test bị bỏ qua thì không chứng minh được điều gì.
   *
   * Duyệt bằng SQL trực tiếp thay vì đi qua OTP: seed không phải chỗ diễn lại
   * luồng nghiệp vụ, và luồng đó đã có test riêng.
   */
  console.log('Tạo đơn demo đã duyệt để lịch xưởng có việc...');
  {
    const chiNhanh = branchesA[0]!.id;
    const { rows: kh } = await db.query<{ id: string }>(
      `INSERT INTO customer (tenant_id, type, display_name, phone)
       VALUES ($1,'INDIVIDUAL','Trần Minh Khoa','0912345678') RETURNING id`,
      [TENANT_A],
    );
    const { rows: xe } = await db.query<{ id: string }>(
      `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain, make_name, model_name)
       VALUES ($1,$2,'30A12345','ICE','Toyota','Vios') RETURNING id`,
      [TENANT_A, kh[0]!.id],
    );
    const { rows: nguoi } = await db.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000003'`,
      [TENANT_A],
    );
    const { rows: don } = await db.query<{ id: string }>(
      `INSERT INTO repair_order (tenant_id, branch_id, vehicle_id, customer_id, code,
                                 customer_complaint, odometer_in, status,
                                 customer_access_token, created_by_user_id)
       VALUES ($1,$2,$3,$4,'RO-DEMO-0001',
               'Xe kêu ở phanh trước, cần kiểm tra và thay dầu', 42000, 'IN_PROGRESS',
               'demo-tra-cuu-0001-token-du-dai-de-qua-rang-buoc', $5)
       RETURNING id`,
      [TENANT_A, chiNhanh, xe[0]!.id, kh[0]!.id, nguoi[0]!.id],
    );
    const { rows: bg } = await db.query<{ id: string }>(
      `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                              price_list_id, created_by_user_id)
       SELECT $1, $2, 1, pl.labor_rate_per_hour, pl.id, $3
         FROM price_list pl
        WHERE pl.tenant_id = $1 AND pl.branch_id IS NULL
          AND pl.effective_from <= now() AND (pl.effective_to IS NULL OR pl.effective_to > now())
        LIMIT 1
       RETURNING id`,
      [TENANT_A, don[0]!.id, nguoi[0]!.id],
    );
    for (const ma of ['SV-BRAKE-PAD', 'SV-OIL-ENGINE']) {
      await db.query(
        `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, service_item_id,
                                     description, quantity, unit_price, status, approval_source)
         SELECT $1, $2, (SELECT COALESCE(max(seq),0)+1 FROM quotation_line WHERE quotation_id = $2),
                'LABOR', si.id, si.name, 1,
                round(si.standard_hours * (SELECT labor_rate_per_hour FROM quotation WHERE id = $2)),
                'APPROVED', 'CUSTOMER'
           FROM service_item si WHERE si.tenant_id = $1 AND si.code = $3`,
        [TENANT_A, bg[0]!.id, ma],
      );
    }
    await db.query(
      `UPDATE quotation SET status = 'APPROVED', sent_at = now(),
                            valid_until = now() + interval '7 days', responded_at = now(),
                            approval_channel = 'IN_PERSON'
        WHERE id = $1`,
      [bg[0]!.id],
    );
  }

  await db.query('COMMIT');

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
