/**
 * Phase 1.1 — khách hàng và phương tiện.
 *
 * Trọng tâm: chuẩn hoá biển số (INV-V-02) và ràng buộc loại động cơ (ADR-0004).
 * Đây là hai thứ mà làm sai sẽ hỏng toàn bộ phần sau: lịch sử xe phân mảnh,
 * bảo hành tra không ra, và báo giá sai hạng mục cho xe điện.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:3001';
let token = '';
let customerId = '';
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

before(async () => {
  const login = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003',
    password: 'demo1234',
  });
  assert.equal(login.status, 201, 'không đăng nhập được — API/seed chưa sẵn sàng');
  token = login.body.accessToken;

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách kiểm thử ${uniq}`,
    phone: `09${uniq}99`,
  });
  assert.equal(c.status, 201);
  customerId = c.body.id;
});

describe('Khách hàng', () => {
  test('khách doanh nghiệp thiếu mã số thuế bị chặn', async () => {
    const r = await call('POST', '/api/v1/customers', {
      type: 'COMPANY',
      displayName: 'Công ty Không MST',
      phone: `08${uniq}11`,
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'VALIDATION_FAILED');
  });

  test('khách doanh nghiệp có mã số thuế được tạo', async () => {
    const r = await call('POST', '/api/v1/customers', {
      type: 'COMPANY',
      displayName: `Công ty ${uniq}`,
      phone: `08${uniq}22`,
      taxCode: '0101234567',
    });
    assert.equal(r.status, 201);
  });
});

describe('🔒 INV-V-02 — chuẩn hoá biển số', () => {
  const plate = `30A-${uniq[0]}${uniq[1]}${uniq[2]}.${uniq[3]}${uniq[4]}`;
  const plateNoSep = plate.replace(/[^A-Za-z0-9]/g, '');

  test('tạo được xe mới', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: plate,
      powertrain: 'BEV',
      batteryCapacityKwh: 42,
      makeName: 'VinFast',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test('tra bằng biển GÕ KHÁC ĐỊNH DẠNG vẫn khớp', async () => {
    // '30A-123.45' và '30A12345' là CÙNG một xe
    const r = await call('GET', `/api/v1/vehicles/lookup?plate=${plateNoSep}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.exact !== null, 'không khớp — chuẩn hoá biển số hỏng');
    assert.equal(r.body.exact.powertrain, 'BEV');
  });

  test('tạo TRÙNG biển với định dạng khác bị chặn', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: plateNoSep,
      powertrain: 'ICE',
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'RESOURCE_CONFLICT');
  });

  test('gõ nhầm một ký tự vẫn gợi ý được xe đúng', async () => {
    // Chống tạo hồ sơ trùng do nhân viên gõ sai — BC-01 mục 3.4
    const typo = plateNoSep.slice(0, -1) + (plateNoSep.endsWith('9') ? '8' : '9');
    const r = await call('GET', `/api/v1/vehicles/lookup?plate=${typo}`);
    assert.equal(r.body.exact, null, 'biển gõ nhầm không được khớp chính xác');
    assert.ok(r.body.suggestions.length > 0, 'không gợi ý gì — nhân viên sẽ tạo hồ sơ trùng');
  });

  test('biển số quá ngắn bị chặn', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: 'A1',
      powertrain: 'ICE',
    });
    assert.ok(r.status >= 400);
  });

  test('biển số toàn ký tự phân cách bị chặn', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: '---.---',
      powertrain: 'ICE',
    });
    assert.ok(r.status >= 400);
  });
});

describe('🔒 ADR-0004 — powertrain là thuộc tính gốc', () => {
  test('powertrain là BẮT BUỘC, không có mặc định', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: `29X-${uniq}`,
    });
    assert.equal(r.status, 400);
  });

  test('xe ICE khai dung lượng pin bị chặn', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: `29Y-${uniq}`,
      powertrain: 'ICE',
      batteryCapacityKwh: 50,
    });
    assert.equal(r.status, 400);
  });

  test('xe HYBRID khai pin được', async () => {
    const r = await call('POST', '/api/v1/vehicles', {
      customerId,
      plateNumber: `29Z-${uniq}`,
      powertrain: 'HYBRID',
      batteryCapacityKwh: 1.8,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
});

describe('INV-T-01 — tra cứu bị giới hạn theo tenant', () => {
  test('tenant khác không tra được xe vừa tạo', async () => {
    const other = await call('POST', '/api/v1/auth/login', {
      phone: '0902000001',
      password: 'demo1234',
    });
    const saved = token;
    token = other.body.accessToken;
    const r = await call('GET', `/api/v1/vehicles/lookup?plate=30A${uniq}`);
    token = saved;
    assert.equal(r.body.exact, null, 'RÒ RỈ: tenant khác tra được xe');
    assert.equal(r.body.suggestions.length, 0, 'RÒ RỈ: gợi ý lộ biển số tenant khác');
  });

  test('không có token thì không tra được', async () => {
    const saved = token;
    token = '';
    const r = await call('GET', '/api/v1/vehicles/lookup?plate=30A12345');
    token = saved;
    assert.equal(r.status, 401);
  });
});
