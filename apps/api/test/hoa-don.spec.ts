/**
 * Phase 3 — hoá đơn, thanh toán, công nợ, bảo hiểm (BC-07 · BC-08 · BC-13).
 *
 * Hai bài quan trọng nhất dùng ĐÚNG VÍ DỤ NGUYÊN VĂN của tài liệu:
 *
 *  · BC-07 mục 3 — bảng đối chiếu: dầu dùng 4,8L thay vì 4L, một hạng mục
 *    khách huỷ, một hạng mục bổ sung. Chênh +39,5%, vượt ngưỡng 5%.
 *  · BC-08 mục 2 — xe va chạm 6.950.000đ: bảo hiểm trả 5.200.000, khách trả
 *    1.750.000 gồm cả mức khấu trừ 500.000 nằm giữa một dòng.
 *
 * Bịa số mới thì test chỉ chứng minh mã nguồn khớp với chính nó. Dùng số của
 * tài liệu thì bản cài đặt lệch khỏi thiết kế sẽ lộ ra ở đây.
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
let tokenCoVan = '';
let tokenThuNgan = '';
let tokenQuanLy = '';
let tokenTho = '';
let branchId = '';
let customerId = '';
let dem = 0;
const uniq = `${Date.now().toString().slice(-5)}${process.pid.toString().slice(-3)}`;

async function call(
  method: string,
  path: string,
  body?: unknown,
  token = tokenCoVan,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Mode': 'token',
      ...(token === '' ? {} : { Authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

async function dangNhap(phone: string): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { phone, password: 'demo1234' }, '');
  assert.equal(r.status, 201, `không đăng nhập được ${phone}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

interface Canh {
  orderId: string;
  quotationId: string;
  /** Dòng công đã duyệt và đã QC_PASSED */
  congLineId: string;
  partId: string;
  partLineId: string;
}

/**
 * Dựng một đơn ĐÃ QC XONG: có dòng công đã QC_PASSED và phụ tùng đã xuất kho.
 *
 * Đi bằng SQL cho phần đã có test riêng (duyệt báo giá, phân công, QC) — ở đây
 * chúng chỉ là điều kiện đầu vào của hoá đơn.
 */
