/**
 * 🔒 Phạm vi chi nhánh ở tầng TIỀN — hồi quy cho F-1 và F-6.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Hai lỗ hổng vòng review Phase 3 tìm ra, và vì sao chúng thoát được
 *
 * F-1 — `appendBranchScope` có mặt ở `InvoiceService.build()` và VẮNG ở năm
 *       đường còn lại. Kết quả đo được: thu ngân chi nhánh HN01 ĐỌC, PHÁT HÀNH
 *       và THU TIỀN được hoá đơn của HCM01, và thấy công nợ khách HCM01.
 *
 * F-6 — `setExpectedPayer` chỉ kiểm hoá đơn còn nháp, không đối chiếu đơn sửa
 *       chữa. Gắn được dòng hoá đơn của xe KHÁC vào hồ sơ bồi thường, và bảng
 *       kê gửi công ty bảo hiểm liệt kê một chiếc xe không có trong vụ va chạm.
 *
 * 💡 Cả hai đều KHÔNG phải lỗi RLS. RLS cô lập theo tenant; hai chi nhánh của
 *    cùng một garage nằm trong cùng tenant, nên nó cho qua — đúng như thiết kế.
 *    Phạm vi chi nhánh là việc của tầng service, và đó chính là chỗ nó bị quên.
 *
 * Đây là lần THỨ HAI dự án mắc đúng lỗi này. Lần đầu ở Phase 1
 * (GARAGEOS-REV: "phạm vi chi nhánh chỉ chặn lúc ghi, không chặn lúc đọc").
 * Lần này chặn cả ghi lẫn đọc đều không có.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

let pool: Pool;
let tokenThuNgan = '';
let tokenCoVan = '';
let dem = 0;
const uniq = `${Date.now().toString().slice(-5)}${process.pid.toString().slice(-3)}`;

async function call(
  method: string,
  path: string,
  body: unknown,
  token: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

async function dangNhap(phone: string): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { phone, password: 'demo1234' }, '');
  assert.equal(r.status, 201, `không đăng nhập được ${phone}`);
  return r.body.accessToken;
}

interface Canh {
  orderId: string;
  invoiceId: string;
  lineId: string;
  customerId: string;
}

/**
 * Một hoá đơn hoàn chỉnh ở chi nhánh chỉ định, dựng bằng SQL.
 *
 * Dùng SQL vì đây là DỮ LIỆU CẢNH: luồng lập hoá đơn đã có 17 bài riêng ở
 * `hoa-don.spec.ts`. Ở đây chỉ cần một hoá đơn tồn tại ở đúng chi nhánh.
 */
