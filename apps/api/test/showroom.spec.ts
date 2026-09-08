import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';

/**
 * Catalog thương mại — SRS-LS-EXP-001 §4, bất biến `INV-LS-16` → `INV-LS-22`.
 *
 * 🔒 Bộ số ở đây khớp với `infra/seed.ts` và với thiết kế Pencil. Chúng là dữ
 *    liệu ĐỐI CHIẾU TAY: nếu một con số ở đây đổi mà không ai đổi seed và thiết
 *    kế theo, thì ba nơi đang nói ba chuyện khác nhau — đúng loại lỗi mà vòng
 *    rà soát 2026-09-04 tìm ra năm lần trong một bộ thiết kế.
 */

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? 'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const TENANT_A = '11111111-1111-1111-1111-111111111111';

let admin: Pool;
/** Pool bằng ROLE ỨNG DỤNG — dùng để chứng minh database chặn, không phải controller. */
let app: Pool;
let publisher = '';
let editor = '';
let advisor = '';
let ownerB = '';
let productId = '';
let revisionId = '';

async function login(phone: string): Promise<string> {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
    body: JSON.stringify({ phone, password: 'demo1234' }),
  });
  const body = (await r.json()) as { accessToken?: string };
  assert.ok(body.accessToken, `đăng nhập ${phone} thất bại`);
  return body.accessToken;
}

