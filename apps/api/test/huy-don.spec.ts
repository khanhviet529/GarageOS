/**
 * Phase 5.3 — huỷ đơn giữa chừng và quyết toán (BC-10).
 *
 * Mười bài của BC-10 mục 8, cộng hai bài mà tài liệu không có nhưng thực tế
 * xưởng thì có: sau khi huỷ, app thợ vẫn còn mở màn cũ và thủ kho vẫn còn món
 * hàng đã soạn trên bàn.
 *
 * 🔒 Sau MỌI kịch bản đều đối soát sổ kho (INV-S-02). Huỷ đơn là thao tác đụng
 *    kho nhiều nhất trong cả hệ thống — nhả giữ chỗ, trả hàng, và một nhánh
 *    "hàng hỏng" cố ý KHÔNG sinh dòng sổ. Nhánh cuối là chỗ dễ trừ tồn hai lần
 *    nhất, và chỉ đối soát mới thấy.
 */
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

let pool: Pool;
let tokenCoVan = '';
let tokenQuanLy = '';
let tokenThuKho = '';
let branchId = '';
let customerId = '';
let khoId = '';
let dem = 0;
const uniq = `${Date.now().toString().slice(-5)}${process.pid.toString().slice(-3)}`;

/**
 * Khung giờ đặt lịch RIÊNG cho mỗi lần chạy và mỗi bài.
 *
 * Ba exclusion constraint (`no_bay_overlap`, `no_tech_overlap`,
 * `no_timelog_overlap`) không biết gì về test: một khung cố định thì lần chạy
 * thứ hai đụng đúng lịch lần chạy thứ nhất, và bài thất bại vì lý do không liên
 * quan tới điều nó muốn kiểm tra. Lấy mốc lệch theo pid — cùng cách đã dùng ở
 * assignment.spec.ts.
 */
function khungGio(chiSo: number): { batDau: Date; ketThuc: Date } {
  const goc = Date.now() + (300 + (process.pid % 200) * 3 + chiSo * 4) * 24 * 3600 * 1000;
  return { batDau: new Date(goc), ketThuc: new Date(goc + 2 * 3600 * 1000) };
}

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

/** 🔒 INV-S-02 — sổ kho và tồn tổng hợp phải khớp, sau mọi kịch bản */
async function assertLedgerMatchesBalance(): Promise<void> {
  const { rows } = await pool.query<{ warehouse_id: string; part_id: string; on_hand: string; ledger: string }>(
    `SELECT b.warehouse_id, b.part_id, b.on_hand, COALESCE(SUM(m.quantity), 0) AS ledger
       FROM stock_balance b
       LEFT JOIN stock_movement m
         ON m.tenant_id = b.tenant_id AND m.warehouse_id = b.warehouse_id
        AND m.part_id = b.part_id
      GROUP BY b.tenant_id, b.warehouse_id, b.part_id, b.on_hand
     HAVING b.on_hand <> COALESCE(SUM(m.quantity), 0)`,
  );
  assert.deepEqual(
    rows.map((r) => `${r.warehouse_id}/${r.part_id}: tồn ${r.on_hand} vs sổ ${r.ledger}`),
    [],
    '🔒 INV-S-02 — tồn tổng hợp lệch với sổ kho',
  );
}

interface Canh {
  repairOrderId: string;
  vehicleId: string;
  quotationId: string;
  congLineId: string;
  partLineId: string;
  partId: string;
  /** Có khi kịch bản yêu cầu giữ chỗ */
  reservationId?: string;
  version: number;
  donDep: () => Promise<void>;
}

/**
 * Dựng một đơn đang sửa dở, với hạng mục công + phụ tùng ĐÃ DUYỆT.
 *
 * Phụ tùng là một mã RIÊNG cho từng kịch bản, không dùng chung với seed: các
 * bài dưới đây đo `on_hand` trước/sau, và một mã hàng dùng chung thì con số đó
 * phụ thuộc bài nào chạy trước.
 */
