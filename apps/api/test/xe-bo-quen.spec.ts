/**
 * Phase 5.5 — khách không đến lấy xe (BC-15).
 *
 * Bảy bài của BC-15 mục 8. Bài số 5 quan trọng hơn vẻ ngoài: nếu báo cáo không
 * loại trừ xe bỏ quên thì MỘT chiếc xe nằm sáu tháng kéo "thời gian sửa trung
 * bình" của cả xưởng lên vô lý — và toàn bộ báo cáo vận hành thành vô nghĩa.
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
let tokenQuanLy = '';
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

/** Chính sách phí lưu bãi của tenant, đặt riêng cho từng kịch bản */
async function datChinhSach(opts: {
  enabled: boolean;
  graceDays?: number;
  perDay?: number;
  max?: number;
}): Promise<void> {
  await pool.query(
    `UPDATE tenant SET storage_fee_enabled = $2,
                       storage_fee_grace_days = COALESCE($3, storage_fee_grace_days),
                       storage_fee_per_day_amount = COALESCE($4, storage_fee_per_day_amount),
                       storage_fee_max_amount = COALESCE($5, storage_fee_max_amount)
      WHERE id = $1`,
    [TENANT_A, opts.enabled, opts.graceDays ?? null, opts.perDay ?? null, opts.max ?? null],
  );
}

/**
 * Một đơn đã ở AWAITING_DELIVERY, sẵn sàng giao từ `soNgayTruoc` ngày trước.
 *
 * Đi thẳng bằng SQL qua từng bước máy trạng thái: luồng sửa chữa đầy đủ đã có
 * test riêng, và ở đây nó chỉ là điều kiện đầu vào.
 */
