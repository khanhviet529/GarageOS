/**
 * Phase 1.6 — máy trạng thái đơn sửa chữa (docs/06-state-machines.md).
 *
 * Bảng chuyển đổi tồn tại ở HAI nơi: `packages/contracts` cho web/mobile và
 * bảng `repair_order_transition` cho trigger. Một quy tắc, hai bản cài đặt —
 * đúng loại rủi ro đã gặp với `normalize_plate` và với phép tính tiền, nên
 * cũng phải có test bắt hai bên đi cùng nhau.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { REPAIR_ORDER_TRANSITIONS } from '@garageos/contracts';

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

async function newOrder(suffix: string): Promise<{ id: string; version: number }> {
  const v = await call('POST', '/api/v1/vehicles', {
    customerId, plateNumber: `18M-${uniq}${suffix}`, powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id, branchId,
    customerComplaint: 'Kiểm tra tổng thể theo yêu cầu',
    odometerIn: 60_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  const d = await call('GET', `/api/v1/repair-orders/${o.body.id}`);
  return { id: o.body.id, version: d.body.version };
}

/** Chuyển trạng thái qua API, tự đọc lại version sau mỗi bước */
async function move(
  orderId: string,
  to: string,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: any }> {
  const d = await call('GET', `/api/v1/repair-orders/${orderId}`);
  return call('POST', `/api/v1/repair-orders/${orderId}/status`, {
    to,
    version: d.body.version,
    ...extra,
  });
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  const login = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003', password: 'demo1234',
  });
  assert.equal(login.status, 201, 'không đăng nhập được — API/seed chưa sẵn sàng');
  token = login.body.accessToken;
  branchId = login.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL', displayName: `Khách trạng thái ${uniq}`, phone: `032${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  await pool.end();
});

describe('🔒 Bảng chuyển đổi ở TypeScript và ở database phải khớp', () => {
  test('không lệch một đường nào', async () => {
    // Lệch nhau nghĩa là web vẽ ra một nút mà database từ chối, hoặc tệ hơn:
    // database cho qua một đường mà web không bao giờ hiển thị nên không ai
    // từng thử — và nó nằm đó tới ngày có người gọi API trực tiếp.
    const { rows } = await pool.query<{ from_status: string; to_status: string }>(
      'SELECT from_status, to_status FROM repair_order_transition',
    );
    const inDb = new Set(rows.map((r) => `${r.from_status}->${r.to_status}`));
    const inTs = new Set(
      Object.entries(REPAIR_ORDER_TRANSITIONS).flatMap(([from, tos]) =>
        tos.map((to) => `${from}->${to}`),
      ),
    );

    const thieuOTs = [...inDb].filter((x) => !inTs.has(x));
    const thieuODb = [...inTs].filter((x) => !inDb.has(x));
    assert.deepEqual(thieuOTs, [], 'database có đường mà TypeScript không biết');
    assert.deepEqual(thieuODb, [], 'TypeScript có đường mà database từ chối');
  });

  test('DELIVERED và CANCELLED không có đường ra', async () => {
    const { rows } = await pool.query<{ from_status: string }>(
      `SELECT DISTINCT from_status FROM repair_order_transition
        WHERE from_status IN ('DELIVERED','CANCELLED')`,
    );
    assert.deepEqual(
      rows,
      [],
      'Trạng thái hấp thụ có đường ra — xe quay lại phải tạo ĐƠN MỚI, không mở lại đơn cũ',
    );
  });
});

