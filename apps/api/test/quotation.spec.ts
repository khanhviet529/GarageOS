/**
 * Phase 1.4 — lập báo giá (BC-02).
 *
 * Báo giá là chứng từ có hệ quả pháp lý: con số khách nhìn thấy và con số xưởng
 * thu tiền phải là một. Vì vậy phần lớn test ở đây không kiểm "tính năng chạy
 * được" mà kiểm "hệ thống TỪ CHỐI làm điều sai".
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { calculateLineTotal } from '@garageos/domain';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

let token = '';
let branchId = '';
let customerId = '';
let pool: Pool;
const uniq = Date.now().toString().slice(-6);

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

/** Tạo xe + đơn tiếp nhận + báo giá nháp, trả về id báo giá */
async function newQuotation(
  powertrain: 'ICE' | 'HYBRID' | 'BEV',
  suffix: string,
): Promise<{ quotationId: string; orderId: string }> {
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `77B-${uniq}${suffix}`,
    powertrain,
    ...(powertrain === 'ICE' ? {} : { batteryCapacityKwh: 42 }),
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Khách yêu cầu kiểm tra và báo giá',
    odometerIn: 20_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  assert.equal(q.status, 201, JSON.stringify(q.body));
  return { quotationId: q.body.id, orderId: o.body.id };
}

/**
 * Id hạng mục / phụ tùng theo MÃ, đọc qua API danh mục để không phụ thuộc vào
 * uuid ngẫu nhiên của seed.
 *
 * Có nhớ kết quả: mỗi lần gọi phải tạo một chiếc xe (danh mục lọc theo xe), mà
 * biển số là duy nhất trong tenant — gọi lại cùng một mã sẽ đụng biển cũ.
 */
const catalogCache = new Map<string, { serviceItems: any[]; parts: any[] }>();
let probeCounter = 0;

async function catalogFor(powertrain: 'ICE' | 'HYBRID' | 'BEV') {
  const cached = catalogCache.get(powertrain);
  if (cached !== undefined) return cached;

  probeCounter += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `77Z-${uniq}${probeCounter}`,
    powertrain,
    ...(powertrain === 'ICE' ? {} : { batteryCapacityKwh: 42 }),
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const cat = await call('GET', `/api/v1/catalog/vehicle/${v.body.id}`);
  assert.equal(cat.status, 200, JSON.stringify(cat.body));
  catalogCache.set(powertrain, cat.body);
  return cat.body;
}

async function serviceItemId(
  vehiclePowertrain: 'ICE' | 'HYBRID' | 'BEV',
  code: string,
): Promise<string> {
  const cat = await catalogFor(vehiclePowertrain);
  const item = cat.serviceItems.find((s: { code: string }) => s.code === code);
  assert.ok(item, `seed thiếu hạng mục ${code} cho xe ${vehiclePowertrain}`);
  return item.id as string;
}

async function partId(sku: string): Promise<string> {
  const cat = await catalogFor('ICE');
  const p = cat.parts.find((x: { sku: string }) => x.sku === sku);
  assert.ok(p, `seed thiếu phụ tùng ${sku}`);
  return p.id as string;
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });

  const login = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003',
    password: 'demo1234',
  });
  assert.equal(login.status, 201, 'không đăng nhập được — API/seed chưa sẵn sàng');
  token = login.body.accessToken;
  branchId = login.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách báo giá ${uniq}`,
    phone: `037${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  await pool.end();
});