async function api(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

function hostHeaders(host = 'localhost'): Record<string, string> {
  const sig = createHmac('sha256', process.env.EDGE_SIGNING_SECRET ?? 'test-edge-secret').update(host).digest('hex');
  return { 'x-garageos-original-host': host, 'x-garageos-original-host-signature': sig };
}

async function publicGet(path: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${API}${path}`, { headers: hostHeaders() });
  return { status: r.status, body: await r.json().catch(() => null) };
}

before(async () => {
  admin = new Pool({ connectionString: ADMIN_URL });
  app = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos',
  });
  [publisher, editor, advisor, ownerB] = await Promise.all([
    login('0901000011'), login('0901000010'), login('0901000012'), login('0902000001'),
  ]);
  const { rows } = await admin.query<{ id: string; rev: string }>(
    `SELECT id, published_revision_id AS rev FROM vehicle_product
      WHERE tenant_id = $1 AND slug = 'aurora-e1'`,
    [TENANT_A],
  );
  productId = rows[0]!.id;
  revisionId = rows[0]!.rev;
});

after(async () => {
  await admin.query(`DELETE FROM onroad_fee_schedule WHERE province_code = '99'`);
  await admin.end();
  await app.end();
});

describe('Giá lăn bánh — INV-LS-16', () => {
  test('bóc giá công khai cộng đúng và tổng bằng tổng các dòng trong tổng', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    assert.equal(r.status, 200);
    assert.equal(r.body.reason, null);

    const lines: { key: string; amount: string; insideTotal: boolean }[] = r.body.breakdown.lines;
    const cong = lines.filter((l) => l.insideTotal).reduce((s, l) => s + BigInt(l.amount), 0n);
    assert.equal(BigInt(r.body.breakdown.total), cong, 'tổng phải bằng tổng các dòng — không có số hạng ẩn');

    // E1 Eco 315.000.000 (BEV, trước bạ 0 %) + 22.380.000
    assert.equal(r.body.breakdown.total, '337380000');
  });

  test('🔒 bảo hiểm vật chất nằm NGOÀI tổng, không phải một dòng cộng vào', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    const vatChat = (r.body.breakdown.lines as { key: string; insideTotal: boolean }[])
      .find((l) => l.key === 'materialInsurance');
    assert.ok(vatChat, 'phải có dòng bảo hiểm vật chất để khách biết khoản đó tồn tại');
    assert.equal(vatChat.insideTotal, false);
  });

  test('🔒 kết quả luôn kèm nguồn — tỉnh, ngày hiệu lực, loại động cơ', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    assert.deepEqual(r.body.breakdown.source, {
      provinceName: 'Hà Nội', effectiveFrom: '2026-07-01', powertrain: 'BEV',
    });
  });

  test('🔒 tỉnh chưa có biểu phí thì nói thẳng, KHÔNG rơi về tỉnh khác', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=92');
    assert.equal(r.status, 200);
    assert.equal(r.body.reason, 'NO_FEE_SCHEDULE');
    assert.equal(r.body.breakdown, undefined, 'không được trả về một phép cộng của tỉnh khác');
  });

  test('thiếu mã tỉnh thì từ chối, không đoán một tỉnh mặc định', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh');
    assert.equal(r.status, 400);
  });

  test('trước bạ phụ thuộc loại động cơ — cùng tỉnh, xe xăng cộng thêm 12 %', async () => {
    const { rows } = await admin.query<{ bev: number; ice: number }>(
      `SELECT max(registration_fee_rate_bp) FILTER (WHERE powertrain='BEV') AS bev,
              max(registration_fee_rate_bp) FILTER (WHERE powertrain='ICE') AS ice
         FROM onroad_fee_schedule WHERE tenant_id=$1 AND province_code='01'`,
      [TENANT_A],
    );
    assert.equal(Number(rows[0]!.bev), 0);
    assert.equal(Number(rows[0]!.ice), 1200);
  });
});

describe('Biểu phí lăn bánh — ràng buộc ở tầng DB', () => {
  test('🔒 hai biểu phí chồng thời gian cho cùng (tỉnh, động cơ) bị chặn', async () => {
    await admin.query(
      `INSERT INTO onroad_fee_schedule
         (tenant_id, province_code, province_name, powertrain, registration_fee_rate_bp,
          plate_fee_amount, inspection_fee_amount, road_maintenance_fee_amount,
          civil_insurance_fee_amount, effective_from, effective_to, created_by, updated_by)
       VALUES ($1,'99','Tỉnh kiểm thử','BEV',0,1000000,340000,1560000,480000,'2026-01-01','2027-01-01',
               (SELECT id FROM app_user WHERE tenant_id=$1 LIMIT 1),
               (SELECT id FROM app_user WHERE tenant_id=$1 LIMIT 1))`,
      [TENANT_A],
    );
    await assert.rejects(
      admin.query(
        `INSERT INTO onroad_fee_schedule
           (tenant_id, province_code, province_name, powertrain, registration_fee_rate_bp,
            plate_fee_amount, inspection_fee_amount, road_maintenance_fee_amount,
            civil_insurance_fee_amount, effective_from, created_by, updated_by)
         VALUES ($1,'99','Tỉnh kiểm thử','BEV',0,1000000,340000,1560000,480000,'2026-06-01',
                 (SELECT id FROM app_user WHERE tenant_id=$1 LIMIT 1),
                 (SELECT id FROM app_user WHERE tenant_id=$1 LIMIT 1))`,
        [TENANT_A],
      ),
      /no_overlapping_onroad_fee|exclusion/i,
      'chồng lấn nghĩa là câu hỏi "hôm nay phí bao nhiêu" có hai đáp án',
    );
  });

  test('phụ phí đại lý phải có tên riêng, không núp dưới tên đăng kiểm', async () => {
    const r = await api('PUT', '/api/v1/showroom/fee-schedules', publisher, {
      provinceCode: '99', provinceName: 'Tỉnh kiểm thử', powertrain: 'ICE',
      registrationFeeRateBp: 1000, plateFeeAmount: 1_000_000, inspectionFeeAmount: 340_000,
      roadMaintenanceFeeAmount: 1_560_000, civilInsuranceFeeAmount: 480_000,
      dealerFeeAmount: 5_000_000, effectiveFrom: '2028-01-01',
    });
    assert.equal(r.status, 400);
  });
});

describe('Trả góp — INV-LS-18', () => {
  test('🔒 trả về hai giai đoạn với hai số tiền khác nhau', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01&termMonths=60&downPaymentBp=3000');
    const tech = r.body.financing.find((f: { bankName: string }) => f.bankName === 'Techcombank');
    assert.ok(tech, 'seed phải có Techcombank');
    assert.equal(tech.quote.phases.length, 2, 'lãi hai giai đoạn phải cho hai đoạn kỳ');
    assert.notEqual(tech.quote.phases[0].monthlyAmount, tech.quote.phases[1].monthlyAmount);
    assert.equal(tech.quote.phases[0].toPeriod, 12);
    assert.equal(tech.quote.phases[1].toPeriod, 60);
  });

  test('tổng đã trả = gốc + lãi, và mọi số tiền là chuỗi số nguyên đồng', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    const q = r.body.financing[0].quote;
    assert.equal(BigInt(q.totalPaid), BigInt(q.principal) + BigInt(q.totalInterest));
    for (const p of q.phases) assert.match(String(p.monthlyAmount), /^\d+$/, 'tiền phải là số nguyên, không có dấu phẩy động');
  });

  test('🔒 kỳ hạn ngoài danh sách ngân hàng khai thì bị từ chối', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM financing_program WHERE product_revision_id=$1 AND bank_name='Techcombank'`,
      [revisionId],
    );
    const r = await api('GET', `/api/v1/showroom/financing-quote?programId=${rows[0]!.id}&basePrice=337380000&downPaymentBp=3000&termMonths=13`, publisher);
    assert.equal(r.status, 400, 'nhận kỳ hạn tuỳ ý là để client tự bịa ra một sản phẩm tài chính');
  });

  test('trả trước thấp hơn mức tối thiểu của ngân hàng thì bị từ chối', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM financing_program WHERE product_revision_id=$1 AND bank_name='VIB'`,
      [revisionId],
    );
    const r = await api('GET', `/api/v1/showroom/financing-quote?programId=${rows[0]!.id}&basePrice=337380000&downPaymentBp=1000&termMonths=48`, publisher);
    assert.equal(r.status, 400);
  });
});

describe('Ưu đãi — INV-LS-19', () => {
  test('🔒 landing chỉ thấy ưu đãi đang chạy; hẹn, hết hạn và đã tắt đều không lọt', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    const titles = (r.body.promotions as { title: string }[]).map((p) => p.title);
    assert.ok(titles.includes('Hỗ trợ 100 % phí đăng ký biển số'));
    assert.equal(titles.includes('Giảm 30 triệu cho khách đổi xe cũ'), false, 'ưu đãi chưa tới ngày bắt đầu không được hiện');
    assert.equal(titles.includes('Tặng gói bảo dưỡng 3 năm'), false, 'ưu đãi đã tắt và đã hết hạn không được hiện');
  });

  test('admin thấy đủ bốn trạng thái, kèm "Đã hẹn"', async () => {
    const r = await api('GET', `/api/v1/showroom/revisions/${revisionId}/promotions`, editor);
    assert.equal(r.status, 200);
    const states = new Set((r.body.items as { state: string }[]).map((p) => p.state));
    assert.ok(states.has('DANG_CHAY'));
    assert.ok(states.has('DA_HEN'), 'biên tập viên hẹn ưu đãi tháng sau phải nhìn thấy nó');
    assert.ok(states.has('DA_TAT'));
  });

  test('🔒 ưu đãi trị giá 0 đồng bị chặn ở ràng buộc DB, không chỉ ở giao diện', async () => {
    await assert.rejects(
      admin.query(
        `INSERT INTO vehicle_promotion (tenant_id, product_revision_id, kind, title, value_amount, starts_at)
         VALUES ($1,$2,'GIAM_TIEN','Ưu đãi rỗng',0,now())`,
        [TENANT_A, revisionId],
      ),
      /promotion_value_positive/,
    );
  });

  test('ưu đãi giảm tiền mà không có số tiền cũng bị chặn', async () => {
    await assert.rejects(
      admin.query(
        `INSERT INTO vehicle_promotion (tenant_id, product_revision_id, kind, title, starts_at)
         VALUES ($1,$2,'GIAM_TIEN','Giảm không rõ bao nhiêu',now())`,
        [TENANT_A, revisionId],
      ),
      /promotion_money_kinds_need_amount/,
    );
  });
});

describe('Tồn và giao xe — INV-LS-17', () => {
  test('🔒 nhãn gộp nêu phạm vi, và không có số lượng xe ở bất kỳ đâu', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    assert.ok(r.body.availability, 'seed đã khai khả năng giao cho các chi nhánh');
    assert.match(r.body.availability.label as string, /chi nhánh|ngày/, 'nhãn phải nói phạm vi hoặc thời gian');
    assert.equal(JSON.stringify(r.body.availability).includes('quantity'), false);
  });

  test('🔒 bảng vehicle_availability không có cột số lượng', async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicle_availability'`,
    );
    const ten = rows.map((r) => r.column_name);
    assert.equal(ten.some((c) => /quantity|qty|stock|so_luong/.test(c)), false,
      'không lưu số thì không thể vô tình hiển thị số');
  });

  test('🔒 "Sẵn xe" mà vẫn khai thời gian chờ bị chặn ở DB', async () => {
    // Dùng mẫu xe CHƯA có dòng khả năng giao nào, để lỗi bật ra là lỗi của
    // CHECK chứ không phải của khoá trùng — nếu không thì test xanh vì lý do sai.
    const { rows } = await admin.query<{ branchId: string; productId: string }>(
      `SELECT (SELECT b.id FROM branch b WHERE b.tenant_id=$1 LIMIT 1) AS "branchId",
              (SELECT p.id FROM vehicle_product p WHERE p.tenant_id=$1 AND p.slug='meridian-x5') AS "productId"`,
      [TENANT_A],
    );
    await assert.rejects(
      admin.query(
        `INSERT INTO vehicle_availability (tenant_id, product_id, branch_id, status,
            lead_time_days_min, lead_time_days_max, updated_by)
         VALUES ($1,$2,$3,'SAN_XE',7,10,(SELECT id FROM app_user WHERE tenant_id=$1 LIMIT 1))`,
        [TENANT_A, rows[0]!.productId, rows[0]!.branchId],
      ),
      /availability_status_matches_lead_time/,
      'Sẵn xe kèm thời gian chờ là hai phát biểu mâu thuẫn trên cùng một dòng',
    );
  });

  test('🔒 "Sắp về" mà KHÔNG khai thời gian chờ cũng bị chặn', async () => {
    const { rows } = await admin.query<{ branchId: string; productId: string }>(
      `SELECT (SELECT b.id FROM branch b WHERE b.tenant_id=$1 LIMIT 1) AS "branchId",
              (SELECT p.id FROM vehicle_product p WHERE p.tenant_id=$1 AND p.slug='meridian-x5') AS "productId"`,
      [TENANT_A],
    );
    await assert.rejects(
      admin.query(
        `INSERT INTO vehicle_availability (tenant_id, product_id, branch_id, status, updated_by)
         VALUES ($1,$2,$3,'SAP_VE',(SELECT id FROM app_user WHERE tenant_id=$1 LIMIT 1))`,
        [TENANT_A, rows[0]!.productId, rows[0]!.branchId],
      ),
      /availability_status_matches_lead_time/,
      'nói "sắp về" mà không nói bao giờ là không nói gì cả',
    );
  });

  test('tư vấn bán hàng cập nhật được chi nhánh mình, không cần quyền sửa nội dung', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT ub.branch_id AS id FROM user_branch ub
         JOIN app_user u ON u.id = ub.user_id
        WHERE u.phone = '0901000012' LIMIT 1`,
    );
    const r = await api('PUT', `/api/v1/showroom/products/${productId}/availability`, advisor, {
      branchId: rows[0]!.id, status: 'SAP_VE', leadTimeDaysMin: 5, leadTimeDaysMax: 9,
      availableVariantIds: [], availableColorIds: [], note: 'Xe về đầu tháng',
    });
    assert.equal(r.status, 200);
  });

  test('🔒 không sửa được chi nhánh khác — kiểm ở service, không ở giao diện', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT b.id FROM branch b
        WHERE b.tenant_id = $1
          AND b.id NOT IN (SELECT ub.branch_id FROM user_branch ub JOIN app_user u ON u.id = ub.user_id WHERE u.phone = '0901000012')
        LIMIT 1`,
      [TENANT_A],
    );
    const r = await api('PUT', `/api/v1/showroom/products/${productId}/availability`, advisor, {
      branchId: rows[0]!.id, status: 'SAN_XE', availableVariantIds: [], availableColorIds: [],
    });
    assert.equal(r.status, 422, 'sai phạm vi không phải là thiếu quyền — hai chuyện khác nhau');
  });

  test('sửa tồn xe để lại vết trong audit_log — §4.5, không thêm bảng thứ hai', async () => {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_log
        WHERE tenant_id=$1 AND action = 'SHOWROOM_AVAILABILITY_UPDATED'`,
      [TENANT_A],
    );
    assert.ok(Number(rows[0]!.n) > 0);
  });
});

describe('Nhật ký giá — INV-LS-20', () => {
  test('🔒 đổi giá bắt buộc có lý do', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT v.id FROM vehicle_variant v WHERE v.product_id = $1 LIMIT 1`, [productId],
    );
    const r = await api('POST', `/api/v1/showroom/products/${productId}/price`, publisher, {
      variantId: rows[0]!.id, newAmount: 320_000_000, reason: '',
    });
    assert.equal(r.status, 400, 'nhật ký không trả lời được "vì sao" là nhật ký để trưng bày');
  });

  test('🔒 nhật ký giá không sửa và không xoá được, kể cả bằng quyền admin của app', async () => {
    const appPool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos',
    });
    try {
      await appPool.query('BEGIN');
      await appPool.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      await assert.rejects(
        appPool.query('UPDATE vehicle_price_log SET reason = $1 WHERE tenant_id = $2', ['sửa lén', TENANT_A]),
        /permission denied|chỉ được INSERT/i,
      );
      await appPool.query('ROLLBACK');
    } finally {
      await appPool.end();
    }
  });

  test('🔒 biên tập viên nội dung KHÔNG có quyền đổi giá — INV-LS-21', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT v.id FROM vehicle_variant v WHERE v.product_id = $1 LIMIT 1`, [productId],
    );
    const r = await api('POST', `/api/v1/showroom/products/${productId}/price`, editor, {
      variantId: rows[0]!.id, newAmount: 320_000_000, reason: 'Thử vượt quyền',
    });
    assert.equal(r.status, 403);
  });

  test('tenant khác không đọc được biểu phí của tenant này', async () => {
    const r = await api('GET', '/api/v1/showroom/fee-schedules?provinceCode=01', ownerB);
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 0, 'RLS FORCE là chốt chặn, không phải WHERE viết tay');
  });
});

describe('Ranh giới hiển thị ≠ giao dịch', () => {
  test('🔒 không endpoint nào của showroom nhận tiền hay tạo hồ sơ vay', async () => {
    for (const path of ['/api/v1/showroom/payments', '/api/v1/showroom/loan-applications', '/api/v1/showroom/checkout']) {
      const r = await api('POST', path, publisher, {});
      assert.equal(r.status, 404, `${path} không được tồn tại — ranh giới phải kiểm được bằng test`);
    }
  });

  test('điều khoản cọc và giá thuê pin đến được landing, không nằm chết trong admin', async () => {
    const r = await publicGet('/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01');
    assert.ok(r.body.deposit, 'điều khoản cọc nhập ở admin phải hiện được ra landing');
    assert.equal(r.body.deposit.amount, '20000000');
    assert.equal(r.body.deposit.holdDays, 14);
    assert.ok('batteryRentalAmount' in r.body, 'giá thuê pin phải có mặt trong hợp đồng dữ liệu');
  });
});

describe('Màu xe — sửa danh sách màu KHÔNG được làm rụng ảnh', () => {
  /*
   * 🔒 `vehicle_product_media.color_id` trỏ tới `vehicle_color` bằng khoá ngoại
   *    `ON DELETE SET NULL` (0072). Nên bất kỳ cách nào XOÁ một màu để rồi chèn
   *    lại nó cũng cắt liên kết ảnh — im lặng, vì `SET NULL` không phải lỗi.
   *
   * Bài này dựng một bản NHÁP (revision đã publish là bất biến — INV-LS-13),
   * gắn một tấm ảnh vào một màu, rồi gọi đúng thao tác mà biên tập viên làm:
   * sửa một màu khác trong cùng danh sách. Ảnh phải còn nguyên màu của nó.
   */
  let revNhap = '';
  let mauGiuId = '';
  let anhId = '';

  before(async () => {
    const r = await api('POST', `/api/v1/marketing/vehicle-products/${productId}/draft`, editor);
    assert.ok(r.status === 200 || r.status === 201, `không tạo được bản nháp: ${JSON.stringify(r.body)}`);
    const { rows } = await admin.query<{ id: string }>(
      `SELECT draft_revision_id AS id FROM vehicle_product WHERE id = $1`,
      [productId],
    );
    revNhap = rows[0]!.id;

    const dat = await api('PUT', `/api/v1/showroom/revisions/${revNhap}/colors`, editor, [
      { name: 'Trắng Ngọc Trai', hexCode: '#f2f2f0', kind: 'DON', surchargeAmount: 0, displayOrder: 0 },
      { name: 'Đỏ Bình Minh', hexCode: '#c73526', kind: 'DAC_BIET', surchargeAmount: 12000000, displayOrder: 1 },
    ]);
    assert.equal(dat.status, 200, `không đặt được màu: ${JSON.stringify(dat.body)}`);

    const { rows: mau } = await admin.query<{ id: string }>(
      `SELECT id FROM vehicle_color WHERE product_revision_id = $1 AND name = 'Trắng Ngọc Trai'`,
      [revNhap],
    );
    mauGiuId = mau[0]!.id;

    const { rows: asset } = await admin.query<{ id: string }>(
      `SELECT id FROM media_asset WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    const { rows: anh } = await admin.query<{ id: string }>(
      `INSERT INTO vehicle_product_media
         (tenant_id, product_revision_id, media_asset_id, color_id, role, sort_order, alt_text)
       VALUES ($1,$2,$3,$4,'GALLERY',0,'Ảnh màu trắng') RETURNING id`,
      [TENANT_A, revNhap, asset[0]!.id, mauGiuId],
    );
    anhId = anh[0]!.id;
  });

  test('🔒 sửa một màu KHÁC không được làm ảnh rời khỏi màu của nó', async () => {
    const r = await api('PUT', `/api/v1/showroom/revisions/${revNhap}/colors`, editor, [
      // giữ nguyên tên, đổi phụ thu — đây là thao tác "sửa", không phải "xoá"
      { name: 'Trắng Ngọc Trai', hexCode: '#f2f2f0', kind: 'DON', surchargeAmount: 0, displayOrder: 0 },
      { name: 'Đỏ Bình Minh', hexCode: '#c73526', kind: 'DAC_BIET', surchargeAmount: 15000000, displayOrder: 1 },
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const { rows } = await admin.query<{ color_id: string | null }>(
      `SELECT color_id FROM vehicle_product_media WHERE id = $1`,
      [anhId],
    );
    assert.equal(
      rows[0]!.color_id,
      mauGiuId,
      'ảnh đã rời khỏi màu — danh sách màu đang bị xoá sạch rồi chèn lại thay vì ghi đè theo tên',
    );

    const { rows: doi } = await admin.query<{ surcharge_amount: string }>(
      `SELECT surcharge_amount FROM vehicle_color WHERE product_revision_id = $1 AND name = 'Đỏ Bình Minh'`,
      [revNhap],
    );
    assert.equal(doi[0]!.surcharge_amount, '15000000', 'phụ thu mới phải được ghi đè');
  });

  test('màu bị bỏ khỏi danh sách thì phải biến mất thật', async () => {
    const r = await api('PUT', `/api/v1/showroom/revisions/${revNhap}/colors`, editor, [
      { name: 'Trắng Ngọc Trai', hexCode: '#f2f2f0', kind: 'DON', surchargeAmount: 0, displayOrder: 0 },
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const { rows } = await admin.query<{ name: string }>(
      `SELECT name FROM vehicle_color WHERE product_revision_id = $1`,
      [revNhap],
    );
    assert.deepEqual(rows.map((x) => x.name), ['Trắng Ngọc Trai']);

    // Và màu còn lại vẫn giữ đúng id cũ — ảnh vẫn dính
    const { rows: anh } = await admin.query<{ color_id: string | null }>(
      `SELECT color_id FROM vehicle_product_media WHERE id = $1`,
      [anhId],
    );
    assert.equal(anh[0]!.color_id, mauGiuId);
  });
});

describe('Thư viện trả góp — mẫu là nguồn để CHÉP, không phải nguồn đọc lúc hiển thị', () => {
  /*
   * 🔒 Đánh đổi trung tâm của lát cắt này (migration 0081):
   *
   * Cho `financing_program` trỏ tới mẫu và đọc lãi suất từ mẫu lúc render sẽ vi
   * phạm INV-LS-13 — sửa lãi suất trong thư viện đổi con số trên MỌI trang xe đã
   * xuất bản, không qua một lần publish nào, không ai duyệt. Với con số khách in
   * ra mang tới ngân hàng thì đó là hỏng, không phải tiện.
   *
   * Nên mẫu được CHÉP, và cái giá của việc chép là bản chép lệch dần. Bài kiểm
   * dưới đây canh đúng cái giá đó: lệch phải NHÌN THẤY ĐƯỢC.
   */

  test('seed có ba mẫu, và VIB đang lệch so với bản chép trên mẫu xe', async () => {
    const r = await api('GET', '/api/v1/showroom/financing-templates', publisher);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const items = r.body.items as { bankName: string; usedByCount: number; driftCount: number }[];
    assert.deepEqual(items.map((t) => t.bankName).sort(), ['Techcombank', 'VIB', 'VPBank']);

    const vib = items.find((t) => t.bankName === 'VIB')!;
    assert.equal(vib.usedByCount, 1);
    assert.equal(vib.driftCount, 1, 'mẫu VIB đã đổi lãi suất, bản chép trên mẫu xe vẫn là bản cũ');

    const tcb = items.find((t) => t.bankName === 'Techcombank')!;
    assert.equal(tcb.driftCount, 0, 'Techcombank khớp mẫu, không được báo lệch');
  });

  test('🔒 báo lệch nói rõ bản lệch đang HIỆN CHO KHÁCH hay chỉ ở nháp', async () => {
    const r = await api('GET', '/api/v1/showroom/financing-drift', publisher);
    assert.equal(r.status, 200);
    const items = r.body.items as { bankName: string; published: boolean; productSlug: string }[];
    const vib = items.find((t) => t.bankName === 'VIB');
    assert.ok(vib !== undefined, 'bản chép lệch phải xuất hiện trong báo lệch');
    assert.equal(vib.published, true, 'bản lệch nằm ở revision đã publish — khách đang thấy số cũ');
    assert.equal(vib.productSlug, 'aurora-e1');
  });

  test('🔒 sửa mẫu KHÔNG đổi con số trên trang xe đã xuất bản', async () => {
    /*
     * Đây là bài kiểm giữ INV-LS-13 khỏi bị phá bởi chính tính năng này. Nếu ai
     * đó sau này đổi sang "đọc thẳng từ mẫu", bài này đỏ.
     */
    const truoc = await fetch(
      `${API}/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01`,
      { headers: hostHeaders() },
    );
    const bodyTruoc = (await truoc.json()) as { financing: { bankName: string }[] };
    const soTruoc = JSON.stringify(bodyTruoc.financing);

    const ds = await api('GET', '/api/v1/showroom/financing-templates', publisher);
    const tcb = (ds.body.items as { id: string; bankName: string; version: number }[])
      .find((t) => t.bankName === 'Techcombank')!;

    const sua = await api('PATCH', `/api/v1/showroom/financing-templates/${tcb.id}`, publisher, {
      bankName: 'Techcombank',
      bankLogoMediaId: null,
      minDownPaymentBp: 2000,
      promoRateBp: 999,
      promoMonths: 12,
      standardRateBp: 1499,
      allowedTermsMonths: [36, 48, 60, 84],
      downPaymentOptionsBp: [2000, 3000, 4000, 5000],
      rateUpdatedAt: '2026-09-08',
      displayOrder: 0,
      isActive: true,
    });
    assert.equal(sua.status, 200, JSON.stringify(sua.body));

    const sau = await fetch(
      `${API}/api/v1/public/vehicle-products/aurora-e1/gia-lan-banh?provinceCode=01`,
      { headers: hostHeaders() },
    );
    const bodySau = (await sau.json()) as { financing: { bankName: string }[] };
    assert.equal(
      JSON.stringify(bodySau.financing),
      soTruoc,
      'sửa mẫu đã đổi con số trên trang đã xuất bản — vi phạm INV-LS-13',
    );

    // Nhưng LỆCH thì phải hiện ra ngay
    const lech = await api('GET', '/api/v1/showroom/financing-drift', publisher);
    assert.ok(
      (lech.body.items as { bankName: string }[]).some((t) => t.bankName === 'Techcombank'),
      'sửa mẫu mà không báo lệch thì bản chép cũ trôi đi không ai biết',
    );

    /*
     * Trả mẫu về đúng số của seed.
     *
     * ⚠️ Bỏ bước này thì bài kiểm ĐẦU của nhóm đỏ ở lượt chạy thứ hai: nó đòi
     *    Techcombank có `driftCount = 0`, mà lượt trước đã làm nó lệch. Bài kiểm
     *    xanh-ở-lượt-đầu-đỏ-ở-lượt-sau là bài kiểm không dùng được, và cách hỏng
     *    đó chỉ lộ ra khi chạy cả bộ chứ không phải khi chạy riêng một file.
     */
    await api('PATCH', `/api/v1/showroom/financing-templates/${tcb.id}`, publisher, {
      bankName: 'Techcombank',
      bankLogoMediaId: null,
      minDownPaymentBp: 2000,
      promoRateBp: 750,
      promoMonths: 12,
      standardRateBp: 1050,
      allowedTermsMonths: [36, 48, 60, 84],
      downPaymentOptionsBp: [2000, 3000, 4000, 5000],
      rateUpdatedAt: '2026-08-28',
      displayOrder: 0,
      isActive: true,
    });
  });

  test('🔒 áp mẫu vào bản ĐÃ PUBLISH bị từ chối, kèm câu tiếng Việt', async () => {
    const ds = await api('GET', '/api/v1/showroom/financing-templates', publisher);
    const tcb = (ds.body.items as { id: string; bankName: string }[])
      .find((t) => t.bankName === 'Techcombank')!;
    const r = await api(
      'POST',
      `/api/v1/showroom/revisions/${revisionId}/financing/from-template/${tcb.id}`,
      publisher,
    );
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(String(r.body.error.message), /bản NHÁP|bất biến/i);
  });

  test('🔒 xoá mẫu khỏi thư viện KHÔNG gỡ chương trình khỏi mẫu xe đang chào', async () => {
    const tao = await api('POST', '/api/v1/showroom/financing-templates', publisher, {
      bankName: `Ngân hàng thử ${Date.now().toString().slice(-6)}`,
      bankLogoMediaId: null,
      minDownPaymentBp: 2000, promoRateBp: 700, promoMonths: 6, standardRateBp: 1000,
      allowedTermsMonths: [36], downPaymentOptionsBp: [2000],
      rateUpdatedAt: '2026-09-01', displayOrder: 50, isActive: true,
    });
    assert.equal(tao.status, 201, JSON.stringify(tao.body));

    const truoc = await admin.query<{ n: string }>('SELECT count(*) AS n FROM financing_program');
    assert.equal((await api('DELETE', `/api/v1/showroom/financing-templates/${tao.body.id}`, publisher)).status, 200);
    const sau = await admin.query<{ n: string }>('SELECT count(*) AS n FROM financing_program');
    assert.equal(sau.rows[0]!.n, truoc.rows[0]!.n, 'xoá mẫu đã kéo theo chương trình của mẫu xe');
  });

  test('🔒 biên tập viên nội dung KHÔNG sửa được lãi suất — cùng khuôn với biểu phí', async () => {
    const r = await api('POST', '/api/v1/showroom/financing-templates', editor, {
      bankName: 'Không được phép',
      bankLogoMediaId: null,
      minDownPaymentBp: 2000, promoRateBp: 700, promoMonths: 6, standardRateBp: 1000,
      allowedTermsMonths: [36], downPaymentOptionsBp: [2000],
      rateUpdatedAt: '2026-09-01', displayOrder: 0, isActive: true,
    });
    assert.equal(r.status, 403);
  });
});

describe('Ảnh và màu của bản sửa — chỉ bản NHÁP, và ảnh bìa có MỘT', () => {
  let revNhap = '';

  before(async () => {
    const r = await api('POST', `/api/v1/marketing/vehicle-products/${productId}/draft`, editor);
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
    const { rows } = await admin.query<{ id: string }>(
      'SELECT draft_revision_id AS id FROM vehicle_product WHERE id = $1',
      [productId],
    );
    revNhap = rows[0]!.id;
  });

  test('🔒 sửa ảnh của bản ĐÃ PUBLISH bị từ chối — INV-LS-13', async () => {
    const r = await api('PUT', `/api/v1/showroom/revisions/${revisionId}/media`, editor, []);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(String(r.body.error.message), /bản NHÁP|bất biến/i);
  });

  test('🔒 database chặn độc lập với controller', async () => {
    /*
     * Bài trên chứng minh controller từ chối. Bài này chứng minh DỮ LIỆU được
     * bảo vệ: ghi thẳng bằng role của ứng dụng, không qua API. Một endpoint
     * kiểm đúng chỉ nói lên rằng endpoint đó kiểm đúng.
     */
    const tx = await app.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await assert.rejects(
        tx.query('DELETE FROM vehicle_product_media WHERE product_revision_id = $1', [revisionId]),
        /bất biến|INV-LS-13/i,
      );
      await tx.query('ROLLBACK');
    } finally {
      tx.release();
    }
  });

  test('gắn ảnh vào bản nháp, đọc lại thấy đúng thứ tự và ảnh bìa', async () => {
    const { rows: assets } = await admin.query<{ id: string }>(
      'SELECT id FROM media_asset WHERE tenant_id = $1 ORDER BY created_at LIMIT 2',
      [TENANT_A],
    );
    assert.equal(assets.length, 2, 'seed cần ít nhất hai ảnh để thử thứ tự');

    const dat = await api('PUT', `/api/v1/showroom/revisions/${revNhap}/media`, editor, [
      { mediaAssetId: assets[1]!.id, role: 'GALLERY', altText: 'Ảnh phụ', sortOrder: 1, isCover: false },
      { mediaAssetId: assets[0]!.id, role: 'POSTER', altText: 'Ảnh bìa', sortOrder: 0, isCover: true },
    ]);
    assert.equal(dat.status, 200, JSON.stringify(dat.body));

    const doc = await api('GET', `/api/v1/showroom/revisions/${revNhap}/media`, editor);
    assert.equal(doc.status, 200);
    const items = doc.body.items as { altText: string; isCover: boolean }[];
    assert.equal(items.length, 2);
    assert.equal(items[0]!.isCover, true, 'ảnh bìa phải đứng đầu');
    assert.equal(items[0]!.altText, 'Ảnh bìa');
  });

  test('🔒 hai ảnh bìa bị từ chối — chỗ bìa có MỘT', async () => {
    const { rows: assets } = await admin.query<{ id: string }>(
      'SELECT id FROM media_asset WHERE tenant_id = $1 ORDER BY created_at LIMIT 2',
      [TENANT_A],
    );
    const r = await api('PUT', `/api/v1/showroom/revisions/${revNhap}/media`, editor, [
      { mediaAssetId: assets[0]!.id, role: 'POSTER', altText: 'A', sortOrder: 0, isCover: true },
      { mediaAssetId: assets[1]!.id, role: 'POSTER', altText: 'B', sortOrder: 1, isCover: true },
    ]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('đọc màu của một bản sửa — endpoint mà giao diện cần để hiện danh sách', async () => {
    const dat = await api('PUT', `/api/v1/showroom/revisions/${revNhap}/colors`, editor, [
      { name: 'Xanh Rêu', hexCode: '#3d4a3a', kind: 'KIM_LOAI', surchargeAmount: 8000000, displayOrder: 0 },
    ]);
    assert.equal(dat.status, 200, JSON.stringify(dat.body));

    const doc = await api('GET', `/api/v1/showroom/revisions/${revNhap}/colors`, editor);
    assert.equal(doc.status, 200);
    const items = doc.body.items as { name: string; hexCode: string; surchargeAmount: number }[];
    assert.equal(items.length, 1);
    assert.equal(items[0]!.name, 'Xanh Rêu');
    assert.equal(items[0]!.surchargeAmount, 8000000, 'phụ thu phải về dạng số, không phải chuỗi');
  });
});

describe('🔒 Danh sách tư vấn viên nhận lead — cùng một quy tắc với bước kiểm', () => {
  test('trả đúng tập mà assignLead sẽ chấp nhận', async () => {
    const quanLySales = await login('0901000013');
    const { rows: br } = await admin.query<{ id: string }>(
      `SELECT b.id FROM branch b
         JOIN user_branch ub ON ub.branch_id = b.id
         JOIN app_user u ON u.id = ub.user_id
        WHERE u.phone = '0901000013' AND b.tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    const r = await api(
      'GET',
      `/api/v1/sales/assignable-advisors?branchId=${br[0]!.id}`,
      quanLySales,
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ds = r.body as { id: string; fullName: string }[];

    /*
     * Đối chiếu với SQL thật thay vì với một con số viết cứng: seed đổi thì bài
     * kiểm không đỏ vì lý do không liên quan, nhưng nếu endpoint và bước kiểm
     * lệch nhau thì nó đỏ ngay.
     */
    const { rows: dung } = await admin.query<{ id: string }>(
      `SELECT u.id FROM app_user u
        WHERE u.tenant_id = $1 AND u.is_active
          AND 'SALES_ADVISOR' = ANY(u.roles::text[])
          AND EXISTS (SELECT 1 FROM user_branch ub WHERE ub.user_id = u.id AND ub.branch_id = $2)`,
      [TENANT_A, br[0]!.id],
    );
    assert.deepEqual(ds.map((x) => x.id).sort(), dung.map((x) => x.id).sort());
  });

  test('🔒 quản lý không liệt kê được nhân sự của chi nhánh KHÁC', async () => {
    const quanLySales = await login('0901000013');
    const { rows: br } = await admin.query<{ id: string }>(
      `SELECT id FROM branch WHERE tenant_id = $1 AND code = 'HCM01'`,
      [TENANT_A],
    );
    const r = await api(
      'GET',
      `/api/v1/sales/assignable-advisors?branchId=${br[0]!.id}`,
      quanLySales,
    );
    assert.equal(r.status, 422, 'đổi một tham số trên URL không được vượt phạm vi chi nhánh');
  });

  test('🔒 tư vấn viên KHÔNG xem được danh sách — họ không gán lead', async () => {
    const { rows: br } = await admin.query<{ id: string }>(
      `SELECT id FROM branch WHERE tenant_id = $1 ORDER BY code LIMIT 1`,
      [TENANT_A],
    );
    const r = await api('GET', `/api/v1/sales/assignable-advisors?branchId=${br[0]!.id}`, advisor);
    assert.equal(r.status, 403);
  });
});

describe('🔒 Tạo bản nháp phải chép ĐỦ nội dung theo revision', () => {
  /*
   * ⚠️ Bản trước chép đúng hai bảng: variant và ảnh. Màu, ưu đãi và trả góp bị
   *    bỏ lại. Đo được trên seed: aurora-e1 có 3 màu / 4 ưu đãi / 3 chương trình;
   *    bản nháp mới có 0/0/0. Biên tập viên sửa một lỗi chính tả rồi bấm Xuất
   *    bản là trang xe mất sạch — không cảnh báo nào, vì về mặt kỹ thuật "bản
   *    nháp đó đúng là không có màu nào".
   *
   * 💡 Lỗi nằm im vì màn Sửa xe chưa có nút tạo bản nháp. Thêm nút xong là nó
   *    thành đường đi hằng ngày.
   *
   * 🔒 Bài này DỰNG LẤY dữ liệu của chính nó thay vì tin vào seed. Bản đầu đọc
   *    thẳng số của seed và đỏ vì một bài khác trong cùng file đã tạo bản nháp
   *    trước — `cloneProductDraft` trả lại bản nháp đang có chứ không chép lần
   *    nữa, nên phép so sánh đo nhầm thứ.
   */
  async function demTheoRevision(revisionId: string): Promise<Record<string, string>> {
    const { rows } = await admin.query<Record<string, string>>(
      `SELECT (SELECT count(*) FROM vehicle_color c WHERE c.product_revision_id = $1) AS mau,
              (SELECT count(*) FROM vehicle_promotion p WHERE p.product_revision_id = $1) AS uu_dai,
              (SELECT count(*) FROM financing_program f WHERE f.product_revision_id = $1) AS tra_gop,
              (SELECT count(*) FROM vehicle_product_media m WHERE m.product_revision_id = $1) AS anh`,
      [revisionId],
    );
    return rows[0]!;
  }

  async function conTro(): Promise<{ draft: string | null; published: string | null }> {
    const { rows } = await admin.query<{ d: string | null; p: string | null }>(
      'SELECT draft_revision_id AS d, published_revision_id AS p FROM vehicle_product WHERE id = $1',
      [productId],
    );
    return { draft: rows[0]!.d, published: rows[0]!.p };
  }

  /** Đưa mẫu xe về trạng thái "đã publish, không còn nháp" — điểm xuất phát sạch. */
  async function dungNenSach(): Promise<string> {
    let ct = await conTro();
    if (ct.draft === null) {
      const tao = await api('POST', `/api/v1/marketing/vehicle-products/${productId}/draft`, editor);
      assert.ok(tao.status === 200 || tao.status === 201, JSON.stringify(tao.body));
      ct = await conTro();
    }
    const rev = ct.draft!;

    // Ba màu và hai ảnh, đặt tường minh để phép so sánh có gì để so.
    const dat = await api('PUT', `/api/v1/showroom/revisions/${rev}/colors`, editor, [
      { name: 'Trắng Nền', hexCode: '#f2f2f0', kind: 'DON', surchargeAmount: 0, displayOrder: 0 },
      { name: 'Đen Nền', hexCode: '#101010', kind: 'DON', surchargeAmount: 0, displayOrder: 1 },
      { name: 'Đỏ Nền', hexCode: '#c73526', kind: 'DAC_BIET', surchargeAmount: 9000000, displayOrder: 2 },
    ]);
    assert.equal(dat.status, 200, JSON.stringify(dat.body));

    const { rows: assets } = await admin.query<{ id: string }>(
      'SELECT id FROM media_asset WHERE tenant_id = $1 ORDER BY created_at LIMIT 2',
      [TENANT_A],
    );
    const datAnh = await api('PUT', `/api/v1/showroom/revisions/${rev}/media`, editor, [
      { mediaAssetId: assets[0]!.id, role: 'POSTER', altText: 'Bìa', sortOrder: 0, isCover: true },
      { mediaAssetId: assets[1]!.id, role: 'GALLERY', altText: 'Phụ', sortOrder: 1, isCover: false },
    ]);
    assert.equal(datAnh.status, 200, JSON.stringify(datAnh.body));

    const ver = (await api('GET', `/api/v1/marketing/vehicle-products/${productId}`, editor)).body.version;
    const pub = await api('POST', `/api/v1/marketing/vehicle-products/${productId}/publish`, publisher, {
      version: ver,
    });
    assert.ok(pub.status === 200 || pub.status === 201, JSON.stringify(pub.body));
    return (await conTro()).published!;
  }

  test('màu, ưu đãi, trả góp và ảnh đều theo sang bản nháp', async () => {
    const daDang = await dungNenSach();
    const truoc = await demTheoRevision(daDang);
    assert.ok(Number(truoc.mau) > 0 && Number(truoc.anh) > 0, 'nền dựng hỏng — không có gì để chép');

    const r = await api('POST', `/api/v1/marketing/vehicle-products/${productId}/draft`, editor);
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));

    const sau = await demTheoRevision((await conTro()).draft!);
    assert.deepEqual(sau, truoc, 'bản nháp phải có đúng bằng bản đang hiện');
  });

  test('🔒 ảnh gắn màu trỏ sang màu MỚI của bản nháp, không phải màu của bản cũ', async () => {
    /*
     * Chỗ sai tinh vi nhất của một lượt chép: bê nguyên `color_id`. Khoá ngoại
     * vẫn hợp lệ (cùng tenant) nên KHÔNG có lỗi nào nổ ra — chỉ là câu "ảnh này
     * của màu nào" trả lời sai kể từ đó, và nó trả lời sai vĩnh viễn.
     */
    const daDang = await dungNenSach();

    // Gắn ảnh của bản ĐANG HIỆN vào một màu của chính bản đó, bằng quyền chủ
    // schema — trigger INV-LS-13 chặn role ứng dụng ghi vào bản đã publish.
    const { rows: mau } = await admin.query<{ id: string }>(
      'SELECT id FROM vehicle_color WHERE product_revision_id = $1 ORDER BY display_order LIMIT 1',
      [daDang],
    );
    await admin.query(
      'UPDATE vehicle_product_media SET color_id = $2 WHERE product_revision_id = $1',
      [daDang, mau[0]!.id],
    );

    const tao = await api('POST', `/api/v1/marketing/vehicle-products/${productId}/draft`, editor);
    assert.ok(tao.status === 200 || tao.status === 201, JSON.stringify(tao.body));
    const revNhap = (await conTro()).draft!;

    const { rows: lac } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n
         FROM vehicle_product_media m
         JOIN vehicle_color c ON c.id = m.color_id
        WHERE m.product_revision_id = $1 AND c.product_revision_id <> $1`,
      [revNhap],
    );
    assert.equal(Number(lac[0]!.n), 0, 'ảnh của bản nháp đang trỏ sang màu của một bản khác');

    const { rows: coMau } = await admin.query<{ n: string }>(
      'SELECT count(*) AS n FROM vehicle_product_media WHERE product_revision_id = $1 AND color_id IS NOT NULL',
      [revNhap],
    );
    assert.ok(Number(coMau[0]!.n) > 0, 'liên kết ảnh–màu bị mất hẳn thay vì được ánh xạ');
  });
});
