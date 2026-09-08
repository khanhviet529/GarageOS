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
import { scryptSync, randomBytes, createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Gốc kho và thư mục media — neo vào GỐC MONOREPO, không vào `process.cwd()`.
 *
 * ⚠️ `cwd` là thuộc tính của LỜI GỌI chứ không phải của dự án: seed chạy ở gốc,
 *    API chạy ở `apps/api`. Suy đường dẫn lưu trữ từ `cwd` nghĩa là hai bên ghi
 *    và đọc ở hai chỗ khác nhau — ảnh "nhập thành công" vẫn trả 404.
 *    Cùng lập luận với `thuMucMediaMacDinh()` ở `apps/api/src/media/storage-provider.ts`.
 */
function timGocKho(): string {
  let thu = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(thu, 'pnpm-workspace.yaml'))) return thu;
    const cha = resolve(thu, '..');
    if (cha === thu) break;
    thu = cha;
  }
  return process.cwd();
}
const GOC_KHO = timGocKho();
/*
 * ⚠️ Kiểm CHUỖI RỖNG, không chỉ `undefined`.
 *
 * `.env` khai `MEDIA_ROOT=` (để trống, nghĩa là "dùng mặc định"), nhưng dotenv
 * nạp nó thành chuỗi rỗng — một giá trị ĐÃ ĐƯỢC ĐẶT. Toán tử `??` chỉ rơi về
 * mặc định khi `null`/`undefined`, nên chuỗi rỗng đi thẳng qua và
 * `join('', key)` cho ra đường dẫn TƯƠNG ĐỐI.
 *
 * Đo được: ảnh seed rơi vào `<gốc kho>/<tenant-uuid>/<sha>.jpg` thay vì
 * `media/public/`, và `/media/:key` trả 404 dù DB ghi "READY".
 *
 * 💡 Với biến môi trường, "để trống" và "chưa đặt" là cùng một ý định của người
 *    viết `.env`. Code phải hiểu như nhau.
 */