async function donDaXongViec(opts: {
  soLuongPhuTung: number;
  giaBanPhuTung: number;
  soLuongXuat: number;
}): Promise<Canh> {
  dem += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `55F-${uniq}${dem}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test hoá đơn',
    odometerIn: 50_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const { rows: sv } = await pool.query<{ id: string }>(
    `SELECT id FROM service_item
      WHERE tenant_id = $1 AND is_active AND category <> 'DIAGNOSIS'
        AND cardinality(required_certifications) = 0 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: p } = await pool.query<{ id: string }>(
    `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
     VALUES ($1,$2,'Dầu động cơ thử hoá đơn','lít','HD-THU',0) RETURNING id`,
    [TENANT_A, `PT-HD-${uniq}${dem}`],
  );
  const partId = p[0]!.id;

  const { rows: pl } = await pool.query<{ id: string }>(
    `SELECT id FROM price_list
      WHERE tenant_id = $1 AND effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC LIMIT 1`,
    [TENANT_A],
  );
  await pool.query(
    `INSERT INTO price_list_item (price_list_id, tenant_id, part_id, sell_price, tax_rate_percent)
     VALUES ($1,$2,$3,$4,0)`,
    [pl[0]!.id, TENANT_A, partId, opts.giaBanPhuTung],
  );

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  const cong = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'LABOR',
    serviceItemId: sv[0]!.id,
    quantity: 1,
  });
  assert.equal(cong.status, 201, JSON.stringify(cong.body));
  const pt = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'PART',
    partId,
    parentLineId: cong.body.id,
    quantity: opts.soLuongPhuTung,
  });
  assert.equal(pt.status, 201, JSON.stringify(pt.body));

  await pool.query(
    `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'COUNTER'
      WHERE quotation_id = $1`,
    [q.body.id],
  );

  // Kho: nhập rồi xuất đúng số lượng THỰC TẾ (có thể khác báo giá)
  const { rows: u } = await pool.query<{ id: string }>(
    'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
    [TENANT_A],
  );
  const { rows: w } = await pool.query<{ id: string }>(
    'SELECT w.id FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE b.id = $1 LIMIT 1',
    [branchId],
  );
  await pool.query(
    `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                 unit_cost, ref_type, created_by_user_id)
     VALUES ($1,$2,$3,'RECEIPT',$4,80000,'PURCHASE',$5)`,
    [TENANT_A, w[0]!.id, partId, opts.soLuongXuat + 10, u[0]!.id],
  );

  for (const tt of ['AWAITING_APPROVAL', 'IN_PROGRESS']) {
    await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [o.body.id, tt]);
  }
  await pool.query(
    `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                 unit_cost, ref_type, ref_id, created_by_user_id)
     VALUES ($1,$2,$3,'ISSUE',$4,80000,'REPAIR_ORDER',$5,$6)`,
    [TENANT_A, w[0]!.id, partId, -opts.soLuongXuat, o.body.id, u[0]!.id],
  );

  // Phân công đã QC_PASSED — nguồn của dòng công trên hoá đơn
  const { rows: tho } = await pool.query<{ id: string }>(
    `SELECT u.id FROM app_user u
      WHERE u.tenant_id = $1 AND 'TECHNICIAN' = ANY(u.roles) LIMIT 1`,
    [TENANT_A],
  );
  const { rows: bay } = await pool.query<{ id: string }>(
    'SELECT id FROM bay WHERE branch_id = $1 LIMIT 1',
    [branchId],
  );
  const goc = Date.now() + (700 + (process.pid % 150) * 3 + dem * 4) * 24 * 3600 * 1000;
  const { rows: qc } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND 'BRANCH_MANAGER' = ANY(roles) LIMIT 1`,
    [TENANT_A],
  );
  await pool.query(
    `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
       technician_id, bay_id, planned_start, planned_end, status, qc_by_user_id, qc_at,
       created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'QC_PASSED',$8,now(),$4)`,
    [
      TENANT_A,
      o.body.id,
      cong.body.id,
      tho[0]!.id,
      bay[0]!.id,
      new Date(goc),
      new Date(goc + 2 * 3600 * 1000),
      qc[0]!.id,
    ],
  );

  await pool.query(`UPDATE repair_order SET status = 'QUALITY_CHECK' WHERE id = $1`, [o.body.id]);

  return {
    orderId: o.body.id,
    quotationId: q.body.id,
    congLineId: cong.body.id,
    partId,
    partLineId: pt.body.id,
  };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenCoVan = await dangNhap('0901000003');
  tokenThuNgan = await dangNhap('0901000006');
  tokenQuanLy = await dangNhap('0901000002');
  tokenTho = await dangNhap('0901000004');

  const me = await call(
    'POST',
    '/api/v1/auth/login',
    { phone: '0901000003', password: 'demo1234' },
    '',
  );
  branchId = me.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách hoá đơn ${uniq}`,
    phone: `034${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  await pool.end();
});

describe('🔒 BC-07 — hoá đơn lập từ CÔNG VIỆC THỰC TẾ', () => {
  test('bài 2: xuất 4,8L cho một dòng báo giá 4L — hoá đơn ghi 4,8', async () => {
    /*
     * Đúng ví dụ BC-07 mục 3: "Dầu động cơ 4L · báo giá 560.000 · thực tế
     * 672.000 · +112.000 · Dùng 4.8L".
     *
     * 140.000đ/lít × 4L = 560.000 báo giá; × 4,8L = 672.000 thực tế.
     */
    const c = await donDaXongViec({ soLuongPhuTung: 4, giaBanPhuTung: 140_000, soLuongXuat: 4.8 });

    const r = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const dongPt = r.body.lines.find((l: { lineType: string }) => l.lineType === 'PART');
    assert.ok(dongPt, 'hoá đơn không có dòng phụ tùng nào');
    assert.equal(dongPt.quantity, 4.8, '🔒 hoá đơn lấy số lượng từ BÁO GIÁ chứ không từ sổ kho');
    assert.equal(dongPt.lineTotal, 672_000);

    // 🔒 Đơn giá vẫn là giá ĐÃ DUYỆT, không phải giá hiện hành
    assert.equal(dongPt.unitPrice, 140_000);
  });

  test('bài 3: trả một phần phụ tùng về kho — số lượng = xuất − trả', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 5, giaBanPhuTung: 100_000, soLuongXuat: 5 });

    const { rows: mv } = await pool.query<{ id: string; warehouse_id: string }>(
      `SELECT id, warehouse_id FROM stock_movement WHERE part_id = $1 AND type = 'ISSUE'`,
      [c.partId],
    );
    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, ref_type, ref_id, reason, created_by_user_id)
       VALUES ($1,$2,$3,'RETURN',2,80000,'RETURN_OF',$4,'Thừa, trả lại kho',$5)`,
      [TENANT_A, mv[0]!.warehouse_id, c.partId, mv[0]!.id, u[0]!.id],
    );

    const r = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    const dongPt = r.body.lines.find((l: { lineType: string }) => l.lineType === 'PART');
    assert.equal(dongPt.quantity, 3, 'xuất 5 trả 2 mà hoá đơn vẫn tính 5 — khách trả tiền hàng trên kệ');
    assert.equal(dongPt.lineTotal, 300_000);
  });

  test('bài 5: tổng hoá đơn bằng tổng các dòng, sai lệch 0đ', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 3, giaBanPhuTung: 333_333, soLuongXuat: 3 });
    const r = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });

    const tongDong = r.body.lines.reduce(
      (t: number, l: { lineTotal: number }) => t + l.lineTotal,
      0,
    );
    assert.equal(
      r.body.totalAmount,
      tongDong,
      '🔒 INV-M-02 — làm tròn ở TỔNG thay vì ở từng dòng: khách và kiểm toán đều bắt được',
    );
  });

  test('🔒 bài 7: sửa hoá đơn đã ISSUED bị chặn, kể cả bằng SQL', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 200_000, soLuongXuat: 1 });
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });

    const ph = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Dựng cảnh test — chấp nhận chênh lệch' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 201, JSON.stringify(ph.body));
    assert.equal(ph.body.status, 'ISSUED');
    assert.ok(ph.body.issuedAt !== null);

    // Dựng lại từ API: bị chặn với thông báo chỉ đường
    const lai = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    assert.equal(lai.status, 409, JSON.stringify(lai.body));
    assert.match(lai.body.error.message, /điều chỉnh/i);

    // 🔒 Và bằng SQL trực tiếp — đường mà một script bảo trì sẽ đi
    await assert.rejects(
      () => pool.query(`UPDATE invoice SET total_amount = 1 WHERE id = $1`, [nhap.body.id]),
      /INVOICE_IMMUTABLE/,
      'sửa được hoá đơn đã phát hành = mất tính bất biến của chứng từ',
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                     quantity, unit_price)
           VALUES ($1,$2,99,'FEE','Thêm lén',1,500000)`,
          [TENANT_A, nhap.body.id],
        ),
      /INVOICE_IMMUTABLE/,
    );
  });

  test('🔒 bài 8: chênh lệch vượt ngưỡng, không có lý do → không phát hành được', async () => {
    /*
     * BC-07 mục 3, BR-09-3. Báo giá 4L dầu, thực xuất 8L — lệch +100%, vượt xa
     * ngưỡng của tenant.
     */
    const c = await donDaXongViec({ soLuongPhuTung: 4, giaBanPhuTung: 150_000, soLuongXuat: 8 });
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });

    assert.equal(nhap.body.reconciliation.vuotNguong, true, 'lệch +100% mà không bị đánh dấu');
    assert.ok(nhap.body.reconciliation.rows.length >= 2, 'bảng đối chiếu thiếu dòng');

    const thieu = await call('POST', `/api/v1/invoices/${nhap.body.id}/issue`, {}, tokenThuNgan);
    assert.equal(thieu.status, 400, JSON.stringify(thieu.body));
    assert.match(thieu.body.error.message, /lý do/i);

    const du = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Xe rò dầu nặng hơn dự kiến, đã báo khách qua điện thoại lúc 14h' },
      tokenThuNgan,
    );
    assert.equal(du.status, 201, JSON.stringify(du.body));
  });

  test('🔒 bài 4: việc làm lại garage tự chịu — có trên hoá đơn nhưng 0đ', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 100_000, soLuongXuat: 1 });

    /*
     * INV-M-06. Dòng vẫn xuất hiện, và đó là chủ ý: bỏ hẳn thì khách nhìn thấy
     * một tờ giấy không khớp với chiếc xe của họ; để 0đ thì họ thấy garage đã
     * làm lại và không tính tiền.
     */
    await pool.query(
      `UPDATE work_assignment SET is_billable = false WHERE repair_order_id = $1`,
      [c.orderId],
    );

    const r = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    const dongCong = r.body.lines.find((l: { lineType: string }) => l.lineType === 'LABOR');
    assert.ok(dongCong, 'việc làm lại biến mất khỏi hoá đơn');
    assert.equal(dongCong.lineTotal, 0);
    assert.equal(dongCong.isWarranty, true);

    /*
     * Và đặt giá cho nó cũng không ăn thua: trigger `tinh_tien_dong_hd` zero hoá
     * MỌI thành phần của dòng bảo hành, không chỉ `line_total`.
     *
     * Đây là điều đáng kiểm hơn một ngoại lệ: ràng buộc chặn được người cố tình,
     * còn việc zero hoá chặn được cả người vô ý — và người vô ý nhiều hơn.
     */
    await pool.query(`UPDATE invoice_line SET unit_price = 500000 WHERE id = $1`, [dongCong.id]);
    const { rows: sau } = await pool.query<{ line_total: string; tax_amount: string }>(
      `SELECT line_total, tax_amount FROM invoice_line WHERE id = $1`,
      [dongCong.id],
    );
    assert.equal(Number(sau[0]!.line_total), 0, '🔒 INV-M-06 — dòng bảo hành có tiền');
    assert.equal(Number(sau[0]!.tax_amount), 0);
  });

  test('🔒 bài 9: hoá đơn điện tử lỗi — hoá đơn nội bộ VẪN phát hành', async () => {
    /*
     * BC-07 mục 6.3. Khách đang đứng ở quầy với chìa khoá trong tay và không
     * quan tâm máy chủ của ai đang hỏng.
     *
     * Bản giả lập trả lỗi khi mã hoá đơn chứa "LOI" — điều khiển bằng dữ liệu
     * chứ không bằng ngẫu nhiên, nên test không phụ thuộc may rủi.
     */
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 250_000, soLuongXuat: 1 });
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    await pool.query(`UPDATE invoice SET code = code || '-LOI' WHERE id = $1`, [nhap.body.id]);

    const ph = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Dựng cảnh test hoá đơn điện tử lỗi' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 201, JSON.stringify(ph.body));
    assert.equal(ph.body.status, 'ISSUED', '🔒 lỗi bên thứ ba làm tê liệt việc bàn giao xe');

    const { rows } = await pool.query<{ status: string; error_message: string; attempt_count: number }>(
      `SELECT status::text AS status, error_message, attempt_count FROM e_invoice WHERE invoice_id = $1`,
      [nhap.body.id],
    );
    assert.equal(rows[0]!.status, 'FAILED');
    assert.ok((rows[0]!.error_message ?? '').length > 0);

    // Gửi lại được, và số lần thử tăng
    const lai = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/e-invoice/retry`,
      undefined,
      tokenThuNgan,
    );
    assert.equal(lai.status, 201, JSON.stringify(lai.body));
    const { rows: sau } = await pool.query<{ attempt_count: number }>(
      `SELECT attempt_count FROM e_invoice WHERE invoice_id = $1`,
      [nhap.body.id],
    );
    assert.equal(sau[0]!.attempt_count, 2);
  });

  test('🔒 hoá đơn điều chỉnh: hoá đơn gốc GIỮ NGUYÊN nội dung', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 2, giaBanPhuTung: 300_000, soLuongXuat: 2 });
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    const ph = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Dựng cảnh test điều chỉnh' },
      tokenThuNgan,
    );
    const tongGoc = ph.body.totalAmount;

    // Cố vấn không được lập hoá đơn điều chỉnh
    const coVan = await call('POST', `/api/v1/invoices/${nhap.body.id}/adjust`, {
      reason: 'Ghi sai số lượng dầu động cơ',
      lines: [{ lineType: 'PART', description: 'Điều chỉnh', quantity: 1, unitPrice: -100_000 }],
    });
    assert.equal(coVan.status, 403, JSON.stringify(coVan.body));

    const dc = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/adjust`,
      {
        reason: 'Ghi thừa 1 lít dầu so với thực tế đã dùng',
        lines: [
          { lineType: 'PART', description: 'Điều chỉnh giảm 1 lít', quantity: 1, unitPrice: -300_000 },
        ],
      },
      tokenQuanLy,
    );
    assert.equal(dc.status, 201, JSON.stringify(dc.body));
    assert.equal(dc.body.totalAmount, -300_000, 'hoá đơn điều chỉnh chỉ ghi PHẦN CHÊNH LỆCH');
    assert.equal(dc.body.adjustmentOfInvoiceId, nhap.body.id);

    const { rows } = await pool.query<{ status: string; total_amount: string }>(
      `SELECT status::text AS status, total_amount FROM invoice WHERE id = $1`,
      [nhap.body.id],
    );
    assert.equal(rows[0]!.status, 'ADJUSTED');
    assert.equal(
      Number(rows[0]!.total_amount),
      tongGoc,
      '🔒 hoá đơn gốc bị sửa nội dung — nó là chứng từ đã giao cho người khác',
    );
  });

  test('🔒 thợ không đọc được hoá đơn', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 100_000, soLuongXuat: 1 });
    const r = await call(
      'GET',
      `/api/v1/repair-orders/${c.orderId}/invoices`,
      undefined,
      tokenTho,
    );
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
});

describe('🔒 BC-08 — bảo hiểm chi trả một phần', () => {
  test('ví dụ nguyên văn: 6.950.000đ chia hai nguồn, khấu trừ nằm GIỮA một dòng', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 100_000, soLuongXuat: 1 });
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });

    /*
     * Thay dòng hoá đơn bằng đúng bốn dòng của BC-08 mục 1. Đi bằng SQL vì đây
     * là dữ liệu cảnh, không phải luồng đang kiểm.
     */
    await pool.query(`DELETE FROM invoice_line WHERE invoice_id = $1`, [nhap.body.id]);
    const dong: string[] = [];
    for (const [seq, mo, gia, payer] of [
      [1, 'Thay đèn pha trái', 3_200_000, 'INSURER'],
      [2, 'Sơn lại cản trước', 2_500_000, 'INSURER'],
      [3, 'Thay dầu động cơ', 850_000, 'CUSTOMER'],
      [4, 'Vệ sinh điều hoà', 400_000, 'CUSTOMER'],
    ] as [number, string, number, string][]) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                   quantity, unit_price, tax_rate_percent, expected_payer_type)
         VALUES ($1,$2,$3,'PART',$4,1,$5,0,$6) RETURNING id`,
        [TENANT_A, nhap.body.id, seq, mo, gia, payer],
      );
      dong.push(rows[0]!.id);
    }

    const ph = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Dựng cảnh test bảo hiểm theo ví dụ BC-08' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 201, JSON.stringify(ph.body));
    assert.equal(ph.body.totalAmount, 6_950_000, 'tổng không khớp ví dụ tài liệu');

    // Bảo hiểm trả 5.200.000: đèn đủ, sơn chỉ 2.000.000 vì khấu trừ 500.000
    const bh = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId,
        payerType: 'INSURER',
        payerName: 'Bảo hiểm PVI',
        amount: 5_200_000,
        method: 'TRANSFER',
        idempotencyKey: `bh-${uniq}-1`,
        allocations: [
          { invoiceLineId: dong[0]!, amount: 3_200_000 },
          { invoiceLineId: dong[1]!, amount: 2_000_000 },
        ],
      },
      tokenThuNgan,
    );
    assert.equal(bh.status, 201, JSON.stringify(bh.body));

    const giua = await call('GET', `/api/v1/invoices/${nhap.body.id}`, undefined, tokenThuNgan);
    assert.equal(giua.body.status, 'PARTIALLY_PAID');
    assert.equal(giua.body.conNo, 1_750_000, 'phần khách phải trả không khớp ví dụ');

    // Khách trả 1.750.000: 500.000 khấu trừ nằm GIỮA dòng sơn + hai hạng mục
    const kh = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId,
        payerType: 'CUSTOMER',
        amount: 1_750_000,
        method: 'CASH',
        idempotencyKey: `kh-${uniq}-1`,
        allocations: [
          { invoiceLineId: dong[1]!, amount: 500_000 },
          { invoiceLineId: dong[2]!, amount: 850_000 },
          { invoiceLineId: dong[3]!, amount: 400_000 },
        ],
      },
      tokenThuNgan,
    );
    assert.equal(kh.status, 201, JSON.stringify(kh.body));

    const cuoi = await call('GET', `/api/v1/invoices/${nhap.body.id}`, undefined, tokenThuNgan);
    assert.equal(cuoi.body.status, 'PAID');
    assert.equal(cuoi.body.conNo, 0);

    /*
     * 💡 Đây là điều mà mô hình "payment gắn với hoá đơn" KHÔNG trả lời được:
     * bảo hiểm đã trả cho hạng mục nào. Công ty bảo hiểm luôn đòi bảng kê theo
     * hạng mục, và không có dữ liệu ở cấp dòng thì phải làm tay bằng Excel.
     */
    const dongSon = cuoi.body.lines.find((l: { id: string }) => l.id === dong[1]);
    assert.equal(dongSon.daThu, 2_500_000, 'dòng sơn phải gồm cả phần bảo hiểm lẫn phần khấu trừ');
  });

  test('🔒 INV-M-05: tổng phân bổ phải khớp số tiền thu', async () => {
    const r = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId,
        amount: 1_000_000,
        method: 'CASH',
        idempotencyKey: `sai-${uniq}`,
        allocations: [{ invoiceLineId: '00000000-0000-0000-0000-000000000001', amount: 300_000 }],
      },
      tokenThuNgan,
    );
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.message, /không khớp/i);
  });

  test('vòng đời hồ sơ bồi thường: không nhảy cóc trạng thái', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 100_000, soLuongXuat: 1 });

    const hs = await call('POST', '/api/v1/insurance-claims', {
      repairOrderId: c.orderId,
      insurerName: 'Bảo hiểm PVI',
      policyNumber: `PVI-${uniq}`,
      deductibleAmount: 500_000,
    });
    assert.equal(hs.status, 201, JSON.stringify(hs.body));
    assert.equal(hs.body.status, 'DRAFT');

    // DRAFT không nhảy thẳng sang APPROVED — phải qua gửi hồ sơ và giám định
    const nhayCoc = await call('POST', `/api/v1/insurance-claims/${hs.body.id}/status`, {
      status: 'APPROVED',
      approvedAmount: 5_200_000,
    });
    assert.equal(nhayCoc.status, 409, JSON.stringify(nhayCoc.body));

    for (const [tt, them] of [
      ['SUBMITTED', {}],
      ['SURVEYED', {}],
      ['PARTIALLY_APPROVED', { approvedAmount: 5_200_000 }],
      ['SETTLED', {}],
    ] as [string, object][]) {
      const r = await call('POST', `/api/v1/insurance-claims/${hs.body.id}/status`, {
        status: tt,
        ...them,
      });
      assert.equal(r.status, 201, `${tt}: ${JSON.stringify(r.body)}`);
    }

    // 🔒 Duyệt mà không ghi số tiền: "đồng ý" không nói được điều gì dùng được
    const hs2 = await call('POST', '/api/v1/insurance-claims', {
      repairOrderId: (await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 1, soLuongXuat: 1 }))
        .orderId,
      insurerName: 'Bảo hiểm Bảo Việt',
      policyNumber: `BV-${uniq}`,
    });
    await call('POST', `/api/v1/insurance-claims/${hs2.body.id}/status`, { status: 'SUBMITTED' });
    await call('POST', `/api/v1/insurance-claims/${hs2.body.id}/status`, { status: 'SURVEYED' });
    const thieuTien = await call('POST', `/api/v1/insurance-claims/${hs2.body.id}/status`, {
      status: 'APPROVED',
    });
    assert.equal(thieuTien.status, 400, JSON.stringify(thieuTien.body));
  });
});