describe('Lập báo giá — luồng chính', () => {
  test('thêm dòng công và dòng phụ tùng, tổng khớp từng đồng', async () => {
    const { quotationId } = await newQuotation('ICE', 'A');
    const oil = await serviceItemId('ICE', 'SV-OIL-ENGINE');
    const oilPart = await partId('PT-OIL-5W30');

    const labor = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR',
      serviceItemId: oil,
      quantity: 1,
    });
    assert.equal(labor.status, 201, JSON.stringify(labor.body));

    const part = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'PART',
      partId: oilPart,
      parentLineId: labor.body.id,
      quantity: 4,
    });
    assert.equal(part.status, 201, JSON.stringify(part.body));

    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(q.body.lines.length, 2);

    // 🔒 INV-Q-06 — tổng bằng tổng các dòng, không sai một đồng
    const sumLines = q.body.lines.reduce(
      (acc: number, l: { lineTotal: number }) => acc + l.lineTotal,
      0,
    );
    assert.equal(q.body.totalAmount, sumLines, 'tổng báo giá lệch với tổng các dòng');

    // Giá công = giờ định mức × đơn giá giờ đã snapshot: 0,8h × 250.000 = 200.000
    const laborLine = q.body.lines.find((l: { lineType: string }) => l.lineType === 'LABOR');
    assert.equal(laborLine.unitPrice, 200_000);
    // 200.000 + 10% thuế
    assert.equal(laborLine.lineTotal, 220_000);

    // Phụ tùng: 4 lít × 185.000 = 740.000, +10% = 814.000
    const partLine = q.body.lines.find((l: { lineType: string }) => l.lineType === 'PART');
    assert.equal(partLine.lineTotal, 814_000);
    assert.equal(q.body.totalAmount, 1_034_000);
  });

  test('🔒 giá KHÔNG nhận từ client', async () => {
    const { quotationId } = await newQuotation('ICE', 'B');
    const oil = await serviceItemId('ICE', 'SV-OIL-ENGINE');

    // Gửi kèm đơn giá bịa — phải bị bỏ qua, không được ghi đè
    const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR',
      serviceItemId: oil,
      quantity: 1,
      unitPrice: 1,
      lineTotal: 1,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(q.body.lines[0].unitPrice, 200_000, 'client ghi đè được giá');
  });

  test('dòng bảo hành tính 0đ', async () => {
    const { quotationId } = await newQuotation('ICE', 'C');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR',
      serviceItemId: brake,
      quantity: 1,
      isWarranty: true,
    });
    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(q.body.lines[0].lineTotal, 0, 'khách không trả tiền cho hạng mục bảo hành');
    assert.equal(q.body.totalAmount, 0);
  });
});

describe('🔒 INV-V-01 — tầng bảo vệ thật ở database', () => {
  test('không thêm được hạng mục động cơ vào báo giá xe thuần điện', async () => {
    // Tầng danh sách (Phase 1.3) chỉ giấu hạng mục khỏi giao diện. Đây mới là
    // tầng chặn: dù request đến từ đâu cũng không lọt.
    const { quotationId } = await newQuotation('BEV', 'D');
    const oil = await serviceItemId('ICE', 'SV-OIL-ENGINE');

    const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR',
      serviceItemId: oil,
      quantity: 1,
    });
    assert.equal(r.status, 422, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'POWERTRAIN_MISMATCH');
    assert.match(r.body.error.message, /Thay dau dong co|khong ap dung/i);
  });

  test('hạng mục pin cao áp thêm được vào xe điện', async () => {
    const { quotationId } = await newQuotation('BEV', 'E');
    const soh = await serviceItemId('BEV', 'SV-HV-SOH');
    const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR',
      serviceItemId: soh,
      quantity: 1,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test('xe hybrid thêm được CẢ hạng mục động cơ LẪN hạng mục pin', async () => {
    const { quotationId } = await newQuotation('HYBRID', 'F');
    const oil = await serviceItemId('HYBRID', 'SV-OIL-ENGINE');
    const soh = await serviceItemId('HYBRID', 'SV-HV-SOH');

    assert.equal(
      (await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'LABOR', serviceItemId: oil, quantity: 1,
      })).status,
      201,
    );
    assert.equal(
      (await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'LABOR', serviceItemId: soh, quantity: 1,
      })).status,
      201,
    );
  });
});

