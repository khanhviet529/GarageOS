/**
 * Phase 1.5 — trang tra cứu công khai và duyệt báo giá từng phần (BC-02).
 *
 * Đây là bề mặt duy nhất KHÔNG cần đăng nhập, nên cũng là bề mặt tấn công lớn
 * nhất. Test ở đây chia làm hai nhóm: nghiệp vụ duyệt từng phần, và những gì
 * người lạ cầm link KHÔNG được làm.
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
let customerId = '';
let pool: Pool;
const uniq = Date.now().toString().slice(-6);
let serviceIds: Record<string, string> = {};
let partIds: Record<string, string> = {};

async function call(
  method: string,
  path: string,
  body?: unknown,
  useAuth = true,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(useAuth && token !== '' ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

/**
 * Dựng một đơn có báo giá ĐÃ GỬI gồm 2 hạng mục công, mỗi hạng mục kèm 1 phụ
 * tùng — đúng hình dạng của ví dụ trong BC-02 mục 3.
 */
async function newSentQuotation(suffix: string): Promise<{
  trackingToken: string;
  quotationId: string;
  laborLineIds: string[];
  totalAmount: number;
}> {
  const v = await call('POST', '/api/v1/vehicles', {
    customerId, plateNumber: `92T-${uniq}${suffix}`, powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id, branchId,
    customerComplaint: 'Xe kêu ở phanh, điều hoà yếu',
    odometerIn: 45_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  const laborLineIds: string[] = [];

  for (const [svc, part] of [
    ['SV-BRAKE-PAD', 'PT-BRAKE-PAD-F'],
    ['SV-AC-CLEAN', 'PT-CABIN-FILTER'],
  ] as const) {
    const labor = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
      lineType: 'LABOR', serviceItemId: serviceIds[svc], quantity: 1,
    });
    assert.equal(labor.status, 201, JSON.stringify(labor.body));
    laborLineIds.push(labor.body.id);

    const p = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
      lineType: 'PART', partId: partIds[part], parentLineId: labor.body.id, quantity: 1,
    });
    assert.equal(p.status, 201, JSON.stringify(p.body));
  }

  const sent = await call('POST', `/api/v1/quotations/${q.body.id}/send`);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));

  const detail = await call('GET', `/api/v1/repair-orders/${o.body.id}`);
  const full = await call('GET', `/api/v1/quotations/${q.body.id}`);

  return {
    trackingToken: detail.body.customerAccessToken,
    quotationId: q.body.id,
    laborLineIds,
    totalAmount: full.body.totalAmount,
  };
}