describe('🔒 BC-13 — công nợ khách doanh nghiệp', () => {
  let congTyId = '';

  before(async () => {
    const c = await call('POST', '/api/v1/customers', {
      type: 'COMPANY',
      displayName: `Công ty vận tải ${uniq}`,
      phone: `028${uniq}`,
      taxCode: `010${uniq}0`,
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    congTyId = c.body.id;
    await pool.query(
      `UPDATE customer SET credit_limit_amount = 5000000, payment_term_days = 30 WHERE id = $1`,
      [congTyId],
    );
  });

  /**
   * Hoá đơn của công ty, kèm cách phân bổ ĐÚNG cho toàn bộ số tiền.
   *
   * Bản đầu của helper này phân bổ cả tổng hoá đơn vào `lines[0]` — dòng công
   * trị giá 412.500 — và mọi bài dùng nó đều đỏ với `OVERPAY`. Chính là INV-M-04
   * đang làm việc: không thu quá số phải thu CỦA TỪNG DÒNG.
   */
  async function hoaDonCuaCongTy(gia: number): Promise<{
    id: string;
    tong: number;
    phanBo: { invoiceLineId: string; amount: number }[];
  }> {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: gia, soLuongXuat: 1 });
    await pool.query(`UPDATE repair_order SET customer_id = $2 WHERE id = $1`, [
      c.orderId,
      congTyId,
    ]);
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    assert.equal(nhap.status, 201, JSON.stringify(nhap.body));
    return {
      id: nhap.body.id,
      tong: nhap.body.totalAmount,
      phanBo: nhap.body.lines
        .filter((l: { lineTotal: number }) => l.lineTotal > 0)
        .map((l: { id: string; lineTotal: number }) => ({
          invoiceLineId: l.id,
          amount: l.lineTotal,
        })),
    };
  }

  test('bài 1: khách cá nhân KHÔNG được ghi công nợ', async () => {
    const c = await donDaXongViec({ soLuongPhuTung: 1, giaBanPhuTung: 100_000, soLuongXuat: 1 });
    const nhap = await call('POST', '/api/v1/invoices', { repairOrderId: c.orderId });
    const r = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { ghiCongNo: true, varianceReason: 'Dựng cảnh test công nợ' },
      tokenThuNgan,
    );
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error.message, /doanh nghiệp/i);
  });

  test('bài 2: vượt hạn mức cần quản lý duyệt, không chặn cứng', async () => {
    // Hạn mức 5 triệu; hoá đơn hơn 6 triệu
    const hd = await hoaDonCuaCongTy(6_000_000);
    assert.ok(hd.tong > 5_000_000, 'cảnh chưa vượt hạn mức');

    const thuNgan = await call(
      'POST',
      `/api/v1/invoices/${hd.id}/issue`,
      { ghiCongNo: true, varianceReason: 'Dựng cảnh test hạn mức' },
      tokenThuNgan,
    );
    assert.equal(thuNgan.status, 403, JSON.stringify(thuNgan.body));
    assert.match(thuNgan.body.error.message, /hạn mức/i);

    /*
     * 🔒 Và quản lý duyệt được — không chặn cứng. BC-13 mục 4.1: chặn cứng là
     * quá cứng, đội xe đang gấp mà chặn là mất khách.
     */
    const quanLy = await call(
      'POST',
      `/api/v1/invoices/${hd.id}/issue`,
      { ghiCongNo: true, varianceReason: 'Dựng cảnh test hạn mức' },
      tokenQuanLy,
    );
    assert.equal(quanLy.status, 201, JSON.stringify(quanLy.body));
    assert.ok(quanLy.body.dueDate !== null, 'ghi nợ mà không có hạn thanh toán');
  });

  test('bài 3 + 4: một khoản thu cho NHIỀU hoá đơn, công nợ giảm đúng', async () => {
    const a = await hoaDonCuaCongTy(1_000_000);
    const b = await hoaDonCuaCongTy(2_000_000);
    for (const hd of [a, b]) {
      const r = await call(
        'POST',
        `/api/v1/invoices/${hd.id}/issue`,
        { ghiCongNo: true, varianceReason: 'Dựng cảnh test thanh toán gộp' },
        tokenQuanLy,
      );
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }

    const truoc = await call('GET', '/api/v1/reports/debt', undefined, tokenThuNgan);
    const noTruoc = truoc.body.find((d: { customerId: string }) => d.customerId === congTyId);
    assert.ok(noTruoc.tongConNo >= a.tong + b.tong, 'công nợ chưa ghi nhận hai hoá đơn mới');

    /*
     * 💡 Đây là điều mô hình `payment.invoice_id` một-một KHÔNG làm được: một
     * lần chuyển khoản trả cho nhiều hoá đơn (BC-13 mục 4.2).
     */
    const tra = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId: congTyId,
        amount: a.tong + b.tong,
        method: 'TRANSFER',
        reference: `CK-${uniq}`,
        idempotencyKey: `gop-${uniq}`,
        allocations: [...a.phanBo, ...b.phanBo],
      },
      tokenThuNgan,
    );
    assert.equal(tra.status, 201, JSON.stringify(tra.body));
    assert.ok(tra.body.allocations.length >= 2, 'một khoản thu phải trải trên hai hoá đơn');

    const sau = await call('GET', '/api/v1/reports/debt', undefined, tokenThuNgan);
    const noSau = sau.body.find((d: { customerId: string }) => d.customerId === congTyId);
    assert.equal(
      noSau?.tongConNo ?? 0,
      noTruoc.tongConNo - (a.tong + b.tong),
      'công nợ không giảm đúng bằng số tiền đã thu',
    );
  });

  test('🔒 thu hai lần vì mạng chậm — chỉ ghi MỘT khoản', async () => {
    const hd = await hoaDonCuaCongTy(500_000);
    await call(
      'POST',
      `/api/v1/invoices/${hd.id}/issue`,
      { ghiCongNo: true, varianceReason: 'Dựng cảnh test idempotency' },
      tokenQuanLy,
    );

    const than = {
      customerId: congTyId,
      amount: hd.tong,
      method: 'CASH',
      idempotencyKey: `trung-${uniq}`,
      allocations: hd.phanBo,
    };
    const lan1 = await call('POST', '/api/v1/payments', than, tokenThuNgan);
    const lan2 = await call('POST', '/api/v1/payments', than, tokenThuNgan);
    assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
    assert.equal(lan2.status, 201, 'lần bấm thứ hai phải trông như thành công');
    assert.equal(lan2.body.id, lan1.body.id, '🔒 thu tiền hai lần cho một lần khách trả');

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM payment WHERE idempotency_key = $1`,
      [than.idempotencyKey],
    );
    assert.equal(Number(rows[0]!.n), 1);
  });

  test('🔒 chứng từ đảo, không sửa và không xoá', async () => {
    const hd = await hoaDonCuaCongTy(700_000);
    await call(
      'POST',
      `/api/v1/invoices/${hd.id}/issue`,
      { ghiCongNo: true, varianceReason: 'Dựng cảnh test chứng từ đảo' },
      tokenQuanLy,
    );
    const tra = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId: congTyId,
        amount: hd.tong,
        method: 'CASH',
        idempotencyKey: `dao-goc-${uniq}`,
        allocations: hd.phanBo,
      },
      tokenThuNgan,
    );
    assert.equal(tra.status, 201, JSON.stringify(tra.body));

    // Không sửa, không xoá — kiểm bằng QUYỀN của role ứng dụng
    const { rows } = await pool.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'garageos_app' AND table_name IN ('payment','payment_allocation')
        GROUP BY privilege_type ORDER BY 1`,
    );
    assert.deepEqual(
      rows.map((r) => r.privilege_type).sort(),
      ['INSERT', 'SELECT'],
      'chứng từ tài chính có quyền ngoài SELECT + INSERT',
    );

    const dao = await call(
      'POST',
      `/api/v1/payments/${tra.body.id}/reverse`,
      { reason: 'Thu nhầm của khách khác', idempotencyKey: `dao-${uniq}` },
      tokenThuNgan,
    );
    assert.equal(dao.status, 201, JSON.stringify(dao.body));
    assert.equal(dao.body.amount, -hd.tong);

    const hoaDon = await call('GET', `/api/v1/invoices/${hd.id}`, undefined, tokenThuNgan);
    assert.equal(hoaDon.body.daThu, 0, 'đảo rồi mà hoá đơn vẫn ghi đã thu');
    assert.equal(hoaDon.body.status, 'ISSUED', 'trạng thái không quay về chưa thu');
  });
});