describe('Chuyển trạng thái qua API', () => {
  test('đi đúng đường thì được', async () => {
    const o = await newOrder('A');
    const r = await move(o.id, 'DIAGNOSING');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, 'DIAGNOSING');
    assert.equal(r.body.version, o.version + 1, 'version phải tăng sau mỗi lần đổi');
  });

  test('nhảy cóc bị từ chối kèm thông báo tiếng Việt', async () => {
    const o = await newOrder('B');
    const r = await move(o.id, 'DELIVERED', { odometerOut: 61_000 });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'INVALID_STATE_TRANSITION');
    assert.match(r.body.error.message, /Đã tiếp nhận.*Đã giao xe/);
  });

  test('🔒 khoá lạc quan: version cũ bị từ chối', async () => {
    // Hai cố vấn mở cùng một đơn trên hai máy và cùng bấm một nút.
    const o = await newOrder('C');
    const first = await move(o.id, 'DIAGNOSING');
    assert.equal(first.status, 201);

    const stale = await call('POST', `/api/v1/repair-orders/${o.id}/status`, {
      to: 'QUOTED',
      version: o.version, // version từ trước lần đổi đầu
    });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.error.code, 'STALE_VERSION');
  });

  test('huỷ đơn bắt buộc có lý do và nhóm lý do', async () => {
    const o = await newOrder('D');
    const thieu = await move(o.id, 'CANCELLED');
    assert.equal(thieu.status, 400, JSON.stringify(thieu.body));

    const du = await move(o.id, 'CANCELLED', {
      cancelReason: 'Khách báo bận, hẹn tuần sau mang xe lại',
      cancelCategory: 'CUSTOMER_REQUEST',
    });
    assert.equal(du.status, 201, JSON.stringify(du.body));
  });

  test('đơn đã huỷ là trạng thái cuối, không mở lại được', async () => {
    const o = await newOrder('E');
    await move(o.id, 'CANCELLED', {
      cancelReason: 'Xe hỏng nặng ngoài phạm vi xưởng',
      cancelCategory: 'GARAGE_UNABLE',
    });
    const r = await move(o.id, 'DIAGNOSING');
    assert.equal(r.status, 409);
  });

  test('giao xe bắt buộc ghi số km ra', async () => {
    const o = await newOrder('F');
    for (const s of ['DIAGNOSING', 'QUOTED', 'AWAITING_APPROVAL', 'IN_PROGRESS',
                     'QUALITY_CHECK', 'AWAITING_PAYMENT', 'AWAITING_DELIVERY']) {
      const r = await move(o.id, s);
      assert.equal(r.status, 201, `${s}: ${JSON.stringify(r.body)}`);
    }

    const thieu = await move(o.id, 'DELIVERED');
    assert.equal(thieu.status, 400, 'giao xe mà không ghi số km');

    const du = await move(o.id, 'DELIVERED', { odometerOut: 60_120 });
    assert.equal(du.status, 201, JSON.stringify(du.body));

    // Số km của xe cập nhật theo lần giao — đó là con số mới nhất đọc được
    const v = await call('GET', `/api/v1/vehicles/lookup?plate=18M${uniq}F`);
    assert.equal(v.body.exact.lastOdometer, 60_120);
  });

  test('🔒 INV-V-04 vẫn áp cho số km lúc giao: xe không chạy lùi trong xưởng', async () => {
    const o = await newOrder('G');
    for (const s of ['DIAGNOSING', 'QUOTED', 'AWAITING_APPROVAL', 'IN_PROGRESS',
                     'QUALITY_CHECK', 'AWAITING_PAYMENT', 'AWAITING_DELIVERY']) {
      await move(o.id, s);
    }
    const r = await move(o.id, 'DELIVERED', { odometerOut: 59_000 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.message, /nhỏ hơn lúc nhận/);
  });
});

describe('🔒 Trigger ở database chặn cả đường vòng', () => {
  test('SQL trực tiếp cũng không nhảy cóc được', async () => {
    // Đây là lý do tồn tại của lớp thứ ba: script bảo trì và import không đi
    // qua service, nên kiểm tra ở service không bảo vệ được chúng.
    const o = await newOrder('H');
    await assert.rejects(
      () => pool.query(`UPDATE repair_order SET status = 'DELIVERED' WHERE id = $1`, [o.id]),
      /INVALID_TRANSITION/,
      'nhảy thẳng sang DELIVERED bằng SQL',
    );
  });

  test('🔒 INV-A-02: mỗi bước chuyển sinh đúng một dòng nhật ký', async () => {
    const o = await newOrder('I');
    await move(o.id, 'DIAGNOSING');
    await move(o.id, 'QUOTED');

    const { rows } = await pool.query<{ before_json: any; after_json: any }>(
      `SELECT before_json, after_json FROM audit_log
        WHERE entity_type = 'repair_order' AND entity_id = $1 AND action = 'STATUS_CHANGED'
        ORDER BY id`,
      [o.id],
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.before_json.status, 'RECEIVED');
    assert.equal(rows[0]!.after_json.status, 'DIAGNOSING');
    assert.equal(rows[1]!.after_json.status, 'QUOTED');
  });
});

describe('Luồng báo giá đi đúng máy trạng thái', () => {
  test('lập báo giá đưa đơn từ RECEIVED qua DIAGNOSING tới QUOTED', async () => {
    const o = await newOrder('J');
    const q = await call('POST', `/api/v1/repair-orders/${o.id}/quotations`);
    assert.equal(q.status, 201, JSON.stringify(q.body));

    const d = await call('GET', `/api/v1/repair-orders/${o.id}`);
    assert.equal(d.body.status, 'QUOTED');

    // Cả hai bước đều để lại dấu vết, không nhảy cóc âm thầm
    const { rows } = await pool.query<{ after_json: any }>(
      `SELECT after_json FROM audit_log
        WHERE entity_type = 'repair_order' AND entity_id = $1 AND action = 'STATUS_CHANGED'
        ORDER BY id`,
      [o.id],
    );
    assert.deepEqual(rows.map((r) => r.after_json.status), ['DIAGNOSING', 'QUOTED']);
  });
});