async function donDangSua(opts: { giuCho?: number; tonBanDau?: number } = {}): Promise<Canh> {
  dem += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `77C-${uniq}${dem}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test huỷ đơn',
    odometerIn: 30_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  /*
   * Hai hạng mục công, và việc tách chúng ra là CÓ CHỦ Ý.
   *
   * Công chẩn đoán và công sửa chữa đi theo hai chính sách khác nhau khi huỷ
   * (`charge_diagnosis_fee_on_cancel` và `charge_diagnosis_fee_if_garage_unable`).
   * Bản đầu của bài test lấy đại hạng mục đầu tiên không đòi chứng chỉ — và trúng
   * ngay một hạng mục nhóm DIAGNOSIS, nên bài "công đã làm phải có trên quyết
   * toán" thất bại trong khi mã nguồn hoàn toàn đúng.
   */
  const { rows: svRows } = await pool.query<{ id: string; category: string }>(
    `SELECT id, category FROM service_item
      WHERE tenant_id = $1 AND is_active AND cardinality(required_certifications) = 0
      ORDER BY category`,
    [TENANT_A],
  );
  const sv = svRows.find((x) => x.category !== 'DIAGNOSIS');
  const svChanDoan = svRows.find((x) => x.category === 'DIAGNOSIS');
  assert.ok(sv && svChanDoan, 'danh mục thiếu hạng mục sửa chữa hoặc hạng mục chẩn đoán');

  // Mã hàng riêng cho kịch bản này, có giá bán trong bảng giá đang hiệu lực
  const { rows: p } = await pool.query<{ id: string }>(
    `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
     VALUES ($1, $2, 'Phụ tùng thử huỷ đơn', 'cái', 'Thử', 0) RETURNING id`,
    [TENANT_A, `PT-HUY-${uniq}${dem}`],
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
     VALUES ($1,$2,$3,500000,10)`,
    [pl[0]!.id, TENANT_A, partId],
  );

  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  const tonBanDau = opts.tonBanDau ?? 10;
  await pool.query(
    `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                 unit_cost, ref_type, created_by_user_id)
     VALUES ($1,$2,$3,'RECEIPT',$4,300000,'PURCHASE',$5)`,
    [TENANT_A, khoId, partId, tonBanDau, u[0]!.id],
  );

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  assert.equal(q.status, 201, JSON.stringify(q.body));
  const cong = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'LABOR',
    serviceItemId: sv.id,
    quantity: 1,
  });
  assert.equal(cong.status, 201, JSON.stringify(cong.body));
  const chanDoan = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'LABOR',
    serviceItemId: svChanDoan.id,
    quantity: 1,
  });
  assert.equal(chanDoan.status, 201, JSON.stringify(chanDoan.body));
  const phuTung = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'PART',
    partId,
    parentLineId: cong.body.id,
    quantity: 2,
  });
  assert.equal(phuTung.status, 201, JSON.stringify(phuTung.body));

  await pool.query(
    `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'COUNTER'
      WHERE quotation_id = $1`,
    [q.body.id],
  );
  // Báo giá giữ nguyên DRAFT: bài này chỉ cần các DÒNG đã duyệt. Đẩy cả tờ báo
  // giá sang APPROVED sẽ đòi `valid_until` (`quotation_sent_needs_validity`),
  // và đường đi thật của việc đó là luồng duyệt của khách, đã có test riêng.

  let reservationId: string | undefined;
  if (opts.giuCho !== undefined) {
    const { rows: sr } = await pool.query<{ id: string }>(
      `INSERT INTO stock_reservation (tenant_id, warehouse_id, part_id, repair_order_id,
                                      quotation_line_id, quantity, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days') RETURNING id`,
      [TENANT_A, khoId, partId, o.body.id, phuTung.body.id, opts.giuCho],
    );
    reservationId = sr[0]!.id;
  }

  for (const tt of ['AWAITING_APPROVAL', 'IN_PROGRESS']) {
    await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [o.body.id, tt]);
  }
  const { rows: ver } = await pool.query<{ version: string }>(
    'SELECT version FROM repair_order WHERE id = $1',
    [o.body.id],
  );

  const donDep = async (): Promise<void> => {
    // Phân công và giờ công phải dọn trước: chúng chiếm chỗ trên ba exclusion
    // constraint, và một lần chạy hỏng giữa chừng sẽ làm hỏng cả lần chạy sau.
    await pool.query(
      `DELETE FROM time_log WHERE work_assignment_id IN (
         SELECT id FROM work_assignment WHERE repair_order_id = $1)`,
      [o.body.id],
    );
    await pool.query('DELETE FROM work_assignment WHERE repair_order_id = $1', [o.body.id]);
    await pool.query('UPDATE stock_movement SET reservation_id = NULL WHERE part_id = $1', [partId]);
    await pool.query('DELETE FROM stock_reservation WHERE part_id = $1', [partId]);
    await pool.query(
      `DELETE FROM stock_movement WHERE part_id = $1 AND type IN ('RETURN','ADJUSTMENT')`,
      [partId],
    );
    await pool.query('DELETE FROM stock_movement WHERE part_id = $1', [partId]);
    await pool.query('DELETE FROM stock_balance WHERE part_id = $1', [partId]);
  };

  return {
    repairOrderId: o.body.id,
    vehicleId: v.body.id,
    quotationId: q.body.id,
    congLineId: cong.body.id,
    partLineId: phuTung.body.id,
    partId,
    reservationId,
    version: Number(ver[0]!.version),
    donDep,
  };
}

