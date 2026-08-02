/**
 * Phase 1.3 — danh mục dịch vụ và phụ tùng.
 *
 * 🔒 INV-V-01 là lý do tồn tại của cả lát cắt này: báo giá "thay dầu động cơ"
 * cho một chiếc xe thuần điện là kiểu sai lộ ngay sự thiếu chuyên nghiệp trước
 * mặt khách, và không có cách nào chữa sau khi đã gửi.
 *
 * Test bám đúng bảng "Test cần có" của BC-11 mục 6.
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

async function vehicleOf(powertrain: 'ICE' | 'HYBRID' | 'BEV', suffix: string): Promise<string> {
  const r = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `88K-${uniq}${suffix}`,
    powertrain,
    ...(powertrain === 'ICE' ? {} : { batteryCapacityKwh: 42 }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

const codesOf = (body: { serviceItems: { code: string }[] }): string[] =>
  body.serviceItems.map((s) => s.code);

before(async () => {
  const login = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003',
    password: 'demo1234',
  });
  assert.equal(login.status, 201, 'không đăng nhập được — API/seed chưa sẵn sàng');
  token = login.body.accessToken;

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách danh mục ${uniq}`,
    phone: `034${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

describe('🔒 INV-V-01 — danh mục lọc theo loại động cơ', () => {
  test('xe thuần điện KHÔNG thấy hạng mục của động cơ đốt trong', async () => {
    const v = await vehicleOf('BEV', 'A');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const codes = codesOf(r.body);
    for (const forbidden of ['SV-OIL-ENGINE', 'SV-SPARK-PLUG', 'SV-TIMING-BELT', 'SV-EXHAUST']) {
      assert.ok(
        !codes.includes(forbidden),
        `Xe điện thấy hạng mục ${forbidden} — báo giá thay dầu cho xe không có động cơ`,
      );
    }
    assert.ok(codes.includes('SV-CHARGE-PORT'), 'thiếu hạng mục riêng của xe thuần điện');
    assert.ok(codes.includes('SV-BRAKE-PAD'), 'xe điện vẫn có má phanh');
  });

  test('xe hybrid thấy CẢ hạng mục động cơ LẪN hạng mục pin', async () => {
    // Đây là ca dễ làm sai nhất: coi hybrid như "một loại xe điện" thì mất
    // hết hạng mục động cơ, mà xe hybrid vẫn có động cơ xăng thật.
    const v = await vehicleOf('HYBRID', 'B');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    const codes = codesOf(r.body);
    assert.ok(codes.includes('SV-OIL-ENGINE'), 'hybrid vẫn phải thay dầu động cơ');
    assert.ok(codes.includes('SV-HV-SOH'), 'hybrid vẫn phải kiểm tra pin cao áp');
  });

  test('xe xăng KHÔNG thấy hạng mục hệ thống cao áp', async () => {
    const v = await vehicleOf('ICE', 'C');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    const codes = codesOf(r.body);
    for (const forbidden of ['SV-HV-SOH', 'SV-HV-MODULE', 'SV-CHARGE-PORT']) {
      assert.ok(!codes.includes(forbidden), `Xe xăng thấy hạng mục cao áp ${forbidden}`);
    }
    assert.ok(codes.includes('SV-OIL-ENGINE'));
  });

  test('loại động cơ lấy từ hồ sơ xe, không nhận từ client', async () => {
    // Không có tham số nào để khai loại động cơ -> không có cách nào lách.
    const v = await vehicleOf('BEV', 'D');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}?powertrain=ICE`);
    assert.equal(r.body.powertrain, 'BEV', 'tham số client ghi đè được loại động cơ');
    assert.ok(!codesOf(r.body).includes('SV-OIL-ENGINE'));
  });
});

describe('Giá và bảng giá', () => {
  test('giá công tính sẵn = giờ định mức × đơn giá giờ, làm tròn về số nguyên đồng', async () => {
    const v = await vehicleOf('ICE', 'E');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    const rate = r.body.laborRatePerHour;
    assert.ok(rate > 0, 'không có đơn giá giờ thì mọi con số phía sau là bịa');

    for (const s of r.body.serviceItems) {
      assert.ok(Number.isInteger(s.laborAmount), `${s.code}: tiền phải là số nguyên đồng`);
      assert.equal(s.laborAmount, Math.round(s.standardHours * rate), `${s.code}: sai giá công`);
    }

    // Má phanh 1,5 giờ × 250.000 = 375.000 — số lẻ giờ không được làm lệch tiền
    const brake = r.body.serviceItems.find((s: { code: string }) => s.code === 'SV-BRAKE-PAD');
    assert.equal(brake.laborAmount, Math.round(1.5 * rate));
  });

  test('phụ tùng có giá bán nguyên đồng và thuế suất hợp lệ', async () => {
    const v = await vehicleOf('ICE', 'F');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    assert.ok(r.body.parts.length > 0, 'danh mục phụ tùng rỗng');
    for (const p of r.body.parts) {
      if (p.sellPrice !== null) {
        assert.ok(Number.isInteger(p.sellPrice), `${p.sku}: giá phải là số nguyên đồng`);
        assert.ok(p.sellPrice >= 0);
        assert.ok(p.taxRatePercent >= 0 && p.taxRatePercent <= 100);
      }
    }
  });

  test('phụ tùng cao áp được đánh dấu riêng', async () => {
    const v = await vehicleOf('BEV', 'G');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    const hv = r.body.parts.find((p: { sku: string }) => p.sku === 'PT-HV-MODULE');
    assert.ok(hv, 'thiếu phụ tùng pin cao áp trong seed');
    assert.equal(hv.isHighVoltage, true, 'phụ tùng cao áp không được đánh dấu -> bỏ qua quy trình an toàn');
  });

  test('hạng mục cao áp khai đúng chứng chỉ bắt buộc', async () => {
    // Dữ liệu này chưa được enforce ở Phase 1 (bảng phân công thuộc Phase 2),
    // nhưng nếu sai từ bây giờ thì lúc bật INV-W-03 sẽ không có gì để dựa vào.
    const v = await vehicleOf('BEV', 'H');
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    const soh = r.body.serviceItems.find((s: { code: string }) => s.code === 'SV-HV-SOH');
    assert.deepEqual(soh.requiredCertifications, ['HV_ELECTRICAL']);
  });
});

describe('🔒 INV-T-01 — danh mục cô lập theo tenant', () => {
  test('không tra được danh mục theo xe của tenant khác', async () => {
    const v = await vehicleOf('ICE', 'I');
    const saved = token;
    const other = await call('POST', '/api/v1/auth/login', {
      phone: '0902000001',
      password: 'demo1234',
    });
    token = other.body.accessToken;
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    token = saved;
    assert.equal(r.status, 404, 'RÒ RỈ: tenant khác đọc được xe qua đường danh mục');
  });

  test('đơn giá giờ của tenant khác không lẫn sang', async () => {
    const mine = await call('GET', `/api/v1/catalog/vehicle/${await vehicleOf('ICE', 'J')}`);
    assert.equal(mine.body.laborRatePerHour, 250_000, 'seed tenant A là 250.000đ/giờ');
  });

  test('không có token thì không đọc được danh mục', async () => {
    const v = await vehicleOf('ICE', 'K');
    const saved = token;
    token = '';
    const r = await call('GET', `/api/v1/catalog/vehicle/${v}`);
    token = saved;
    assert.equal(r.status, 401);
  });
});
