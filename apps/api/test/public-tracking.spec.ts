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
/*
 * Sáu chữ số cuối của mili-giây quay vòng mỗi ~16,7 phút — hai lần chạy cách
 * nhau đúng một vòng sinh ra cùng biển số. Thêm pid để không bao giờ trùng.
 */
const uniq = `${Date.now().toString().slice(-6)}${process.pid.toString().slice(-3)}`;
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
/**
 * Mọi đơn do file test này dựng lên — để nhả chỗ ở `after()`.
 *
 * 🔒 Cần thiết từ Phase 2.2: mỗi lần khách duyệt là một bản ghi giữ chỗ ACTIVE
 * chiếm hàng trong seed. Không nhả thì chạy lại vài lần là `PT-BRAKE-PAD-F`
 * hết khả dụng, và những test CHẲNG LIÊN QUAN bắt đầu đỏ với lý do khó hiểu —
 * đúng loại lỗi tốn hàng giờ để lần ra.
 */
const donDaDung: string[] = [];

/*
 * `suffix` chỉ là NHÃN để đọc log — biển số còn kèm số đếm tăng dần.
 *
 * Trước đây tính duy nhất phụ thuộc vào việc người viết test nhớ chữ cái nào
 * đã dùng. Bảng chữ cái cạn dần theo từng đợt, và hai test thêm ở Phase 2.2
 * lấy trúng R/S đã có người dùng. Triệu chứng là "biển số đã có hồ sơ" ở một
 * test chẳng liên quan gì tới biển số.
 */
let demDon = 0;