async function tonKho(partId: string): Promise<{ onHand: number; reserved: number }> {
  const { rows } = await pool.query<{ on_hand: string; reserved: string }>(
    'SELECT on_hand, reserved FROM stock_balance WHERE part_id = $1',
    [partId],
  );
  return rows[0] === undefined
    ? { onHand: 0, reserved: 0 }
    : { onHand: Number(rows[0].on_hand), reserved: Number(rows[0].reserved) };
}

/**
 * 🔒 Dọn đoạn giờ CÒN MỞ trước khi bắt đầu — bộ này không được phụ thuộc vào
 *    việc lượt chạy trước có kết thúc sạch sẽ hay không.
 *
 * Một `time_log` chưa đóng có khoảng thời gian kéo tới VÔ CÙNG, nên nó chồng
 * lên mọi đoạn khác của cùng người thợ — kể cả đoạn nằm sau nó.
 * `no_timelog_overlap` từ chối, và thông báo ("conflicting key value violates
 * exclusion constraint") không hé lộ gì về nguyên nhân thật.
 *
 * Hậu quả trước khi có bước này: một lượt chạy hỏng giữa chừng để lại đoạn mở,
 * rồi MỌI lượt sau đều đỏ — ở những bài chẳng liên quan gì tới thứ vừa sửa.
 * Đã báo động nhầm hai lần trong một ngày.
 *
 * 💡 Đây đúng việc mà `dong_ho_gio_bo_quen()` làm trong đời thật, nên bộ test
 *    dọn theo đúng cách đó chứ không xoá thẳng: xoá thì che mất dữ liệu mà một
 *    lượt chạy trước có thể đang cần để chẩn đoán.
 */
