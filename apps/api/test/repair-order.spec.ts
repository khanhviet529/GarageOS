/**
 * Phase 1.2 — tiếp nhận xe (BC-01).
 *
 * Trọng tâm là hai bất biến hay bị bỏ sót vì "hiếm khi xảy ra":
 *  - INV-V-03: một xe chỉ có MỘT đơn đang mở
 *  - INV-V-04: số km không lùi, trừ khi có lý do và có ghi nhật ký
 *
 * Cả hai đều là loại lỗi không lộ ra ngay: hệ thống vẫn chạy, chỉ có dữ liệu
 * lịch sử sai dần cho tới khi tra bảo hành thì không khớp.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

let token = '';
let branchId = '';
let vehicleId = '';
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
  return { status: res.status, body: await res.json() };
}

/** Tạo một xe mới tinh — mỗi test cần xe riêng vì INV-V-03 khoá theo xe */
async function newVehicle(lastOdometer = 0, suffix = ''): Promise<string> {
  const r = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `51H-${uniq}${suffix}`,
    powertrain: 'ICE',
    lastOdometer,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
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
  assert.ok(branchId, 'người dùng seed phải thuộc ít nhất một chi nhánh');

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách tiếp nhận ${uniq}`,
    phone: `035${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;

  vehicleId = await newVehicle(10_000, 'A');
});

after(async () => {
  await pool.end();
});