async function newSentQuotation(suffix: string): Promise<{
  trackingToken: string;
  quotationId: string;
  laborLineIds: string[];
  totalAmount: number;
}> {
  demDon += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId, plateNumber: `92T-${uniq}${suffix}${demDon}`, powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id, branchId,
    customerComplaint: 'Xe kêu ở phanh, điều hoà yếu',
    odometerIn: 45_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  donDaDung.push(o.body.id as string);

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
  // Nhả chỗ trước khi đóng kết nối. Đổi trạng thái chứ không xoá — 0027 thu
  // hồi quyền DELETE, và bản ghi đã nhả vẫn là dữ liệu giải thích được.
  if (donDaDung.length > 0) {
    await pool.query(
      `UPDATE stock_reservation SET status = 'RELEASED', released_reason = 'Dọn sau test'
        WHERE repair_order_id = ANY($1) AND status = 'ACTIVE'`,
      [donDaDung],
    );
  }
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

    /*
     * Lùi hạn hiệu lực về quá khứ để mô phỏng báo giá hết hạn.
     *
     * Từ migration 0019, trigger `trg_quotation_frozen` chặn đúng thao tác này —
     * và nó chặn ĐÚNG: sửa `valid_until` sau khi gửi cho phép khách duyệt lại
     * mức giá cũ sau khi bảng giá đã tăng. Ta phải tắt trigger tạm thời vì đang
     * cố ý dựng một trạng thái mà ứng dụng KHÔNG còn tạo ra được nữa.
     *
     * Tắt trigger ở đây không làm test yếu đi: nó vẫn kiểm đúng thứ cần kiểm là
     * INV-Q-07 (hết hạn thì không duyệt được), còn INV-Q-05 có test riêng.
     */
    await pool.query('ALTER TABLE quotation DISABLE TRIGGER trg_quotation_frozen');
    try {
      await pool.query(
        `UPDATE quotation SET valid_until = now() - interval '1 day' WHERE id = $1`,
        [s.quotationId],
      );
    } finally {
      await pool.query('ALTER TABLE quotation ENABLE TRIGGER trg_quotation_frozen');
    }

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

describe('🔒 Đợt 4 — lỗ hổng logic từ vòng rà soát nhiều reviewer', () => {
  test('OTP: bắn 20 request song song không vượt được giới hạn 5 lần đoán', async () => {
    /*
     * Đây là khác biệt giữa "không thể dò" và "dò được trong vài giờ".
     *
     * Bản trước đọc bộ đếm trong transaction chính rồi tăng nó bằng transaction
     * khác SAU khi rollback — khoá đã nhả trước lúc tăng. Bắn N request song
     * song với N mã đoán khác nhau thì cả N đều đọc thấy bộ đếm cũ và cả N đều
     * được đoán. Giới hạn 5 lần trở thành "5 lần mỗi đợt bắn".
     */
    const s = await newSentQuotation('T');
    await getOtp(s.trackingToken, s.quotationId);
    const decisions = s.laborLineIds.map((id) => ({ lineId: id, approved: true }));

    // 20 mã đoán khác nhau, bắn cùng lúc
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        call('POST', `/api/v1/public/tracking/${s.trackingToken}/respond`, {
          quotationId: s.quotationId,
          otp: String(i).padStart(6, '0'),
          decisions,
        }, false),
      ),
    );

    // Không cái nào được chấp nhận (mã đúng là ngẫu nhiên 6 chữ số)
    assert.equal(results.filter((r) => r.status === 201).length, 0);

    const { rows } = await pool.query<{ attempts: number }>(
      `SELECT attempts FROM otp_challenge WHERE quotation_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [s.quotationId],
    );
    assert.equal(
      rows[0]!.attempts,
      5,
      `Bộ đếm dừng ở ${rows[0]!.attempts} thay vì đúng 5 — số lần đoán thật sự ` +
        'bị chặn bởi thông lượng chứ không bởi quy tắc',
    );
  });

  test('🔒 INV-Q-02: không thêm được dòng phụ tùng không gắn hạng mục công', async () => {
    // Dòng mồ côi khiến khách KHÔNG BAO GIỜ duyệt được báo giá, và nếu client
    // chỉ gửi id dòng công thì tiền của nó vẫn nằm trong tổng.
    const v = await call('POST', '/api/v1/vehicles', {
      customerId, plateNumber: `92M-${uniq}`, powertrain: 'ICE',
    });
    const o = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v.body.id, branchId, customerComplaint: 'Thử dòng mồ côi', odometerIn: 1,
    });
    const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);

    const r = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
      lineType: 'PART', partId: partIds['PT-OIL-5W30'], quantity: 1,
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'VALIDATION_FAILED');
    // Thông báo chi tiết nằm trong `details` — ZodPipe trả message chung ở ngoài
    assert.match(JSON.stringify(r.body.error.details), /gắn vào một hạng mục công/);
  });

  test('🔒 INV-Q-05: không sửa được tổng tiền của báo giá đã gửi', async () => {
    // Trước đợt 4, một câu UPDATE vào cột tổng đi qua mọi ràng buộc: trang tra
    // cứu của khách và báo cáo doanh thu đọc header -> thấy 0đ trong khi tổng
    // các dòng vẫn nguyên.
    const s = await newSentQuotation('U');
    const truoc = await call('GET', `/api/v1/quotations/${s.quotationId}`);
    assert.ok(truoc.body.totalAmount > 0);

    await assert.rejects(
      () =>
        pool.query(
          `UPDATE quotation SET subtotal_amount = 0, tax_amount = 0, total_amount = 0
            WHERE id = $1`,
          [s.quotationId],
        ),
      /INV-Q-06|quotation_totals_match_lines/,
      'sửa được tổng tiền của báo giá đã gửi khách',
    );

    const sau = await call('GET', `/api/v1/quotations/${s.quotationId}`);
    assert.equal(sau.body.totalAmount, truoc.body.totalAmount);
  });

  test('🔒 INV-Q-05: không lùi được hạn hiệu lực sau khi gửi', async () => {
    // Lùi hạn cho phép khách duyệt lại mức giá cũ sau khi bảng giá đã tăng.
    const s = await newSentQuotation('V');
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE quotation SET valid_until = now() + interval '30 days' WHERE id = $1`,
          [s.quotationId],
        ),
      /INV-Q-05/,
      'gia hạn được báo giá đã gửi',
    );
  });
});

