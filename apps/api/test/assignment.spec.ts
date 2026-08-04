/**
 * Phase 2.3 — phân công khoang và thợ (BC-05).
 *
 * Hai nhóm test, hai loại rủi ro khác hẳn nhau:
 *
 *  1. TRANH CHẤP — hai người xếp lịch cùng lúc vào một ô. Không có dòng nào để
 *     khoá khi lịch đang trống, nên exclusion constraint là trọng tài duy nhất.
 *  2. AN TOÀN — thợ thiếu chứng chỉ cao áp, hoặc khoang không có vùng cách ly.
 *     Đây là ràng buộc tính mạng, không phải tối ưu vận hành.
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
let token = '';
let branchId = '';
let customerId = '';
let demXe = 0;
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
 * Dựng một hạng mục CÔNG đã được khách duyệt, sẵn sàng để phân công.
 *
 * Duyệt bằng SQL trực tiếp: luồng OTP đầy đủ đã có test riêng ở
 * `public-tracking.spec.ts`, còn ở đây nó chỉ là điều kiện đầu vào.
 */
async function hangMucDaDuyet(
  maDichVu: string,
  powertrain: 'ICE' | 'BEV' = 'ICE',
): Promise<{ quotationLineId: string; repairOrderId: string }> {
  demXe += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `88P-${uniq}${demXe}`,
    powertrain,
    ...(powertrain === 'BEV' ? { batteryCapacityKwh: 60 } : {}),
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test phân công',
    odometerIn: 10_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const cat = await call('GET', `/api/v1/catalog/vehicle/${v.body.id}`);
  const sv = cat.body.serviceItems.find((s: { code: string }) => s.code === maDichVu);
  assert.ok(sv, `danh mục không có hạng mục ${maDichVu} cho xe ${powertrain}`);

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  const line = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'LABOR',
    serviceItemId: sv.id,
    quantity: 1,
  });
  assert.equal(line.status, 201, JSON.stringify(line.body));

  await pool.query(
    `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'COUNTER' WHERE id = $1`,
    [line.body.id],
  );
  return { quotationLineId: line.body.id, repairOrderId: o.body.id };
}

async function khoang(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM bay WHERE tenant_id = $1 AND code = $2',
    [TENANT_A, code],
  );
  assert.ok(rows[0], `seed thiếu khoang ${code}`);
  return rows[0]!.id;
}

async function thoTheoDienThoai(phone: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM app_user WHERE tenant_id = $1 AND phone = $2',
    [TENANT_A, phone],
  );
  return rows[0]!.id;
}