async function dongDoanGioBoQuen(p: Pool): Promise<void> {
  await p.query(
    `UPDATE time_log SET ended_at = started_at + interval '1 hour',
                         auto_closed = true, pause_reason = 'SHIFT_END'
      WHERE ended_at IS NULL`,
  );
  await p.query(
    `UPDATE work_assignment SET status = 'PAUSED' WHERE status = 'IN_PROGRESS'`,
  );
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  await dongDoanGioBoQuen(pool);
  tokenCoVan = await dangNhap('0901000003');
  tokenQuanLy = await dangNhap('0901000001');
  tokenThuKho = await dangNhap('0901000002');

  const me = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003',
    password: 'demo1234',
  }, '');
  branchId = me.body.user.branchIds[0];

  const { rows: w } = await pool.query<{ id: string }>(
    `SELECT w.id FROM warehouse w JOIN branch b ON b.id = w.branch_id
      WHERE b.id = $1 LIMIT 1`,
    [branchId],
  );
  assert.ok(w[0], 'chi nhánh không có kho');
  khoId = w[0].id;

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách huỷ đơn ${uniq}`,
    phone: `035${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

afterEach(assertLedgerMatchesBalance);

after(async () => {
  /*
   * Đưa bảng quyết toán về DRAFT trước khi xoá dòng.
   *
   * `trg_settlement_line_khoa` chặn cả DELETE trên bảng đã CONFIRMED/WAIVED —
   * kể cả kết nối quản trị. Đó là điều đúng: khoá mà mở được bằng một đường
   * khác thì không phải khoá. Dọn dẹp trong test cũng phải đi qua cửa đó.
   */
  await pool.query(
    `UPDATE cancellation_settlement SET status = 'DRAFT' WHERE repair_order_id IN (
       SELECT ro.id FROM repair_order ro JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number LIKE $1)`,
    [`77C-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM cancellation_settlement_line WHERE settlement_id IN (
       SELECT s.id FROM cancellation_settlement s
         JOIN repair_order ro ON ro.id = s.repair_order_id
         JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number LIKE $1)`,
    [`77C-${uniq}%`],
  );
  await pool.end();
});

describe('🔒 BC-10 — huỷ là quyết toán, không phải xoá', () => {
  test('bài 1: huỷ ở RECEIVED — không có gì để quyết toán', async () => {
    const v = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: `77C-${uniq}R`,
      powertrain: 'ICE',
    });
    const o = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v.body.id,
      branchId,
      customerComplaint: 'Khách đổi ý ngay sau khi tiếp nhận',
      odometerIn: 10_000,
    });

    const r = await call('POST', `/api/v1/repair-orders/${o.body.id}/cancel`, {
      version: 0,
      reason: 'Khách gọi lại nói thôi không sửa nữa',
      category: 'CUSTOMER_REQUEST',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.totalAmount, 0, 'chưa làm gì mà vẫn đòi tiền');
    assert.equal(r.body.lines.length, 0);

    const { rows } = await pool.query<{ status: string; cancel_category: string }>(
      'SELECT status::text AS status, cancel_category FROM repair_order WHERE id = $1',
      [o.body.id],
    );
    assert.equal(rows[0]!.status, 'CANCELLED');
    // 🔒 Đơn vẫn còn đó — huỷ không bao giờ là DELETE
    assert.equal(rows[0]!.cancel_category, 'CUSTOMER_REQUEST');
  });

  test('không thể bỏ qua quyết toán bằng route đổi trạng thái chung', async () => {
    const c = await donDangSua();
    try {
      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/status`, {
        to: 'CANCELLED',
        version: c.version,
        cancelReason: 'Thử đi tắt quy trình hủy',
        cancelCategory: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 409, JSON.stringify(r.body));

      const { rows } = await pool.query<{ status: string }>(
        'SELECT status::text AS status FROM repair_order WHERE id = $1',
        [c.repairOrderId],
      );
      assert.notEqual(rows[0]!.status, 'CANCELLED');
    } finally {
      await c.donDep();
    }
  });

  test('bài 2: huỷ sau khi giữ chỗ — mọi giữ chỗ được nhả, reserved về 0', async () => {
    const c = await donDangSua({ giuCho: 2 });
    try {
      const truoc = await tonKho(c.partId);
      assert.equal(truoc.reserved, 2, 'chưa dựng đúng cảnh có giữ chỗ');

      const xem = await call('GET', `/api/v1/repair-orders/${c.repairOrderId}/cancel-preview`);
      assert.equal(xem.status, 200, JSON.stringify(xem.body));
      assert.equal(xem.body.activeReservationCount, 1);
      assert.equal(xem.body.cancellable, true);

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Khách đổi ý sau khi duyệt báo giá',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const sau = await tonKho(c.partId);
      assert.equal(sau.reserved, 0, '🔒 quên nhả chỗ = hàng bị khoá vĩnh viễn, kho "hết hàng" giả');
      assert.equal(sau.onHand, truoc.onHand, 'nhả chỗ không được đụng tồn thực tế');
    } finally {
      await c.donDep();
    }
  });

  test('bài 3: xuất kho rồi huỷ, hàng CHƯA lắp — trả về kho, tồn trở lại như cũ', async () => {
    const c = await donDangSua({ giuCho: 2, tonBanDau: 10 });
    try {
      const xuat = await call(
        'POST',
        '/api/v1/stock/issues',
        { reservationId: c.reservationId },
        tokenThuKho,
      );
      assert.equal(xuat.status, 201, JSON.stringify(xuat.body));
      const sauXuat = await tonKho(c.partId);
      assert.equal(sauXuat.onHand, 8);

      const xem = await call('GET', `/api/v1/repair-orders/${c.repairOrderId}/cancel-preview`);
      assert.equal(xem.body.issuedParts.length, 1, 'màn xác nhận phải hỏi về phiếu xuất này');
      assert.equal(xem.body.issuedParts[0].quantity, 2);

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Khách đổi ý, thợ chưa kịp lắp',
        category: 'CUSTOMER_REQUEST',
        partDispositions: [{ movementId: xem.body.issuedParts[0].movementId, disposition: 'RETURNED' }],
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const sau = await tonKho(c.partId);
      assert.equal(sau.onHand, 10, 'hàng chưa lắp phải quay lại kệ');
      assert.equal(
        r.body.lines.filter((l: { nguon: string }) => l.nguon === 'PART_FITTED').length,
        0,
        'hàng đã trả về kho mà vẫn tính tiền khách',
      );

      // 🔒 Giá vốn khi trả PHẢI bằng giá vốn lúc xuất — BC-04 mục 5.4
      const { rows: mv } = await pool.query<{ unit_cost: string }>(
        `SELECT unit_cost FROM stock_movement WHERE part_id = $1 AND type = 'RETURN'`,
        [c.partId],
      );
      assert.equal(Number(mv[0]!.unit_cost), 300_000);
    } finally {
      await c.donDep();
    }
  });

  test('bài 4: xuất kho rồi huỷ, hàng ĐÃ lắp — không trả kho, có trên bảng quyết toán', async () => {
    const c = await donDangSua({ giuCho: 2, tonBanDau: 10 });
    try {
      const xuat = await call(
        'POST',
        '/api/v1/stock/issues',
        { reservationId: c.reservationId },
        tokenThuKho,
      );
      assert.equal(xuat.status, 201, JSON.stringify(xuat.body));

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Khách đổi ý khi thợ đã lắp xong phụ tùng',
        category: 'CUSTOMER_REQUEST',
        partDispositions: [{ movementId: xuat.body.movementId, disposition: 'FITTED' }],
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const sau = await tonKho(c.partId);
      assert.equal(sau.onHand, 8, 'hàng đã lắp vào xe mà vẫn nhập lại kho');

      const dong = r.body.lines.find((l: { nguon: string }) => l.nguon === 'PART_FITTED');
      assert.ok(dong, 'phụ tùng đã lắp không có trên bảng quyết toán — garage mất tiền');
      assert.equal(dong.quantity, 2);
      assert.ok(dong.amount > 0);
    } finally {
      await c.donDep();
    }
  });

  test('bài 5: huỷ khi thợ đang bấm giờ — đoạn giờ được đóng tại thời điểm huỷ', async () => {
    const c = await donDangSua();
    try {
      const { rows: tho } = await pool.query<{ id: string }>(
        `SELECT u.id FROM app_user u WHERE u.tenant_id = $1 AND 'TECHNICIAN' = ANY(u.roles) LIMIT 1`,
        [TENANT_A],
      );
      const { rows: bay } = await pool.query<{ id: string }>(
        'SELECT id FROM bay WHERE branch_id = $1 LIMIT 1',
        [branchId],
      );
      const k = khungGio(5);
      const { rows: wa } = await pool.query<{ id: string }>(
        `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
           technician_id, bay_id, planned_start, planned_end, status, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'IN_PROGRESS',$4) RETURNING id`,
        [TENANT_A, c.repairOrderId, c.congLineId, tho[0]!.id, bay[0]!.id, k.batDau, k.ketThuc],
      );
      await pool.query(
        `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id, started_at,
                               entered_by_user_id)
         VALUES ($1,$2,$3, now() - interval '90 minute', $3)`,
        [TENANT_A, wa[0]!.id, tho[0]!.id],
      );

      const xem = await call('GET', `/api/v1/repair-orders/${c.repairOrderId}/cancel-preview`);
      assert.equal(xem.body.openTimeLogCount, 1, 'màn xác nhận không thấy đoạn giờ đang chạy');

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Khách gọi huỷ trong lúc thợ đang làm',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const { rows: tl } = await pool.query<{ ended_at: Date | null }>(
        `SELECT ended_at FROM time_log WHERE work_assignment_id = $1`,
        [wa[0]!.id],
      );
      assert.ok(
        tl[0]!.ended_at !== null,
        '🔒 quên đóng đoạn giờ = giờ công chạy vô hạn, năng suất thợ âm',
      );

      // Công đã làm phải có trên bảng quyết toán (chính sách mặc định ACTUAL_HOURS)
      const cong = r.body.lines.find((l: { nguon: string }) => l.nguon === 'LABOR');
      assert.ok(cong, 'thợ làm 1,5 tiếng mà quyết toán không có dòng công nào');
      // Và công chẩn đoán thu riêng theo chính sách — khách đổi ý thì có thu
      assert.ok(
        r.body.lines.some((l: { nguon: string }) => l.nguon === 'DIAGNOSIS'),
        'chính sách bật thu công chẩn đoán mà bảng quyết toán không có dòng nào',
      );
    } finally {
      await c.donDep();
    }
  });

  test('bài 6: huỷ giải phóng khoang và thợ — khung giờ đó đặt lịch mới được ngay', async () => {
    const c = await donDangSua();
    try {
      const { rows: tho } = await pool.query<{ id: string }>(
        `SELECT u.id FROM app_user u WHERE u.tenant_id = $1 AND 'TECHNICIAN' = ANY(u.roles) LIMIT 1`,
        [TENANT_A],
      );
      const { rows: bay } = await pool.query<{ id: string }>(
        'SELECT id FROM bay WHERE branch_id = $1 LIMIT 1',
        [branchId],
      );
      const { batDau, ketThuc } = khungGio(6);
      await pool.query(
        `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
           technician_id, bay_id, planned_start, planned_end, status, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'SCHEDULED',$4)`,
        [TENANT_A, c.repairOrderId, c.congLineId, tho[0]!.id, bay[0]!.id, batDau, ketThuc],
      );

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Huỷ để kiểm tra khoang có được nhả không',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const { rows: sau } = await pool.query<{ status: string }>(
        `SELECT status::text AS status FROM work_assignment WHERE repair_order_id = $1`,
        [c.repairOrderId],
      );
      assert.deepEqual(
        sau.map((s) => s.status),
        ['CANCELLED'],
        '🔒 quên huỷ phân công = khoang và thợ bị chiếm chỗ, xưởng "kín" giả',
      );

      /*
       * Bài thật nằm ở đây: exclusion constraint `no_bay_overlap` không quan tâm
       * trạng thái phân công cũ nếu điều kiện WHERE của nó loại CANCELLED ra.
       * Đặt được một lịch mới vào ĐÚNG khung giờ đó là bằng chứng khoang đã
       * thật sự trống, chứ không phải chỉ đổi một chữ trong cột status.
       */
      const c2 = await donDangSua();
      try {
        const { rows: moi } = await pool.query<{ id: string }>(
          `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
             technician_id, bay_id, planned_start, planned_end, status, created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'SCHEDULED',$4) RETURNING id`,
          [TENANT_A, c2.repairOrderId, c2.congLineId, tho[0]!.id, bay[0]!.id, batDau, ketThuc],
        );
        assert.ok(moi[0], 'khung giờ vẫn bị chiếm sau khi huỷ đơn');
      } finally {
        await c2.donDep();
      }
    } finally {
      await c.donDep();
    }
  });

  test('bài 7: huỷ ở AWAITING_PAYMENT bị chặn — hoá đơn đã phát hành', async () => {
    const c = await donDangSua();
    try {
      for (const tt of ['QUALITY_CHECK', 'AWAITING_PAYMENT']) {
        await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [c.repairOrderId, tt]);
      }
      const { rows: v } = await pool.query<{ version: string }>(
        'SELECT version FROM repair_order WHERE id = $1',
        [c.repairOrderId],
      );

      const xem = await call('GET', `/api/v1/repair-orders/${c.repairOrderId}/cancel-preview`);
      assert.equal(xem.body.cancellable, false);
      assert.match(xem.body.lyDoKhongHuyDuoc, /hoá đơn điều chỉnh/i);

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: Number(v[0]!.version),
        reason: 'Thử huỷ sau khi đã sang bước thanh toán',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 403, JSON.stringify(r.body));
    } finally {
      // Để nguyên đơn ở AWAITING_PAYMENT: chính máy trạng thái vừa chứng minh
      // rằng từ đó không có đường sang CANCELLED, kể cả để dọn dẹp.
      await c.donDep();
    }
  });

  test('bài 8: GARAGE_UNABLE — không thu tiền công, kể cả công đã bấm giờ', async () => {
    const c = await donDangSua();
    try {
      const { rows: tho } = await pool.query<{ id: string }>(
        `SELECT u.id FROM app_user u WHERE u.tenant_id = $1 AND 'TECHNICIAN' = ANY(u.roles) LIMIT 1`,
        [TENANT_A],
      );
      const { rows: bay } = await pool.query<{ id: string }>(
        'SELECT id FROM bay WHERE branch_id = $1 LIMIT 1',
        [branchId],
      );
      const k8 = khungGio(8);
      const { rows: wa } = await pool.query<{ id: string }>(
        `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
           technician_id, bay_id, planned_start, planned_end, status, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'SCHEDULED',$4) RETURNING id`,
        [TENANT_A, c.repairOrderId, c.congLineId, tho[0]!.id, bay[0]!.id, k8.batDau, k8.ketThuc],
      );
      await pool.query(
        `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id, started_at,
                               ended_at, entered_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$3)`,
        [TENANT_A, wa[0]!.id, tho[0]!.id, k8.batDau, k8.ketThuc],
      );

      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Xưởng không có thiết bị chuyên dụng cho dòng xe này',
        category: 'GARAGE_UNABLE',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const congLines = r.body.lines.filter(
        (l: { nguon: string }) => l.nguon === 'LABOR' || l.nguon === 'DIAGNOSIS',
      );
      assert.deepEqual(
        congLines,
        [],
        '🔒 garage không làm được thì 2 tiếng đã bỏ ra là chi phí của garage, không phải của khách',
      );
    } finally {
      await c.donDep();
    }
  });

  test('bài 10: huỷ đơn BẢO HÀNH — suất bảo hành gốc không bị tiêu thụ', async () => {
    /*
     * BC-10 mục 5.4. Chỗ dễ sai: đơn bảo hành bị huỷ mà `claimed_by_repair_order_id`
     * vẫn trỏ vào nó thì suất bảo hành coi như đã dùng — khách mất quyền lợi vì
     * một đơn KHÔNG BAO GIỜ được làm.
     */
    const c = await donDangSua();
    try {
      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Huỷ đơn bảo hành giữa chừng',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM warranty_coverage
          WHERE claimed_by_repair_order_id = $1`,
        [c.repairOrderId],
      );
      assert.equal(Number(rows[0]!.n), 0, 'đơn bảo hành đã huỷ mà vẫn giữ suất bảo hành');
    } finally {
      await c.donDep();
    }
  });
});