describe('🔒 INV-Q-05 — giá đã gửi thì đóng băng', () => {
  test('gửi rồi thì không thêm dòng được nữa', async () => {
    const { quotationId } = await newQuotation('ICE', 'G');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });

    const sent = await call('POST', `/api/v1/quotations/${quotationId}/send`);
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.ok(sent.body.validUntil, 'gửi mà không có hạn hiệu lực thì báo giá sống mãi');

    const add = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    assert.equal(add.status, 409, JSON.stringify(add.body));
  });

  test('đổi bảng giá KHÔNG làm đổi báo giá đã gửi', async () => {
    // Đây là kiểm chứng trực tiếp của INV-Q-05: khách đã nhìn thấy con số nào
    // thì con số đó phải giữ nguyên, dù garage tăng giá công ngay hôm sau.
    const { quotationId } = await newQuotation('ICE', 'H');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    const before = await call('GET', `/api/v1/quotations/${quotationId}`);

    // Đóng bảng giá cũ và mở bảng giá mới đắt gấp đôi — trong MỘT giao dịch.
    // Tách ra hai lệnh sẽ để lại một khoảnh khắc không có bảng giá nào hiệu lực,
    // và mọi truy vấn giá chạy đúng lúc đó đều nhận lỗi "chưa có bảng giá".
    await pool.query('BEGIN');
    await pool.query(
      `UPDATE price_list SET effective_to = now()
        WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND effective_to IS NULL`,
    );
    await pool.query(
      `INSERT INTO price_list (tenant_id, name, labor_rate_per_hour, effective_from)
       VALUES ('11111111-1111-1111-1111-111111111111', 'Bang gia moi', 500000, now())`,
    );
    await pool.query('COMMIT');

    const after = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(
      after.body.totalAmount,
      before.body.totalAmount,
      'báo giá đã gửi bị đổi theo bảng giá mới',
    );
    assert.equal(after.body.laborRatePerHour, 250_000, 'đơn giá giờ không được snapshot');

    // Trả lại bảng giá cũ cho các test sau — cũng trong một giao dịch
    await pool.query('BEGIN');
    await pool.query(
      `DELETE FROM price_list WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
        AND name = 'Bang gia moi'`,
    );
    await pool.query(
      `UPDATE price_list SET effective_to = NULL
        WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND name = 'Bảng giá 2026'`,
    );
    await pool.query('COMMIT');
  });

  test('sửa giá bằng SQL trực tiếp cũng bị trigger chặn', async () => {
    const { quotationId } = await newQuotation('ICE', 'I');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    const line = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    await assert.rejects(
      () => pool.query('UPDATE quotation_line SET unit_price = 1 WHERE id = $1', [line.body.id]),
      /INV-Q-05/,
      'sửa được giá của báo giá đã gửi bằng SQL',
    );
  });

  test('trạng thái dòng VẪN đổi được sau khi gửi — đó là việc khách làm', async () => {
    const { quotationId } = await newQuotation('ICE', 'J');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    const line = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    await pool.query(
      `UPDATE quotation_line SET status = 'APPROVED' WHERE id = $1`,
      [line.body.id],
    );
    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(q.body.lines[0].status, 'APPROVED');
  });
});

describe('🔒 INV-Q-02 — từ chối công thì phụ tùng đi kèm từ chối theo', () => {
  test('từ chối dòng công lan xuống dòng phụ tùng con', async () => {
    const { quotationId } = await newQuotation('ICE', 'K');
    const oil = await serviceItemId('ICE', 'SV-OIL-ENGINE');
    const oilPart = await partId('PT-OIL-5W30');

    const labor = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: oil, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'PART', partId: oilPart, parentLineId: labor.body.id, quantity: 4,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    await pool.query(
      `UPDATE quotation_line SET status = 'REJECTED', reject_reason = 'Khach tu choi'
        WHERE id = $1`,
      [labor.body.id],
    );

    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    const partLine = q.body.lines.find((l: { lineType: string }) => l.lineType === 'PART');
    assert.equal(
      partLine.status,
      'REJECTED',
      'Phụ tùng còn chờ trong khi công đã bị từ chối -> kho xuất hàng cho việc không ai làm',
    );

    // 🔒 INV-Q-06: dòng bị từ chối không nằm trong số tiền khách phải trả
    assert.equal(q.body.totalAmount, 0, 'tổng vẫn tính tiền cho dòng đã bị từ chối');
  });
});