async function getOtp(trackingToken: string, quotationId: string): Promise<string> {
  const r = await call(
    'POST', `/api/v1/public/tracking/${trackingToken}/otp`, { quotationId }, false,
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.devCode, 'CI/dev phải bật OTP_DEV_ECHO để chạy được luồng này');
  return r.body.devCode as string;
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
    type: 'INDIVIDUAL',
    displayName: `Khách tra cứu ${uniq}`,
    phone: `091${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;

  // Đọc id danh mục một lần qua API để không phụ thuộc uuid của seed
  const probe = await call('POST', '/api/v1/vehicles', {
    customerId, plateNumber: `92P-${uniq}`, powertrain: 'ICE',
  });
  const cat = await call('GET', `/api/v1/catalog/vehicle/${probe.body.id}`);
  serviceIds = Object.fromEntries(
    cat.body.serviceItems.map((s: { code: string; id: string }) => [s.code, s.id]),
  );
  partIds = Object.fromEntries(
    cat.body.parts.map((p: { sku: string; id: string }) => [p.sku, p.id]),
  );
});

after(async () => {
  await pool.end();
});

/**
 * Đưa một đơn đi hết vòng đời tới DELIVERED bằng các bước HỢP LỆ.
 *
 * Không đặt thẳng `status='DELIVERED'` được nữa: trigger máy trạng thái ở
 * migration 0014 chặn mọi đường tắt. Đây chính là điều ta muốn — và hàm này
 * cũng là bản mô tả sống của chuỗi trạng thái đầy đủ.
 */
const DELIVERY_PATH = [
  'RECEIVED', 'DIAGNOSING', 'QUOTED', 'AWAITING_APPROVAL', 'IN_PROGRESS',
  'QUALITY_CHECK', 'AWAITING_PAYMENT', 'AWAITING_DELIVERY', 'DELIVERED',
] as const;

async function deliverOrder(orderId: string, odometerOut: number): Promise<void> {
  const { rows } = await pool.query<{ status: string }>(
    'SELECT status FROM repair_order WHERE id = $1',
    [orderId],
  );
  const from = DELIVERY_PATH.indexOf(rows[0]!.status as (typeof DELIVERY_PATH)[number]);
  assert.ok(from >= 0, `đơn đang ở ${rows[0]!.status}, không nằm trên đường giao xe`);

  for (const s of DELIVERY_PATH.slice(from + 1)) {
    if (s === 'DELIVERED') {
      await pool.query(
        `UPDATE repair_order SET status = 'DELIVERED', odometer_out = $2, delivered_at = now()
          WHERE id = $1`,
        [orderId, odometerOut],
      );
    } else {
      await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [orderId, s]);
    }
  }
}


describe('Trang tra cứu công khai — xem', () => {
  test('mở link không cần đăng nhập, thấy đúng đơn và báo giá', async () => {
    const s = await newSentQuotation('A');
    const r = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.orderCode, /^RO-\d{8}-\d{4}$/);
    assert.equal(r.body.garageName, 'Garage Thành Công');
    assert.equal(r.body.quotation.status, 'SENT');
    assert.equal(r.body.quotation.canRespond, true);
    assert.equal(r.body.quotation.totalAmount, s.totalAmount);
  });

  test('🔒 INV-Q-02 hiện ngay ở cấu trúc: phụ tùng nằm TRONG hạng mục công', async () => {
    // Khách không thể duyệt riêng phụ tùng vì API không đưa ra công tắc nào
    // cho nó — BC-02 mục 5.3.
    const s = await newSentQuotation('B');
    const r = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);

    assert.equal(r.body.quotation.groups.length, 2, 'phải gom thành 2 hạng mục công');
    for (const g of r.body.quotation.groups) {
      assert.equal(g.parts.length, 1, 'mỗi hạng mục công phải kèm đúng 1 phụ tùng');
    }
  });

  test('🔒 KHÔNG lộ dữ liệu nội bộ ra trang công khai', async () => {
    const s = await newSentQuotation('C');
    const r = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    const raw = JSON.stringify(r.body);

    for (const leaked of ['customerAccessToken', 'createdByUserId', 'created_by', 'branchId']) {
      assert.ok(!raw.includes(leaked), `Trang công khai lộ trường nội bộ: ${leaked}`);
    }
    // Số điện thoại phải che bớt
    assert.match(r.body.approverPhoneMasked, /^\d{3}\*{4}\d{3}$/);
    assert.ok(!raw.includes(`091${uniq}`), 'lộ nguyên số điện thoại khách');
  });

  test('token sai hoặc quá ngắn trả 404, không phải 500', async () => {
    for (const bad of ['abc', 'x'.repeat(50), 'x'.repeat(200)]) {
      const r = await call('GET', `/api/v1/public/tracking/${bad}`, undefined, false);
      assert.equal(r.status, 404, `token "${bad.slice(0, 10)}..." trả ${r.status}`);
    }
  });
});

describe('🔒 BC-02 — duyệt từng phần', () => {
  test('khách duyệt 1 trong 2 hạng mục: trạng thái PARTIALLY_APPROVED, phụ tùng theo cha', async () => {
    const s = await newSentQuotation('D');
    const otp = await getOtp(s.trackingToken, s.quotationId);

    const r = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId,
        otp,
        decisions: [
          { lineId: s.laborLineIds[0], approved: true },
          { lineId: s.laborLineIds[1], approved: false },
        ],
      },
      false,
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.quotationStatus, 'PARTIALLY_APPROVED');
    assert.ok(r.body.approvedAmount > 0);
    assert.ok(r.body.rejectedAmount > 0);

    // Phụ tùng phải theo đúng trạng thái của hạng mục công cha
    const q = await call('GET', `/api/v1/quotations/${s.quotationId}`);
    const approvedParent = q.body.lines.find((l: any) => l.id === s.laborLineIds[0]);
    const rejectedParent = q.body.lines.find((l: any) => l.id === s.laborLineIds[1]);
    const approvedPart = q.body.lines.find((l: any) => l.parentLineId === approvedParent.id);
    const rejectedPart = q.body.lines.find((l: any) => l.parentLineId === rejectedParent.id);

    assert.equal(approvedPart.status, 'APPROVED');
    assert.equal(rejectedPart.status, 'REJECTED');
  });

  test('duyệt toàn bộ -> APPROVED, đơn chuyển sang đang sửa', async () => {
    const s = await newSentQuotation('E');
    const otp = await getOtp(s.trackingToken, s.quotationId);
    const r = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId, otp,
        decisions: s.laborLineIds.map((id) => ({ lineId: id, approved: true })),
      },
      false,
    );
    assert.equal(r.body.quotationStatus, 'APPROVED');

    const view = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(view.body.status, 'IN_PROGRESS');
  });

  test('từ chối toàn bộ -> REJECTED, đơn chuyển sang chờ giao xe', async () => {
    const s = await newSentQuotation('F');
    const otp = await getOtp(s.trackingToken, s.quotationId);
    const r = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId, otp,
        decisions: s.laborLineIds.map((id) => ({ lineId: id, approved: false })),
      },
      false,
    );
    assert.equal(r.body.quotationStatus, 'REJECTED');

    const view = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(view.body.status, 'AWAITING_DELIVERY');
  });

  test('trả lời thiếu hạng mục bị chặn', async () => {
    const s = await newSentQuotation('G');
    const otp = await getOtp(s.trackingToken, s.quotationId);
    const r = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId, otp,
        decisions: [{ lineId: s.laborLineIds[0], approved: true }],
      },
      false,
    );
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('🔒 BC-02 mục 5.6 — trả lời lần thứ hai bị từ chối', async () => {
    const s = await newSentQuotation('H');
    const otp1 = await getOtp(s.trackingToken, s.quotationId);
    const decisions = s.laborLineIds.map((id) => ({ lineId: id, approved: true }));

    const first = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      { quotationId: s.quotationId, otp: otp1, decisions }, false,
    );
    assert.equal(first.status, 201);

    // Xin mã mới rồi thử trả lời lại — báo giá không còn ở trạng thái SENT
    const second = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/otp`,
      { quotationId: s.quotationId }, false,
    );
    assert.equal(second.status, 409, 'xin được mã cho báo giá đã trả lời');
    assert.equal(second.body.error.code, 'QUOTATION_ALREADY_RESPONDED');
  });

  test('🔒 INV-Q-07 — báo giá hết hạn không trả lời được', async () => {
    const s = await newSentQuotation('I');
    const otp = await getOtp(s.trackingToken, s.quotationId);

    // Lùi hạn hiệu lực về quá khứ
    await pool.query(
      `UPDATE quotation SET valid_until = now() - interval '1 day' WHERE id = $1`,
      [s.quotationId],
    );

    const r = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId, otp,
        decisions: s.laborLineIds.map((id) => ({ lineId: id, approved: true })),
      },
      false,
    );
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'QUOTATION_EXPIRED');

    const view = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(view.body.quotation.expired, true);
    assert.equal(view.body.quotation.canRespond, false);
  });
});