const MEDIA_ROOT =
  (process.env.MEDIA_ROOT ?? '') === ''
    ? join(GOC_KHO, 'media', 'public')
    : process.env.MEDIA_ROOT!;

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
  /*
   * Thợ THỨ HAI, cố ý KHÔNG có chứng chỉ cao áp.
   *
   * Một xưởng chỉ có một thợ làm cả hai thứ trở nên vô nghĩa: màn gợi ý thợ
   * không có gì để gợi ý, cân tải giữa các thợ không có ai để cân, và hai bất
   * biến an toàn INV-W-03 (chứng chỉ) / INV-W-05 (một việc một lúc) không bao
   * giờ được nhìn thấy trong bản demo.
   *
   * Đây cũng là chỗ một test từng đỏ rồi xanh một cách ngẫu nhiên: nó đòi phải
   * có thợ KHÔNG đủ điều kiện, và trên dữ liệu seed sạch thì không có ai như
   * vậy — nó chỉ xanh nhờ rác trạng thái của lần chạy trước.
   */
  { phone: '0901000007', fullName: 'Vũ Đình Thợ Mới', roles: ['TECHNICIAN'] },
  // Landing / Sales (SRS Phase 1) — vai mới chỉ có quyền mới
  { phone: '0901000010', fullName: 'Nguyễn Thị Marketing', roles: ['MARKETING_EDITOR'] },
  { phone: '0901000011', fullName: 'Trần Văn Duyệt Nội Dung', roles: ['MARKETING_PUBLISHER'] },
  { phone: '0901000012', fullName: 'Lê Thị Tư Vấn', roles: ['SALES_ADVISOR'] },
  { phone: '0901000013', fullName: 'Phạm Văn Quản Lý Sales', roles: ['SALES_MANAGER'] },
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
    e_invoice, payment_allocation, payment, invoice_line, invoice,
    insurance_claim,
    llm_call_log,
    storage_fee, customer_contact_attempt,
    maintenance_plan_part, maintenance_plan_item,
    stock_take_line, stock_take,
    cancellation_settlement_line, cancellation_settlement,
    warranty_cost_attribution, warranty_coverage,
    supplement_block, supplement_request,
    time_log, work_assignment, bay, user_certification, certification,
    stock_reservation, stock_movement, stock_balance, warehouse,
    otp_challenge, quotation_line, quotation,
    repair_order_asset, repair_order_photo, repair_order, doc_counter,
    price_list_item, price_list, part, service_item,
    vehicle_ownership, vehicle, customer,
    lead_activity, sales_lead,
    landing_preview_session, landing_page_revision, landing_page,
    media_import_item, media_import_job,
    vehicle_product_media, vehicle_experience_version_media,
    vehicle_experience_version, vehicle_experience,
    vehicle_price_log, vehicle_availability, financing_program, vehicle_promotion,
    vehicle_color, onroad_fee_schedule,
    financing_program_template,
    lead_form_consent_version, lead_form,
    site_theme, site_redirect, site_navigation,
    article_tag, article_revision, article, article_category,
    faq_placement, faq_item,
    testimonial, vehicle_variant_revision, vehicle_variant,
    vehicle_product_revision, vehicle_product, vehicle_product_category,
    media_publication, media_rendition, media_asset,
    branch_public_profile, site_profile, site_domain,
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

    /*
     * Lịch bảo dưỡng định kỳ — dữ liệu cho tính năng "chi phí sở hữu 5 năm".
     *
     * ─────────────────────────────────────────────────────────────────────
     * ⚠️ CÁC MỐC DƯỚI ĐÂY LÀ GIÁ TRỊ THÔNG DỤNG Ở THỊ TRƯỜNG VIỆT NAM, CHƯA
     *    ĐƯỢC MỘT XƯỞNG THẬT XÁC NHẬN.
     *
     *    Chúng xuất hiện CÔNG KHAI trên trang bán xe, và khách sẽ cầm con số đó
     *    tới xưởng đối chiếu. Trước khi dùng cho quảng cáo thật, xưởng phải rà
     *    lại theo khuyến cáo của từng hãng xe mà họ phục vụ.
     *
     * 💡 Ghi thành DỮ LIỆU của tenant chứ không phải hằng số trong mã: mỗi xưởng
     *    có khuyến cáo riêng, và sửa một con số không nên cần một lần deploy.
     *
     * Mốc "hoặc N tháng" quan trọng ngang mốc km: người chạy 3.000 km/năm vẫn
     * phải thay dầu theo tuổi dù xe gần như đứng yên.
     */
    const LICH_BAO_DUONG: {
      sv: string; km: number | null; thang: number | null;
      vatTu: { sku: string; sl: number }[];
    }[] = [
      // --- Mọi loại động cơ ---
      { sv: 'SV-TIRE-ROT',    km: 10_000, thang: 12, vatTu: [] },
      { sv: 'SV-BRAKE-PAD',   km: 40_000, thang: null,
        vatTu: [{ sku: 'PT-BRAKE-PAD-F', sl: 1 }] },
      { sv: 'SV-AC-CLEAN',    km: null,   thang: 12,
        vatTu: [{ sku: 'PT-CABIN-FILTER', sl: 1 }] },
      { sv: 'SV-SUSPENSION',  km: 20_000, thang: 24, vatTu: [] },

      // --- Chỉ xe có động cơ đốt trong ---
      { sv: 'SV-OIL-ENGINE',  km: 10_000, thang: 12,
        vatTu: [{ sku: 'PT-OIL-5W30', sl: 4 }, { sku: 'PT-FILTER-OIL', sl: 1 }] },
      { sv: 'SV-SPARK-PLUG',  km: 40_000, thang: null,
        vatTu: [{ sku: 'PT-SPARK-PLUG', sl: 4 }] },
      { sv: 'SV-TIMING-BELT', km: 100_000, thang: null, vatTu: [] },
      { sv: 'SV-EXHAUST',     km: 20_000, thang: 24, vatTu: [] },

      // --- Chỉ xe điện hoá ---
      { sv: 'SV-HV-SOH',      km: null,   thang: 12, vatTu: [] },
      { sv: 'SV-HV-COOLANT',  km: 60_000, thang: 48,
        vatTu: [{ sku: 'PT-HV-COOLANT', sl: 3 }] },
      { sv: 'SV-HV-INSUL',    km: null,   thang: 24, vatTu: [] },
      { sv: 'SV-CHARGE-PORT', km: null,   thang: 12, vatTu: [] },
      { sv: 'SV-FIRMWARE',    km: null,   thang: 12, vatTu: [] },
    ];

    for (const lich of LICH_BAO_DUONG) {
      const { rows: pi } = await db.query<{ id: string }>(
        `INSERT INTO maintenance_plan_item
           (tenant_id, service_item_id, interval_km, interval_months)
         SELECT $1, id, $3, $4 FROM service_item
          WHERE tenant_id = $1 AND code = $2
         RETURNING id`,
        [t, lich.sv, lich.km, lich.thang],
      );
      const planId = pi[0]?.id;
      if (planId === undefined) continue;
      for (const v of lich.vatTu) {
        const partId = partIds.get(v.sku);
        if (partId === undefined) continue;
        await db.query(
          `INSERT INTO maintenance_plan_part (tenant_id, plan_item_id, part_id, quantity)
           VALUES ($1,$2,$3,$4)`,
          [t, planId, partId, v.sl],
        );
      }
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
    /*
     * SÁU hạng mục, và con số này có chủ ý:
     *  · một cái đã xếp và ĐÃ XONG   -> màn QC có việc để kiểm
     *  · một cái đã xếp và CHỜ LÀM   -> app thợ có thẻ bấm "Bắt đầu"
     *  · BỐN cái CHƯA xếp            -> nhiều bộ E2E cùng cần "việc chờ xếp"
     *
     * Vì sao bốn chứ không phải một: các bộ E2E chạy tuần tự trên CÙNG một
     * database, và bộ nào xếp lịch thì TIÊU MẤT một hạng mục chờ. Để đúng một
     * cái thì bộ chạy sau đói dữ liệu và đỏ ở chỗ chẳng liên quan gì tới thứ
     * nó đang kiểm — đã xảy ra đúng như vậy khi thêm app thợ.
     */
    for (const ma of [
      'SV-BRAKE-PAD',
      'SV-OIL-ENGINE',
      'SV-SPARK-PLUG',
      'SV-TIRE-ROT',
      'SV-AC-CLEAN',
      'SV-SUSPENSION',
    ]) {
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
    /*
     * Một dòng phụ tùng KÈM phiếu giữ chỗ đang chờ xuất.
     *
     * Không có nó thì màn "Chờ xuất kho" luôn rỗng trên dữ liệu seed, và test
     * E2E của luồng xuất phải tự bỏ qua — mà test bị bỏ qua thì không chứng
     * minh được gì. Cùng lý do với đơn demo ở trên.
     */
    const { rows: dongCong } = await db.query<{ id: string }>(
      `SELECT id FROM quotation_line
        WHERE quotation_id = $1 AND line_type = 'LABOR' ORDER BY seq LIMIT 1`,
      [bg[0]!.id],
    );
    const { rows: dongPt } = await db.query<{ id: string; part_id: string }>(
      `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, part_id,
                                   parent_line_id, description, quantity, unit_price,
                                   status, approval_source)
       SELECT $1, $2, (SELECT COALESCE(max(seq),0)+1 FROM quotation_line WHERE quotation_id = $2),
              'PART', p.id, $3, p.name, 1, pli.sell_price, 'APPROVED', 'CUSTOMER'
         FROM part p
         JOIN price_list_item pli ON pli.part_id = p.id
         JOIN price_list pl ON pl.id = pli.price_list_id AND pl.branch_id IS NULL
        WHERE p.tenant_id = $1 AND p.sku = 'PT-BRAKE-PAD-F'
       RETURNING id, part_id`,
      [TENANT_A, bg[0]!.id, dongCong[0]!.id],
    );
    await db.query(
      `INSERT INTO stock_reservation (tenant_id, warehouse_id, part_id, repair_order_id,
                                      quotation_line_id, quantity, expires_at)
       SELECT $1, w.id, $2, $3, $4, 1, now() + interval '7 days'
         FROM warehouse w WHERE w.tenant_id = $1 AND w.branch_id = $5 AND w.is_default`,
      [TENANT_A, dongPt[0]!.part_id, don[0]!.id, dongPt[0]!.id, chiNhanh],
    );

    /*
     * Một việc ĐÃ XONG, đang chờ kiểm tra chất lượng — Phase 2.6.
     *
     * Không có nó thì hộp QC không bao giờ hiện ra trên dữ liệu seed: người xem
     * demo không thấy được phần đáng xem nhất của lát cắt này (bốn nguyên nhân
     * làm lại, mỗi cái nói rõ ai trả tiền), và một test E2E phải tự bỏ qua.
     *
     * Xếp vào 8h HÔM NAY để nó nằm đúng trong khung giờ màn lịch hiển thị.
     */
    /*
     * Dùng thợ THỨ HAI (0901000007), không dùng 0901000004.
     *
     * Bộ test giờ công lùi thời gian đoạn của 0901000004 về 20 tiếng trước để
     * kiểm job đóng hộ. Đoạn seed nằm ở hôm nay của cùng người sẽ đụng
     * `no_timelog_overlap` — và test đỏ ở một chỗ chẳng liên quan gì tới thứ nó
     * đang kiểm.
     *
     * Đây là loại va chạm mà dữ liệu demo và dữ liệu test luôn có nguy cơ gặp:
     * cả hai dùng chung một database. Tách người là cách rẻ nhất để chúng không
     * đụng nhau.
     */
    const { rows: thoChinh } = await db.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000007'`,
      [TENANT_A],
    );
    const { rows: khoangDau } = await db.query<{ id: string }>(
      `SELECT id FROM bay WHERE tenant_id = $1 AND branch_id = $2 ORDER BY code LIMIT 1`,
      [TENANT_A, chiNhanh],
    );
    const { rows: dongCong2 } = await db.query<{ id: string }>(
      `SELECT id FROM quotation_line
        WHERE quotation_id = $1 AND line_type = 'LABOR' ORDER BY seq LIMIT 1`,
      [bg[0]!.id],
    );
    /*
     * 🔒 Mốc "đầu ngày" phải tính theo MÚI GIỜ CHI NHÁNH, không theo múi giờ
     * của database.
     *
     * `date_trunc('day', now())` chạy theo timezone của phiên PostgreSQL — trong
     * Docker là UTC. Màn lịch xưởng thì hỏi "hôm nay" theo giờ trình duyệt
     * (UTC+7). Từ 00:00 tới 07:00 giờ Việt Nam, hai bên ở HAI NGÀY KHÁC NHAU:
     * lịch xưởng trống trơn, app thợ không có việc nào, và mọi test dựa vào
     * lịch hôm nay đều đỏ.
     *
     * Đã xảy ra thật: bộ E2E xanh lúc 23h, đỏ 5 bài lúc 0h30 cùng đêm, không có
     * dòng code nào thay đổi ở giữa.
     */
    const { rows: mocNgay } = await db.query<{ dau_ngay: Date }>(
      `SELECT (date_trunc('day', now() AT TIME ZONE b.timezone) AT TIME ZONE b.timezone)
                AS dau_ngay
         FROM branch b WHERE b.id = $1`,
      [chiNhanh],
    );
    const dauNgay = mocNgay[0]!.dau_ngay;

    const { rows: pc } = await db.query<{ id: string }>(
      `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
                                    technician_id, bay_id, planned_start, planned_end,
                                    created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,
               $7::timestamptz + interval '8 hours',
               $7::timestamptz + interval '9 hours 30 minutes',
               $6)
       RETURNING id`,
      [TENANT_A, don[0]!.id, dongCong2[0]!.id, thoChinh[0]!.id, khoangDau[0]!.id, nguoi[0]!.id,
       dauNgay],
    );
    /*
     * Một đoạn giờ công đã đóng, rồi đưa việc sang DONE — đúng đường mà
     * TimeLogService đi, không nhảy cóc trạng thái.
     *
     * 🔒 Đoạn giờ này phải nằm HOÀN TOÀN TRONG QUÁ KHỨ, không phải "8h sáng
     * hôm nay".
     *
     * `no_timelog_overlap` (exclusion constraint) coi một đoạn đang mở là
     * `[bắt đầu, ∞)`. Seed chạy lúc 0h30 sáng thì đoạn 8h–9h20 hôm nay nằm ở
     * TƯƠNG LAI, và thợ bấm "Bắt đầu" lúc 0h30 sẽ tạo một đoạn mở chồng lên nó
     * — bị chặn với thông báo "đang có đoạn giờ khác chồng lấn", trong khi
     * người dùng chưa làm gì cả.
     *
     * `LEAST(...)` giữ mốc 8h sáng cho lịch nhìn hợp lý ban ngày, và tự lùi về
     * quá khứ nếu seed chạy sớm hơn thế.
     */
    await db.query(
      `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id,
                             started_at, ended_at, entered_by_user_id)
       VALUES ($1,$2,$3,
               LEAST($4::timestamptz + interval '8 hours', now() - interval '100 minutes'),
               LEAST($4::timestamptz + interval '8 hours', now() - interval '100 minutes')
                 + interval '80 minutes',
               $3)`,
      [TENANT_A, pc[0]!.id, thoChinh[0]!.id, dauNgay],
    );
    await db.query(`UPDATE work_assignment SET status = 'DONE' WHERE id = $1`, [pc[0]!.id]);

    /*
     * Một việc CHỜ LÀM cho cùng người thợ — Phase 4.
     *
     * App thợ cần ít nhất một thẻ bấm được "Bắt đầu", nếu không thì test luồng
     * bấm giờ tự bỏ qua, và người xem demo mở app ra chỉ thấy một việc đã xong.
     *
     * Xếp lúc 10h để không đụng khung 8h–9h30 của việc trên: exclusion
     * constraint chặn cả theo khoang lẫn theo thợ.
     */
    const { rows: dongCongSau } = await db.query<{ id: string }>(
      `SELECT id FROM quotation_line
        WHERE quotation_id = $1 AND line_type = 'LABOR' AND id <> $2
        ORDER BY seq LIMIT 1`,
      [bg[0]!.id, dongCong2[0]!.id],
    );
    if (dongCongSau[0] !== undefined) {
      await db.query(
        `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
                                      technician_id, bay_id, planned_start, planned_end,
                                      created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,
                 $7::timestamptz + interval '10 hours',
                 $7::timestamptz + interval '11 hours',
                 $6)`,
        [
          TENANT_A,
          don[0]!.id,
          dongCongSau[0].id,
          thoChinh[0]!.id,
          khoangDau[0]!.id,
          nguoi[0]!.id,
          dauNgay,
        ],
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

  /*
   * ════════════════════════════════════════════════════════════════════════
   * Phase 3 — hoá đơn, thanh toán, công nợ, bảo hiểm
   *
   * 🔒 `docs/14-testing-strategy.md` mục 6: seed phải đủ để MỌI màn hình có nội
   *    dung và MỌI báo cáo có số liệu. Trước khối này, màn hoá đơn và báo cáo
   *    công nợ mở ra trống trơn — phần đã làm xong trông như chưa làm.
   *
   * Ba cảnh, mỗi cảnh minh hoạ một điều KHÁC NHAU:
   *
   *   1. Khách lẻ, đã thu đủ         -> vòng đời hoá đơn đóng lại bình thường
   *   2. Công ty vận tải, nợ QUÁ HẠN -> báo cáo công nợ theo tuổi nợ có số liệu
   *   3. Xe va chạm có bảo hiểm      -> phân bổ hai nguồn tới TỪNG DÒNG (BC-08)
   *
   * 💡 Cảnh 3 là cảnh đáng có nhất: nó là thứ duy nhất chứng minh bằng dữ liệu
   *    rằng `payment_allocation` trỏ tới DÒNG chứ không tới hoá đơn — điều mà
   *    một hoá đơn thu một lần không nói ra được.
   *
   * Ba đơn ở đây tự dựng lấy chứ không mượn đơn demo phía trên: đơn đó đang
   * IN_PROGRESS và còn là chỗ dựa của nhiều bộ E2E khác. Kéo nó sang DELIVERED
   * để có chỗ gắn hoá đơn sẽ làm đỏ những bài chẳng liên quan gì.
   * ════════════════════════════════════════════════════════════════════════
   */
  console.log('Tạo hoá đơn, thanh toán và hồ sơ bảo hiểm...');

  const { rows: thuNgan } = await db.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000006'`,
    [TENANT_A],
  );
  const { rows: coVan } = await db.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000003'`,
    [TENANT_A],
  );
  const { rows: chiNhanhChinh } = await db.query<{ id: string }>(
    `SELECT id FROM branch WHERE tenant_id = $1 AND code = 'HN01'`,
    [TENANT_A],
  );
  const nguoiThu = thuNgan[0]!.id;
  const nguoiTao = coVan[0]!.id;
  const chiNhanhHD = chiNhanhChinh[0]!.id;

  /** Một đơn đã bàn giao — chỗ hợp lệ duy nhất để gắn hoá đơn */
  async function donDaGiao(opts: {
    ma: string;
    customerId: string;
    vehicleId: string;
    than: string;
    kmVao: number;
    kmRa: number;
    giaoTruoc: number;
  }): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                                 customer_complaint, odometer_in, odometer_out,
                                 customer_access_token, created_by_user_id,
                                 status, received_at, delivered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DELIVERED',
               now() - make_interval(days => $11::int) - interval '2 day',
               now() - make_interval(days => $11::int))
       RETURNING id`,
      [
        TENANT_A,
        chiNhanhHD,
        opts.ma,
        opts.customerId,
        opts.vehicleId,
        opts.than,
        opts.kmVao,
        opts.kmRa,
        // 🔒 ro_token_long_enough: token tra cứu công khai tối thiểu 32 ký tự
        `demo-${opts.ma.toLowerCase()}-token-tra-cuu-cong-khai`,
        nguoiTao,
        opts.giaoTruoc,
      ],
    );
    return rows[0]!.id;
  }

  /** Dựng một hoá đơn đã phát hành, trả về id hoá đơn và id các dòng */
  async function hoaDonDemo(opts: {
    orderId: string;
    customerId: string;
    ma: string;
    dong: {
      moTa: string;
      gia: number;
      payer?: 'CUSTOMER' | 'INSURER';
      claimId?: string;
    }[];
    phatHanhTruoc: number;
    hanNgay: number;
  }): Promise<{ id: string; dong: string[] }> {
    const { rows: hd } = await db.query<{ id: string }>(
      `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                            created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [TENANT_A, chiNhanhHD, opts.orderId, opts.customerId, opts.ma, nguoiThu],
    );
    const dong: string[] = [];
    for (const [i, d] of opts.dong.entries()) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                   quantity, unit_price, tax_rate_percent,
                                   expected_payer_type, insurance_claim_id)
         VALUES ($1,$2,$3,'PART',$4,1,$5,0,$6,$7) RETURNING id`,
        [
          TENANT_A,
          hd[0]!.id,
          i + 1,
          d.moTa,
          d.gia,
          d.payer ?? 'CUSTOMER',
          // 🔒 Gắn hồ sơ bồi thường NGAY lúc tạo dòng: sau ISSUED thì
          //    `chan_sua_dong_hoa_don_da_phat_hanh` chặn cả UPDATE
          d.claimId ?? null,
        ],
      );
      dong.push(rows[0]!.id);
    }
    /*
     * 🔒 INV-M-03: sau ISSUED thì không thêm bớt sửa dòng — nên phát hành SAU
     *    khi đã nhập đủ dòng. Ảnh chụp thông tin khách là bắt buộc
     *    (`invoice_issued_needs_snapshot`): hoá đơn phải đọc được y như lúc
     *    phát hành, kể cả khi khách đổi tên hay mã số thuế về sau.
     */
    await db.query(
      `UPDATE invoice i
          SET status = 'ISSUED',
              issued_at = now() - make_interval(days => $2::int),
              due_date  = now() - make_interval(days => $2::int)
                          + make_interval(days => $3::int),
              customer_snapshot = jsonb_build_object(
                'displayName', c.display_name,
                'phone', c.phone,
                'address', c.address,
                'taxCode', c.tax_code)
         FROM customer c
        WHERE i.id = $1 AND c.id = i.customer_id`,
      [hd[0]!.id, opts.phatHanhTruoc, opts.hanNgay],
    );
    return { id: hd[0]!.id, dong };
  }

  /** Thu tiền và phân bổ tới từng dòng — đúng đường mà PaymentService đi */
  async function thuTien(opts: {
    customerId: string;
    payerType: 'CUSTOMER' | 'INSURER';
    payerName?: string;
    method: 'CASH' | 'TRANSFER';
    khoa: string;
    truocNgay: number;
    phanBo: { dong: string; tien: number }[];
  }): Promise<void> {
    const tong = opts.phanBo.reduce((t, x) => t + x.tien, 0);
    const { rows: pm } = await db.query<{ id: string }>(
      `INSERT INTO payment (tenant_id, branch_id, customer_id, payer_type, payer_name,
                            amount, method, paid_at, idempotency_key, received_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() - make_interval(days => $8::int), $9,$10)
       RETURNING id`,
      [
        TENANT_A,
        chiNhanhHD,
        opts.customerId,
        opts.payerType,
        opts.payerName ?? null,
        tong,
        opts.method,
        opts.truocNgay,
        opts.khoa,
        nguoiThu,
      ],
    );
    for (const x of opts.phanBo) {
      await db.query(
        `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_line_id, amount)
         VALUES ($1,$2,$3,$4)`,
        [TENANT_A, pm[0]!.id, x.dong, x.tien],
      );
    }
  }

  // ── Cảnh 1 — khách lẻ, bảo dưỡng thường, đã thu đủ ─────────────────────────
  const { rows: khachLe } = await db.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone, address)
     VALUES ($1,'INDIVIDUAL','Lý Thu Hà','0913222444',
             '18 ngõ 42 Thái Hà, Đống Đa, Hà Nội') RETURNING id`,
    [TENANT_A],
  );
  const { rows: xeKhachLe } = await db.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, make_name, model_name,
                          model_year, powertrain, last_odometer)
     VALUES ($1,$2,'30F55521','Honda','City',2020,'ICE',61000) RETURNING id`,
    [TENANT_A, khachLe[0]!.id],
  );
  const donLe = await donDaGiao({
    ma: 'RO-DEMO-0050',
    customerId: khachLe[0]!.id,
    vehicleId: xeKhachLe[0]!.id,
    than: 'Đến kỳ thay dầu, xin kiểm tra thêm phanh trước',
    kmVao: 61000,
    kmRa: 61012,
    giaoTruoc: 4,
  });
  const hdLe = await hoaDonDemo({
    orderId: donLe,
    customerId: khachLe[0]!.id,
    ma: 'INV-DEMO-0050',
    phatHanhTruoc: 4,
    hanNgay: 0,
    dong: [
      { moTa: 'Công thay dầu động cơ và lọc dầu', gia: 480_000 },
      { moTa: 'Dầu động cơ 5W-30 (4 lít)', gia: 740_000 },
    ],
  });
  await thuTien({
    customerId: khachLe[0]!.id,
    payerType: 'CUSTOMER',
    method: 'CASH',
    khoa: 'seed-demo-0050',
    truocNgay: 4,
    phanBo: [
      { dong: hdLe.dong[0]!, tien: 480_000 },
      { dong: hdLe.dong[1]!, tien: 740_000 },
    ],
  });

  /*
   * ── Cảnh 2 — công ty vận tải, nợ quá hạn ─────────────────────────────────
   *
   * Phát hành 45 ngày trước, hạn thanh toán 30 ngày -> quá hạn 15 ngày. Báo cáo
   * công nợ chia theo tuổi nợ, và một bảng chỉ toàn "trong hạn" không cho thấy
   * nó làm được gì.
   */
  const { rows: congTy } = await db.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone, tax_code, address,
                           credit_limit_amount, payment_term_days,
                           billing_contact_name, billing_email)
     VALUES ($1,'COMPANY','Công ty TNHH Vận tải Đông Đô','02438220100','0102938475',
             'Số 5 Phạm Hùng, Nam Từ Liêm, Hà Nội', 80000000, 30,
             'Chị Hương - Kế toán trưởng','ketoan@vantaidongdo.example')
     RETURNING id`,
    [TENANT_A],
  );
  const { rows: xeCongTy } = await db.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, make_name, model_name,
                          model_year, powertrain, last_odometer)
     VALUES ($1,$2,'29H12345','Hyundai','Solati',2021,'ICE',142000) RETURNING id`,
    [TENANT_A, congTy[0]!.id],
  );
  const donCongTy = await donDaGiao({
    ma: 'RO-DEMO-0100',
    customerId: congTy[0]!.id,
    vehicleId: xeCongTy[0]!.id,
    than: 'Xe chạy tuyến dài, đến kỳ bảo dưỡng 140.000km',
    kmVao: 142000,
    kmRa: 142050,
    giaoTruoc: 45,
  });
  const hdNo = await hoaDonDemo({
    orderId: donCongTy,
    customerId: congTy[0]!.id,
    ma: 'INV-DEMO-0100',
    phatHanhTruoc: 45,
    hanNgay: 30,
    dong: [
      { moTa: 'Bảo dưỡng cấp 140.000km', gia: 2_400_000 },
      { moTa: 'Bộ lọc gió, lọc dầu, lọc nhiên liệu', gia: 1_850_000 },
      { moTa: 'Dầu hộp số', gia: 1_250_000 },
    ],
  });
  // Trả trước một phần -> hoá đơn PARTIALLY_PAID, phần còn lại đã quá hạn
  await thuTien({
    customerId: congTy[0]!.id,
    payerType: 'CUSTOMER',
    payerName: 'Công ty TNHH Vận tải Đông Đô',
    method: 'TRANSFER',
    khoa: 'seed-demo-0100',
    truocNgay: 20,
    phanBo: [{ dong: hdNo.dong[0]!, tien: 2_400_000 }],
  });

  /*
   * ── Cảnh 3 — xe va chạm, bảo hiểm trả một phần ───────────────────────────
   *
   * Đúng ví dụ BC-08: bảo hiểm duyệt 5.200.000 (đèn đủ, sơn thiếu 500.000 là
   * mức khấu trừ), khách trả 500.000 đó CỘNG hai hạng mục ngoài phạm vi bồi
   * thường. Mức khấu trừ nằm GIỮA một dòng, nên không có cách nào ghi đúng cảnh
   * này nếu phân bổ chỉ tới mức hoá đơn.
   */
  const { rows: khachVaCham } = await db.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone, address)
     VALUES ($1,'INDIVIDUAL','Trịnh Văn Hoà','0912345699',
             '77 Trần Duy Hưng, Cầu Giấy, Hà Nội') RETURNING id`,
    [TENANT_A],
  );
  const { rows: xeVaCham } = await db.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, make_name, model_name,
                          model_year, powertrain, last_odometer)
     VALUES ($1,$2,'30G88888','Mazda','CX-5',2022,'ICE',38000) RETURNING id`,
    [TENANT_A, khachVaCham[0]!.id],
  );
  const donVaCham = await donDaGiao({
    ma: 'RO-DEMO-0200',
    customerId: khachVaCham[0]!.id,
    vehicleId: xeVaCham[0]!.id,
    than: 'Va chạm phía trước: vỡ đèn pha trái, xước cản trước',
    kmVao: 38000,
    kmRa: 38020,
    giaoTruoc: 10,
  });
  const { rows: hoSo } = await db.query<{ id: string }>(
    `INSERT INTO insurance_claim (tenant_id, repair_order_id, insurer_name, policy_number,
                                  claim_number, deductible_amount, approved_amount,
                                  status, submitted_at, surveyed_at, approved_at,
                                  created_by_user_id)
     VALUES ($1,$2,'Bảo hiểm PVI','PVI-VC-2026-004471','BT-2026-11902',500000,5200000,
             'PARTIALLY_APPROVED', now() - interval '20 day', now() - interval '18 day',
             now() - interval '14 day', $3)
     RETURNING id`,
    [TENANT_A, donVaCham, nguoiTao],
  );
  const hdBh = await hoaDonDemo({
    orderId: donVaCham,
    customerId: khachVaCham[0]!.id,
    ma: 'INV-DEMO-0200',
    phatHanhTruoc: 10,
    hanNgay: 0,
    dong: [
      {
        moTa: 'Cụm đèn pha trái (chính hãng)',
        gia: 3_200_000,
        payer: 'INSURER',
        claimId: hoSo[0]!.id,
      },
      { moTa: 'Sơn lại cản trước', gia: 2_500_000, payer: 'INSURER', claimId: hoSo[0]!.id },
      { moTa: 'Dầu động cơ 5W-30 (4 lít)', gia: 850_000 },
      { moTa: 'Vệ sinh hệ thống điều hoà', gia: 400_000 },
    ],
  });
  await thuTien({
    customerId: khachVaCham[0]!.id,
    payerType: 'INSURER',
    payerName: 'Bảo hiểm PVI',
    method: 'TRANSFER',
    khoa: 'seed-demo-0200-bh',
    truocNgay: 6,
    phanBo: [
      { dong: hdBh.dong[0]!, tien: 3_200_000 },
      // 🔒 Chỉ 2.000.000 cho dòng sơn: 500.000 còn lại là MỨC KHẤU TRỪ khách chịu
      { dong: hdBh.dong[1]!, tien: 2_000_000 },
    ],
  });
  await thuTien({
    customerId: khachVaCham[0]!.id,
    payerType: 'CUSTOMER',
    method: 'CASH',
    khoa: 'seed-demo-0200-kh',
    truocNgay: 10,
    phanBo: [
      { dong: hdBh.dong[1]!, tien: 500_000 },
      { dong: hdBh.dong[2]!, tien: 850_000 },
      { dong: hdBh.dong[3]!, tien: 400_000 },
    ],
  });

  /*
   * ── Cảnh 4 — hoá đơn NHÁP lệch quá ngưỡng ────────────────────────────────
   *
   * Ba cảnh trên đều đã phát hành, nên màn hoá đơn chỉ hiện phần chỉ-đọc. Bảng
   * đối chiếu báo giá ↔ thực tế, cảnh báo vượt ngưỡng và nút phát hành khoá
   * theo lý do chỉ tồn tại ở trạng thái NHÁP — không có cảnh này thì phần giao
   * diện đáng kiểm nhất của BC-07 không có cách nào mở ra để nhìn.
   *
   * Báo giá 3.000.000, thực tế 3.600.000 -> +20%, vượt ngưỡng 5% của tenant.
   * Ba dòng cố ý phủ ba lý do khác nhau mà bảng đối chiếu biết nói:
   *   · đã báo giá, làm đúng      -> không lệch
   *   · đã báo giá, thực tế khác  -> "Thực tế khác báo giá"
   *   · không có trong báo giá    -> "Phát sinh sau báo giá"
   */
  const { rows: khachLech } = await db.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone, address)
     VALUES ($1,'INDIVIDUAL','Bùi Quang Nam','0987654321',
             '256 Nguyễn Trãi, Thanh Xuân, Hà Nội') RETURNING id`,
    [TENANT_A],
  );
  const { rows: xeLech } = await db.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, make_name, model_name,
                          model_year, powertrain, last_odometer)
     VALUES ($1,$2,'30K77712','Ford','Ranger',2019,'ICE',96000) RETURNING id`,
    [TENANT_A, khachLech[0]!.id],
  );
  const { rows: donLech } = await db.query<{ id: string }>(
    `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                               customer_complaint, odometer_in, customer_access_token,
                               created_by_user_id, status, received_at)
     VALUES ($1,$2,'RO-DEMO-0300',$3,$4,
             'Rò dầu hộp số, xe rung khi tăng tốc', 96000,
             'demo-ro-demo-0300-token-tra-cuu-cong-khai', $5,
             'AWAITING_PAYMENT', now() - interval '1 day')
     RETURNING id`,
    [TENANT_A, chiNhanhHD, khachLech[0]!.id, xeLech[0]!.id, nguoiTao],
  );
  const { rows: bgLech } = await db.query<{ id: string }>(
    `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                            price_list_id, created_by_user_id, status, sent_at,
                            responded_at, approval_channel, valid_until)
     SELECT $1, $2, 1, pl.labor_rate_per_hour, pl.id, $3, 'DRAFT',
            NULL, NULL, NULL, now() + interval '6 day'
       FROM price_list pl
      WHERE pl.tenant_id = $1 AND pl.branch_id IS NULL
        AND pl.effective_from <= now()
        AND (pl.effective_to IS NULL OR pl.effective_to > now())
      LIMIT 1
     RETURNING id`,
    [TENANT_A, donLech[0]!.id, nguoiTao],
  );
  /*
   * 🔒 `qline_ref_matches_type`: dòng LABOR phải trỏ tới một hạng mục dịch vụ,
   *    dòng PART phải trỏ tới một phụ tùng. Không có "dòng tự do" — mọi thứ
   *    tính tiền đều phải truy được về danh mục.
   */
  const { rows: hangMuc } = await db.query<{ id: string }>(
    `SELECT id FROM service_item WHERE tenant_id = $1 ORDER BY code LIMIT 2`,
    [TENANT_A],
  );
  const dongBaoGia: string[] = [];
  for (const [i, d] of [
    { moTa: 'Công tháo lắp và thay gioăng hộp số', gia: 1_800_000 },
    { moTa: 'Công thay dầu hộp số ATF', gia: 1_200_000 },
  ].entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, service_item_id,
                                   description, quantity, unit_price, tax_rate_percent, status)
       VALUES ($1,$2,$3,'LABOR',$4,$5,1,$6,0,'APPROVED') RETURNING id`,
      [TENANT_A, bgLech[0]!.id, i + 1, hangMuc[i]!.id, d.moTa, d.gia],
    );
    dongBaoGia.push(rows[0]!.id);
  }
  /*
   * 🔒 INV-Q-05: gửi khách rồi thì không thêm bớt dòng nữa. Nên báo giá phải
   *    nằm ở DRAFT lúc nhập dòng, và chỉ chốt sau — đúng thứ tự mà đơn demo
   *    phía trên đã dùng.
   */
  await db.query(
    `UPDATE quotation SET status = 'APPROVED', sent_at = now() - interval '1 day',
                          responded_at = now() - interval '1 day',
                          approval_channel = 'IN_PERSON'
      WHERE id = $1`,
    [bgLech[0]!.id],
  );

  /*
   * 🔒 Hai hạng mục này phải có phân công ĐÃ XONG, không được để trống.
   *
   * Đơn đang ở AWAITING_PAYMENT — nghĩa là đã sửa xong, đã qua kiểm tra chất
   * lượng, chỉ còn chờ thu tiền. Một đơn như vậy mà không có việc nào đã làm là
   * dữ liệu tự mâu thuẫn.
   *
   * ⚠️ Và nó KHÔNG chỉ là chuyện thẩm mỹ. Danh sách "việc chờ xếp" lấy mọi dòng
   *    công đã duyệt chưa có phân công, của đơn chưa giao — rồi `ORDER BY
   *    ro.received_at`. Đơn này nhận cách đây một ngày nên **nhảy lên đầu danh
   *    sách**, và mọi bộ E2E lấy mục ĐẦU TIÊN đều đổi mục tiêu sang nó. Hai bộ
   *    đã đỏ trên CI vì đúng chuyện đó, trong khi ở máy dev vẫn xanh — chênh
   *    lệch múi giờ khiến việc bị xếp nhầm rơi ra ngoài khung giờ hiển thị.
   *
   * 💡 `STATUS.md` đã ghi cái bẫy "bộ E2E đói dữ liệu lẫn nhau" từ Phase 4.
   *    Lần này nó quay lại theo hướng ngược: không phải seed cho ÍT quá, mà là
   *    seed thêm dữ liệu chen vào ĐẦU một danh sách có thứ tự.
   *
   * Trạng thái DONE nằm ngoài `no_bay_overlap` / `no_technician_overlap` (chỉ
   * áp cho SCHEDULED/IN_PROGRESS/PAUSED), nên xếp vào quá khứ không đụng ai.
   */
  const { rows: khoangLech } = await db.query<{ id: string }>(
    `SELECT id FROM bay WHERE tenant_id = $1 AND branch_id = $2 ORDER BY code LIMIT 1`,
    [TENANT_A, chiNhanhHD],
  );
  const { rows: thoLech } = await db.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000004'`,
    [TENANT_A],
  );
  for (const [i, dongId] of dongBaoGia.entries()) {
    await db.query(
      `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
                                    technician_id, bay_id, planned_start, planned_end,
                                    status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,
               now() - interval '5 day' + make_interval(hours => $6::int),
               now() - interval '5 day' + make_interval(hours => $6::int) + interval '1 hour',
               'DONE',$7)`,
      [TENANT_A, donLech[0]!.id, dongId, thoLech[0]!.id, khoangLech[0]!.id, i * 2, nguoiTao],
    );
  }

  const { rows: hdNhap } = await db.query<{ id: string }>(
    `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                          created_by_user_id)
     VALUES ($1,$2,$3,$4,'INV-DEMO-0300',$5) RETURNING id`,
    [TENANT_A, chiNhanhHD, donLech[0]!.id, khachLech[0]!.id, nguoiThu],
  );
  for (const [i, d] of [
    // Đúng như báo giá
    { moTa: 'Công tháo lắp và thay gioăng hộp số', gia: 1_800_000, nguon: dongBaoGia[0] },
    // Nhiều hơn báo giá: mở ra mới thấy phải thay cả bộ lọc
    { moTa: 'Công thay dầu hộp số ATF', gia: 1_400_000, nguon: dongBaoGia[1] },
    // Không có trong báo giá
    { moTa: 'Công thay bộ lọc dầu hộp số (phát sinh)', gia: 400_000, nguon: null },
  ].entries()) {
    await db.query(
      `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                 quantity, unit_price, tax_rate_percent,
                                 source_quotation_line_id)
       VALUES ($1,$2,$3,'LABOR',$4,1,$5,0,$6)`,
      [TENANT_A, hdNhap[0]!.id, i + 1, d.moTa, d.gia, d.nguon ?? null],
    );
  }

  // ===========================================================================
  // Landing / Sales seed (SRS Phase 1) — site domain, profile, catalog, media.
  // Demo media dùng key `demo/…` do API sinh placeholder SVG (chỉ cho dev/demo).
  // ===========================================================================
  console.log('Tạo landing/sales seed...');
  const { rows: pubRows } = await db.query<{ id: string }>(
    "SELECT id FROM app_user WHERE phone = '0901000011'",
  );
  const publisherId = pubRows[0]!.id;
  const { rows: ownerBRows } = await db.query<{ id: string }>(
    "SELECT id FROM app_user WHERE phone = '0902000001'",
  );
  const ownerBId = ownerBRows[0]!.id;

  const createMedia = async (
    tenantId: string,
    stableKey: string,
    profile: string,
    key: string,
  ): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO media_asset (tenant_id, stable_key, kind, status, source_storage_key,
                                source_sha256, source_mime, byte_size, provenance, license, license_owner, created_by)
       VALUES ($1,$2,'IMAGE','READY',$3,$3,'image/svg+xml',1024,'{}','DEMO','GarageOS', $4)
       RETURNING id`,
      [tenantId, stableKey, key, publisherId],
    );
    const assetId = rows[0]!.id;
    await db.query(
      `INSERT INTO media_rendition (tenant_id, asset_id, profile, format, mime, storage_key, content_sha256, byte_size, visibility)
       VALUES ($1,$2,$3,'svg','image/svg+xml',$4,$4,1024,'PUBLIC')`,
      [tenantId, assetId, profile, key],
    );
    await db.query(
      `INSERT INTO media_publication (tenant_id, rendition_id, public_storage_key, public_content_sha256, status, verified_at)
       SELECT $1, id, $2, $2, 'READY', now() FROM media_rendition WHERE asset_id = $3 AND profile = $4`,
      [tenantId, key, assetId, profile],
    );
    return assetId;
  };

  /**
   * Ảnh THẬT từ `infra/seed-assets/` — không phải placeholder sinh trong bộ nhớ.
   *
   * 🔒 Ghi ra đúng chỗ `MediaStorage` sẽ đọc, bằng đúng quy ước key
   * content-addressed `<tenant>/<sha256>.<ext>`. Nhờ vậy `Cache-Control:
   * immutable` và ETag ở `MediaController` là đúng sự thật: nội dung đổi thì key
   * đổi theo.
   *
   * 💡 Giấy phép ghi vào đúng hai cột `license`/`license_owner` đã có sẵn, thay
   *    vì nằm trong một file README không ai đọc. Nguồn đầy đủ và tiêu chí chọn
   *    ảnh: `infra/seed-assets/LICENSE.md`.
   */
  /**
   * Nhập hình vẽ SVG (`infra/seed-assets/*.svg`) làm ảnh bìa xe.
   *
   * 🔒 Hình VẼ chứ không phải ảnh chụp, và đó là lựa chọn có lý do:
   *
   *   · Dữ liệu mẫu dùng tên tự đặt (`Aurora E1`), nên mọi ảnh chụp đều là MỘT
   *     CHIẾC XE KHÁC đặt dưới cái tên không phải của nó. Hình vẽ hiển nhiên là
   *     minh hoạ nên không có gì để lệch.
   *   · Mọi xe cùng một phong cách, cùng góc, cùng ánh sáng — điều mà ảnh gom
   *     từ nhiều nguồn không có.
   *   · Và nó MỞ KHOÁ được tính năng chọn màu: đổi màu sơn của một hình vector
   *     là đổi một biến, còn nhuộm ảnh chụp thì ra màu sai — đúng thứ
   *     `docs/…/automotive-landing-experience-design.md` mục 3 cấm.
   *
   * Xem `infra/seed-assets/ve-xe.mjs` để biết cách sinh.
   */
  const themHinhVe = async (
    tenantId: string,
    stableKey: string,
    profile: string,
    tenFile: string,
  ): Promise<string> => {
    const dulieu = readFileSync(join(GOC_KHO, 'infra', 'seed-assets', tenFile));
    const sha = createHash('sha256').update(dulieu).digest('hex');
    const key = `${tenantId}/${sha}.svg`;
    const dich = join(MEDIA_ROOT, key);
    mkdirSync(dirname(dich), { recursive: true });
    writeFileSync(dich, dulieu);

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO media_asset (tenant_id, stable_key, kind, status, source_storage_key,
                                source_sha256, source_mime, byte_size, provenance,
                                license, license_owner, created_by)
       VALUES ($1,$2,'IMAGE','READY',$3,$4,'image/svg+xml',$5,$6::jsonb,
               'Nội bộ — hình minh hoạ','GarageOS',$7)
       RETURNING id`,
      [tenantId, stableKey, key, sha, dulieu.length,
       JSON.stringify({ nguon: 'infra/seed-assets/ve-xe.mjs', loai: 'minh hoạ vector' }),
       publisherId],
    );
    const assetId = rows[0]!.id;
    await db.query(
      `INSERT INTO media_rendition (tenant_id, asset_id, profile, format, mime,
                                    storage_key, content_sha256, byte_size, visibility)
       VALUES ($1,$2,$3,'svg','image/svg+xml',$4,$5,$6,'PUBLIC')`,
      [tenantId, assetId, profile, key, sha, dulieu.length],
    );
    await db.query(
      `INSERT INTO media_publication (tenant_id, rendition_id, public_storage_key,
                                      public_content_sha256, status, verified_at)
       SELECT $1, id, $2, $3, 'READY', now() FROM media_rendition
        WHERE asset_id = $4 AND profile = $5`,
      [tenantId, key, sha, assetId, profile],
    );
    return assetId;
  };

  const themAnhThat = async (
    tenantId: string,
    stableKey: string,
    profile: string,
    tenFile: string,
    tacGia: string,
  ): Promise<string> => {
    const dulieu = readFileSync(join(GOC_KHO, 'infra', 'seed-assets', tenFile));
    const sha = createHash('sha256').update(dulieu).digest('hex');
    const key = `${tenantId}/${sha}.jpg`;

    const dich = join(MEDIA_ROOT, key);
    mkdirSync(dirname(dich), { recursive: true });
    writeFileSync(dich, dulieu);

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO media_asset (tenant_id, stable_key, kind, status, source_storage_key,
                                source_sha256, source_mime, byte_size, provenance,
                                license, license_owner, created_by)
       VALUES ($1,$2,'IMAGE','READY',$3,$4,'image/jpeg',$5,$6::jsonb,'Unsplash License',$7,$8)
       RETURNING id`,
      [
        tenantId, stableKey, key, sha, dulieu.length,
        JSON.stringify({ nguon: 'unsplash.com', tacGia, xem: 'infra/seed-assets/LICENSE.md' }),
        tacGia, publisherId,
      ],
    );
    const assetId = rows[0]!.id;
    await db.query(
      `INSERT INTO media_rendition (tenant_id, asset_id, profile, format, mime,
                                    storage_key, content_sha256, byte_size, visibility)
       VALUES ($1,$2,$3,'jpg','image/jpeg',$4,$5,$6,'PUBLIC')`,
      [tenantId, assetId, profile, key, sha, dulieu.length],
    );
    await db.query(
      `INSERT INTO media_publication (tenant_id, rendition_id, public_storage_key,
                                      public_content_sha256, status, verified_at)
       SELECT $1, id, $2, $3, 'READY', now() FROM media_rendition
        WHERE asset_id = $4 AND profile = $5`,
      [tenantId, key, sha, assetId, profile],
    );
    return assetId;
  };

  await db.query(
    `INSERT INTO site_domain (tenant_id, hostname, status, is_primary)
     VALUES ($1,'localhost','ACTIVE',true),
            ($2,'garage-b.localhost','ACTIVE',true)`,
    [TENANT_A, TENANT_B],
  );

  await db.query(
    `INSERT INTO site_profile (tenant_id, version_number, status, brand_name, legal_name,
                               default_title_suffix, default_description, phone, address,
                               created_by, updated_by, published_by, published_at)
     VALUES
       ($1, 1, 'PUBLISHED', 'Garage Thành Công Showroom', 'Công ty TNHH Garage Thành Công',
        'Garage Thành Công',
        'Showroom ô tô chính hãng tại Hà Nội và TP.HCM. Đăng ký lái thử miễn phí, nhận báo giá trong ngày và hưởng hậu mãi trọn đời tại xưởng.',
        '02411110001', '{"line1":"12 Giải Phóng, Hà Nội"}', $2, $2, $2, now()),
       ($1, 2, 'DRAFT', 'Garage Thành Công Showroom', 'Công ty TNHH Garage Thành Công',
        'Garage Thành Công',
        'Showroom ô tô chính hãng tại Hà Nội và TP.HCM. Đăng ký lái thử miễn phí, nhận báo giá trong ngày và hưởng hậu mãi trọn đời tại xưởng.',
        '02411110001', '{"line1":"12 Giải Phóng, Hà Nội"}', $2, $2, NULL, NULL)`,
    [TENANT_A, publisherId],
  );
  await db.query(
    `INSERT INTO site_profile (tenant_id, version_number, status, brand_name, legal_name,
                               default_title_suffix, default_description, created_by, updated_by,
                               published_by, published_at)
     VALUES ($1, 1, 'PUBLISHED', 'Garage Đối Chứng Showroom', 'Công ty Garage Đối Chứng',
             'Garage Đối Chứng',
             'Showroom đối chứng để kiểm chứng cô lập tenant trong kiểm thử landing end-to-end.',
             $2, $2, $2, now())`,
    [TENANT_B, ownerBId],
  );

  /*
   * Ảnh mặt tiền — ẢNH CHỤP, khác hẳn hình vẽ dùng cho thẻ xe.
   *
   * 💡 Hai chỗ này có yêu cầu ngược nhau. Hero cần một tấm gây ấn tượng, xem
   *    một lần; thẻ xe cần nhất quán giữa nhiều xe và đổi màu được. Ép chúng
   *    dùng chung một trường ảnh là bắt cả hai cùng thoả hiệp.
   */
  const heroId = await themAnhThat(
    TENANT_A, 'hero-trang-chu', 'POSTER', 'xe-den-pha.jpg', 'Graham Pengelly',
  );
  await db.query(
    `UPDATE site_profile SET hero_media_id = $2 WHERE tenant_id = $1`,
    [TENANT_A, heroId],
  );

  for (const b of branchesA) {
    await db.query(
      `INSERT INTO branch_public_profile (tenant_id, branch_id, version_number, status,
                                          stable_key, public_name, public_phone, public_address,
                                          created_by, updated_by, published_by, published_at)
       SELECT $1, id, 1, 'PUBLISHED', code, name, phone, address, $2, $2, $2, now()
         FROM branch WHERE id = $3`,
      [TENANT_A, publisherId, b.id],
    );
  }

  // --- Flagship product: có spin 360° + panorama + hotspot ------------------
  const coverId = await themHinhVe(TENANT_A, 'e1-cover', 'POSTER', 'xe-ve-sedan.svg');
  const gal1Id = await createMedia(TENANT_A, 'e1-gallery-1', 'GALLERY', 'demo/e1-gallery-1.svg');
  const gal2Id = await createMedia(TENANT_A, 'e1-gallery-2', 'GALLERY', 'demo/e1-gallery-2.svg');

  const spinAssetIds: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    spinAssetIds.push(
      await createMedia(TENANT_A, `e1-spin-${i}`, 'GALLERY', `demo/e1-spin-${i}.svg`),
    );
  }
  const driverId = await createMedia(TENANT_A, 'e1-int-driver', 'PANORAMA', 'demo/e1-int-driver.svg');
  const rearId = await createMedia(TENANT_A, 'e1-int-rear', 'PANORAMA', 'demo/e1-int-rear.svg');

  const hashOf = (s: string): string => createHash('sha256').update(s).digest('hex');

  const productId = randomUUID();
  const revisionId = randomUUID();
  await db.query(
    `INSERT INTO vehicle_product (id, tenant_id, stable_key, slug, created_by, updated_by)
     VALUES ($1,$2,'product-aurora-e1','aurora-e1',$3,$3)`,
    [productId, TENANT_A, publisherId],
  );
  await db.query(
    `INSERT INTO vehicle_product_revision (id, tenant_id, product_id, revision_number, status,
                                           name, make_name, model_name, summary, description, description_document,
                                           seo_title, seo_description, content_hash,
                                           published_by, published_at, created_by, updated_by)
     VALUES ($1,$2,$3,1,'PUBLISHED','Aurora E1','Aurora','E1',
             'Xe điện đô thị nhỏ gọn, phù hợp gia đình trẻ.',
             'Aurora E1 là mẫu SUV điện đô thị nhỏ gọn, linh hoạt trong phố và tiết kiệm chi phí vận hành.',
             jsonb_build_object('type','doc','schemaVersion',1,'content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text','Aurora E1 là mẫu SUV điện đô thị nhỏ gọn, linh hoạt trong phố và tiết kiệm chi phí vận hành.'))))),
             'Aurora E1 — giá niêm yết', 'Mua Aurora E1 chính hãng, đăng ký lái thử miễn phí.',
             $4, $5, now(), $5, $5)`,
    [revisionId, TENANT_A, productId, hashOf('e1-rev-1'), publisherId],
  );
  await db.query(
    `UPDATE vehicle_product SET published_revision_id = $1, first_published_at = now()
      WHERE id = $2`,
    [revisionId, productId],
  );

  for (const [i, v] of [
    { name: 'E1 Eco', price: 315_000_000, key: 'e1-eco' },
    { name: 'E1 Plus', price: 349_000_000, key: 'e1-plus' },
  ].entries()) {
    const variantId = randomUUID();
    await db.query(
      `INSERT INTO vehicle_variant (id, tenant_id, product_id, stable_key, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5)`,
      [variantId, TENANT_A, productId, v.key, publisherId],
    );
    await db.query(
      `INSERT INTO vehicle_variant_revision (id, tenant_id, product_revision_id, variant_id,
                                             name, powertrain, model_year, display_price_amount,
                                             specifications, is_featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,'BEV',2026,$6,'{"rangeKm":210,"seats":4}'::jsonb,$7,$8)`,
      [randomUUID(), TENANT_A, revisionId, variantId, v.name, v.price, i === 0, i],
    );
  }

  for (const [i, m] of [
    { asset: coverId, role: 'POSTER', alt: 'Aurora E1 nhìn nghiêng, viền sáng trên nền tối', cover: true },
    { asset: gal1Id, role: 'GALLERY', alt: 'Aurora E1 nhìn nghiêng, viền sáng trên nền tối', cover: false },
    { asset: gal2Id, role: 'GALLERY', alt: 'Khoang lái Aurora E1', cover: false },
  ].entries()) {
    await db.query(
      `INSERT INTO vehicle_product_media (tenant_id, product_revision_id, media_asset_id, role,
                                          alt_text, sort_order, is_cover)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [TENANT_A, revisionId, m.asset, m.role, m.alt, i, m.cover],
    );
  }

  // Experience: exterior spin (8 khung + hotspot) + interior panorama (2 viewpoint)
  const spinExpId = randomUUID();
  await db.query(
    `INSERT INTO vehicle_experience (id, tenant_id, product_id, kind, stable_key, created_by, updated_by)
     VALUES ($1,$2,$3,'EXTERIOR_SPIN','exterior-360',$4,$4)`,
    [spinExpId, TENANT_A, productId, publisherId],
  );
  const spinVerId = randomUUID();
  await db.query(
    `INSERT INTO vehicle_experience_version (id, tenant_id, experience_id, revision_number, status,
                                             label, config, content_hash, published_by, published_at,
                                             created_by, updated_by)
     VALUES ($1,$2,$3,1,'PUBLISHED','Ngoại thất 360°',
             '{"kind":"EXTERIOR_SPIN","startYawDegrees":0,"hotspots":[{"id":"h1","yawDegrees":0,"title":"Đèn LED định vị ban ngày","description":"Thiết kế trẻ trung, nhận diện tốt ban ngày."},{"id":"h2","yawDegrees":90,"title":"Mâm hợp kim 16 inch","description":"Mâm 5 chấu kép thể thao."},{"id":"h3","yawDegrees":180,"title":"Cụm đèn hậu LED","description":"Dải LED hiện đại, dễ nhận diện ban đêm."},{"id":"h4","yawDegrees":270,"title":"Tay nắm cửa ẩn","description":"Mặt ngoài liền mạch, giảm nhiễu khí động."},{"id":"h5","yawDegrees":45,"title":"Cổng sạc nhanh","description":"Sạc 10-70% trong khoảng 36 phút."}]}'::jsonb,
             $4, $5, now(), $5, $5)`,
    [spinVerId, TENANT_A, spinExpId, hashOf('e1-spin-1'), publisherId],
  );
  await db.query(
    `UPDATE vehicle_experience SET published_version_id = $1 WHERE id = $2`,
    [spinVerId, spinExpId],
  );
  for (let i = 0; i < 8; i += 1) {
    await db.query(
      `INSERT INTO vehicle_experience_version_media (tenant_id, experience_version_id, media_asset_id,
                                                    binding_key, role, logical_yaw, sort_order,
                                                    accessible_label, description)
       VALUES ($1,$2,$3,$4,'SPIN_FRAME',$5,$6,$7,$8)`,
      [TENANT_A, spinVerId, spinAssetIds[i]!, `frame-${i}`, i * 45, i, `Góc ${i * 45}°`, `Ngoại thất góc ${i * 45} độ`],
    );
  }

  const intExpId = randomUUID();
  await db.query(
    `INSERT INTO vehicle_experience (id, tenant_id, product_id, kind, stable_key, created_by, updated_by)
     VALUES ($1,$2,$3,'INTERIOR_PANORAMA','interior-panorama',$4,$4)`,
    [intExpId, TENANT_A, productId, publisherId],
  );
  const intVerId = randomUUID();
  await db.query(
    `INSERT INTO vehicle_experience_version (id, tenant_id, experience_id, revision_number, status,
                                             label, config, content_hash, published_by, published_at,
                                             created_by, updated_by)
     VALUES ($1,$2,$3,1,'PUBLISHED','Tham quan nội thất',
             '{"kind":"INTERIOR_PANORAMA","initialViewpointKey":"driver","viewpoints":[{"key":"driver","name":"Ghế lái","description":"Khoang lái tối giản với màn hình trung tâm cảm ứng.","initialYaw":0,"initialPitch":0,"hotspots":[{"id":"d1","title":"Màn hình 10 inch","description":"Điều khiển giải trí và điều hoà."}]},{"key":"rear","name":"Hàng ghế sau","description":"Không gian đủ cho 4 người lớn, gập phẳng tăng khoang hành lý.","initialYaw":180,"initialPitch":0,"hotspots":[]}]}'::jsonb,
             $4, $5, now(), $5, $5)`,
    [intVerId, TENANT_A, intExpId, hashOf('e1-int-1'), publisherId],
  );
  await db.query(
    `UPDATE vehicle_experience SET published_version_id = $1 WHERE id = $2`,
    [intVerId, intExpId],
  );
  await db.query(
    `INSERT INTO vehicle_experience_version_media (tenant_id, experience_version_id, media_asset_id,
                                                  binding_key, role, scene_key, sort_order, accessible_label)
     VALUES ($1,$2,$3,'pano-driver','PANORAMA','driver',0,'Toàn cảnh ghế lái'),
            ($1,$2,$4,'pano-rear','PANORAMA','rear',1,'Toàn cảnh hàng ghế sau')`,
    [TENANT_A, intVerId, driverId, rearId],
  );

  // --- Product thứ hai: chỉ gallery, KHÔNG có experience (fallback) ----------
  /*
   * ⚠️ Xe này lên HERO của trang chủ, nên nó nhận tấm có đèn pha.
   *
   * `PublicLandingService.listProducts` xếp `ORDER BY created_at DESC`, nên
   * `products[0]` là xe được tạo SAU CÙNG — tức Meridian X5, không phải Aurora
   * E1 như thứ tự đọc trong file này gợi ý.
   *
   * 💡 Đã đổi nhầm chiều một lần vì tưởng xe khai báo trước thì đứng trước. Thứ
   *    tự trong seed KHÔNG phải thứ tự hiển thị — cái sau do câu ORDER BY quyết
   *    định, và nó nằm ở một file khác.
   */
  const coverX5Id = await themHinhVe(TENANT_A, 'x5-cover', 'POSTER', 'xe-ve-suv.svg');
  const productX5Id = randomUUID();
  const revisionX5Id = randomUUID();
  await db.query(
    `INSERT INTO vehicle_product (id, tenant_id, stable_key, slug, created_by, updated_by)
     VALUES ($1,$2,'product-meridian-x5','meridian-x5',$3,$3)`,
    [productX5Id, TENANT_A, publisherId],
  );
  await db.query(
    `INSERT INTO vehicle_product_revision (id, tenant_id, product_id, revision_number, status,
                                           name, make_name, model_name, summary, description, description_document,
                                           seo_title, seo_description, content_hash,
                                           published_by, published_at, created_by, updated_by)
     VALUES ($1,$2,$3,1,'PUBLISHED','Meridian X5','Meridian','X5',
             'SUV điện hạng B cho gia đình.',
             'Meridian X5 là mẫu SUV điện hạng B, không gian rộng và vận hành êm ái.',
             jsonb_build_object('type','doc','schemaVersion',1,'content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text','Meridian X5 là mẫu SUV điện hạng B, không gian rộng và vận hành êm ái.'))))),
             'Meridian X5 — giá niêm yết', 'Mua Meridian X5 chính hãng, nhận tư vấn miễn phí.',
             $4, $5, now(), $5, $5)`,
    [revisionX5Id, TENANT_A, productX5Id, hashOf('x5-rev-1'), publisherId],
  );
  await db.query(
    `UPDATE vehicle_product SET published_revision_id = $1, first_published_at = now() WHERE id = $2`,
    [revisionX5Id, productX5Id],
  );
  const variantX5Id = randomUUID();
  await db.query(
    `INSERT INTO vehicle_variant (id, tenant_id, product_id, stable_key, created_by, updated_by)
     VALUES ($1,$2,$3,'x5-base',$4,$4)`,
    [variantX5Id, TENANT_A, productX5Id, publisherId],
  );
  await db.query(
    `INSERT INTO vehicle_variant_revision (id, tenant_id, product_revision_id, variant_id, name,
                                           powertrain, model_year, display_price_amount, specifications,
                                           is_featured, sort_order)
     VALUES ($1,$2,$3,$4,'X5 Base','BEV',2026,$5,'{"rangeKm":399,"seats":5}'::jsonb,false,0)`,
    [randomUUID(), TENANT_A, revisionX5Id, variantX5Id, 675_000_000],
  );
  await db.query(
    `INSERT INTO vehicle_product_media (tenant_id, product_revision_id, media_asset_id, role,
                                        alt_text, sort_order, is_cover)
     VALUES ($1,$2,$3,'POSTER','Meridian X5 nhìn từ phía trước trong bóng tối, đèn pha bật sáng',0,true)`,
    [TENANT_A, revisionX5Id, coverX5Id],
  );

  /*
   * ───────────────────────────────────────────────────────────────────────────
   * Catalog thương mại — SRS-LS-EXP-001 §4.
   *
   * 🔒 Bộ số ở đây là bộ ĐỐI CHIẾU TAY: mọi con số landing hiện ra phải cộng
   *    được từ biểu phí này bằng một cái máy tính bỏ túi. Đổi một dòng ở đây là
   *    đổi kết quả của `apps/api/test/showroom.spec.ts`, và đó là chủ ý.
   *
   *    Lăn bánh = giá xe + trước bạ theo powertrain + 22.380.000
   *               (biển 20tr + đăng kiểm 340k + đường bộ 1,56tr + BHTNDS 480k)
   */
  const PHI_CO_DINH = {
    plate: 20_000_000, inspection: 340_000, road: 1_560_000, civil: 480_000,
  };
  const TINH = [
    { code: '01', name: 'Hà Nội', ice: 1200, plate: PHI_CO_DINH.plate },
    { code: '79', name: 'TP. Hồ Chí Minh', ice: 1000, plate: 20_000_000 },
    { code: '31', name: 'Hải Phòng', ice: 1000, plate: 1_000_000 },
    { code: '48', name: 'Đà Nẵng', ice: 1000, plate: 1_000_000 },
  ];
  for (const t of TINH) {
    for (const pt of ['ICE', 'HYBRID', 'BEV'] as const) {
      await db.query(
        `INSERT INTO onroad_fee_schedule
           (tenant_id, province_code, province_name, powertrain, registration_fee_rate_bp,
            plate_fee_amount, inspection_fee_amount, road_maintenance_fee_amount,
            civil_insurance_fee_amount, material_insurance_rate_bp, effective_from,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,120,'2026-07-01',$10,$10)`,
        [
          TENANT_A, t.code, t.name, pt,
          // Xe điện hiện được miễn lệ phí trước bạ — biểu diễn bằng 0 bp, và đó
          // là lý do `powertrain` phải là một chiều của khoá chứ không phải một
          // cột giá trị.
          pt === 'BEV' ? 0 : t.ice,
          t.plate, PHI_CO_DINH.inspection, PHI_CO_DINH.road, PHI_CO_DINH.civil,
          publisherId,
        ],
      );
    }
  }

  // Màu, ưu đãi, trả góp và điều khoản cọc cho Aurora E1.
  await db.query(
    `UPDATE vehicle_product_revision
        SET deposit_amount = 20000000, deposit_hold_days = 14,
            deposit_refund_text = 'Hoàn 100 % nếu huỷ trước 7 ngày'
      WHERE id = $1`,
    [revisionId],
  );
  for (const [i, c] of [
    { name: 'Xanh đại dương', hex: '#1f4d7a', kind: 'DON', surcharge: 0 },
    { name: 'Trắng ngọc trai', hex: '#e8e6e1', kind: 'KIM_LOAI', surcharge: 12_000_000 },
    { name: 'Đen huyền', hex: '#141414', kind: 'DON', surcharge: 0 },
  ].entries()) {
    await db.query(
      `INSERT INTO vehicle_color (tenant_id, product_revision_id, name, hex_code, kind, surcharge_amount, display_order)
       VALUES ($1,$2,$3,$4,$5::vehicle_color_kind,$6,$7)`,
      [TENANT_A, revisionId, c.name, c.hex, c.kind, c.surcharge, i],
    );
  }
  await db.query(
    `INSERT INTO vehicle_promotion
       (tenant_id, product_revision_id, kind, title, condition_text, value_amount,
        is_enabled, starts_at, ends_at, display_order)
     VALUES
       ($1,$2,'HO_TRO_PHI','Hỗ trợ 100 % phí đăng ký biển số','Áp dụng khi nhận xe trong tháng',20000000,true,now() - interval '10 days', now() + interval '26 days',0),
       ($1,$2,'QUA_TANG','Tặng 1 năm sạc miễn phí','Mọi trạm trong hệ thống',NULL,true,now() - interval '3 days', now() + interval '5 days',1),
       -- 🔒 "Đã hẹn": ngày bắt đầu còn ở tương lai. Không hiện trên landing
       --    nhưng PHẢI nhìn thấy trong admin, nếu không biên tập viên hẹn ưu đãi
       --    tháng sau sẽ tưởng hệ thống nuốt mất.
       ($1,$2,'GIAM_TIEN','Giảm 30 triệu cho khách đổi xe cũ','Áp dụng khi thu đổi tại showroom',30000000,true,now() + interval '20 days', now() + interval '50 days',2),
       ($1,$2,'QUA_TANG','Tặng gói bảo dưỡng 3 năm','Chương trình đã kết thúc',NULL,false,now() - interval '90 days', now() - interval '30 days',3)`,
    [TENANT_A, revisionId],
  );
  /*
   * Thư viện mẫu trả góp (0081) — nguồn để CHÉP, khai một lần cho cả tenant.
   *
   * Ba bản chép dưới đây trỏ về mẫu qua `template_id`, và VIB cố ý được chép với
   * lãi suất KHÁC mẫu: đó là ca "bản chép đã lệch so với thư viện" mà màn Ngân
   * hàng liên kết sinh ra để phát hiện. Một bộ dữ liệu mà mọi bản chép đều khớp
   * thì không thử được gì.
   */
  const MAU_TRA_GOP = [
    { ten: 'Techcombank', dpMin: 2000, uuDai: 750, thang: 12, chuan: 1050, ky: '{36,48,60,84}', dp: '{2000,3000,4000,5000}', ngay: '2026-08-28' },
    { ten: 'VPBank', dpMin: 2000, uuDai: 790, thang: 12, chuan: 1080, ky: '{36,48,60}', dp: '{2000,3000,4000}', ngay: '2026-08-28' },
    { ten: 'VIB', dpMin: 3000, uuDai: 800, thang: 6, chuan: 1100, ky: '{36,48,60}', dp: '{3000,4000,5000}', ngay: '2026-09-05' },
  ];
  const mauId: Record<string, string> = {};
  for (const [i, m] of MAU_TRA_GOP.entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO financing_program_template
         (tenant_id, bank_name, min_down_payment_bp, promo_rate_bp, promo_months,
          standard_rate_bp, allowed_terms_months, down_payment_options_bp,
          rate_updated_at, display_order, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::int[],$8::int[],$9::date,$10,$11,$11) RETURNING id`,
      [TENANT_A, m.ten, m.dpMin, m.uuDai, m.thang, m.chuan, m.ky, m.dp, m.ngay, i, publisherId],
    );
    mauId[m.ten] = rows[0]!.id;
  }

  await db.query(
    `INSERT INTO financing_program
       (tenant_id, product_revision_id, template_id, bank_name, min_down_payment_bp, promo_rate_bp,
        promo_months, standard_rate_bp, allowed_terms_months, down_payment_options_bp,
        rate_updated_at, display_order)
     VALUES
       ($1,$2,$3,'Techcombank',2000,750,12,1050,'{36,48,60,84}','{2000,3000,4000,5000}','2026-08-28',0),
       ($1,$2,$4,'VPBank',2000,790,12,1080,'{36,48,60}','{2000,3000,4000}','2026-08-28',1),
       -- ⚠️ Lệch có chủ ý: mẫu VIB đã đổi sang 8,00 %/11,00 % ngày 05/09, bản chép
       --    trên mẫu xe vẫn là 8,20 %/11,20 % của ngày 20/08.
       ($1,$2,$5,'VIB',3000,820,6,1120,'{36,48,60}','{3000,4000,5000}','2026-08-20',2)`,
    [TENANT_A, revisionId, mauId['Techcombank'], mauId['VPBank'], mauId['VIB']],
  );

  /*
   * Khả năng giao xe theo chi nhánh — KHÔNG đi qua revision (§3).
   *
   * Ba trạng thái khác nhau trên ba chi nhánh để nhãn gộp có gì để gộp: nếu mọi
   * chi nhánh cùng một trạng thái thì `nhanKhaNangGiao` không bao giờ bị thử.
   */
  const trangThaiChiNhanh: { status: string; min: number | null; max: number | null }[] = [
    { status: 'SAN_XE', min: null, max: null },
    { status: 'SAP_VE', min: 7, max: 10 },
    { status: 'DAT_HANG', min: 30, max: 45 },
  ];
  for (const [i, b] of branchesA.entries()) {
    const tt = trangThaiChiNhanh[i % trangThaiChiNhanh.length]!;
    await db.query(
      `INSERT INTO vehicle_availability
         (tenant_id, product_id, branch_id, status, lead_time_days_min, lead_time_days_max, updated_by)
       VALUES ($1,$2,$3,$4::vehicle_availability_status,$5,$6,$7)`,
      [TENANT_A, productId, b.id, tt.status, tt.min, tt.max, publisherId],
    );
  }

  /*
   * Câu hỏi thường gặp — bốn câu này TRƯỚC ĐÂY là mảng hằng trong
   * `apps/landing/src/app/lien-he/page.tsx`. Chuyển nguyên văn vào dữ liệu để
   * trang Liên hệ trông y như cũ sau khi đổi nguồn, và để có ca thử thật cho
   * `faq_placement`.
   *
   * Câu thứ năm cố ý để nháp và câu thứ sáu cố ý chỉ gắn bề mặt VEHICLE: bài
   * kiểm cần một câu KHÔNG được lọt ra `CONTACT` vì trạng thái, và một câu
   * không lọt ra vì bề mặt. Hai lý do khác nhau, hai đường rò khác nhau.
   */
  console.log('Tạo câu hỏi thường gặp...');
  const FAQ_SEED: {
    hoi: string;
    dap: string;
    chuDe: string;
    trangThai: 'DRAFT' | 'PUBLISHED';
    beMat: string[];
  }[] = [
    {
      hoi: 'Lái thử có mất phí không?',
      dap: 'Không. Lái thử miễn phí, không cần đặt cọc và không ràng buộc mua.',
      chuDe: 'Lái thử',
      trangThai: 'PUBLISHED',
      beMat: ['CONTACT', 'HOME'],
    },
    {
      hoi: 'Giá lăn bánh trên trang có đúng không?',
      dap: 'Là số ước tính theo biểu phí đang hiệu lực, hiện kèm ngày hiệu lực ngay cạnh con số. Showroom xác nhận lại khi ký hợp đồng.',
      chuDe: 'Giá và chi phí',
      trangThai: 'PUBLISHED',
      beMat: ['CONTACT', 'VEHICLE'],
    },
    {
      hoi: 'Có hỗ trợ trả góp không?',
      dap: 'Có. Khoản trả góp trên trang là con số tham khảo; ngân hàng xét hồ sơ và quyết định điều kiện vay riêng.',
      chuDe: 'Giá và chi phí',
      trangThai: 'PUBLISHED',
      beMat: ['CONTACT', 'VEHICLE'],
    },
    {
      hoi: 'Mua xe ở đây có bắt buộc bảo dưỡng ở đây không?',
      dap: 'Không bắt buộc. Nhưng xe mua tại đây được tạo hồ sơ sẵn trong hệ thống xưởng, nên lần bảo dưỡng đầu không phải khai lại từ đầu.',
      chuDe: 'Sau khi mua',
      trangThai: 'PUBLISHED',
      beMat: ['CONTACT'],
    },
    {
      hoi: 'Xe điện sạc ở đâu?',
      dap: 'Bản nháp — chưa duyệt nội dung.',
      chuDe: 'Xe điện',
      trangThai: 'DRAFT',
      beMat: ['CONTACT'],
    },
    {
      hoi: 'Pin xe điện bảo hành bao lâu?',
      dap: 'Tám năm hoặc 160.000 km, tuỳ điều kiện nào đến trước.',
      chuDe: 'Xe điện',
      trangThai: 'PUBLISHED',
      beMat: ['VEHICLE'],
    },
  ];
  for (const [i, c] of FAQ_SEED.entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO faq_item (tenant_id, question, answer, topic, display_order, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::testimonial_status,$7,$7) RETURNING id`,
      [TENANT_A, c.hoi, c.dap, c.chuDe, i, c.trangThai, publisherId],
    );
    for (const s of c.beMat) {
      await db.query(
        `INSERT INTO faq_placement (tenant_id, faq_item_id, surface) VALUES ($1,$2,$3::faq_surface)`,
        [TENANT_A, rows[0]!.id, s],
      );
    }
  }

  /*
   * Bài viết — ba bài, ba trạng thái khác nhau. Ba trạng thái đó là toàn bộ lý
   * do seed này tồn tại: một bộ dữ liệu mà mọi bài đều đã publish thì không thử
   * được điều kiện lọc nào cả.
   *
   *   1. đã publish và NỔI BẬT   → khối tràn viền đầu trang Tin tức
   *   2. đã publish, thường      → lưới bài
   *   3. mới tạo, chỉ có NHÁP    → KHÔNG được lọt ra landing
   */
  console.log('Tạo chuyên mục và bài viết...');
  const chuyenMuc: Record<string, string> = {};
  for (const [i, c] of [
    { ten: 'Kinh nghiệm mua xe', slug: 'kinh-nghiem-mua-xe' },
    { ten: 'Xe điện', slug: 'xe-dien' },
  ].entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO article_category (tenant_id, name, slug, display_order, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
      [TENANT_A, c.ten, c.slug, i, publisherId],
    );
    chuyenMuc[c.slug] = rows[0]!.id;
  }

  const doanVan = (chu: string): string =>
    JSON.stringify({
      type: 'doc',
      schemaVersion: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: chu }] }],
    });

  const BAI_SEED = [
    {
      slug: 'chi-phi-thuc-te-khi-nuoi-mot-chiec-xe-dien',
      tieuDe: 'Chi phí thực tế khi nuôi một chiếc xe điện',
      tomTat: 'Tiền điện, tiền bảo dưỡng và những khoản không ai nói trước khi bạn ký hợp đồng.',
      than: 'Xe điện rẻ hơn ở phần nhiên liệu và đắt hơn ở phần bảo hiểm. Bài này bóc từng khoản theo số liệu xưởng.',
      chuyenMuc: 'xe-dien',
      the: ['chi phí', 'xe điện'],
      dang: true,
      noiBat: true,
    },
    {
      slug: 'sau-dieu-can-kiem-truoc-khi-nhan-xe',
      tieuDe: 'Sáu điều cần kiểm trước khi nhận xe',
      tomTat: 'Danh sách kiểm tra rút ra từ những lỗi khách hay phát hiện muộn.',
      than: 'Nhận xe là lần cuối bạn có quyền từ chối mà không mất gì. Sáu mục dưới đây mất mười lăm phút.',
      chuyenMuc: 'kinh-nghiem-mua-xe',
      the: ['nhận xe'],
      dang: true,
      noiBat: false,
    },
    {
      slug: 'bao-duong-mua-mua',
      tieuDe: 'Bảo dưỡng mùa mưa',
      tomTat: null,
      than: 'Bản nháp — chưa duyệt.',
      chuyenMuc: 'kinh-nghiem-mua-xe',
      the: [],
      dang: false,
      noiBat: false,
    },
  ];

  for (const b of BAI_SEED) {
    const { rows: bai } = await db.query<{ id: string }>(
      `INSERT INTO article (tenant_id, slug, category_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4) RETURNING id`,
      [TENANT_A, b.slug, chuyenMuc[b.chuyenMuc], publisherId],
    );
    const baiId = bai[0]!.id;
    const { rows: rev } = await db.query<{ id: string }>(
      `INSERT INTO article_revision
         (tenant_id, article_id, revision_number, status, title, excerpt, body_document,
          content_hash, created_by, updated_by)
       VALUES ($1,$2,1,'DRAFT',$3,$4,$5::jsonb,$6,$7,$7) RETURNING id`,
      [TENANT_A, baiId, b.tieuDe, b.tomTat, doanVan(b.than), `seed-${b.slug}`, publisherId],
    );
    await db.query('UPDATE article SET draft_revision_id = $2 WHERE id = $1', [baiId, rev[0]!.id]);
    for (const t of b.the) {
      await db.query('INSERT INTO article_tag (tenant_id, article_id, tag) VALUES ($1,$2,$3)', [
        TENANT_A, baiId, t,
      ]);
    }
    if (b.dang) {
      await db.query(
        `UPDATE article_revision SET status='PUBLISHED', published_at=now(), published_by=$2 WHERE id=$1`,
        [rev[0]!.id, publisherId],
      );
      await db.query(
        `UPDATE article SET published_revision_id=$2, draft_revision_id=NULL,
                            published_at=now(), featured=$3 WHERE id=$1`,
        [baiId, rev[0]!.id, b.noiBat],
      );
    }
  }

  /*
   * Điều hướng — bộ mặc định, khớp ĐÚNG mảng `MAC_DINH` trong `site-header.tsx`
   * và `site-footer.tsx`. Khớp là điều kiện để đổi nguồn dữ liệu mà người dùng
   * không thấy gì đổi; lệch là một lỗi hiển thị chỉ hiện ra sau khi seed chạy.
   */
  console.log('Tạo menu và chuyển hướng...');
  const MENU: { vt: 'HEADER' | 'FOOTER'; cot: number; nhan: string; duong: string }[] = [
    { vt: 'HEADER', cot: 0, nhan: 'Xe đang bán', duong: '/xe' },
    { vt: 'HEADER', cot: 0, nhan: 'Giá lăn bánh', duong: '/#gia-lan-banh' },
    { vt: 'HEADER', cot: 0, nhan: 'Tin tức', duong: '/tin-tuc' },
    { vt: 'HEADER', cot: 0, nhan: 'Liên hệ', duong: '/lien-he' },
    { vt: 'FOOTER', cot: 0, nhan: 'Xe đang bán', duong: '/xe' },
    { vt: 'FOOTER', cot: 0, nhan: 'Giá lăn bánh', duong: '/#gia-lan-banh' },
    { vt: 'FOOTER', cot: 0, nhan: 'Đăng ký lái thử', duong: '/lien-he?nhu-cau=lai-thu' },
    { vt: 'FOOTER', cot: 1, nhan: 'Tin tức', duong: '/tin-tuc' },
    { vt: 'FOOTER', cot: 1, nhan: 'Gửi yêu cầu tư vấn', duong: '/lien-he' },
    { vt: 'FOOTER', cot: 1, nhan: 'Hệ thống showroom', duong: '/#chi-nhanh' },
  ];
  for (const [i, m] of MENU.entries()) {
    await db.query(
      `INSERT INTO site_navigation
         (tenant_id, placement, column_index, label, path, display_order, created_by, updated_by)
       VALUES ($1,$2::nav_placement,$3,$4,$5,$6,$7,$7)`,
      [TENANT_A, m.vt, m.cot, m.nhan, m.duong, i, publisherId],
    );
  }

  /*
   * Một chuyển hướng thật để bài kiểm có gì để thử: `/tin-tuc-cu` là đường dẫn
   * của bản trang cũ. Đây đúng ca dùng mà bảng này sinh ra — đổi cấu trúc URL mà
   * không bỏ rơi link đã có ngoài internet.
   */
  await db.query(
    `INSERT INTO site_redirect (tenant_id, from_path, to_path, status_code, note, created_by, updated_by)
     VALUES ($1,'/tin-tuc-cu','/tin-tuc',301,'Đường dẫn của bản trang trước',$2,$2)`,
    [TENANT_A, publisherId],
  );

  /*
   * Biểu mẫu và câu đồng ý.
   *
   * 🔒 Phiên bản `2026-08-1` trùng ĐÚNG hằng số `LEAD_CONSENT_VERSION` trong
   *    `sales.service.ts`, và câu chữ trùng đúng chuỗi từng nằm trong JSX của
   *    `lead-form.tsx`. Trùng là điều kiện để lead cũ và lead mới cùng trỏ về một
   *    nội dung đọc lại được; lệch là tạo ra đúng cái lỗ mà 0079 sinh ra để bịt.
   */
  console.log('Tạo biểu mẫu và câu đồng ý...');
  const { rows: bm } = await db.query<{ id: string }>(
    `INSERT INTO lead_form (tenant_id, code, created_by, updated_by)
     VALUES ($1,'LANDING',$2,$2) RETURNING id`,
    [TENANT_A, publisherId],
  );
  await db.query(
    `INSERT INTO lead_form_consent_version (tenant_id, form_id, version, body, effective_from, created_by)
     VALUES ($1,$2,'2026-08-1',$3, now() - interval '30 days', $4)`,
    [
      TENANT_A,
      bm[0]!.id,
      'Tôi đồng ý để showroom liên hệ tư vấn theo thông tin đã cung cấp',
      publisherId,
    ],
  );

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