describe('Tiếp nhận xe — luồng chính', () => {
  let orderId = '';
  let orderCode = '';

  test('tạo được đơn tiếp nhận', async () => {
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId,
      branchId,
      customerComplaint: 'Xe kêu lạch cạch phía trước bên trái khi qua ổ gà',
      odometerIn: 12_500,
      energyLevelIn: 40,
      assets: [{ description: 'Một túi xách da màu nâu' }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    orderId = r.body.id;
    orderCode = r.body.code;
    assert.match(orderCode, /^RO-\d{8}-\d{4}$/, `mã đơn sai định dạng: ${orderCode}`);
  });

  test('chi tiết đơn trả đúng xe, khách và tài sản', async () => {
    const r = await call('GET', `/api/v1/repair-orders/${orderId}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'RECEIVED');
    assert.equal(r.body.odometerIn, 12_500);
    assert.equal(r.body.assets.length, 1);
    assert.match(r.body.assets[0].description, /túi xách/);
    assert.equal(
      r.body.customerComplaint,
      'Xe kêu lạch cạch phía trước bên trái khi qua ổ gà',
      'lời khách phải giữ NGUYÊN VĂN',
    );
  });

  test('🔒 token tra cứu đủ dài để không đoán được', async () => {
    const r = await call('GET', `/api/v1/repair-orders/${orderId}`);
    // 32 byte ngẫu nhiên mã hoá base64url = 43 ký tự
    assert.ok(
      r.body.customerAccessToken.length >= 43,
      `token chỉ dài ${r.body.customerAccessToken.length} ký tự`,
    );
  });

  test('số km của xe được cập nhật theo lần tiếp nhận', async () => {
    const r = await call('GET', `/api/v1/vehicles/lookup?plate=51H${uniq}A`);
    assert.equal(r.body.exact.lastOdometer, 12_500);
  });

  test('đơn xuất hiện trong danh sách xe đang trong xưởng', async () => {
    const r = await call('GET', '/api/v1/repair-orders?open=true');
    assert.equal(r.status, 200);
    assert.ok(
      r.body.some((o: { code: string }) => o.code === orderCode),
      'đơn vừa tạo không có trong danh sách',
    );
  });
});

describe('🔒 INV-V-03 — một xe chỉ có một đơn đang mở', () => {
  test('tạo đơn thứ hai cho cùng xe bị chặn, và báo rõ đơn nào đang mở', async () => {
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId,
      branchId,
      customerComplaint: 'Khách quay lại vì lỗi khác',
      odometerIn: 12_600,
    });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'RESOURCE_CONFLICT');
    assert.match(
      r.body.error.message,
      /RO-\d{8}-\d{4}/,
      'thông báo phải nêu MÃ đơn đang mở, nếu không cố vấn phải đi tìm bằng tay',
    );
  });

  test('xe đã giao thì tiếp nhận lại được (BC-01 mục 3.7)', async () => {
    // Tình huống thật: xe bàn giao sáng nay, chiều quay lại vì lỗi khác.
    // Đơn cũ đã DELIVERED nên không nằm trong index chặn.
    const v = await newVehicle(5_000, 'B');
    const first = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Bảo dưỡng định kỳ 5000km',
      odometerIn: 5_000,
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    await pool.query(
      `UPDATE repair_order SET status = 'DELIVERED', odometer_out = 5000, delivered_at = now()
        WHERE id = $1`,
      [first.body.id],
    );

    // 🔒 INV-A-02: đổi trạng thái PHẢI sinh nhật ký, và trigger ở DB phải làm
    //    việc đó kể cả khi lệnh UPDATE đến từ ngoài ứng dụng như ở đây.
    const { rows: audit } = await pool.query(
      `SELECT action, before_json, after_json FROM audit_log
        WHERE entity_type = 'repair_order' AND entity_id = $1
          AND action = 'STATUS_CHANGED'`,
      [first.body.id],
    );
    assert.equal(audit.length, 1, 'đổi trạng thái mà không có nhật ký');
    assert.equal(audit[0].before_json.status, 'RECEIVED');
    assert.equal(audit[0].after_json.status, 'DELIVERED');

    const second = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Chiều quay lại vì đèn báo lỗi động cơ',
      odometerIn: 5_010,
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
  });
});

describe('🔒 INV-V-04 — số km không lùi', () => {
  test('số km lùi mà KHÔNG có lý do bị từ chối', async () => {
    const v = await newVehicle(80_000, 'C');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Thay dầu',
      odometerIn: 70_000,
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.message, /nhỏ hơn lần trước/);
  });

  test('số km lùi CÓ lý do thì cho qua và ghi nhật ký', async () => {
    const v = await newVehicle(80_000, 'D');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Thay dầu sau khi thay cụm đồng hồ',
      odometerIn: 70_000,
      odometerOverrideReason: 'ODOMETER_REPLACED',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    // 🔒 Cho qua mà không để lại vết thì quy tắc này vô nghĩa: gian lận số km
    //    chỉ phát hiện được khi có hệ thống, mà "có hệ thống" cần lịch sử.
    const { rows } = await pool.query(
      `SELECT action, reason, before_json, after_json FROM audit_log
        WHERE entity_type = 'repair_order' AND entity_id = $1`,
      [r.body.id],
    );
    assert.equal(rows.length, 1, 'không ghi nhật ký cho lần nhập km lùi');
    assert.equal(rows[0].action, 'ODOMETER_ROLLBACK');
    assert.equal(rows[0].reason, 'ODOMETER_REPLACED');
    assert.equal(Number(rows[0].before_json.lastOdometer), 80_000);
    assert.equal(Number(rows[0].after_json.odometerIn), 70_000);
  });

  test('số km lùi KHÔNG làm giảm số km của xe', async () => {
    const r = await call('GET', `/api/v1/vehicles/lookup?plate=51H${uniq}D`);
    assert.equal(
      r.body.exact.lastOdometer,
      80_000,
      'ghi đè bằng số nhỏ hơn sẽ làm hỏng mọi tính toán bảo hành theo km',
    );
  });

  test('đồng hồ hỏng thì để trống được', async () => {
    const v = await newVehicle(30_000, 'E');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Đồng hồ công tơ mét không hiển thị',
      odometerUnavailable: true,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test('vừa đánh dấu không đọc được vừa nhập số km bị chặn', async () => {
    const v = await newVehicle(0, 'F');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Mâu thuẫn dữ liệu',
      odometerUnavailable: true,
      odometerIn: 1_000,
    });
    assert.equal(r.status, 400);
  });

  test('không nhập gì về số km cũng bị chặn', async () => {
    const v = await newVehicle(0, 'G');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Thiếu số km',
    });
    assert.equal(r.status, 400);
  });
});

describe('Ràng buộc dữ liệu tiếp nhận', () => {
  test('lời khách quá ngắn bị chặn', async () => {
    const v = await newVehicle(0, 'H');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'x',
      odometerIn: 1,
    });
    assert.equal(r.status, 400);
  });

  test('mức năng lượng ngoài 0-100 bị chặn', async () => {
    const v = await newVehicle(0, 'I');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId,
      customerComplaint: 'Pin báo sai',
      odometerIn: 1,
      energyLevelIn: 150,
    });
    assert.equal(r.status, 400);
  });

  test('xe không tồn tại trả 404', async () => {
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: '00000000-0000-0000-0000-000000000000',
      branchId,
      customerComplaint: 'Xe không tồn tại',
      odometerIn: 1,
    });
    assert.equal(r.status, 404);
  });

  test('🔒 tiếp nhận ở chi nhánh không thuộc quyền bị chặn', async () => {
    const v = await newVehicle(0, 'J');
    const r = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId: '00000000-0000-0000-0000-000000000001',
      customerComplaint: 'Chi nhánh lạ',
      odometerIn: 1,
    });
    assert.equal(r.status, 403, 'RLS không chặn được vì vẫn cùng tenant');
  });
});

describe('🔒 INV-T-01 — đơn bị cô lập theo tenant', () => {
  test('tenant khác không đọc được đơn', async () => {
    const mine = await call('GET', '/api/v1/repair-orders?open=true');
    const anyOrder = mine.body[0];
    assert.ok(anyOrder, 'cần ít nhất một đơn để kiểm tra');

    const other = await call('POST', '/api/v1/auth/login', {
      phone: '0902000001',
      password: 'demo1234',
    });
    const saved = token;
    token = other.body.accessToken;
    const r = await call('GET', `/api/v1/repair-orders/${anyOrder.id}`);
    const listOther = await call('GET', '/api/v1/repair-orders?open=true');
    token = saved;

    assert.equal(r.status, 404, 'RÒ RỈ: tenant khác đọc được đơn');
    assert.ok(
      !listOther.body.some((o: { id: string }) => o.id === anyOrder.id),
      'RÒ RỈ: đơn của tenant khác lọt vào danh sách',
    );
  });
});

describe('🔒 Phạm vi chi nhánh — docs/02-actors-and-permissions.md', () => {
  test('cố vấn chi nhánh A không đọc được đơn của chi nhánh B', async () => {
    // OWNER có phạm vi TENANT nên được gán mọi chi nhánh; cố vấn chỉ chi nhánh 1.
    const saved = token;
    const owner = await call('POST', '/api/v1/auth/login', {
      phone: '0901000001',
      password: 'demo1234',
    });
    token = owner.body.accessToken;
    const otherBranch = owner.body.user.branchIds.find((b: string) => b !== branchId);
    assert.ok(otherBranch, 'seed phải có ít nhất hai chi nhánh');

    const v = await newVehicle(0, 'K');
    const created = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v,
      branchId: otherBranch,
      customerComplaint: 'Đơn của chi nhánh khác',
      odometerIn: 1,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    // Chủ chuỗi phạm vi TENANT thì vẫn phải đọc được
    const asOwner = await call('GET', `/api/v1/repair-orders/${created.body.id}`);
    assert.equal(asOwner.status, 200, 'chủ chuỗi phải xem được mọi chi nhánh');

    token = saved;
    const asAdvisor = await call('GET', `/api/v1/repair-orders/${created.body.id}`);
    assert.equal(
      asAdvisor.status,
      404,
      'RÒ RỈ: cố vấn đọc được đơn của chi nhánh không thuộc quyền',
    );

    const list = await call('GET', '/api/v1/repair-orders?open=true');
    assert.ok(
      !list.body.some((o: { id: string }) => o.id === created.body.id),
      'RÒ RỈ: đơn chi nhánh khác lọt vào danh sách',
    );
  });

  test('truyền branchId lạ trong query không mở rộng được phạm vi', async () => {
    const list = await call(
      'GET',
      '/api/v1/repair-orders?open=true&branchId=00000000-0000-0000-0000-000000000009',
    );
    // Lọc thêm thì được, mở rộng thì không
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 0);
  });
});