describe('🔒 INV-Q-03 / INV-Q-04 — số thứ tự và báo giá đang chờ', () => {
  test('mỗi đơn chỉ có MỘT báo giá đang chờ khách trả lời', async () => {
    const { quotationId, orderId } = await newQuotation('ICE', 'L');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    const second = await call('POST', `/api/v1/repair-orders/${orderId}/quotations`);
    assert.equal(second.status, 201, 'lập bản nháp thứ hai vẫn được');
    assert.equal(second.body.seq, 2, 'số thứ tự phải tăng liên tục');

    await call('POST', `/api/v1/quotations/${second.body.id}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    const sendSecond = await call('POST', `/api/v1/quotations/${second.body.id}/send`);
    assert.equal(sendSecond.status, 409, JSON.stringify(sendSecond.body));
    assert.equal(sendSecond.body.error.code, 'RESOURCE_CONFLICT');
  });

  test('báo giá rỗng không gửi được', async () => {
    const { quotationId } = await newQuotation('ICE', 'M');
    const r = await call('POST', `/api/v1/quotations/${quotationId}/send`);
    assert.equal(r.status, 400);
  });
});

describe('Ràng buộc dữ liệu dòng báo giá', () => {
  test('số lượng 0 hoặc âm bị chặn', async () => {
    const { quotationId } = await newQuotation('ICE', 'N');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    for (const quantity of [0, -1]) {
      const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'LABOR', serviceItemId: brake, quantity,
      });
      assert.equal(r.status, 400, `số lượng ${quantity} lọt qua`);
    }
  });

  test('🔒 INV-M-07 — chiết khấu lớn hơn giá trị dòng bị chặn', async () => {
    const { quotationId } = await newQuotation('ICE', 'O');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
      discountAmount: 999_999_999,
    });
    assert.ok(r.status >= 400, 'chiết khấu vượt giá trị dòng lọt qua -> dòng âm tiền');
  });

  test('dòng công không có dòng cha', async () => {
    const { quotationId } = await newQuotation('ICE', 'P');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    const first = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
      parentLineId: first.body.id,
    });
    assert.equal(r.status, 400);
  });

  test('phụ tùng trỏ về dòng cha của báo giá KHÁC bị chặn', async () => {
    const a = await newQuotation('ICE', 'Q');
    const b = await newQuotation('ICE', 'R');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    const oilPart = await partId('PT-OIL-5W30');

    const lineA = await call('POST', `/api/v1/quotations/${a.quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    const r = await call('POST', `/api/v1/quotations/${b.quotationId}/lines`, {
      lineType: 'PART', partId: oilPart, parentLineId: lineA.body.id, quantity: 1,
    });
    assert.equal(r.status, 400, 'nối được dòng sang báo giá khác');
  });
});

describe('🔒 INV-T-01 — báo giá cô lập theo tenant', () => {
  test('tenant khác không đọc được báo giá', async () => {
    const { quotationId } = await newQuotation('ICE', 'S');
    const saved = token;
    const other = await call('POST', '/api/v1/auth/login', {
      phone: '0902000001',
      password: 'demo1234',
    });
    token = other.body.accessToken;
    const r = await call('GET', `/api/v1/quotations/${quotationId}`);
    token = saved;
    assert.equal(r.status, 404, 'RÒ RỈ: tenant khác đọc được báo giá');
  });
});

describe('🔒 Phép tính tiền của database và của TypeScript phải khớp từng đồng', () => {
  test('mọi tổ hợp số lượng lẻ và thuế suất đều cho cùng kết quả', async () => {
    // Database tính tiền để lưu; TypeScript tính tiền để xem trước trên giao
    // diện. Hai chỗ lệch nhau thì con số khách nhìn trước khi bấm duyệt sẽ khác
    // con số in trên báo giá — và không ai phát hiện cho tới lúc khách hỏi.
    //
    // Cùng loại rủi ro với normalize_plate: một quy tắc, hai bản cài đặt, phải
    // có test bắt chúng đi cùng nhau.
    const { quotationId } = await newQuotation('ICE', 'T');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');

    const cases = [
      { quantity: 1, discountAmount: 0, taxRatePercent: 10 },
      { quantity: 1.5, discountAmount: 0, taxRatePercent: 10 },
      { quantity: 2.33, discountAmount: 0, taxRatePercent: 8 },
      { quantity: 0.25, discountAmount: 0, taxRatePercent: 5 },
      { quantity: 3.07, discountAmount: 12_345, taxRatePercent: 10 },
      { quantity: 1, discountAmount: 1, taxRatePercent: 0 },
      { quantity: 7.77, discountAmount: 99_999, taxRatePercent: 10 },
    ];

    for (const c of cases) {
      const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'LABOR',
        serviceItemId: brake,
        ...c,
      });
      assert.equal(r.status, 201, `${JSON.stringify(c)} -> ${JSON.stringify(r.body)}`);
    }

    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(q.body.lines.length, cases.length);

    let expectedTotal = 0;
    for (const line of q.body.lines) {
      const ts = calculateLineTotal({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxRatePercent: line.taxRatePercent,
      });
      assert.equal(
        line.lineTotal,
        ts.total,
        `Lệch ở dòng "${line.description}" sl=${line.quantity} thuế=${line.taxRatePercent}%: ` +
          `database ${line.lineTotal} vs TypeScript ${ts.total}`,
      );
      expectedTotal += ts.total;
    }

    // 🔒 INV-M-02: làm tròn TỪNG DÒNG rồi cộng, không làm tròn ở tổng
    assert.equal(q.body.totalAmount, expectedTotal, 'tổng báo giá lệch');
  });
});