async function hoaDonTaiChiNhanh(branchCode: string, phatHanh = false): Promise<Canh> {
  dem += 1;
  const { rows: b } = await pool.query<{ id: string }>(
    `SELECT id FROM branch WHERE tenant_id = $1 AND code = $2`,
    [TENANT_A, branchCode],
  );
  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: kh } = await pool.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone)
     VALUES ($1,'INDIVIDUAL',$2,$3) RETURNING id`,
    [TENANT_A, `Khách phạm vi ${uniq}${dem}`, `058${uniq}${dem}`],
  );
  const { rows: xe } = await pool.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain)
     VALUES ($1,$2,$3,'ICE') RETURNING id`,
    [TENANT_A, kh[0]!.id, `96P${uniq}${dem}`],
  );
  const { rows: ro } = await pool.query<{ id: string }>(
    `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                               customer_complaint, odometer_in, customer_access_token,
                               created_by_user_id, status)
     VALUES ($1,$2,$3,$4,$5,'Dựng cảnh phạm vi chi nhánh',1,$6,$7,'QUALITY_CHECK')
     RETURNING id`,
    [
      TENANT_A,
      b[0]!.id,
      `RO-PV-${uniq}${dem}`,
      kh[0]!.id,
      xe[0]!.id,
      `pv${uniq}${dem}${'x'.repeat(32)}`,
      u[0]!.id,
    ],
  );
  const { rows: hd } = await pool.query<{ id: string }>(
    `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                          created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [TENANT_A, b[0]!.id, ro[0]!.id, kh[0]!.id, `INV-PV-${uniq}${dem}`, u[0]!.id],
  );
  const { rows: dong } = await pool.query<{ id: string }>(
    `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                               quantity, unit_price, tax_rate_percent)
     VALUES ($1,$2,1,'PART','Hạng mục dựng cảnh',1,2000000,0) RETURNING id`,
    [TENANT_A, hd[0]!.id],
  );
  if (phatHanh) {
    await pool.query(
      `UPDATE invoice SET status = 'ISSUED', issued_at = now(),
                          customer_snapshot = '{}'::jsonb, due_date = now() + interval '30 day'
        WHERE id = $1`,
      [hd[0]!.id],
    );
  }
  return {
    orderId: ro[0]!.id,
    invoiceId: hd[0]!.id,
    lineId: dong[0]!.id,
    customerId: kh[0]!.id,
  };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenThuNgan = await dangNhap('0901000006');
  tokenCoVan = await dangNhap('0901000003');

  // Điều kiện tiên quyết: hai vai trên phải thuộc HN01 và KHÔNG thuộc HCM01
  const { rows } = await pool.query<{ code: string }>(
    `SELECT b.code FROM user_branch ub
       JOIN branch b ON b.id = ub.branch_id
       JOIN app_user u ON u.id = ub.user_id
      WHERE u.phone = '0901000006'`,
  );
  assert.deepEqual(
    rows.map((r) => r.code),
    ['HN01'],
    'seed đổi: thu ngân không còn thuộc đúng một chi nhánh HN01 — bài này mất ý nghĩa',
  );
});

after(async () => {
  /*
   * Đưa hoá đơn về DRAFT TRƯỚC MỌI THỨ.
   *
   * `trg_invoice_line_bat_bien` chặn cả UPDATE lẫn DELETE trên dòng của hoá đơn
   * đã phát hành — kể cả câu gỡ liên kết hồ sơ bảo hiểm. Dọn sai thứ tự thì
   * chính INV-M-03 chặn lại, và đó là nó làm đúng việc.
   */
  await pool.query(`UPDATE invoice SET status = 'DRAFT' WHERE code LIKE $1`, [`INV-PV-${uniq}%`]);
  await pool.query(
    `UPDATE invoice_line SET insurance_claim_id = NULL WHERE invoice_id IN
       (SELECT id FROM invoice WHERE code LIKE $1)`,
    [`INV-PV-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM e_invoice WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`,
    [`INV-PV-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM invoice_line WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`,
    [`INV-PV-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM insurance_claim WHERE repair_order_id IN
       (SELECT id FROM repair_order WHERE code LIKE $1)`,
    [`RO-PV-${uniq}%`],
  );
  await pool.query(`DELETE FROM invoice WHERE code LIKE $1`, [`INV-PV-${uniq}%`]);
  await pool.query(`DELETE FROM repair_order WHERE code LIKE $1`, [`RO-PV-${uniq}%`]);
  await pool.query(
    `DELETE FROM vehicle_ownership WHERE vehicle_id IN
       (SELECT id FROM vehicle WHERE plate_number LIKE $1)`,
    [`96P${uniq}%`],
  );
  await pool.query(`DELETE FROM vehicle WHERE plate_number LIKE $1`, [`96P${uniq}%`]);
  await pool.query(`DELETE FROM customer WHERE phone LIKE $1`, [`058${uniq}%`]);
  await pool.end();
});

describe('🔒 F-1 — hoá đơn chi nhánh khác: không đọc, không ghi', () => {
  test('thu ngân HN01 KHÔNG đọc được hoá đơn HCM01', async () => {
    const xa = await hoaDonTaiChiNhanh('HCM01', true);
    const r = await call('GET', `/api/v1/invoices/${xa.invoiceId}`, undefined, tokenThuNgan);
    assert.equal(r.status, 404, `đọc được hoá đơn chi nhánh khác (HTTP ${r.status})`);

    /*
     * ĐỐI CHỨNG bắt buộc: hoá đơn CÙNG chi nhánh phải đọc được.
     *
     * Không có vế này thì "trả 404" cũng có thể là do endpoint hỏng, và bài
     * kiểm sẽ xanh trong khi cả chi nhánh không xem được hoá đơn nào.
     */
    const gan = await hoaDonTaiChiNhanh('HN01', true);
    const r2 = await call('GET', `/api/v1/invoices/${gan.invoiceId}`, undefined, tokenThuNgan);
    assert.equal(r2.status, 200, 'chặn nhầm hoá đơn của chính chi nhánh mình');
  });

  test('cố vấn HN01 KHÔNG thấy hoá đơn khi liệt kê theo đơn của HCM01', async () => {
    const xa = await hoaDonTaiChiNhanh('HCM01', true);
    const r = await call(
      'GET',
      `/api/v1/repair-orders/${xa.orderId}/invoices`,
      undefined,
      tokenCoVan,
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, [], 'liệt kê ra hoá đơn của chi nhánh khác');
  });

  test('🔒 thu ngân HN01 KHÔNG phát hành được hoá đơn HCM01', async () => {
    const xa = await hoaDonTaiChiNhanh('HCM01');
    const r = await call(
      'POST',
      `/api/v1/invoices/${xa.invoiceId}/issue`,
      { ghiCongNo: false, varianceReason: 'Thử phát hành hoá đơn chi nhánh khác' },
      tokenThuNgan,
    );
    assert.equal(r.status, 404, `PHÁT HÀNH được hoá đơn chi nhánh khác (HTTP ${r.status})`);

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status::text AS status FROM invoice WHERE id = $1`,
      [xa.invoiceId],
    );
    assert.equal(rows[0]!.status, 'DRAFT', 'hoá đơn đã bị phát hành dù lời gọi báo lỗi');
  });

  test('🔒 thu ngân HN01 KHÔNG thu được tiền của hoá đơn HCM01', async () => {
    const xa = await hoaDonTaiChiNhanh('HCM01', true);
    const r = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId: xa.customerId,
        amount: 2_000_000,
        method: 'CASH',
        idempotencyKey: `pv-${uniq}-${dem}`,
        allocations: [{ invoiceLineId: xa.lineId, amount: 2_000_000 }],
      },
      tokenThuNgan,
    );
    assert.equal(r.status, 404, `THU được tiền hoá đơn chi nhánh khác (HTTP ${r.status})`);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM payment_allocation WHERE invoice_line_id = $1`,
      [xa.lineId],
    );
    assert.equal(Number(rows[0]!.n), 0, 'có phân bổ được ghi dù lời gọi báo lỗi');
  });

  test('🔒 công nợ chỉ gồm khách có hoá đơn TRONG phạm vi', async () => {
    const xa = await hoaDonTaiChiNhanh('HCM01', true);
    const gan = await hoaDonTaiChiNhanh('HN01', true);

    const r = await call('GET', '/api/v1/reports/debt', undefined, tokenThuNgan);
    assert.equal(r.status, 200);
    const ids = (r.body as { customerId: string }[]).map((d) => d.customerId);

    assert.ok(!ids.includes(xa.customerId), 'công nợ lộ khách của chi nhánh khác');
    assert.ok(
      ids.includes(gan.customerId),
      'công nợ bỏ sót khách của chính chi nhánh mình — lọc quá tay',
    );
  });
});

describe('🔒 F-6 — hồ sơ bồi thường chỉ nhận dòng của ĐÚNG đơn', () => {
  test('gắn dòng hoá đơn của đơn KHÁC vào hồ sơ bị chặn', async () => {
    const a = await hoaDonTaiChiNhanh('HN01');
    const b = await hoaDonTaiChiNhanh('HN01');

    const hs = await call(
      'POST',
      '/api/v1/insurance-claims',
      {
        repairOrderId: a.orderId,
        insurerName: 'Bảo hiểm thử phạm vi',
        policyNumber: `PV-${uniq}`,
      },
      tokenCoVan,
    );
    assert.equal(hs.status, 201, JSON.stringify(hs.body));

    const sai = await call(
      'POST',
      `/api/v1/insurance-claims/${hs.body.id}/expected-lines`,
      { invoiceLineIds: [b.lineId] },
      tokenCoVan,
    );
    assert.equal(
      sai.status,
      409,
      '🔒 gắn được hạng mục của xe khác — bảng kê gửi bảo hiểm sẽ có một chiếc xe ' +
        'không nằm trong vụ va chạm',
    );

    // ĐỐI CHỨNG: dòng của ĐÚNG đơn thì gắn được
    const dung = await call(
      'POST',
      `/api/v1/insurance-claims/${hs.body.id}/expected-lines`,
      { invoiceLineIds: [a.lineId] },
      tokenCoVan,
    );
    assert.equal(dung.status, 201, JSON.stringify(dung.body));
    assert.equal(dung.body.soDong, 1);
  });

  test('gắn MỘT PHẦN cũng bị chặn, không im lặng bỏ qua dòng sai', async () => {
    /*
     * Gửi hai dòng, một hợp lệ một không. Trả 201 với `soDong: 1` là câu trả
     * lời sai: người dùng nghĩ cả hai đã gắn, và bảng kê thiếu một hạng mục mà
     * không ai biết.
     */
    const a = await hoaDonTaiChiNhanh('HN01');
    const b = await hoaDonTaiChiNhanh('HN01');
    const hs = await call(
      'POST',
      '/api/v1/insurance-claims',
      {
        repairOrderId: a.orderId,
        insurerName: 'Bảo hiểm thử một phần',
        policyNumber: `PV2-${uniq}`,
      },
      tokenCoVan,
    );

    const r = await call(
      'POST',
      `/api/v1/insurance-claims/${hs.body.id}/expected-lines`,
      { invoiceLineIds: [a.lineId, b.lineId] },
      tokenCoVan,
    );
    assert.equal(r.status, 409, 'gắn một phần mà vẫn báo thành công');
    assert.match(r.body.error.message, /1\/2/);

    // Và KHÔNG dòng nào bị gắn — cả lời gọi phải rollback
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM invoice_line WHERE insurance_claim_id = $1`,
      [hs.body.id],
    );
    assert.equal(Number(rows[0]!.n), 0, 'gắn được một nửa rồi mới báo lỗi');
  });

  test('🔒 cố vấn HN01 không mở được hồ sơ cho đơn của HCM01', async () => {
    const xa = await hoaDonTaiChiNhanh('HCM01');
    const r = await call(
      'POST',
      '/api/v1/insurance-claims',
      {
        repairOrderId: xa.orderId,
        insurerName: 'Bảo hiểm chi nhánh khác',
        policyNumber: `PV3-${uniq}`,
      },
      tokenCoVan,
    );
    assert.equal(r.status, 404, `mở được hồ sơ cho đơn chi nhánh khác (HTTP ${r.status})`);
  });
});
