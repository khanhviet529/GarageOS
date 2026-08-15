/**
 * 🔒 HÀNG RÀO: không endpoint nào rò dữ liệu của CHI NHÁNH KHÁC.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao hàng rào này tồn tại
 *
 * Vòng tự review sau Phase 3 tìm ra CHÍN vấn đề, và năm trong số đó là cùng
 * MỘT lỗi lặp lại ở bốn phase khác nhau: quên phạm vi chi nhánh.
 *
 *   F-1 (3)    hoá đơn — đọc, phát hành, thu tiền, công nợ
 *   F-6 (3)    hồ sơ bồi thường nhận dòng của đơn khác
 *   P-1 (5.4)  kiểm kê kho của chi nhánh khác
 *   P-2 (6)    báo cáo tồn kho hiện cả giá vốn kho chi nhánh khác
 *   P-3 (8)    tool AI trả về dữ liệu mọi chi nhánh
 *
 * Không phải năm lỗi độc lập — là một thói quen sai lặp năm lần. Và mỗi lần
 * đều được sửa bằng cách thêm `appendBranchScope` vào đúng chỗ vừa phát hiện,
 * tức là chờ tới lần thứ sáu.
 *
 * 💡 RLS che mất nó: RLS cô lập theo TENANT, mà hai chi nhánh của cùng một
 *    garage nằm trong cùng tenant. Mọi thứ TRÔNG NHƯ đã được bảo vệ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Cách làm: gắn nhãn rồi QUÉT, không liệt kê tay
 *
 * Dựng một đơn sửa chữa hoàn chỉnh ở chi nhánh KHÁC, rồi gọi MỌI endpoint đọc
 * bằng token của chi nhánh này và tìm dấu vết của nó trong JSON trả về.
 *
 * Cùng kỹ thuật với `tho-khong-thay-tien.spec.ts` — bài đã tìm ra ba endpoint
 * rò tiền mà đọc tay bỏ sót.
 *
 * ⚠️ Quét theo ID, KHÔNG quét theo nhãn chữ. Bản đầu gắn một chuỗi nhãn vào mọi
 *    thứ rồi tìm chuỗi đó, và nó báo ba "rò rỉ" mà hai trong ba là DƯƠNG TÍNH
 *    GIẢ: danh mục phụ tùng và tra cứu biển số trả về `part` và `vehicle` —
 *    hai bảng thuộc phạm vi TENANT, không phải chi nhánh. Một chiếc xe đến
 *    garage nào trong chuỗi cũng được, và danh mục phụ tùng dùng chung.
 *
 *    Quét theo ID của những thực thể THẬT SỰ gắn chi nhánh thì không có chỗ cho
 *    nhầm lẫn: một `repair_order.id` của chi nhánh khác xuất hiện trong phản hồi
 *    là rò rỉ, không cần bàn.
 *
 * Hai nhóm endpoint, hai cách kiểm khác nhau:
 *   A. Endpoint DANH SÁCH → phản hồi không được chứa id nào của chi nhánh khác
 *   B. Endpoint truy cập THẲNG bằng id chi nhánh khác → phải 4xx, hoặc rỗng
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

/** Nhãn không thể trùng với bất cứ dữ liệu nào khác trong hệ thống */
const NHAN = `ZZKHAC${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;

let pool: Pool;
let tokenCoVan = '';
let tokenThuKho = '';
let tokenThuNgan = '';
let tokenQuanLy = '';
let duongDan: string[] = [];
let duongDanTrucTiep: string[] = [];
const xa: Record<string, string> = {};

async function goi(path: string, token: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, text: await res.text() };
}

async function dangNhap(phone: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
    body: JSON.stringify({ phone, password: 'demo1234' }),
  });
  const j = (await res.json()) as { accessToken?: string };
  assert.ok(j.accessToken, `không đăng nhập được ${phone}`);
  return j.accessToken;
}

/**
 * Dựng một đơn HOÀN CHỈNH ở chi nhánh khác.
 *
 * Càng nhiều loại bản ghi con càng tốt: mỗi bảng là một đường rò tiềm năng, và
 * bài quét chỉ tìm được thứ nó đã dựng ra.
 */
async function dungDuLieuChiNhanhKhac(): Promise<void> {
  const { rows: b } = await pool.query<{ id: string }>(
    `SELECT id FROM branch WHERE tenant_id = $1 AND code = 'HCM01'`,
    [TENANT_A],
  );
  assert.ok(b[0], 'seed thiếu chi nhánh HCM01 — bài quét này mất ý nghĩa');
  xa.branchId = b[0].id;

  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  const userId = u[0]!.id;

  const { rows: kh } = await pool.query<{ id: string }>(
    // Khách doanh nghiệp BẮT BUỘC có mã số thuế — `customer_company_needs_tax_code`
    `INSERT INTO customer (tenant_id, type, display_name, phone, tax_code,
                           credit_limit_amount, payment_term_days)
     VALUES ($1,'COMPANY',$2,$3,$4,50000000,30) RETURNING id`,
    [TENANT_A, `Cong ty ${NHAN}`, `0333${NHAN.slice(-6)}`, `01${NHAN.slice(-8)}`],
  );
  xa.customerId = kh[0]!.id;

  const { rows: xe } = await pool.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain)
     VALUES ($1,$2,$3,'ICE') RETURNING id`,
    [TENANT_A, xa.customerId, NHAN],
  );
  xa.vehicleId = xe[0]!.id;

  const { rows: ro } = await pool.query<{ id: string }>(
    `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                               customer_complaint, odometer_in, customer_access_token,
                               created_by_user_id, status, ready_for_delivery_at)
     VALUES ($1,$2,$3,$4,$5,$6,1000,$7,$8,'AWAITING_DELIVERY', now() - interval '40 day')
     RETURNING id`,
    [
      TENANT_A,
      xa.branchId,
      `RO-${NHAN}`,
      xa.customerId,
      xa.vehicleId,
      `Khieu nai ${NHAN}`,
      `tok${NHAN}${'x'.repeat(32)}`,
      userId,
    ],
  );
  xa.orderId = ro[0]!.id;

  // Báo giá + dòng
  const { rows: pl } = await pool.query<{ id: string; labor_rate_per_hour: string }>(
    `SELECT id, labor_rate_per_hour FROM price_list
      WHERE tenant_id = $1 AND effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC LIMIT 1`,
    [TENANT_A],
  );
  const { rows: sv } = await pool.query<{ id: string }>(
    `SELECT id FROM service_item WHERE tenant_id = $1 AND is_active LIMIT 1`,
    [TENANT_A],
  );
  const { rows: q } = await pool.query<{ id: string }>(
    `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                            price_list_id, created_by_user_id)
     VALUES ($1,$2,1,$3,$4,$5) RETURNING id`,
    [TENANT_A, xa.orderId, pl[0]!.labor_rate_per_hour, pl[0]!.id, userId],
  );
  xa.quotationId = q[0]!.id;
  await pool.query(
    `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, service_item_id,
                                 description, quantity, unit_price, tax_rate_percent, status)
     VALUES ($1,$2,1,'LABOR',$3,$4,1,500000,0,'APPROVED')`,
    [TENANT_A, xa.quotationId, sv[0]!.id, `Hang muc ${NHAN}`],
  );

  // Hoá đơn đã phát hành + thu một phần -> có công nợ
  const { rows: hd } = await pool.query<{ id: string }>(
    `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                          created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [TENANT_A, xa.branchId, xa.orderId, xa.customerId, `INV-${NHAN}`, userId],
  );
  xa.invoiceId = hd[0]!.id;
  const { rows: dong } = await pool.query<{ id: string }>(
    `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                               quantity, unit_price, tax_rate_percent)
     VALUES ($1,$2,1,'PART',$3,1,3000000,0) RETURNING id`,
    [TENANT_A, xa.invoiceId, `Dong hoa don ${NHAN}`],
  );
  xa.lineId = dong[0]!.id;
  await pool.query(
    `UPDATE invoice SET status = 'ISSUED', issued_at = now(),
                        customer_snapshot = jsonb_build_object('displayName', $2::text),
                        due_date = now() - interval '5 day'
      WHERE id = $1`,
    [xa.invoiceId, `Cong ty ${NHAN}`],
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pm } = await client.query<{ id: string }>(
      `INSERT INTO payment (tenant_id, branch_id, customer_id, amount, method,
                            idempotency_key, reference, received_by_user_id)
       VALUES ($1,$2,$3,1000000,'TRANSFER',$4,$5,$6) RETURNING id`,
      [TENANT_A, xa.branchId, xa.customerId, `key${NHAN}`, `CK-${NHAN}`, userId],
    );
    await client.query(
      `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_line_id, amount)
       VALUES ($1,$2,$3,1000000)`,
      [TENANT_A, pm[0]!.id, xa.lineId],
    );
    await client.query('COMMIT');
    xa.paymentId = pm[0]!.id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Hồ sơ bồi thường
  const { rows: hs } = await pool.query<{ id: string }>(
    `INSERT INTO insurance_claim (tenant_id, repair_order_id, insurer_name, policy_number,
                                  created_by_user_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [TENANT_A, xa.orderId, `Bao hiem ${NHAN}`, `POL-${NHAN}`, userId],
  );
  xa.claimId = hs[0]!.id;

  // Phiếu kiểm kê ở kho của chi nhánh khác
  const { rows: kho } = await pool.query<{ id: string }>(
    `SELECT id FROM warehouse WHERE tenant_id = $1 AND branch_id = $2 LIMIT 1`,
    [TENANT_A, xa.branchId],
  );
  if (kho[0] !== undefined) {
    xa.warehouseId = kho[0].id;
    const { rows: kk } = await pool.query<{ id: string }>(
      `INSERT INTO stock_take (tenant_id, warehouse_id, code, status, snapshot_at,
                               started_by_user_id)
       VALUES ($1,$2,$3,'COUNTING', now(), $4) RETURNING id`,
      [TENANT_A, xa.warehouseId, `ST-${NHAN}`, userId],
    );
    xa.stockTakeId = kk[0]!.id;

    // Mã hàng riêng, chỉ tồn ở kho chi nhánh khác
    const { rows: pt } = await pool.query<{ id: string }>(
      `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
       VALUES ($1,$2,$3,'cái','Quét',0) RETURNING id`,
      [TENANT_A, `PT-${NHAN}`, `Phu tung ${NHAN}`],
    );
    xa.partId = pt[0]!.id;
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, ref_type, created_by_user_id)
       VALUES ($1,$2,$3,'RECEIPT',10,123456,'PURCHASE',$4)`,
      [TENANT_A, xa.warehouseId, xa.partId, userId],
    );
  }

  // Phân công ở chi nhánh khác — để hai route `assignments/*` có id mà thử
  const { rows: ql } = await pool.query<{ id: string }>(
    `SELECT id FROM quotation_line WHERE quotation_id = $1 LIMIT 1`,
    [xa.quotationId],
  );
  xa.quotationLineId = ql[0]!.id;
  const { rows: bay } = await pool.query<{ id: string }>(
    `SELECT id FROM bay WHERE tenant_id = $1 AND branch_id = $2 LIMIT 1`,
    [TENANT_A, xa.branchId],
  );
  const { rows: tho } = await pool.query<{ id: string }>(
    `SELECT u.id FROM app_user u WHERE u.tenant_id = $1 AND 'TECHNICIAN' = ANY(u.roles) LIMIT 1`,
    [TENANT_A],
  );
  if (bay[0] !== undefined && tho[0] !== undefined) {
    const moc = new Date(Date.now() + (1100 + (process.pid % 100)) * 24 * 3600 * 1000);
    const { rows: wa } = await pool.query<{ id: string }>(
      `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
         technician_id, bay_id, planned_start, planned_end, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$4) RETURNING id`,
      [
        TENANT_A,
        xa.orderId,
        xa.quotationLineId,
        tho[0].id,
        bay[0].id,
        moc,
        new Date(moc.getTime() + 2 * 3600 * 1000),
      ],
    );
    xa.assignmentId = wa[0]!.id;
  }

  // Nhật ký liên hệ + phí lưu bãi (xe nằm bãi)
  await pool.query(
    `INSERT INTO customer_contact_attempt (tenant_id, repair_order_id, attempted_by_user_id,
                                           channel, outcome, note)
     VALUES ($1,$2,$3,'PHONE','NO_ANSWER',$4)`,
    [TENANT_A, xa.orderId, userId, `Ghi chu ${NHAN}`],
  );
  await pool.query(
    `UPDATE repair_order SET abandonment_status = 'OVERDUE' WHERE id = $1`,
    [xa.orderId],
  );
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenCoVan = await dangNhap('0901000003');
  tokenThuKho = await dangNhap('0901000005');
  tokenThuNgan = await dangNhap('0901000006');
  tokenQuanLy = await dangNhap('0901000002');

  // Điều kiện tiên quyết: bốn vai trên đều thuộc HN01, không thuộc HCM01
  const { rows } = await pool.query<{ phone: string; codes: string[] }>(
    `SELECT u.phone, array_agg(b.code ORDER BY b.code) AS codes
       FROM app_user u
       JOIN user_branch ub ON ub.user_id = u.id
       JOIN branch b ON b.id = ub.branch_id
      WHERE u.phone IN ('0901000002','0901000003','0901000005','0901000006')
      GROUP BY u.phone`,
  );
  for (const r of rows) {
    assert.deepEqual(
      r.codes,
      ['HN01'],
      `${r.phone} không còn thuộc đúng một chi nhánh HN01 — bài quét mất ý nghĩa`,
    );
  }

  await dungDuLieuChiNhanhKhac();

  // Vài id "của mình" để gọi những endpoint cần tham số
  const { rows: minh } = await pool.query<{ id: string; vehicle_id: string }>(
    `SELECT id, vehicle_id FROM repair_order WHERE code = 'RO-DEMO-0001'`,
  );
  const { rows: kh } = await pool.query<{ id: string }>(
    `SELECT customer_id AS id FROM repair_order WHERE code = 'RO-DEMO-0001'`,
  );

  duongDanTrucTiep = [
    `/api/v1/repair-orders/${xa.orderId}`,
    `/api/v1/repair-orders/${xa.orderId}/invoices`,
    `/api/v1/repair-orders/${xa.orderId}/quotations`,
    `/api/v1/repair-orders/${xa.orderId}/assignments`,
    `/api/v1/repair-orders/${xa.orderId}/supplements`,
    `/api/v1/repair-orders/${xa.orderId}/contacts`,
    `/api/v1/repair-orders/${xa.orderId}/storage-fee`,
    `/api/v1/repair-orders/${xa.orderId}/settlement`,
    `/api/v1/repair-orders/${xa.orderId}/cancel-preview`,
    `/api/v1/repair-orders/${xa.orderId}/warranty-costs`,
    `/api/v1/repair-orders/${xa.orderId}/insurance-claim`,
    `/api/v1/invoices/${xa.invoiceId}`,
    `/api/v1/quotations/${xa.quotationId}`,
    `/api/v1/customers/${xa.customerId}/payments`,
    ...(xa.stockTakeId === undefined ? [] : [`/api/v1/stock-takes/${xa.stockTakeId}`]),
    ...(xa.assignmentId === undefined
      ? []
      : [`/api/v1/assignments/${xa.assignmentId}/time`]),
  ];

  duongDan = [
    '/api/v1/auth/me',
    '/api/v1/repair-orders?open=true',
    '/api/v1/abandoned-vehicles',
    '/api/v1/insurance-claims',
    '/api/v1/stock-takes',
    '/api/v1/warehouses',
    '/api/v1/stock/balances',
    '/api/v1/stock/movements',
    '/api/v1/stock/parts',
    '/api/v1/stock/pending-issues',
    '/api/v1/bays',
    '/api/v1/supplements',
    '/api/v1/assignments/pending-work',
    '/api/v1/assignments/technician-options?quotationLineId=' +
      `${xa.quotationLineId}&plannedStart=${encodeURIComponent(new Date().toISOString())}`,
    '/api/v1/assignments/quality',
    `/api/v1/assignments?date=${new Date().toISOString().slice(0, 10)}`,
    '/api/v1/reports/profit',
    '/api/v1/reports/wait-time',
    '/api/v1/reports/productivity',
    '/api/v1/reports/stock',
    '/api/v1/reports/stock-variance',
    '/api/v1/reports/on-time',
    '/api/v1/reports/debt',
    '/api/v1/ai/usage',

    /*
     * Ba đường dưới đây thuộc phạm vi TENANT chứ không phải chi nhánh, và có
     * mặt ở đây CÓ CHỦ Ý: chúng phải trả về dữ liệu, và bài quét theo id sẽ
     * không coi đó là rò rỉ.
     *
     *  · `vehicles/:id/warranty` — bảo hành theo XE, mà xe đến chi nhánh nào
     *    cũng được. Chặn theo chi nhánh sẽ làm khách không tra được bảo hành ở
     *    chi nhánh gần nhà.
     *  · `catalog/vehicle/:id` — danh mục dịch vụ và phụ tùng dùng chung chuỗi.
     *  · `vehicles/lookup` — tra biển số để biết xe đã từng vào chuỗi chưa.
     */
    `/api/v1/vehicles/${xa.vehicleId}/warranty`,
    `/api/v1/catalog/vehicle/${xa.vehicleId}`,
    '/api/v1/vehicles/lookup?plate=' + encodeURIComponent(NHAN),

    // Vài đường "của mình" để bảo đảm bài quét không chỉ toàn 404
    ...(minh[0] === undefined ? [] : [`/api/v1/repair-orders/${minh[0].id}`]),
    ...(kh[0] === undefined ? [] : [`/api/v1/customers/${kh[0].id}/payments`]),
  ];
});