describe('Phát hiện từ codex-review — giữ lại làm hồi quy', () => {
  test('🔒 REV-001: giao xe khi đồng hồ hỏng vẫn làm được', async () => {
    // Hợp đồng API cho phép đánh dấu không đọc được số km thay cho số km ra.
    // Bản đầu không ghi cột đó, nên ràng buộc `ro_delivered_needs_odometer` từ
    // chối và người dùng nhận lỗi 500 cho một việc hoàn toàn hợp lệ.
    const o = await newOrder('K');
    for (const s of ['DIAGNOSING', 'QUOTED', 'AWAITING_APPROVAL', 'IN_PROGRESS',
                     'QUALITY_CHECK', 'AWAITING_PAYMENT', 'AWAITING_DELIVERY']) {
      await move(o.id, s);
    }
    const r = await move(o.id, 'DELIVERED', { odometerUnavailable: true });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<{
      odometer_unavailable: boolean;
      odometer_out_unavailable: boolean;
    }>(
      'SELECT odometer_unavailable, odometer_out_unavailable FROM repair_order WHERE id = $1',
      [o.id],
    );
    assert.equal(rows[0]!.odometer_out_unavailable, true, 'không ghi cờ của lúc giao xe');
    assert.equal(
      rows[0]!.odometer_unavailable,
      false,
      'ghi nhầm sang cờ của lúc TIẾP NHẬN — hai thời điểm là hai sự thật khác nhau',
    );
  });

  test('🔒 REV-002: thợ không huỷ được đơn, không giao được xe', async () => {
    // Thợ thuộc đúng chi nhánh, đúng tenant, đơn có thật, version đúng — mọi
    // lớp kiểm tra khác đều cho qua. Chỉ còn VAI là thứ chặn được.
    const o = await newOrder('L');
    const saved = token;

    const tech = await call('POST', '/api/v1/auth/login', {
      phone: '0901000004', password: 'demo1234',
    });
    assert.equal(tech.status, 201, JSON.stringify(tech.body));
    token = tech.body.accessToken;

    const d = await call('GET', `/api/v1/repair-orders/${o.id}`);
    assert.equal(d.status, 200, 'thợ vẫn XEM được đơn, chỉ không sửa được');

    const huy = await call('POST', `/api/v1/repair-orders/${o.id}/status`, {
      to: 'CANCELLED',
      version: d.body.version,
      cancelReason: 'Thợ tự huỷ đơn',
      cancelCategory: 'CUSTOMER_REQUEST',
    });
    assert.equal(huy.status, 403, JSON.stringify(huy.body));
    assert.equal(huy.body.error.code, 'FORBIDDEN');

    const batDau = await call('POST', `/api/v1/repair-orders/${o.id}/status`, {
      to: 'DIAGNOSING',
      version: d.body.version,
    });
    assert.equal(batDau.status, 403, 'thợ mở được việc chẩn đoán');

    token = saved;

    // Và đơn phải còn nguyên trạng thái
    const sau = await call('GET', `/api/v1/repair-orders/${o.id}`);
    assert.equal(sau.body.status, 'RECEIVED');
  });

  test('🔒 REV-002: thu ngân chuyển được sang chờ giao xe nhưng không huỷ đơn', async () => {
    // Danh sách là DANH SÁCH CHO PHÉP theo từng thao tác, không phải một mức
    // quyền chung cho cả endpoint.
    const o = await newOrder('M');
    for (const s of ['DIAGNOSING', 'QUOTED', 'AWAITING_APPROVAL', 'IN_PROGRESS',
                     'QUALITY_CHECK', 'AWAITING_PAYMENT']) {
      await move(o.id, s);
    }

    const saved = token;
    const cashier = await call('POST', '/api/v1/auth/login', {
      phone: '0901000006', password: 'demo1234',
    });
    token = cashier.body.accessToken;

    const d = await call('GET', `/api/v1/repair-orders/${o.id}`);
    const ok = await call('POST', `/api/v1/repair-orders/${o.id}/status`, {
      to: 'AWAITING_DELIVERY', version: d.body.version,
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));

    const giao = await call('POST', `/api/v1/repair-orders/${o.id}/status`, {
      to: 'DELIVERED', version: d.body.version + 1, odometerOut: 60_500,
    });
    assert.equal(giao.status, 403, 'thu ngân giao được xe');

    token = saved;
  });
});