describe('🔒 Hàng rào sau khi huỷ — cái BC-10 không liệt kê', () => {
  test('đơn đã huỷ thì không bấm giờ và không xuất kho được nữa', async () => {
    const c = await donDangSua({ giuCho: 2 });
    try {
      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Huỷ để kiểm tra hàng rào sau khi huỷ',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      /*
       * Giữ chỗ đã bị nhả nên đường xuất kho bình thường không còn. Thử thẳng
       * bằng SQL — đó chính là đường mà một script bảo trì hay một service viết
       * vội sẽ đi, và là lý do hàng rào phải nằm ở database.
       */
      const { rows: u } = await pool.query<{ id: string }>(
        `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
        [TENANT_A],
      );
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                         unit_cost, ref_type, ref_id, created_by_user_id)
             VALUES ($1,$2,$3,'ISSUE',-1,300000,'REPAIR_ORDER',$4,$5)`,
            [TENANT_A, khoId, c.partId, c.repairOrderId, u[0]!.id],
          ),
        /ORDER_CANCELLED/,
        'xuất kho được cho đơn đã đóng = bảng quyết toán vừa chốt đã sai',
      );
    } finally {
      await c.donDep();
    }
  });

  test('🔒 bảng quyết toán đã chốt thì không thêm bớt dòng được', async () => {
    const c = await donDangSua();
    try {
      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Huỷ để kiểm tra khoá bảng quyết toán',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const chot = await call('POST', `/api/v1/settlements/${r.body.id}/confirm`);
      assert.equal(chot.status, 201, JSON.stringify(chot.body));
      assert.equal(chot.body.status, 'CONFIRMED');

      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO cancellation_settlement_line (tenant_id, settlement_id, seq, nguon,
               description, unit_price, amount)
             VALUES ($1,$2,99,'LABOR','thêm lén sau khi khách đã đồng ý',900000,900000)`,
            [TENANT_A, r.body.id],
          ),
        /SETTLEMENT_LOCKED/,
        'con số khách đã đồng ý và con số hệ thống giữ phải là một',
      );

      // Và không quay ngược trạng thái được
      const nguoc = await call('POST', `/api/v1/settlements/${r.body.id}/dispute`, {
        note: 'thử lật lại sau khi đã chốt',
      });
      assert.equal(nguoc.status, 409, JSON.stringify(nguoc.body));
    } finally {
      await c.donDep();
    }
  });

  test('🔒 thợ không đọc được bảng quyết toán — nó toàn là tiền', async () => {
    const c = await donDangSua();
    try {
      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Huỷ để kiểm tra quyền đọc quyết toán',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const tokenTho = await dangNhap('0901000004');
      const tho = await call(
        'GET',
        `/api/v1/repair-orders/${c.repairOrderId}/settlement`,
        undefined,
        tokenTho,
      );
      assert.equal(tho.status, 403, JSON.stringify(tho.body));

      const coVan = await call('GET', `/api/v1/repair-orders/${c.repairOrderId}/settlement`);
      assert.equal(coVan.status, 200, 'cố vấn VẪN phải đọc được — nếu không thì test này vô nghĩa');
    } finally {
      await c.donDep();
    }
  });

  test('🔒 miễn khoản quyết toán là quyền của quản lý, không phải cố vấn', async () => {
    const c = await donDangSua();
    try {
      const r = await call('POST', `/api/v1/repair-orders/${c.repairOrderId}/cancel`, {
        version: c.version,
        reason: 'Huỷ để kiểm tra quyền miễn',
        category: 'CUSTOMER_REQUEST',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const coVan = await call('POST', `/api/v1/settlements/${r.body.id}/waive`, {
        note: 'Cố vấn tự miễn cho khách quen',
      });
      assert.equal(coVan.status, 403, JSON.stringify(coVan.body));

      const quanLy = await call(
        'POST',
        `/api/v1/settlements/${r.body.id}/waive`,
        { note: 'Khách quen, quản lý duyệt miễn' },
        tokenQuanLy,
      );
      assert.equal(quanLy.status, 201, JSON.stringify(quanLy.body));
      assert.equal(quanLy.body.status, 'WAIVED');
    } finally {
      await c.donDep();
    }
  });
});