after(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM payment_allocation WHERE payment_id IN
         (SELECT id FROM payment WHERE idempotency_key LIKE $1)`,
      [`key${NHAN}%`],
    );
    await client.query(`DELETE FROM payment WHERE idempotency_key LIKE $1`, [`key${NHAN}%`]);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
  for (const q of [
    [`UPDATE invoice SET status = 'DRAFT' WHERE code LIKE $1`, [`INV-${NHAN}%`]],
    [`DELETE FROM e_invoice WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`, [`INV-${NHAN}%`]],
    [`DELETE FROM invoice_line WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`, [`INV-${NHAN}%`]],
    [`DELETE FROM invoice WHERE code LIKE $1`, [`INV-${NHAN}%`]],
    [`DELETE FROM insurance_claim WHERE policy_number LIKE $1`, [`POL-${NHAN}%`]],
    [`DELETE FROM stock_take_line WHERE stock_take_id IN (SELECT id FROM stock_take WHERE code LIKE $1)`, [`ST-${NHAN}%`]],
    [`DELETE FROM stock_take WHERE code LIKE $1`, [`ST-${NHAN}%`]],
    [`DELETE FROM stock_movement WHERE part_id IN (SELECT id FROM part WHERE sku LIKE $1)`, [`PT-${NHAN}%`]],
    [`DELETE FROM stock_balance WHERE part_id IN (SELECT id FROM part WHERE sku LIKE $1)`, [`PT-${NHAN}%`]],
    [`DELETE FROM part WHERE sku LIKE $1`, [`PT-${NHAN}%`]],
    [`DELETE FROM customer_contact_attempt WHERE repair_order_id IN (SELECT id FROM repair_order WHERE code LIKE $1)`, [`RO-${NHAN}%`]],
    [`DELETE FROM time_log WHERE work_assignment_id IN (SELECT id FROM work_assignment WHERE repair_order_id IN (SELECT id FROM repair_order WHERE code LIKE $1))`, [`RO-${NHAN}%`]],
    [`DELETE FROM work_assignment WHERE repair_order_id IN (SELECT id FROM repair_order WHERE code LIKE $1)`, [`RO-${NHAN}%`]],
    [`DELETE FROM quotation_line WHERE quotation_id IN (SELECT id FROM quotation WHERE repair_order_id IN (SELECT id FROM repair_order WHERE code LIKE $1))`, [`RO-${NHAN}%`]],
    [`DELETE FROM quotation WHERE repair_order_id IN (SELECT id FROM repair_order WHERE code LIKE $1)`, [`RO-${NHAN}%`]],
    [`DELETE FROM repair_order WHERE code LIKE $1`, [`RO-${NHAN}%`]],
    [`DELETE FROM vehicle_ownership WHERE vehicle_id IN (SELECT id FROM vehicle WHERE plate_number LIKE $1)`, [`${NHAN}%`]],
    [`DELETE FROM vehicle WHERE plate_number LIKE $1`, [`${NHAN}%`]],
    [`DELETE FROM customer WHERE display_name LIKE $1`, [`%${NHAN}%`]],
  ] as [string, unknown[]][]) {
    await pool.query(q[0], q[1]);
  }
  await pool.end();
});

/**
 * Những thực thể THẬT SỰ gắn chi nhánh. Id của chúng xuất hiện trong phản hồi
 * của người thuộc chi nhánh khác là rò rỉ, không cần bàn thêm.
 *
 * `customer`, `vehicle`, `part` KHÔNG có ở đây: chúng thuộc phạm vi tenant.
 */
function idThuocChiNhanhKhac(): { ten: string; id: string }[] {
  return (
    [
      ['đơn sửa chữa', xa.orderId],
      ['hoá đơn', xa.invoiceId],
      ['dòng hoá đơn', xa.lineId],
      ['báo giá', xa.quotationId],
      ['hồ sơ bồi thường', xa.claimId],
      ['phiếu thu', xa.paymentId],
      ['chi nhánh', xa.branchId],
      ['kho', xa.warehouseId],
      ['phiếu kiểm kê', xa.stockTakeId],
      ['phân công', xa.assignmentId],
    ] as [string, string | undefined][]
  )
    .filter((x): x is [string, string] => x[1] !== undefined)
    .map(([ten, id]) => ({ ten, id }));
}

describe('🔒 Quét: dữ liệu chi nhánh khác không lọt ra endpoint nào', () => {
  for (const [ten, lay] of [
    ['cố vấn dịch vụ', () => tokenCoVan],
    ['thủ kho', () => tokenThuKho],
    ['thu ngân', () => tokenThuNgan],
    ['quản lý chi nhánh', () => tokenQuanLy],
  ] as [string, () => string][]) {
    test(`nhóm A — ${ten} HN01 không thấy id nào của HCM01 trong danh sách`, async () => {
      const roRi: string[] = [];
      const canTim = idThuocChiNhanhKhac();

      for (const d of duongDan) {
        const r = await goi(d, lay());
        if (r.status >= 400) continue;
        for (const x of canTim) {
          if (r.text.includes(x.id)) roRi.push(`${d} → lộ ${x.ten} (${x.id})`);
        }
      }

      assert.deepEqual(
        roRi,
        [],
        `🔒 Endpoint rò dữ liệu chi nhánh khác cho ${ten}:\n  ${roRi.join('\n  ')}`,
      );
    });

    test(`nhóm B — ${ten} HN01 gọi thẳng id của HCM01: 4xx hoặc rỗng`, async () => {
      /*
       * Khác nhóm A: ở đây id đã nằm trong đường dẫn, nên tìm nó trong phản hồi
       * là vô nghĩa. Điều phải kiểm là phản hồi KHÔNG CÓ NỘI DUNG — hoặc bị
       * chặn thẳng.
       */
      const roRi: string[] = [];
      for (const d of duongDanTrucTiep) {
        const r = await goi(d, lay());
        if (r.status >= 400) continue;
        const rong =
          r.text === '' || r.text === 'null' || r.text === '[]' || r.text === '{}';
        if (!rong) roRi.push(`${d} → ${r.status}, ${r.text.slice(0, 90)}…`);
      }
      assert.deepEqual(
        roRi,
        [],
        `🔒 Truy cập thẳng bằng id chi nhánh khác trả về dữ liệu cho ${ten}:\n  ${roRi.join('\n  ')}`,
      );
    });
  }

  test('ĐỐI CHỨNG: bài quét thật sự gọi được endpoint, không phải toàn 4xx', async () => {
    /*
     * Không có vế này thì một cấu hình hỏng làm mọi endpoint trả 500 cũng khiến
     * bốn bài trên xanh — và bài quét trở thành một dòng chữ trấn an.
     */
    let ok = 0;
    for (const d of duongDan) {
      const r = await goi(d, tokenQuanLy);
      if (r.status === 200) ok += 1;
    }
    assert.ok(
      ok >= 15,
      `chỉ ${ok}/${duongDan.length} endpoint trả 200 — bài quét không quét được gì`,
    );
  });

  test('🔒 hàng rào: mọi route @Get trong mã nguồn đều nằm trong danh sách quét', () => {
    /*
     * Endpoint mới thêm mà quên đưa vào `duongDan` thì bài quét bỏ sót nó và
     * vẫn xanh. Cùng cơ chế đối chiếu đã dùng ở `tho-khong-thay-tien.spec.ts`.
     */
    const thuMuc = join(process.cwd(), 'src');
    const routes: string[] = [];
    const di = (d: string): void => {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, f.name);
        if (f.isDirectory()) di(p);
        else if (f.name.endsWith('.controller.ts')) {
          const src = readFileSync(p, 'utf8');
          const prefix = /@Controller\('([^']*)'\)/.exec(src)?.[1] ?? '';
          for (const m of src.matchAll(/@Get\('([^']*)'\)/g)) {
            routes.push(`${prefix}/${m[1]}`.replace(/\/+/g, '/'));
          }
          if (/@Get\(\)/.test(src)) routes.push(prefix);
        }
      }
    };
    di(thuMuc);

    /*
     * Ba nhóm route KHÔNG thuộc phạm vi bài này, và mỗi nhóm phải nêu lý do —
     * "không áp dụng" mà không kèm lý do là một lỗ hổng đội lốt ngoại lệ.
     */
    const boQua: Record<string, string> = {
      'api/v1/health': 'kiểm tra sống — không trả dữ liệu nghiệp vụ nào',
      '/health': 'kiểm tra sống, controller không có tiền tố đường dẫn',
      'api/v1/public/tracking/:token':
        'trang tra cứu công khai: khách không có tài khoản, phạm vi do chính token quyết định',
      'api/v1/marketing/vehicle-products': 'catalog marketing có phạm vi tenant, không theo chi nhánh',
      'api/v1/marketing/vehicle-products/:id': 'catalog marketing có phạm vi tenant, không theo chi nhánh',
      'api/v1/marketing/vehicle-products/:id/experiences': 'experience marketing có phạm vi tenant',
      'api/v1/marketing/site-profile': 'hồ sơ landing là dữ liệu tenant',
      'api/v1/marketing/branch-public-profiles': 'cấu hình public profile không phải dữ liệu vận hành chi nhánh',
      'api/v1/public/site': 'bootstrap landing công khai, tenant lấy từ hostname',
      'api/v1/public/vehicle-products/:slug': 'catalog công khai, tenant lấy từ hostname',
      'api/v1/public/vehicle-products/:slug/experiences/:stableKey': 'experience công khai, tenant lấy từ hostname',
      'api/v1/public/vehicle-products/:slug/chi-phi-so-huu': 'chi phí bảo dưỡng công khai, tenant lấy từ hostname',
      'api/v1/public/leads': 'lead public chỉ POST; GET guard là controller scan metadata',
      /*
       * ⚠️ NỢ, không phải miễn trừ thật. `requireLeadInScope()` CÓ áp
       * `sl.branch_id = ANY($branchIds)` khi scope là BRANCH — nghĩa là hai
       * route này thuộc đúng loại mà bài quét sinh ra để canh. Chúng nằm đây
       * chỉ vì seed chưa có lead ở chi nhánh khác để dựng ca quét.
       * Việc phải làm: tạo lead ở HCM01 rồi chuyển hai dòng này sang `duongDan`.
       */
      'api/v1/sales/leads': 'NỢ — chưa có lead ở chi nhánh khác trong seed để quét',
      'api/v1/sales/leads/:id': 'NỢ — chưa có lead ở chi nhánh khác trong seed để quét',
      'api/v1/public/vehicle-products': 'catalog công khai, tenant lấy từ hostname',
      'media/:key': 'media public chỉ được phát từ asset đã publish',
    };

    /*
     * 🔒 Chuẩn hoá tham số của `boQua` GIỐNG HỆT cách chuẩn hoá route thật.
     *
     * Bản trước so khớp `boQua` bằng tên tham số nguyên gốc (`:id`, `:slug`,
     * `:key`) trong khi `routes` đã được đổi hết thành `:x`. Hệ quả: mọi dòng
     * miễn trừ có tham số đều VÔ TÁC DỤNG — chỉ `:token` khớp, và khớp nhờ một
     * phép thay ngược `:x → :token` chỉ đúng cho đúng một route.
     *
     * Đây là kiểu hỏng nguy hiểm nhất của một hàng rào: nó không im lặng cho
     * qua, nó báo động NHẦM. Người thêm route mới sẽ thấy tên route mình vừa
     * khai báo miễn trừ vẫn bị liệt kê, và cách sửa nhanh nhất trông như là
     * "xoá cái assert phiền phức này đi".
     */
    /*
     * ⚠️ Chuẩn hoá phải nuốt cả ĐẶC TẢ ĐƯỜNG DẪN, không chỉ tên tham số.
     *
     * Bản trước đổi `:ten` thành `:x` rồi ghép thẳng phần còn lại vào `RegExp`.
     * Với một route hợp lệ như `media/:key(*)` — cú pháp Express để bắt cả phần
     * chứa dấu `/` — chuỗi ghép ra là:
     *
     *     /^media\/[^\/?]+(*)(\?|$)/     ->  SyntaxError: Nothing to repeat
     *
     * Hàng rào không báo "thiếu route", nó ĐỔ VỠ. Và một hàng rào đổ vỡ thì cách
     * sửa nhanh nhất luôn trông như "xoá cái assert phiền phức này đi" — đúng
     * thứ mà chú thích ngay phía trên đã cảnh báo, chỉ ở một dạng khác.
     */
    const chuanHoa = (r: string): string => r.replace(/:[a-zA-Z]+(\([^)]*\))?/g, ':x');
    const boQuaChuanHoa = new Set(Object.keys(boQua).map(chuanHoa));

    const thieu = routes
      .map(chuanHoa)
      .filter((r) => !boQuaChuanHoa.has(r))
      .filter((r) => {
        // Thoát TOÀN BỘ phần cố định TRƯỚC, rồi mới thay chỗ giữ. Đảo thứ tự là
        // để `(`, `*`, `.` trong route chảy thẳng vào regex.
        const mau = r.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/:x/g, '[^/?]+');
        return ![...duongDan, ...duongDanTrucTiep].some((d) =>
          new RegExp(`^${mau}(\\?|$)`).test(d.replace(/^\//, '')),
        );
      });

    assert.deepEqual(
      [...new Set(thieu)],
      [],
      'Route mới chưa được đưa vào bài quét phạm vi chi nhánh — thêm vào `duongDan`',
    );
  });
});