async function donChoLay(soNgayTruoc: number): Promise<{ id: string; code: string }> {
  dem += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `88D-${uniq}${dem}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test xe bỏ quên',
    odometerIn: 20_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  for (const tt of [
    'DIAGNOSING',
    'QUOTED',
    'AWAITING_APPROVAL',
    'IN_PROGRESS',
    'QUALITY_CHECK',
    'AWAITING_PAYMENT',
    'AWAITING_DELIVERY',
  ]) {
    await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [o.body.id, tt]);
  }
  await pool.query(
    `UPDATE repair_order SET ready_for_delivery_at = now() - make_interval(days => $2::int)
      WHERE id = $1`,
    [o.body.id, soNgayTruoc],
  );

  return { id: o.body.id, code: o.body.code };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenCoVan = await dangNhap('0901000003');
  tokenQuanLy = await dangNhap('0901000002');

  const me = await call(
    'POST',
    '/api/v1/auth/login',
    { phone: '0901000003', password: 'demo1234' },
    '',
  );
  branchId = me.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách bỏ quên xe ${uniq}`,
    phone: `037${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  // Trả chính sách về mặc định của seed để bài khác không thừa hưởng
  await datChinhSach({ enabled: false, graceDays: 7, perDay: 50_000, max: 5_000_000 });
  await pool.query(
    `DELETE FROM storage_fee WHERE repair_order_id IN (
       SELECT ro.id FROM repair_order ro JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number LIKE $1)`,
    [`88D-${uniq}%`],
  );
  await pool.end();
});

describe('🔒 BC-15 — xe nằm bãi và phí lưu bãi', () => {
  test('bài 1: quá thời gian miễn phí → OVERDUE và bắt đầu tính phí', async () => {
    await datChinhSach({ enabled: true, graceDays: 7, perDay: 50_000, max: 5_000_000 });
    const don = await donChoLay(10);

    const r = await call('POST', `/api/v1/repair-orders/${don.id}/storage-fee/refresh`);
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const { rows } = await pool.query<{ st: string }>(
      'SELECT abandonment_status AS st FROM repair_order WHERE id = $1',
      [don.id],
    );
    assert.equal(rows[0]!.st, 'OVERDUE');

    // 10 ngày nằm chờ − 7 ngày miễn phí = 3 ngày × 50.000đ
    assert.equal(r.body.soNgay, 3);
    assert.equal(r.body.amount, 150_000);
    assert.equal(r.body.conPhaiThu, 150_000);
  });

  test('bài 3: phí vượt trần thì dừng ở trần', async () => {
    /*
     * Một xe nằm hai năm với phí 50.000đ/ngày là 36 triệu — lớn hơn giá trị
     * nhiều chiếc xe cũ. BC-15 mục 5 gọi trần này là "tránh phí vượt giá trị
     * xe", và không có nó thì con số trên màn hình tự vô hiệu hoá chính nó.
     */
    await datChinhSach({ enabled: true, graceDays: 7, perDay: 50_000, max: 1_000_000 });
    const don = await donChoLay(400);

    const r = await call('POST', `/api/v1/repair-orders/${don.id}/storage-fee/refresh`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.soNgay, 393, '393 ngày × 50.000 = 19,65 triệu — vượt xa trần');
    assert.equal(r.body.amount, 1_000_000, 'phí không dừng ở trần');
  });

  test('bài 4: tenant tắt phí lưu bãi → KHÔNG sinh khoản phí nào', async () => {
    await datChinhSach({ enabled: false });
    const don = await donChoLay(30);

    const r = await call('POST', `/api/v1/repair-orders/${don.id}/storage-fee/refresh`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body, null, 'garage không thu phí mà vẫn sinh một khoản phí');

    /*
     * Nhưng mức leo thang VẪN chạy — hai thứ này độc lập. Gộp lại là chỗ dễ
     * sai: tắt phí thành ra tắt luôn việc theo dõi, và xe bỏ quên biến mất khỏi
     * mọi màn hình.
     */
    const { rows } = await pool.query<{ st: string }>(
      'SELECT abandonment_status AS st FROM repair_order WHERE id = $1',
      [don.id],
    );
    assert.equal(rows[0]!.st, 'UNREACHABLE', '30 ngày là mốc gửi thư bảo đảm');
  });

  test('mốc leo thang: 60 ngày → DECLARED_ABANDONED', async () => {
    await datChinhSach({ enabled: false });
    const don = await donChoLay(70);
    await call('POST', `/api/v1/repair-orders/${don.id}/storage-fee/refresh`);

    const { rows } = await pool.query<{ st: string }>(
      'SELECT abandonment_status AS st FROM repair_order WHERE id = $1',
      [don.id],
    );
    assert.equal(rows[0]!.st, 'DECLARED_ABANDONED');
    /*
     * ⚠️ Và đó là TOÀN BỘ những gì phần mềm làm: một cái nhãn để con người biết
     *    cần tham vấn luật sư. Không có hành động pháp lý tự động nào.
     */
  });

  test('bài 6: xe có legal_hold thì KHÔNG bàn giao được', async () => {
    const don = await donChoLay(3);

    const dat = await call(
      'POST',
      `/api/v1/repair-orders/${don.id}/legal-hold`,
      { legalHold: true, reason: 'Xe đang cầm cố, có người thứ ba tới nhận' },
      tokenQuanLy,
    );
    assert.equal(dat.status, 201, JSON.stringify(dat.body));

    // 🔒 Chặn ở tầng DB: một màn hình quên hỏi thì vẫn không giao được
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE repair_order SET status = 'DELIVERED', odometer_out = 20500,
                                   delivered_at = now() WHERE id = $1`,
          [don.id],
        ),
      /ro_khong_giao_khi_legal_hold/,
      'giao được xe đang tranh chấp',
    );

    // Gỡ cờ thì giao được — không có vế này thì chưa chứng minh cờ là thứ đang chặn
    const go = await call(
      'POST',
      `/api/v1/repair-orders/${don.id}/legal-hold`,
      { legalHold: false, reason: 'Đã xác minh giấy tờ, tranh chấp được giải quyết' },
      tokenQuanLy,
    );
    assert.equal(go.status, 201, JSON.stringify(go.body));
    await pool.query(
      `UPDATE repair_order SET status = 'DELIVERED', odometer_out = 20500, delivered_at = now()
        WHERE id = $1`,
      [don.id],
    );
  });

  test('bài 7: miễn phí lưu bãi là quyền của quản lý, không phải cố vấn', async () => {
    await datChinhSach({ enabled: true, graceDays: 7, perDay: 50_000, max: 5_000_000 });
    const don = await donChoLay(20);
    const phi = await call('POST', `/api/v1/repair-orders/${don.id}/storage-fee/refresh`);
    assert.equal(phi.body.amount, 650_000, '13 ngày × 50.000');

    const coVan = await call('POST', `/api/v1/repair-orders/${don.id}/storage-fee/waive`, {
      amount: 650_000,
      reason: 'Khách quen, cố vấn tự miễn',
    });
    assert.equal(coVan.status, 403, JSON.stringify(coVan.body));

    const quanLy = await call(
      'POST',
      `/api/v1/repair-orders/${don.id}/storage-fee/waive`,
      { amount: 400_000, reason: 'Khách bị tai nạn nằm viện, giảm một phần' },
      tokenQuanLy,
    );
    assert.equal(quanLy.status, 201, JSON.stringify(quanLy.body));
    assert.equal(quanLy.body.waivedAmount, 400_000);
    assert.equal(quanLy.body.conPhaiThu, 250_000);

    // 🔒 Không miễn nhiều hơn số phải thu — miễn vượt là một khoản CHI trá hình
    await assert.rejects(
      () =>
        pool.query(`UPDATE storage_fee SET waived_amount = 999999999 WHERE repair_order_id = $1`, [
          don.id,
        ]),
      /storage_fee_waive_khong_vuot/,
    );
  });
});