describe('🔒 BC-04 — giữ chỗ chạy ngay khi khách duyệt (Phase 2.2)', () => {
  /** Tồn khả dụng của một SKU ở kho mặc định của chi nhánh đang test */
  async function khaDung(sku: string): Promise<number> {
    const { rows } = await pool.query<{ kd: string }>(
      `SELECT b.on_hand - b.reserved AS kd
         FROM stock_balance b
         JOIN part p ON p.id = b.part_id
         JOIN warehouse w ON w.id = b.warehouse_id
        WHERE p.sku = $1 AND w.branch_id = $2`,
      [sku, branchId],
    );
    return Number(rows[0]?.kd ?? 0);
  }

  test('duyệt xong thì phụ tùng đã được giữ chỗ, tồn thực tế KHÔNG đổi', async () => {
    /*
     * BC-04 mục 1: giữ chỗ khác với xuất kho. Sau khi khách duyệt, hàng vẫn
     * nằm trên kệ — thủ kho nhìn lên thấy đúng số cũ — nhưng `available` đã
     * giảm, nên đơn tiếp theo không nhận nhầm món đã có chủ.
     */
    const s = await newSentQuotation('R');
    const kdTruoc = await khaDung('PT-BRAKE-PAD-F');
    const { rows: tonTruoc } = await pool.query<{ on_hand: string }>(
      `SELECT b.on_hand FROM stock_balance b
         JOIN part p ON p.id = b.part_id
         JOIN warehouse w ON w.id = b.warehouse_id
        WHERE p.sku = 'PT-BRAKE-PAD-F' AND w.branch_id = $1`,
      [branchId],
    );

    const otp = await getOtp(s.trackingToken, s.quotationId);
    const r = await call(
      'POST',
      `/api/v1/public/tracking/${s.trackingToken}/respond`,
      {
        quotationId: s.quotationId,
        otp,
        decisions: s.laborLineIds.map((id) => ({ lineId: id, approved: true })),
      },
      false,
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.thieuHang, [], 'kho đủ hàng mà vẫn báo thiếu');

    assert.equal(await khaDung('PT-BRAKE-PAD-F'), kdTruoc - 1, 'không giữ chỗ khi khách duyệt');

    const { rows: tonSau } = await pool.query<{ on_hand: string }>(
      `SELECT b.on_hand FROM stock_balance b
         JOIN part p ON p.id = b.part_id
         JOIN warehouse w ON w.id = b.warehouse_id
        WHERE p.sku = 'PT-BRAKE-PAD-F' AND w.branch_id = $1`,
      [branchId],
    );
    assert.equal(
      Number(tonSau[0]!.on_hand),
      Number(tonTruoc[0]!.on_hand),
      'giữ chỗ đã trừ tồn thực tế — thủ kho sẽ thấy sổ lệch với kệ',
    );

    // Đủ hàng thì đơn vào việc luôn
    const { rows: ro } = await pool.query<{ status: string }>(
      `SELECT ro.status FROM repair_order ro
         JOIN quotation q ON q.repair_order_id = ro.id WHERE q.id = $1`,
      [s.quotationId],
    );
    assert.equal(ro[0]!.status, 'IN_PROGRESS');
  });

  test('🔒 BC-04 mục 5.1: hết hàng thì vẫn duyệt được, đơn chuyển sang CHỜ PHỤ TÙNG', async () => {
    /*
     * Phương án bị loại: từ chối duyệt báo giá vì kho hết hàng. Vô lý — khách
     * đã đồng ý trả tiền rồi, và việc kho có hàng hay không là chuyện của
     * xưởng chứ không phải của khách.
     *
     * Phương án đã chọn: nhận quyết định, giữ phần có, ghi rõ phần thiếu, và
     * đưa đơn sang AWAITING_PARTS thay vì IN_PROGRESS. Nhánh thứ ba này là
     * nhánh bản trước không có — mọi đơn đều vào thẳng IN_PROGRESS kể cả khi
     * kho trống, nên điều phối xếp thợ cho một việc không làm được.
     */
    const s = await newSentQuotation('S');

    // Rút sạch hàng khả dụng của một mã bằng một phiếu điều chỉnh có lý do —
    // không xoá dòng sổ, không sửa tồn tay. Chính là đường mà nghiệp vụ dùng.
    const kd = await khaDung('PT-CABIN-FILTER');
    const { rows: w } = await pool.query<{ id: string; part_id: string }>(
      `SELECT w.id, p.id AS part_id
         FROM warehouse w, part p
        WHERE w.branch_id = $1 AND w.is_default AND p.sku = 'PT-CABIN-FILTER'
          AND p.tenant_id = w.tenant_id`,
      [branchId],
    );
    const { rows: u } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = (SELECT tenant_id FROM warehouse WHERE id = $1) LIMIT 1`,
      [w[0]!.id],
    );
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, reason, created_by_user_id)
       SELECT tenant_id, $1, $2, 'ADJUSTMENT', $3, 0, 'Rút sạch để test thiếu hàng', $4
         FROM warehouse WHERE id = $1`,
      [w[0]!.id, w[0]!.part_id, -kd, u[0]!.id],
    );

    try {
      assert.equal(await khaDung('PT-CABIN-FILTER'), 0, 'chưa rút hết hàng, test vô nghĩa');

      const otp = await getOtp(s.trackingToken, s.quotationId);
      const r = await call(
        'POST',
        `/api/v1/public/tracking/${s.trackingToken}/respond`,
        {
          quotationId: s.quotationId,
          otp,
          decisions: s.laborLineIds.map((id) => ({ lineId: id, approved: true })),
        },
        false,
      );

      // 🔒 VẪN duyệt được — đây là điểm chính của cả test
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.quotationStatus, 'APPROVED');
      assert.ok(r.body.approvedAmount > 0);

      // ... nhưng khách được biết NGAY là thiếu gì
      const thieu = r.body.thieuHang as { sku: string; canCo: number; giuDuoc: number }[];
      assert.equal(thieu.length, 1, JSON.stringify(thieu));
      assert.equal(thieu[0]!.sku, 'PT-CABIN-FILTER');
      assert.equal(thieu[0]!.giuDuoc, 0);
      assert.equal(thieu[0]!.canCo, 1);

      // ... và đơn KHÔNG vào việc, vì không làm được
      const { rows: ro } = await pool.query<{ status: string }>(
        `SELECT ro.status FROM repair_order ro
           JOIN quotation q ON q.repair_order_id = ro.id WHERE q.id = $1`,
        [s.quotationId],
      );
      assert.equal(
        ro[0]!.status,
        'AWAITING_PARTS',
        'đơn vào việc dù kho không có phụ tùng — điều phối sẽ xếp thợ cho việc không làm được',
      );

      // Món CÒN hàng vẫn được giữ chỗ bình thường: thiếu một mã không kéo cả
      // đơn xuống. Đây là "giữ phần có" của BC-04 mục 5.1.
      const { rows: gc } = await pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM stock_reservation sr
           JOIN quotation q ON q.repair_order_id = sr.repair_order_id
          WHERE q.id = $1 AND sr.status = 'ACTIVE'`,
        [s.quotationId],
      );
      assert.equal(Number(gc[0]!.n), 1, 'thiếu một mã mà bỏ luôn mã còn hàng');
    } finally {
      await pool.query(
        `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                     unit_cost, reason, created_by_user_id)
         SELECT tenant_id, $1, $2, 'ADJUSTMENT', $3, 0, 'Hoàn lại sau test thiếu hàng', $4
           FROM warehouse WHERE id = $1`,
        [w[0]!.id, w[0]!.part_id, kd, u[0]!.id],
      );
    }
  });
});
