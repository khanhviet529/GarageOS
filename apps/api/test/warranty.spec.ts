/**
 * Phase 5.1–5.2 — bảo hành (BC-09).
 *
 * Bài kiểm chính là **ví dụ nguyên văn của tài liệu**: thay má phanh + bơm nước
 * ngày 10/03 ở km 45.200, xe quay lại ngày 22/06 ở km 51.800.
 *
 *   Bơm nước  (PART,  6 tháng / 10.000km) -> hạn 10/09 và 55.200km -> CÒN
 *   Công thay (LABOR, 1 tháng /  2.000km) -> hạn 10/04 và 47.200km -> HẾT
 *
 * Dùng đúng ví dụ đó chứ không bịa số mới: nếu bản cài đặt lệch khỏi tài liệu
 * thì phải lộ ra ở đây, không phải ở lúc khách khiếu nại.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';


let pool: Pool;
let token = '';
let branchId = '';
let customerId = '';
let dem = 0;
const uniq = `${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token === '' ? {} : { Authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

async function dangNhap(phone: string): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { phone, password: 'demo1234' });
  assert.equal(r.status, 201, `không đăng nhập được ${phone}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

/**
 * Dựng một đơn ĐÃ BÀN GIAO với một dòng công và một dòng phụ tùng đã duyệt.
 *
 * Đi qua API cho phần tạo xe/đơn/báo giá; dùng SQL cho phần duyệt và bàn giao
 * vì hai luồng đó đã có test riêng và ở đây chúng chỉ là điều kiện đầu vào.
 */