describe('🔒 Nhật ký liên hệ là BẰNG CHỨNG, không phải ghi chú', () => {
  test('ghi được nhiều lần, hiện đủ, và cập nhật mốc liên hệ gần nhất', async () => {
    await datChinhSach({ enabled: false });
    const don = await donChoLay(15);

    const l1 = await call('POST', `/api/v1/repair-orders/${don.id}/contacts`, {
      channel: 'PHONE',
      outcome: 'NO_ANSWER',
      note: 'Gọi 3 lần buổi sáng',
    });
    assert.equal(l1.status, 201, JSON.stringify(l1.body));

    const l2 = await call('POST', `/api/v1/repair-orders/${don.id}/contacts`, {
      channel: 'ZALO',
      outcome: 'PROMISED_DATE',
      promisedPickupAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      note: 'Khách hẹn thứ sáu qua lấy',
    });
    assert.equal(l2.status, 201, JSON.stringify(l2.body));
    assert.equal(l2.body.length, 2);
    assert.equal(l2.body[0].channel, 'ZALO', 'nhật ký phải xếp mới nhất lên đầu');

    const { rows } = await pool.query<{ t: Date | null }>(
      'SELECT last_contact_attempt_at AS t FROM repair_order WHERE id = $1',
      [don.id],
    );
    assert.ok(rows[0]!.t !== null, 'ghi nhật ký mà đơn vẫn "chưa ai liên hệ bao giờ"');
  });

  test('🔒 khách hẹn ngày mà không ghi ngày — bị chặn', async () => {
    const don = await donChoLay(8);
    const r = await call('POST', `/api/v1/repair-orders/${don.id}/contacts`, {
      channel: 'PHONE',
      outcome: 'PROMISED_DATE',
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('🔒 thư bảo đảm phải ghi rõ gửi đi đâu', async () => {
    const don = await donChoLay(35);
    const thieu = await call('POST', `/api/v1/repair-orders/${don.id}/contacts`, {
      channel: 'REGISTERED_MAIL',
      outcome: 'NO_ANSWER',
      note: 'đã gửi',
    });
    assert.equal(thieu.status, 400, JSON.stringify(thieu.body));

    const du = await call('POST', `/api/v1/repair-orders/${don.id}/contacts`, {
      channel: 'REGISTERED_MAIL',
      outcome: 'NO_ANSWER',
      note: 'Gửi tới 12 Lê Lợi, Q1 — vận đơn VNP-2026-889120, bưu điện xác nhận đã phát',
    });
    assert.equal(du.status, 201, JSON.stringify(du.body));
  });

  test('🔒 nhật ký liên hệ KHÔNG sửa và KHÔNG xoá được', async () => {
    /*
     * Nếu sửa được một lần gọi đã ghi thì toàn bộ giá trị làm chứng biến mất:
     * garage nào cũng "đã gọi mười lần" vào ngày cần chứng minh.
     *
     * Kiểm bằng quyền của role ứng dụng, không phải bằng kết nối quản trị —
     * đường mà API thật đi.
     */
    const { rows } = await pool.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'garageos_app' AND table_name = 'customer_contact_attempt'
        ORDER BY 1`,
    );
    assert.deepEqual(
      rows.map((r) => r.privilege_type).sort(),
      ['INSERT', 'SELECT'],
      'nhật ký liên hệ có quyền ngoài SELECT + INSERT',
    );
  });

  test('danh sách xe nằm bãi hiện đủ số ngày chờ và số lần liên hệ', async () => {
    await datChinhSach({ enabled: false });
    const don = await donChoLay(25);
    await call('POST', `/api/v1/repair-orders/${don.id}/contacts`, {
      channel: 'SMS',
      outcome: 'NO_ANSWER',
    });

    const r = await call('GET', '/api/v1/abandoned-vehicles');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cua = r.body.find((x: { code: string }) => x.code === don.code);
    assert.ok(cua, 'xe nằm bãi 25 ngày không có trong danh sách');
    assert.equal(cua.soNgayCho, 25);
    assert.equal(cua.soLanLienHe, 1);
  });
});