describe('Phát hiện từ codex-review — giữ lại làm hồi quy', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';

  test('🔒 Q-001: giá phụ tùng lấy từ bảng giá ĐANG hiệu lực, không lấy giá cũ rẻ hơn', async () => {
    // Dựng một bảng giá đã hết hạn với giá rẻ hơn hẳn. Nếu câu truy vấn chọn
    // giá thấp nhất thay vì giá của bảng giá đang hiệu lực, nó sẽ lấy 1.000đ.
    const { rows: br } = await pool.query<{ id: string }>(
      'SELECT id FROM branch WHERE tenant_id = $1 ORDER BY code LIMIT 1',
      [TENANT_A],
    );
    const { rows: old } = await pool.query<{ id: string }>(
      `INSERT INTO price_list (tenant_id, branch_id, name, labor_rate_per_hour,
                               effective_from, effective_to)
       VALUES ($1, $2, 'Bang gia cu da het han', 1000,
               now() - interval '2 year', now() - interval '1 year')
       RETURNING id`,
      [TENANT_A, br[0]!.id],
    );
    const { rows: partRows } = await pool.query<{ id: string }>(
      `SELECT id FROM part WHERE tenant_id = $1 AND sku = 'PT-OIL-5W30'`,
      [TENANT_A],
    );
    await pool.query(
      `INSERT INTO price_list_item (price_list_id, tenant_id, part_id, sell_price)
       VALUES ($1, $2, $3, 1000)`,
      [old[0]!.id, TENANT_A, partRows[0]!.id],
    );

    try {
      const { quotationId } = await newQuotation('ICE', 'U');
      const oilPart = await partId('PT-OIL-5W30');
      // Dòng phụ tùng BẮT BUỘC có cha kể từ migration 0019 — xem INV-Q-02.
      const oil = await serviceItemId('ICE', 'SV-OIL-ENGINE');
      const labor = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'LABOR', serviceItemId: oil, quantity: 1,
      });
      const r = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'PART', partId: oilPart, parentLineId: labor.body.id, quantity: 1,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));

      const q = await call('GET', `/api/v1/quotations/${quotationId}`);
      const partLine = q.body.lines.find((l: any) => l.lineType === 'PART');
      assert.equal(
        partLine.unitPrice,
        185_000,
        'lấy giá từ bảng giá đã hết hiệu lực -> báo giá gửi khách sai giá',
      );
    } finally {
      await pool.query('DELETE FROM price_list_item WHERE price_list_id = $1', [old[0]!.id]);
      await pool.query('DELETE FROM price_list WHERE id = $1', [old[0]!.id]);
    }
  });

  test('🔒 Q-002: báo giá dùng bảng giá CỦA CHI NHÁNH nhận xe', async () => {
    // Chi nhánh thứ hai có bảng giá riêng đắt gấp đôi. Đơn nhận ở chi nhánh đó
    // phải snapshot đúng đơn giá của nó.
    const owner = await call('POST', '/api/v1/auth/login', {
      phone: '0901000001',
      password: 'demo1234',
    });
    const saved = token;
    token = owner.body.accessToken;
    const otherBranch = owner.body.user.branchIds.find((b: string) => b !== branchId);
    assert.ok(otherBranch, 'seed phải có ít nhất hai chi nhánh');

    const { rows: pl } = await pool.query<{ id: string }>(
      `INSERT INTO price_list (tenant_id, branch_id, name, labor_rate_per_hour, effective_from)
       VALUES ($1, $2, 'Bang gia chi nhanh hai', 500000, now() - interval '1 day')
       RETURNING id`,
      [TENANT_A, otherBranch],
    );

    try {
      const v = await call('POST', '/api/v1/vehicles', {
        customerId, plateNumber: `77C-${uniq}V`, powertrain: 'ICE',
      });
      const o = await call('POST', '/api/v1/repair-orders', {
        vehicleId: v.body.id,
        branchId: otherBranch,
        customerComplaint: 'Đơn ở chi nhánh có bảng giá riêng',
        odometerIn: 1,
      });
      assert.equal(o.status, 201, JSON.stringify(o.body));

      const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
      assert.equal(q.status, 201, JSON.stringify(q.body));

      const detail = await call('GET', `/api/v1/quotations/${q.body.id}`);
      assert.equal(
        detail.body.laborRatePerHour,
        500_000,
        'đơn ở chi nhánh có bảng giá riêng phải dùng bảng giá đó',
      );

      // Chiều ngược lại mới là chiều bắt được lỗi cũ: chi nhánh KHÔNG có bảng
      // giá riêng phải rơi về bảng giá toàn chuỗi, chứ không mượn bảng giá của
      // chi nhánh khác chỉ vì nó có `branch_id` khác NULL.
      const v2 = await call('POST', '/api/v1/vehicles', {
        customerId, plateNumber: `77C-${uniq}W`, powertrain: 'ICE',
      });
      const o2 = await call('POST', '/api/v1/repair-orders', {
        vehicleId: v2.body.id,
        branchId,
        customerComplaint: 'Đơn ở chi nhánh dùng bảng giá toàn chuỗi',
        odometerIn: 1,
      });
      const q2 = await call('POST', `/api/v1/repair-orders/${o2.body.id}/quotations`);
      const detail2 = await call('GET', `/api/v1/quotations/${q2.body.id}`);
      assert.equal(
        detail2.body.laborRatePerHour,
        250_000,
        'mượn bảng giá của chi nhánh khác -> báo giá sai giá công',
      );
    } finally {
      await pool.query('DELETE FROM price_list WHERE id = $1', [pl[0]!.id]);
      token = saved;
    }
  });

  test('🔒 Q-003: bật cờ bảo hành sau khi gửi bị chặn', async () => {
    // Cờ này đưa cả dòng về 0đ. Không đóng băng nó thì một lệnh UPDATE biến
    // báo giá 5 triệu khách đã nhận thành 0 mà không vi phạm ràng buộc nào.
    const { quotationId } = await newQuotation('ICE', 'W');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    const line = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    const before = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.ok(before.body.totalAmount > 0);

    await assert.rejects(
      () => pool.query('UPDATE quotation_line SET is_warranty = true WHERE id = $1', [line.body.id]),
      /INV-Q-05/,
      'bật được cờ bảo hành sau khi gửi -> tổng báo giá về 0',
    );

    const after = await call('GET', `/api/v1/quotations/${quotationId}`);
    assert.equal(after.body.totalAmount, before.body.totalAmount);
  });

  test('🔒 Q-004: không duyệt riêng dòng phụ tùng khi dòng công cha chưa duyệt', async () => {
    // Phụ tùng APPROVED trong khi công còn PENDING nghĩa là kho được phép xuất
    // hàng cho một việc khách chưa đồng ý làm.
    const { quotationId } = await newQuotation('ICE', 'X');
    const oil = await serviceItemId('ICE', 'SV-OIL-ENGINE');
    const oilPart = await partId('PT-OIL-5W30');

    const labor = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: oil, quantity: 1,
    });
    const part = await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'PART', partId: oilPart, parentLineId: labor.body.id, quantity: 4,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    await assert.rejects(
      () => pool.query(`UPDATE quotation_line SET status = 'APPROVED' WHERE id = $1`, [part.body.id]),
      /INV-Q-02/,
      'duyệt được phụ tùng khi công cha chưa duyệt',
    );

    // Duyệt cha thì con tự theo — chiều lan vẫn phải hoạt động
    await pool.query(`UPDATE quotation_line SET status = 'APPROVED' WHERE id = $1`, [labor.body.id]);
    const q = await call('GET', `/api/v1/quotations/${quotationId}`);
    for (const l of q.body.lines) assert.equal(l.status, 'APPROVED');
  });

  test('🔒 Q-005: gửi hai lần đồng thời thì lần sau báo xung đột, không phải lỗi 500', async () => {
    const { quotationId } = await newQuotation('ICE', 'Y');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });

    const [a, b] = await Promise.all([
      call('POST', `/api/v1/quotations/${quotationId}/send`),
      call('POST', `/api/v1/quotations/${quotationId}/send`),
    ]);

    const codes = [a.status, b.status].sort((x, y) => x - y);
    assert.equal(codes[0], 201, 'phải có đúng một request gửi thành công');
    assert.equal(codes[1], 409, `request thứ hai trả ${codes[1]} thay vì 409`);
  });

  test('Q-006: danh sách báo giá của một đơn trả đủ dòng của từng bản', async () => {
    const { quotationId, orderId } = await newQuotation('ICE', 'Z');
    const brake = await serviceItemId('ICE', 'SV-BRAKE-PAD');
    await call('POST', `/api/v1/quotations/${quotationId}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 1,
    });
    await call('POST', `/api/v1/quotations/${quotationId}/send`);

    const second = await call('POST', `/api/v1/repair-orders/${orderId}/quotations`);
    await call('POST', `/api/v1/quotations/${second.body.id}/lines`, {
      lineType: 'LABOR', serviceItemId: brake, quantity: 2,
    });

    const list = await call('GET', `/api/v1/repair-orders/${orderId}/quotations`);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);
    // Ghép dòng theo báo giá phải đúng, không được trộn lẫn giữa hai bản
    for (const q of list.body) {
      assert.equal(q.lines.length, 1, `báo giá #${q.seq} có ${q.lines.length} dòng`);
    }
    assert.equal(list.body[0].seq, 2, 'sắp xếp theo seq giảm dần');
    assert.equal(list.body[0].lines[0].quantity, 2);
    assert.equal(list.body[1].lines[0].quantity, 1);
  });
});