async function donDaBanGiao(opts: {
  ngayGiao: string;
  kmRa: number;
  thangCong: number;
  thangPhuTung: number;
  kmPhuTung: number;
}): Promise<{ repairOrderId: string; vehicleId: string }> {
  dem += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `66B-${uniq}${dem}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test bảo hành',
    odometerIn: opts.kmRa - 500,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const cat = await call('GET', `/api/v1/catalog/vehicle/${v.body.id}`);
  const sv = cat.body.serviceItems[0];
  const pt = cat.body.parts.find((p: { sellPrice: number | null }) => p.sellPrice !== null);
  assert.ok(sv && pt, 'danh mục thiếu hạng mục hoặc phụ tùng có giá');

  // Đặt chính sách bảo hành ĐÚNG như ví dụ của tài liệu
  await pool.query('UPDATE service_item SET warranty_months = $2 WHERE id = $1', [
    sv.id,
    opts.thangCong,
  ]);
  await pool.query(
    'UPDATE part SET warranty_months = $2, warranty_kilometers = $3 WHERE id = $1',
    [pt.id, opts.thangPhuTung, opts.kmPhuTung],
  );

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  const cong = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'LABOR',
    serviceItemId: sv.id,
    quantity: 1,
  });
  assert.equal(cong.status, 201, JSON.stringify(cong.body));
  const phuTung = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'PART',
    partId: pt.id,
    parentLineId: cong.body.id,
    quantity: 1,
  });
  assert.equal(phuTung.status, 201, JSON.stringify(phuTung.body));

  await pool.query(
    `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'COUNTER'
      WHERE quotation_id = $1`,
    [q.body.id],
  );
  /*
   * Ghi số km ra TRƯỚC khi chuyển sang DELIVERED.
   *
   * `ro_delivered_needs_odometer` (có từ 0015) chặn một đơn DELIVERED mà không
   * có `odometer_out` — trừ khi đánh dấu tường minh là không đọc được đồng hồ.
   * Ràng buộc đó nằm THẤP HƠN kiểm tra của `WarrantyService`, nên trên thực tế
   * service sẽ không bao giờ gặp trường hợp đó qua đường bình thường.
   */
  await pool.query(
    `UPDATE repair_order SET delivered_at = $2::timestamptz, odometer_out = $3 WHERE id = $1`,
    [o.body.id, opts.ngayGiao, opts.kmRa],
  );
  // Đi từng bước theo máy trạng thái, không nhảy cóc — trigger ở 0014 chặn
  for (const tt of [
    'AWAITING_APPROVAL',
    'IN_PROGRESS',
    'QUALITY_CHECK',
    'AWAITING_PAYMENT',
    'AWAITING_DELIVERY',
    'DELIVERED',
  ]) {
    await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [o.body.id, tt]);
  }

  return { repairOrderId: o.body.id, vehicleId: v.body.id };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  token = await dangNhap('0901000003');
  const me = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003',
    password: 'demo1234',
  });
  branchId = me.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách bảo hành ${uniq}`,
    phone: `033${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  await pool.query(
    `DELETE FROM warranty_coverage WHERE repair_order_id IN (
       SELECT ro.id FROM repair_order ro JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number LIKE $1)`,
    [`66B-${uniq}%`],
  );
  await pool.end();
});

describe('🔒 INV-B-01/B-02 — hạn kép tháng và km', () => {
  test('ví dụ nguyên văn BC-09: phụ tùng còn bảo hành, công thợ thì không', async () => {
    const don = await donDaBanGiao({
      ngayGiao: '2026-03-10T00:00:00Z',
      kmRa: 45_200,
      thangCong: 1,
      thangPhuTung: 6,
      kmPhuTung: 10_000,
    });

    const sinh = await call('POST', '/api/v1/warranty/issue', {
      repairOrderId: don.repairOrderId,
    });
    assert.equal(sinh.status, 201, JSON.stringify(sinh.body));
    assert.equal(sinh.body.daSinh, 2, 'một dòng hạng mục phải sinh HAI suất: công và phụ tùng');

    // Ngày 22/06 ở km 51.800 — đúng mốc của tài liệu
    const r = await call(
      'GET',
      `/api/v1/vehicles/${don.vehicleId}/warranty?odometer=51800`,
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const phuTung = r.body.find((c: { coverageType: string }) => c.coverageType === 'PART');
    const cong = r.body.find((c: { coverageType: string }) => c.coverageType === 'LABOR');
    assert.ok(phuTung && cong, 'thiếu một trong hai suất');

    // Hạn km của phụ tùng: 45.200 + 10.000 = 55.200 -> 51.800 vẫn trong hạn
    assert.equal(phuTung.expiresAtOdometer, 55_200);
    // Công thợ 1 tháng: hết hạn 10/04, mà "bây giờ" đã qua -> hết
    assert.equal(cong.conHieuLuc, false, 'công thợ 1 tháng mà vẫn còn hiệu lực');
    assert.ok(cong.lyDoHetHieuLuc !== null, 'không nói được vì sao hết hiệu lực');
  });

  test('🔒 hết hạn khi MỘT trong hai mốc bị vượt, không phải cả hai', async () => {
    /*
     * Đây là chỗ dễ viết `AND` thay vì `OR`. Lỗi đó nghiêng về phía garage
     * (bảo hành dài hơn thực tế), nên không ai phàn nàn — cho tới khi kế toán
     * phát hiện chi phí bảo hành vượt dự tính.
     */
    const don = await donDaBanGiao({
      ngayGiao: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      kmRa: 10_000,
      thangCong: 24,
      thangPhuTung: 24,
      kmPhuTung: 1_000, // hạn km rất ngắn
    });
    await call('POST', '/api/v1/warranty/issue', { repairOrderId: don.repairOrderId });

    // Còn hạn tháng (24 tháng) nhưng VƯỢT km (11.000 > 10.000 + 1.000)
    const vuotKm = await call(
      'GET',
      `/api/v1/vehicles/${don.vehicleId}/warranty?odometer=11500`,
    );
    const ptVuot = vuotKm.body.find((c: { coverageType: string }) => c.coverageType === 'PART');
    assert.equal(ptVuot.conHieuLuc, false, 'vượt hạn km mà vẫn còn hiệu lực -> dùng AND thay vì OR');
    assert.match(ptVuot.lyDoHetHieuLuc, /km/i);

    // Cùng suất đó, số km trong hạn -> phải còn
    const trongHan = await call(
      'GET',
      `/api/v1/vehicles/${don.vehicleId}/warranty?odometer=10500`,
    );
    const ptTrong = trongHan.body.find((c: { coverageType: string }) => c.coverageType === 'PART');
    assert.equal(ptTrong.conHieuLuc, true, 'chặn nhầm suất còn hạn');
  });

  test('🔒 INV-B-01: chưa bàn giao thì không sinh bảo hành', async () => {
    dem += 1;
    const v = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: `66B-${uniq}${dem}`,
      powertrain: 'ICE',
    });
    const o = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v.body.id,
      branchId,
      customerComplaint: 'Chưa bàn giao',
      odometerIn: 1000,
    });
    const r = await call('POST', '/api/v1/warranty/issue', { repairOrderId: o.body.id });
    assert.equal(r.status, 409, 'sinh được bảo hành cho xe chưa giao');
  });

  test('🔒 đồng hồ km hỏng thì CHẶN sinh bảo hành, không lặng lẽ bỏ hạn km', async () => {
    /*
     * Bảo hành "không giới hạn km" là một lời hứa đắt hơn hẳn. Để nó ra đời chỉ
     * vì đồng hồ hỏng là sai kiểu tốn tiền.
     *
     * `ro_delivered_needs_odometer` (0015) cho phép bàn giao KHÔNG có số km nếu
     * đánh dấu `odometer_out_unavailable` — đó là đường hợp lệ cho xe hỏng đồng
     * hồ. Nhưng hợp lệ để BÀN GIAO không có nghĩa là hợp lệ để sinh bảo hành có
     * hạn km.
     */
    const don = await donDaBanGiao({
      ngayGiao: '2026-03-10T00:00:00Z',
      kmRa: 45_200,
      thangCong: 1,
      thangPhuTung: 6,
      kmPhuTung: 10_000,
    });
    await pool.query(
      `UPDATE repair_order SET odometer_out = NULL, odometer_out_unavailable = true
        WHERE id = $1`,
      [don.repairOrderId],
    );
    const r = await call('POST', '/api/v1/warranty/issue', {
      repairOrderId: don.repairOrderId,
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('sinh hai lần không tạo ra suất trùng', async () => {
    const don = await donDaBanGiao({
      ngayGiao: '2026-03-10T00:00:00Z',
      kmRa: 20_000,
      thangCong: 3,
      thangPhuTung: 12,
      kmPhuTung: 20_000,
    });
    const lan1 = await call('POST', '/api/v1/warranty/issue', {
      repairOrderId: don.repairOrderId,
    });
    const lan2 = await call('POST', '/api/v1/warranty/issue', {
      repairOrderId: don.repairOrderId,
    });
    assert.equal(lan1.body.daSinh, 2);
    assert.equal(lan2.body.daSinh, 0, 'bấm hai lần sinh ra bảo hành trùng');
  });
});

describe('🔒 INV-B-03/B-04 — dùng bảo hành và quy chi phí', () => {
  async function canhBaoHanh(): Promise<{
    goc: string;
    vehicleId: string;
    coverageIds: string[];
  }> {
    const don = await donDaBanGiao({
      ngayGiao: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      kmRa: 30_000,
      thangCong: 12,
      thangPhuTung: 12,
      kmPhuTung: 20_000,
    });
    await call('POST', '/api/v1/warranty/issue', { repairOrderId: don.repairOrderId });
    const r = await call('GET', `/api/v1/vehicles/${don.vehicleId}/warranty?odometer=31000`);
    return {
      goc: don.repairOrderId,
      vehicleId: don.vehicleId,
      coverageIds: r.body
        .filter((c: { conHieuLuc: boolean }) => c.conHieuLuc)
        .map((c: { id: string }) => c.id),
    };
  }

  /** Một đơn MỚI để làm đơn bảo hành */
  async function donMoi(): Promise<string> {
    dem += 1;
    const v = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: `66B-${uniq}${dem}`,
      powertrain: 'ICE',
    });
    const o = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v.body.id,
      branchId,
      customerComplaint: 'Đơn bảo hành',
      odometerIn: 31_000,
    });
    return o.body.id;
  }

  test('mở đơn bảo hành: nối về đơn gốc và đánh dấu suất đã dùng', async () => {
    const c = await canhBaoHanh();
    assert.ok(c.coverageIds.length > 0, 'không có suất nào còn hiệu lực để thử');
    const bh = await donMoi();

    const r = await call('POST', '/api/v1/warranty/claims', {
      repairOrderId: bh,
      originalRepairOrderId: c.goc,
      coverageIds: c.coverageIds,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.soSuatDaDung, c.coverageIds.length);

    const { rows } = await pool.query<{ warranty_claim_of_id: string }>(
      'SELECT warranty_claim_of_id FROM repair_order WHERE id = $1',
      [bh],
    );
    assert.equal(rows[0]!.warranty_claim_of_id, c.goc, 'đơn bảo hành không nối về đơn gốc');
  });

  test('🔒 INV-B-03: không dùng lại một suất bảo hành cho đơn thứ hai', async () => {
    const c = await canhBaoHanh();
    const bh1 = await donMoi();
    const bh2 = await donMoi();

    const r1 = await call('POST', '/api/v1/warranty/claims', {
      repairOrderId: bh1,
      originalRepairOrderId: c.goc,
      coverageIds: c.coverageIds,
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));

    const r2 = await call('POST', '/api/v1/warranty/claims', {
      repairOrderId: bh2,
      originalRepairOrderId: c.goc,
      coverageIds: c.coverageIds,
    });
    assert.equal(r2.status, 409, 'dùng lại được một suất bảo hành -> bảo hành vô hạn');
  });

  test('🔒 chi phí bảo hành quy về ĐƠN GỐC, không sửa chứng từ đơn gốc', async () => {
    /*
     * "Đơn hôm 10/03 tưởng lãi 2 triệu, bảo hành ăn mất 1 triệu, thực ra chỉ
     * lãi 1 triệu" — con số mà chủ garage thực sự cần.
     *
     * Ghi vào bảng RIÊNG chứ không sửa hoá đơn đơn gốc: INV-M-03 nói chứng từ
     * đã phát hành là bất biến.
     */
    const c = await canhBaoHanh();
    const bh = await donMoi();
    await call('POST', '/api/v1/warranty/claims', {
      repairOrderId: bh,
      originalRepairOrderId: c.goc,
      coverageIds: c.coverageIds,
    });

    const tinh = await call('POST', `/api/v1/warranty/claims/${bh}/recalculate`);
    assert.equal(tinh.status, 201, JSON.stringify(tinh.body));
    assert.equal(tinh.body.originalRepairOrderId, c.goc);

    const ds = await call('GET', `/api/v1/repair-orders/${c.goc}/warranty-costs`);
    assert.equal(ds.status, 200);
    assert.equal(ds.body.length, 1, 'chi phí bảo hành không quy về đơn gốc');
    assert.equal(
      ds.body[0].netCostAmount,
      ds.body[0].partCostAmount + ds.body[0].laborCostAmount - ds.body[0].recoveredFromSupplierAmount,
      'chi phí ròng không khớp ba thành phần — cột SINH bị ghi đè',
    );
  });

  test('🔒 đòi lại từ nhà cung cấp không vượt quá chi phí đã bỏ ra', async () => {
    const c = await canhBaoHanh();
    const bh = await donMoi();
    await call('POST', '/api/v1/warranty/claims', {
      repairOrderId: bh,
      originalRepairOrderId: c.goc,
      coverageIds: c.coverageIds,
    });

    const luu = token;
    token = await dangNhap('0901000002'); // quản lý — vai được ghi nhận đòi lại
    try {
      const r = await call(`POST`, `/api/v1/warranty/claims/${bh}/supplier-recovery`, {
        amount: 999_000_000,
        note: 'Đòi nhiều hơn chi phí đã bỏ ra — phải bị chặn',
      });
      assert.equal(r.status, 400, 'đòi lại được nhiều hơn số đã tốn');
    } finally {
      token = luu;
    }
  });

  test('🔒 cố vấn KHÔNG ghi nhận được tiền đòi từ nhà cung cấp', async () => {
    // Đó là tiền THU VỀ. Cùng lập luận với `stock:adjust`: đường làm đổi một
    // con số tiền mà không có chứng từ mua bán đối ứng thì cần quản lý.
    const c = await canhBaoHanh();
    const bh = await donMoi();
    await call('POST', '/api/v1/warranty/claims', {
      repairOrderId: bh,
      originalRepairOrderId: c.goc,
      coverageIds: c.coverageIds,
    });
    const r = await call('POST', `/api/v1/warranty/claims/${bh}/supplier-recovery`, {
      amount: 1000,
      note: 'Cố vấn tự ghi nhận tiền đòi lại',
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test('🔒 thợ tra cứu được bảo hành nhưng KHÔNG mở được đơn bảo hành', async () => {
    // Thợ cần biết để không tháo nhầm thứ đang còn bảo hành hãng. Nhưng mở đơn
    // bảo hành là garage tự nhận chi phí — đó là quyết định tiền bạc.
    const c = await canhBaoHanh();
    const bh = await donMoi();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const tra = await call('GET', `/api/v1/vehicles/${c.vehicleId}/warranty`);
      assert.equal(tra.status, 200, 'thợ không tra cứu được bảo hành');

      const mo = await call('POST', '/api/v1/warranty/claims', {
        repairOrderId: bh,
        originalRepairOrderId: c.goc,
        coverageIds: c.coverageIds,
      });
      assert.equal(mo.status, 403, 'thợ tự mở được đơn bảo hành');
    } finally {
      token = luu;
    }
  });
});
