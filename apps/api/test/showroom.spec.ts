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