/** Giờ bắt đầu ở TƯƠNG LAI xa, mỗi lần gọi lệch đi một ngày để không đụng nhau */
let ngayLech = 0;
function khungGio(): string {
  ngayLech += 1;
  const d = new Date('2027-06-01T01:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + ngayLech);
  return d.toISOString();
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  token = await dangNhap('0901000002'); // quản lý chi nhánh — vai xếp lịch
  const me = await call('POST', '/api/v1/auth/login', {
    phone: '0901000002',
    password: 'demo1234',
  });
  branchId = me.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách phân công ${uniq}`,
    phone: `035${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  await pool.query(
    `DELETE FROM work_assignment
      WHERE repair_order_id IN (
        SELECT ro.id FROM repair_order ro JOIN vehicle v ON v.id = ro.vehicle_id
         WHERE v.plate_number LIKE $1)`,
    [`88P-${uniq}%`],
  );
  await pool.end();
});

describe('Xếp lịch — luồng chính', () => {
  test('xếp được, giờ kết thúc tính từ ĐỊNH MỨC chứ không nhận từ client', async () => {
    const hm = await hangMucDaDuyet('SV-OIL-ENGINE');
    const batDau = khungGio();

    const r = await call('POST', '/api/v1/assignments', {
      quotationLineId: hm.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: await khoang('K1-01'),
      plannedStart: batDau,
      // Gửi kèm giờ kết thúc bịa — phải bị bỏ qua hoàn toàn
      plannedEnd: new Date(new Date(batDau).getTime() + 60_000).toISOString(),
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    // SV-OIL-ENGINE định mức 0,8h = 48 phút
    const phut = (new Date(r.body.plannedEnd).getTime() - new Date(batDau).getTime()) / 60_000;
    assert.equal(phut, 48, 'client đặt được giờ kết thúc -> lách được ràng buộc trùng lịch');
  });

  test('hạng mục đã xếp thì biến khỏi danh sách chờ', async () => {
    const hm = await hangMucDaDuyet('SV-BRAKE-PAD');

    const truoc = await call('GET', '/api/v1/assignments/pending-work');
    assert.ok(
      truoc.body.some((w: { quotationLineId: string }) => w.quotationLineId === hm.quotationLineId),
      'hạng mục đã duyệt không xuất hiện ở danh sách chờ',
    );

    await call('POST', '/api/v1/assignments', {
      quotationLineId: hm.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: await khoang('K1-02'),
      plannedStart: khungGio(),
    });

    const sau = await call('GET', '/api/v1/assignments/pending-work');
    assert.ok(
      !sau.body.some((w: { quotationLineId: string }) => w.quotationLineId === hm.quotationLineId),
      'hạng mục đã xếp vẫn còn trong danh sách chờ -> sẽ bị xếp hai lần',
    );
  });

  test('gợi ý thợ trả về CẢ người không đủ điều kiện, kèm lý do', async () => {
    // Danh sách ngắn đi mà không nói vì sao khiến quản lý nghĩ hệ thống hỏng,
    // rồi tìm đường lách. Nói rõ lý do thì họ biết phải cử người đi học.
    const hm = await hangMucDaDuyet('SV-HV-SOH', 'BEV');
    const r = await call(
      'GET',
      `/api/v1/assignments/technician-options?quotationLineId=${hm.quotationLineId}` +
        `&plannedStart=${encodeURIComponent(khungGio())}`,
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.length > 0, 'không gợi ý được thợ nào');

    const khongDu = r.body.filter((t: { eligible: boolean }) => !t.eligible);
    assert.ok(khongDu.length > 0, 'seed phải có thợ THIẾU chứng chỉ cao áp');
    for (const t of khongDu) {
      assert.ok(t.reason !== null && t.reason !== '', 'không đủ điều kiện mà không nói lý do');
    }
  });
});

describe('🔒 Bất biến phân công', () => {
  test('INV-W-01: khoang không phục vụ hai xe cùng lúc', async () => {
    const a = await hangMucDaDuyet('SV-OIL-ENGINE');
    const b = await hangMucDaDuyet('SV-OIL-ENGINE');
    const bay = await khoang('K1-01');
    const batDau = khungGio();

    const r1 = await call('POST', '/api/v1/assignments', {
      quotationLineId: a.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: bay,
      plannedStart: batDau,
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));

    // Thợ KHÁC, cùng khoang, giờ chồng lấn
    const r2 = await call('POST', '/api/v1/assignments', {
      quotationLineId: b.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000003'),
      bayId: bay,
      plannedStart: new Date(new Date(batDau).getTime() + 10 * 60_000).toISOString(),
    });
    assert.equal(r2.status, 409, JSON.stringify(r2.body));

    // 🔒 Thông báo phải NÊU TÊN cái đang chiếm chỗ. "Trùng lịch" là câu trả lời
    //    vô dụng: quản lý phải đi dò từng ô để tìm ra ai.
    assert.match(r2.body.error.message, /Khoang đã có xe/);
    assert.match(r2.body.error.message, /Đang là đơn RO-/, JSON.stringify(r2.body));
  });

  test('INV-W-02: một thợ không ở hai chỗ cùng lúc', async () => {
    const a = await hangMucDaDuyet('SV-OIL-ENGINE');
    const b = await hangMucDaDuyet('SV-OIL-ENGINE');
    const tho = await thoTheoDienThoai('0901000004');
    const batDau = khungGio();

    const r1 = await call('POST', '/api/v1/assignments', {
      quotationLineId: a.quotationLineId,
      technicianId: tho,
      bayId: await khoang('K1-01'),
      plannedStart: batDau,
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));

    // KHOANG khác, cùng thợ, giờ chồng lấn
    const r2 = await call('POST', '/api/v1/assignments', {
      quotationLineId: b.quotationLineId,
      technicianId: tho,
      bayId: await khoang('K1-02'),
      plannedStart: new Date(new Date(batDau).getTime() + 10 * 60_000).toISOString(),
    });
    assert.equal(r2.status, 409, JSON.stringify(r2.body));
    assert.match(r2.body.error.message, /Thợ đã có việc khác/);
  });

  test('🔒 INV-W-03: thợ thiếu chứng chỉ cao áp KHÔNG được xếp vào việc cao áp', async () => {
    // Đây là ràng buộc AN TOÀN TÍNH MẠNG, không phải quy định nội bộ: làm việc
    // trên hệ thống 400V mà không có chứng chỉ là rủi ro chết người.
    const hm = await hangMucDaDuyet('SV-HV-SOH', 'BEV');
    const r = await call('POST', '/api/v1/assignments', {
      quotationLineId: hm.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000003'), // cố vấn, không có chứng chỉ
      bayId: await khoang('K1-03'),
      plannedStart: khungGio(),
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error.message, /chứng chỉ/);
  });

  test('🔒 INV-W-03: chứng chỉ HẾT HẠN trước ngày làm việc cũng bị chặn', async () => {
    /*
     * Kiểm hiệu lực tại `plannedStart`, KHÔNG tại `now()`. Lịch đặt cho tuần
     * sau mà chứng chỉ hết hạn ngày mai thì người đó sẽ không còn quyền làm
     * việc đó vào lúc thật sự làm.
     *
     * Đây là loại lỗi mà một bản cài đặt "kiểm tra bằng now()" chạy đúng suốt
     * và chỉ sai vào đúng ngày chứng chỉ hết hạn.
     */
    const tho = await thoTheoDienThoai('0901000004');
    const { rows: cert } = await pool.query<{ id: string }>(
      `SELECT id FROM certification WHERE tenant_id = $1 AND code = 'HV_ELECTRICAL'`,
      [TENANT_A],
    );
    // Cấp chứng chỉ CÒN hiệu lực hôm nay nhưng hết hạn trước khung giờ đã xếp
    await pool.query(
      `INSERT INTO user_certification (tenant_id, user_id, certification_id, issued_at, expires_at)
       VALUES ($1,$2,$3, now() - interval '1 day', now() + interval '30 days')
       ON CONFLICT (user_id, certification_id) DO UPDATE
         SET expires_at = now() + interval '30 days'`,
      [TENANT_A, tho, cert[0]!.id],
    );

    try {
      const hm = await hangMucDaDuyet('SV-HV-SOH', 'BEV');
      const r = await call('POST', '/api/v1/assignments', {
        quotationLineId: hm.quotationLineId,
        technicianId: tho,
        bayId: await khoang('K1-03'),
        // Xa hơn hạn 30 ngày
        plannedStart: new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString(),
      });
      assert.equal(
        r.status,
        403,
        `chứng chỉ hết hạn trước ngày làm mà vẫn xếp được: ${JSON.stringify(r.body)}`,
      );
    } finally {
      await pool.query(
        'DELETE FROM user_certification WHERE user_id = $1 AND certification_id = $2',
        [tho, cert[0]!.id],
      );
    }
  });

  test('🔒 INV-W-07: việc cao áp phải làm ở khoang có vùng an toàn', async () => {
    const hm = await hangMucDaDuyet('SV-HV-SOH', 'BEV');
    const r = await call('POST', '/api/v1/assignments', {
      quotationLineId: hm.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: await khoang('K1-01'), // chỉ có LIFT, không có HV_SAFE_ZONE
      plannedStart: khungGio(),
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error.message, /vùng an toàn cao áp/);
  });

  test('🔒 INV-Q-01: không phân công cho hạng mục khách CHƯA duyệt', async () => {
    demXe += 1;
    const v = await call('POST', '/api/v1/vehicles', {
      customerId, plateNumber: `88P-${uniq}${demXe}`, powertrain: 'ICE',
    });
    const o = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v.body.id, branchId,
      customerComplaint: 'Chưa duyệt', odometerIn: 1,
    });
    const cat = await call('GET', `/api/v1/catalog/vehicle/${v.body.id}`);
    const sv = cat.body.serviceItems[0];
    const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
    const line = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
      lineType: 'LABOR', serviceItemId: sv.id, quantity: 1,
    });

    const r = await call('POST', '/api/v1/assignments', {
      quotationLineId: line.body.id,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: await khoang('K1-01'),
      plannedStart: khungGio(),
    });
    assert.notEqual(r.status, 201, 'phân công được cho hạng mục khách chưa đồng ý trả tiền');
  });

  test('🔒 INV-W-04: không tự kiểm tra chất lượng việc mình vừa làm', async () => {
    const hm = await hangMucDaDuyet('SV-OIL-ENGINE');
    const tho = await thoTheoDienThoai('0901000004');
    const r = await call('POST', '/api/v1/assignments', {
      quotationLineId: hm.quotationLineId,
      technicianId: tho,
      bayId: await khoang('K1-01'),
      plannedStart: khungGio(),
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    await call('POST', `/api/v1/assignments/${r.body.id}/status`, { to: 'IN_PROGRESS' });
    await call('POST', `/api/v1/assignments/${r.body.id}/status`, { to: 'DONE' });

    // Chính người thợ đó đăng nhập và tự QC
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const qc = await call('POST', `/api/v1/assignments/${r.body.id}/status`, {
        to: 'QC_PASSED',
        qcNote: 'Tôi tự kiểm',
      });
      assert.equal(qc.status, 403, 'thợ tự QC việc của mình — chỉ là ký tên, không phải kiểm tra');
    } finally {
      token = luu;
    }
  });

  test('🔒 INV-W-05: một thợ chỉ có MỘT việc đang làm', async () => {
    /*
     * Khác INV-W-02: hai phân công có thể KHÔNG chồng giờ kế hoạch mà vẫn cùng
     * IN_PROGRESS, nếu thợ bấm bắt đầu việc thứ hai trong khi quên bấm kết thúc
     * việc thứ nhất. Khi đó giờ công của cả hai đều sai.
     */
    const tho = await thoTheoDienThoai('0901000004');
    const a = await hangMucDaDuyet('SV-OIL-ENGINE');
    const b = await hangMucDaDuyet('SV-OIL-ENGINE');
    const t1 = khungGio();
    const t2 = khungGio(); // ngày khác hẳn, không chồng giờ kế hoạch

    const r1 = await call('POST', '/api/v1/assignments', {
      quotationLineId: a.quotationLineId, technicianId: tho,
      bayId: await khoang('K1-01'), plannedStart: t1,
    });
    const r2 = await call('POST', '/api/v1/assignments', {
      quotationLineId: b.quotationLineId, technicianId: tho,
      bayId: await khoang('K1-02'), plannedStart: t2,
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal(r2.status, 201, JSON.stringify(r2.body));

    const s1 = await call('POST', `/api/v1/assignments/${r1.body.id}/status`, {
      to: 'IN_PROGRESS',
    });
    assert.equal(s1.status, 201, JSON.stringify(s1.body));

    const s2 = await call('POST', `/api/v1/assignments/${r2.body.id}/status`, {
      to: 'IN_PROGRESS',
    });
    assert.equal(s2.status, 409, 'thợ làm hai việc cùng lúc -> giờ công của cả hai đều sai');
  });

  test('khoang được giải phóng sau khi việc xong', async () => {
    // Mệnh đề WHERE của exclusion constraint quyết định điều này. Quên nó thì
    // lịch sử hôm qua chặn việc đặt lịch hôm nay ở cùng khung giờ, và triệu
    // chứng là "khoang bận" ở một khoang đang trống trơn.
    const a = await hangMucDaDuyet('SV-OIL-ENGINE');
    const b = await hangMucDaDuyet('SV-OIL-ENGINE');
    const bay = await khoang('K1-02');
    const batDau = khungGio();

    const r1 = await call('POST', '/api/v1/assignments', {
      quotationLineId: a.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: bay, plannedStart: batDau,
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    await call('POST', `/api/v1/assignments/${r1.body.id}/status`, { to: 'CANCELLED' });

    const r2 = await call('POST', '/api/v1/assignments', {
      quotationLineId: b.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: bay, plannedStart: batDau,
    });
    assert.equal(r2.status, 201, `khoang không được giải phóng: ${JSON.stringify(r2.body)}`);
  });
});

describe('🔒 Tranh chấp — không có dòng nào để khoá khi lịch trống', () => {
  test('5 request xếp cùng ô cùng lúc: đúng 1 thành công', async () => {
    /*
     * Đây là lý do lát cắt này dùng exclusion constraint chứ không dùng
     * `SELECT … FOR UPDATE` như bài toán kho: ở kho luôn có sẵn một dòng tồn để
     * khoá, còn ở đây lịch đang TRỐNG — không tồn tại dòng nào cả. Năm request
     * đều thấy trống và đều ghi.
     *
     * Phải bắn song song THẬT: chạy tuần tự thì không có tranh chấp nào và test
     * xanh giả.
     */
    const hangMuc = await Promise.all([
      hangMucDaDuyet('SV-OIL-ENGINE'),
      hangMucDaDuyet('SV-OIL-ENGINE'),
      hangMucDaDuyet('SV-OIL-ENGINE'),
      hangMucDaDuyet('SV-OIL-ENGINE'),
      hangMucDaDuyet('SV-OIL-ENGINE'),
    ]);
    const bay = await khoang('K1-01');
    const tho = await thoTheoDienThoai('0901000004');
    const batDau = khungGio();

    const kq = await Promise.all(
      hangMuc.map((hm) =>
        call('POST', '/api/v1/assignments', {
          quotationLineId: hm.quotationLineId,
          technicianId: tho,
          bayId: bay,
          plannedStart: batDau,
        }),
      ),
    );
    const thanhCong = kq.filter((r) => r.status === 201).length;
    assert.equal(
      thanhCong,
      1,
      `${thanhCong} phân công cùng thành công cho một ô: ` +
        JSON.stringify(kq.map((r) => r.status)),
    );

    // Bốn cái còn lại phải nhận lỗi NGHIỆP VỤ, không phải 500
    for (const r of kq.filter((x) => x.status !== 201)) {
      assert.equal(r.status, 409, `lỗi kỹ thuật rò ra ngoài: ${JSON.stringify(r.body)}`);
    }
  });
});

describe('🔒 Phân quyền phân công', () => {
  test('thợ KHÔNG tự xếp lịch cho mình', async () => {
    const hm = await hangMucDaDuyet('SV-OIL-ENGINE');
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const r = await call('POST', '/api/v1/assignments', {
        quotationLineId: hm.quotationLineId,
        technicianId: await thoTheoDienThoai('0901000004'),
        bayId: await khoang('K1-01'),
        plannedStart: khungGio(),
      });
      assert.equal(r.status, 403, 'thợ tự nhận việc — docs/02 mục 2.3 cấm');
    } finally {
      token = luu;
    }
  });

  test('thợ VẪN xem được lịch xưởng', async () => {
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const r = await call('GET', '/api/v1/assignments?date=2027-06-02');
      assert.equal(r.status, 200, 'thợ không xem được lịch của chính mình');
    } finally {
      token = luu;
    }
  });

  test('🔒 không xếp vào khoang của chi nhánh khác', async () => {
    // RLS không chặn: các chi nhánh cùng một tenant, biết UUID là gọi được.
    const { rows } = await pool.query<{ id: string }>(
      `SELECT b.id FROM bay b JOIN branch br ON br.id = b.branch_id
        WHERE b.tenant_id = $1 AND br.code <> 'HN01' LIMIT 1`,
      [TENANT_A],
    );
    const hm = await hangMucDaDuyet('SV-OIL-ENGINE');
    const r = await call('POST', '/api/v1/assignments', {
      quotationLineId: hm.quotationLineId,
      technicianId: await thoTheoDienThoai('0901000004'),
      bayId: rows[0]!.id,
      plannedStart: khungGio(),
    });
    assert.notEqual(r.status, 201, 'xếp được xe vào khoang ở chi nhánh khác');
  });
});