describe('🔒 Mã xác thực', () => {
  test('mã sai bị từ chối và ĐẾM được, không phải thử vô hạn', async () => {
    const s = await newSentQuotation('J');
    await getOtp(s.trackingToken, s.quotationId);
    const decisions = s.laborLineIds.map((id) => ({ lineId: id, approved: true }));

    for (let i = 0; i < 3; i += 1) {
      const r = await call(
        'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
        { quotationId: s.quotationId, otp: '000000', decisions }, false,
      );
      assert.equal(r.status, 400, JSON.stringify(r.body));
    }

    // 🔒 Đây là điểm mấu chốt: ném lỗi trong transaction làm rollback luôn lệnh
    //    tăng bộ đếm. Nếu bộ đếm không tăng, giới hạn 5 lần là vô nghĩa và mã
    //    6 chữ số bị dò ra trong vài phút.
    const { rows } = await pool.query<{ attempts: number }>(
      `SELECT attempts FROM otp_challenge WHERE quotation_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [s.quotationId],
    );
    assert.equal(rows[0]!.attempts, 3, 'bộ đếm số lần nhập sai bị rollback mất');
  });

  test('mã đã dùng không dùng lại được', async () => {
    const s = await newSentQuotation('K');
    const otp = await getOtp(s.trackingToken, s.quotationId);
    const decisions = s.laborLineIds.map((id) => ({ lineId: id, approved: true }));

    await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      { quotationId: s.quotationId, otp, decisions }, false,
    );

    // Báo giá đã trả lời nên bị chặn trước cả bước kiểm mã — nhưng mã cũng đã
    // bị đánh dấu là đã dùng.
    const { rows } = await pool.query<{ consumed_at: Date | null }>(
      `SELECT consumed_at FROM otp_challenge WHERE quotation_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [s.quotationId],
    );
    assert.ok(rows[0]!.consumed_at !== null, 'mã không được đánh dấu đã dùng');
  });

  test('🔒 mã không bao giờ lưu dạng thô trong database', async () => {
    const s = await newSentQuotation('L');
    const otp = await getOtp(s.trackingToken, s.quotationId);
    const { rows } = await pool.query<{ code_hash: string }>(
      `SELECT code_hash FROM otp_challenge WHERE quotation_id = $1`,
      [s.quotationId],
    );
    assert.ok(!rows[0]!.code_hash.includes(otp), 'mã OTP lưu thô trong database');
    assert.match(rows[0]!.code_hash, /^scrypt\$/);
  });

  test('xin mã quá nhiều lần bị chặn', async () => {
    const s = await newSentQuotation('M');
    for (let i = 0; i < 5; i += 1) {
      const r = await call(
        'POST', `/api/v1/public/tracking/${s.trackingToken}/otp`,
        { quotationId: s.quotationId }, false,
      );
      assert.equal(r.status, 201, `lần ${i + 1} bị chặn sớm`);
    }
    const sixth = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/otp`,
      { quotationId: s.quotationId }, false,
    );
    assert.equal(sixth.status, 429, JSON.stringify(sixth.body));
    assert.equal(sixth.body.error.code, 'RATE_LIMITED');
  });
});

describe('🔒 INV-T-01 — token của tenant này không mở được đơn của tenant kia', () => {
  test('token không tồn tại không rò rỉ thông tin', async () => {
    // Token đúng định dạng nhưng không có thật -> vẫn là 404 với cùng thông báo
    const fake = 'a'.repeat(43);
    const r = await call('GET', `/api/v1/public/tracking/${fake}`, undefined, false);
    assert.equal(r.status, 404);
    assert.ok(!JSON.stringify(r.body).includes('tenant'));
  });

  test('token dẫn đúng tenant của đơn, không phải tenant nào khác', async () => {
    const s = await newSentQuotation('N');
    const r = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(r.body.garageName, 'Garage Thành Công');
    assert.notEqual(r.body.garageName, 'Garage Đối Chứng');
  });
});

describe('Phát hiện từ codex-review — giữ lại làm hồi quy', () => {
  test('🔒 GARAGEOS-001: gửi hai quyết định cho CÙNG một hạng mục bị chặn', async () => {
    // Số lượng khớp nhưng tập hợp không phủ hết: hạng mục còn lại chưa bao giờ
    // được khách trả lời, mà báo giá đã bị chốt và đơn đã chuyển sang đang sửa.
    const s = await newSentQuotation('O');
    const otp = await getOtp(s.trackingToken, s.quotationId);

    const r = await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId,
        otp,
        decisions: [
          { lineId: s.laborLineIds[0], approved: true },
          { lineId: s.laborLineIds[0], approved: false },
        ],
      },
      false,
    );
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.message, /hai lần/);

    // Và báo giá phải còn nguyên trạng thái chờ
    const view = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(view.body.quotation.status, 'SENT');
    for (const g of view.body.quotation.groups) assert.equal(g.status, 'PENDING');
  });

  test('🔒 GARAGEOS-002: xin mã đồng thời không vượt được giới hạn 5 mã/giờ', async () => {
    const s = await newSentQuotation('P');

    // Bắn 8 request song song. Không có khoá thì nhiều request cùng đọc thấy
    // số cũ và cùng ghi -> nhiều hơn 5 mã sống song song, tức là mở rộng bề mặt
    // dò mã.
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call('POST', `/api/v1/public/tracking/${s.trackingToken}/otp`,
             { quotationId: s.quotationId }, false),
      ),
    );
    const created = results.filter((r) => r.status === 201).length;
    assert.equal(created, 5, `tạo được ${created} mã trong khi giới hạn là 5`);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM otp_challenge
        WHERE quotation_id = $1 AND created_at > now() - interval '1 hour'`,
      [s.quotationId],
    );
    assert.equal(Number(rows[0]!.n), 5, 'số bản ghi trong database vượt giới hạn');
  });

  test('🔒 GARAGEOS-003: link hết hạn 30 ngày sau khi bàn giao xe', async () => {
    // docs/02-actors-and-permissions.md mục 2.1. Không có điều kiện này thì một
    // link phát năm ngoái vẫn mở được biển số, tên chủ xe và toàn bộ báo giá.
    const s = await newSentQuotation('Q');

    const before = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(before.status, 200);

    const { rows: ro } = await pool.query<{ id: string }>(
      `SELECT repair_order_id AS id FROM quotation WHERE id = $1`,
      [s.quotationId],
    );
    // Giao xe 31 ngày trước — đi đúng chuỗi trạng thái rồi mới lùi mốc thời gian
    await deliverOrder(ro[0]!.id, 46_000);
    await pool.query(
      `UPDATE repair_order SET delivered_at = now() - interval '31 days' WHERE id = $1`,
      [ro[0]!.id],
    );

    const after = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(after.status, 404, 'link vẫn mở được sau khi hết hạn');

    // Giao xe hôm qua thì vẫn còn xem được lịch sử
    await pool.query(
      `UPDATE repair_order SET delivered_at = now() - interval '1 day' WHERE id = $1`,
      [ro[0]!.id],
    );
    const recent = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(recent.status, 200, 'link đóng quá sớm sau khi giao xe');
  });

  test('🔒 GARAGEOS-003: đơn đã huỷ thì link đóng ngay', async () => {
    const s = await newSentQuotation('R');
    const { rows: ro } = await pool.query<{ id: string }>(
      `SELECT repair_order_id AS id FROM quotation WHERE id = $1`,
      [s.quotationId],
    );
    await pool.query(
      `UPDATE repair_order SET status = 'CANCELLED', cancelled_at = now(),
                               cancel_reason = 'Khach doi y'
        WHERE id = $1`,
      [ro[0]!.id],
    );
    const r = await call('GET', `/api/v1/public/tracking/${s.trackingToken}`, undefined, false);
    assert.equal(r.status, 404);
  });

  test('GARAGEOS-001b: trạng thái báo giá suy từ DATABASE, không từ dữ liệu gửi lên', async () => {
    // Duyệt một nửa qua đường công khai, rồi đọc lại bằng API nội bộ để đối
    // chiếu: hai đường phải cho cùng một kết luận.
    const s = await newSentQuotation('S');
    const otp = await getOtp(s.trackingToken, s.quotationId);
    await call(
      'POST', `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId, otp,
        decisions: [
          { lineId: s.laborLineIds[0], approved: true },
          { lineId: s.laborLineIds[1], approved: false },
        ],
      },
      false,
    );

    const internal = await call('GET', `/api/v1/quotations/${s.quotationId}`);
    assert.equal(internal.body.status, 'PARTIALLY_APPROVED');
    const pending = internal.body.lines.filter((l: any) => l.status === 'PENDING');
    assert.equal(pending.length, 0, 'còn dòng chưa quyết mà báo giá đã chốt');
  });
});
