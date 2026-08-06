/**
 * Phase 2.7 — báo giá bổ sung và tạm dừng có chọn lọc (BC-03).
 *
 * Case khó nhất của Phase 2. Cái khó không nằm ở lượng code mà ở chỗ trạng thái
 * của ĐƠN và trạng thái của TỪNG PHÂN CÔNG là hai chiều độc lập: đơn "đang chờ
 * khách duyệt" KHÔNG có nghĩa mọi thợ ngồi chơi.
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
 * Dựng một đơn có BA hạng mục công đã duyệt và đã xếp lịch — đúng cảnh của
 * BC-03: má phanh, thay dầu, vệ sinh kim phun.
 *
 * Trả về id ba phân công theo đúng thứ tự, để test chỉ định "cái nào bị chặn".
 */
async function donBaViec(): Promise<{
  repairOrderId: string;
  assignmentIds: string[];
  serviceItemIds: string[];
  trangThai: () => Promise<string[]>;
}> {
  dem += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `55P-${uniq}${dem}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test phát sinh',
    odometerIn: 30_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const cat = await call('GET', `/api/v1/catalog/vehicle/${v.body.id}`);
  const svIds: string[] = cat.body.serviceItems
    .slice(0, 3)
    .map((s: { id: string }) => s.id);
  assert.equal(svIds.length, 3, 'danh mục cần ít nhất 3 hạng mục');

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  const lineIds: string[] = [];
  for (const sv of svIds) {
    const l = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
      lineType: 'LABOR',
      serviceItemId: sv,
      quantity: 1,
    });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    lineIds.push(l.body.id);
  }
  await pool.query(
    `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'COUNTER'
      WHERE id = ANY($1::uuid[])`,
    [lineIds],
  );
  // Đơn đi theo đúng máy trạng thái tới IN_PROGRESS
  for (const tt of ['AWAITING_APPROVAL', 'IN_PROGRESS']) {
    await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [o.body.id, tt]);
  }

  const { rows: bays } = await pool.query<{ id: string }>(
    `SELECT id FROM bay WHERE tenant_id = $1 AND branch_id = $2 ORDER BY code LIMIT 3`,
    [TENANT_A, branchId],
  );
  const { rows: tho } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000004'`,
    [TENANT_A],
  );
  const { rows: nguoi } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 AND phone = '0901000003'`,
    [TENANT_A],
  );

  const assignmentIds: string[] = [];
  for (const [i, lineId] of lineIds.entries()) {
    /*
     * Khung giờ tính bằng INTERVAL từ một mốc, và mốc lệch theo TIẾN TRÌNH.
     *
     * Bản đầu dùng `make_timestamptz(2028, 1, <ngày>, …)` với ngày suy từ một
     * bộ đếm — hai lần chạy khác nhau sinh ra ĐÚNG cùng khung giờ, và lần thứ
     * hai đỏ với `no_bay_overlap`. Test đọc ra như một lỗi của tính năng, trong
     * khi nó chỉ là rác của lần chạy trước.
     *
     * Cộng interval cũng tránh luôn chuyện ngày vượt quá 31.
     */
    const gioLech = (process.pid % 900) * 100 + dem * 10 + i * 3;
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO work_assignment (tenant_id, repair_order_id, quotation_line_id,
                                    technician_id, bay_id, planned_start, planned_end,
                                    created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,
               timestamptz '2028-01-01 00:00Z' + ($6 || ' hours')::interval,
               timestamptz '2028-01-01 00:00Z' + ($6 || ' hours')::interval + interval '2 hours',
               $7)
       RETURNING id`,
      [
        TENANT_A,
        o.body.id,
        lineId,
        tho[0]!.id,
        bays[i % bays.length]!.id,
        String(gioLech),
        nguoi[0]!.id,
      ],
    );
    assignmentIds.push(rows[0]!.id);
  }

  const trangThai = async (): Promise<string[]> => {
    const { rows } = await pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM work_assignment WHERE id = ANY($1::uuid[])',
      [assignmentIds],
    );
    const m = new Map(rows.map((r) => [r.id, r.status]));
    return assignmentIds.map((id) => m.get(id) ?? '?');
  };

  return { repairOrderId: o.body.id, assignmentIds, serviceItemIds: svIds, trangThai };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  token = await dangNhap('0901000003'); // cố vấn dịch vụ
  const me = await call('POST', '/api/v1/auth/login', {
    phone: '0901000003',
    password: 'demo1234',
  });
  branchId = me.body.user.branchIds[0];

  /*
   * Dọn việc đang dở của người thợ mà bộ test này dùng.
   *
   * INV-W-05 cho mỗi thợ đúng MỘT việc `IN_PROGRESS`. Một lần chạy đỏ giữa
   * chừng ở bất kỳ bộ test nào để lại một việc chưa đóng, và từ đó mọi lần bấm
   * giờ của người đó đều nhận 409 — test đỏ với "thợ đang có việc khác", chẳng
   * liên quan gì tới thứ nó đang kiểm.
   *
   * Dọn ở `before()` chứ không chỉ ở `finally` của từng test: `finally` chỉ
   * chạy khi tiến trình còn sống.
   */
  await pool.query(
    `UPDATE time_log SET ended_at = now(), pause_reason = 'OTHER',
                         note = 'Đóng hộ khi bắt đầu bộ test phát sinh'
      WHERE ended_at IS NULL
        AND technician_id = (SELECT id FROM app_user
                              WHERE tenant_id = $1 AND phone = '0901000004')`,
    [TENANT_A],
  );
  await pool.query(
    `UPDATE work_assignment SET status = 'PAUSED'
      WHERE status = 'IN_PROGRESS'
        AND technician_id = (SELECT id FROM app_user
                              WHERE tenant_id = $1 AND phone = '0901000004')`,
    [TENANT_A],
  );

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách phát sinh ${uniq}`,
    phone: `034${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  /*
   * Dọn ĐOẠN GIỜ CÔNG mà bộ test này tạo ra.
   *
   * `no_timelog_overlap` là exclusion constraint theo (thợ, khoảng thời gian).
   * Bộ test giờ công lùi một đoạn về `now() - 20 giờ` rồi để mở — khoảng đó
   * phủ mọi đoạn mà bộ test này vừa tạo quanh `now()` cho CÙNG người thợ, và
   * bộ chạy sau đỏ với một lỗi chẳng liên quan gì tới nó.
   *
   * Mỗi bộ test dọn đúng thứ mình tạo là cách rẻ nhất để chúng không đụng nhau.
   */
  const dieuKienDon = `
    SELECT ro.id FROM repair_order ro
      JOIN vehicle v ON v.id = ro.vehicle_id
     WHERE v.plate_number LIKE $1`;

  await pool.query(
    `DELETE FROM time_log WHERE work_assignment_id IN (
       SELECT id FROM work_assignment WHERE repair_order_id IN (${dieuKienDon}))`,
    [`55P-${uniq}%`],
  );
  /*
   * Thứ tự xoá đi theo chiều khoá ngoại: chặn -> bản khai -> phân công.
   *
   * `supplement_request.found_in_assignment_id` trỏ về phân công, nên xoá phân
   * công trước là lỗi 23503. Thiết kế cố ý không dùng `ON DELETE CASCADE` —
   * xoá dây chuyền im lặng thì một lần xoá nhầm cuốn theo cả chuỗi dữ liệu mà
   * không ai biết.
   */
  await pool.query(
    `DELETE FROM supplement_block WHERE supplement_request_id IN (
       SELECT id FROM supplement_request WHERE repair_order_id IN (${dieuKienDon}))`,
    [`55P-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM supplement_request WHERE repair_order_id IN (${dieuKienDon})`,
    [`55P-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM work_assignment WHERE repair_order_id IN (${dieuKienDon})`,
    [`55P-${uniq}%`],
  );
  await pool.end();
});

describe('🔒 BR-07-5 — phát sinh chỉ dừng hạng mục PHỤ THUỘC', () => {
  test('hai hạng mục độc lập vẫn chạy khi hạng mục thứ ba bị chặn', async () => {
    /*
     * Đúng ví dụ mở đầu BC-03: thợ tháo bánh phát hiện đĩa phanh vênh. Việc
     * thay má phanh phải dừng, nhưng thay dầu và vệ sinh kim phun chẳng liên
     * quan gì — dừng chúng là lãng phí một người thợ và một khoang.
     */
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004'); // thợ báo phát sinh
    try {
      const r = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        foundInAssignmentId: don.assignmentIds[0],
        description: 'Đĩa phanh trước vênh và mòn quá giới hạn, không lắp má mới lên được',
        blocksAssignmentIds: [don.assignmentIds[0]],
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.soViecTamDung, 1, 'dừng nhiều hơn đúng một việc');
    } finally {
      token = luu;
    }

    const tt = await don.trangThai();
    assert.equal(tt[0], 'PAUSED', 'việc phụ thuộc không bị dừng');
    assert.equal(tt[1], 'SCHEDULED', 'việc ĐỘC LẬP bị dừng oan -> lãng phí thợ và khoang');
    assert.equal(tt[2], 'SCHEDULED', 'việc ĐỘC LẬP bị dừng oan');
  });

  test('đơn chuyển sang chờ duyệt NHƯNG việc độc lập vẫn không bị chạm', async () => {
    // Đây là chỗ dễ thiết kế sai nhất: trạng thái ĐƠN và trạng thái PHÂN CÔNG
    // là hai chiều độc lập.
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Phát hiện gioăng nắp máy rỉ dầu, nên thay luôn khi đang mở',
        blocksAssignmentIds: [],
      });
    } finally {
      token = luu;
    }

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM repair_order WHERE id = $1',
      [don.repairOrderId],
    );
    assert.equal(rows[0]!.status, 'AWAITING_APPROVAL', 'đơn không chuyển sang chờ duyệt');

    const tt = await don.trangThai();
    assert.deepEqual(
      tt,
      ['SCHEDULED', 'SCHEDULED', 'SCHEDULED'],
      'phát sinh không chặn việc nào mà vẫn dừng — cả xưởng đứng vì một đề xuất',
    );
  });

  test('🔒 không chặn được hạng mục của đơn KHÁC', async () => {
    const donA = await donBaViec();
    const donB = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const r = await call('POST', '/api/v1/supplements', {
        repairOrderId: donA.repairOrderId,
        serviceItemId: donA.serviceItemIds[0],
        description: 'Thử chặn việc của xe khác — phải bị từ chối',
        blocksAssignmentIds: [donB.assignmentIds[0]],
      });
      assert.notEqual(r.status, 201, 'một phát sinh ở xe A dừng được việc trên xe B');
    } finally {
      token = luu;
    }

    assert.deepEqual(
      await donB.trangThai(),
      ['SCHEDULED', 'SCHEDULED', 'SCHEDULED'],
      'xe B bị đứng vì phát sinh của xe A',
    );
  });

  test('đoạn giờ công đang mở được đóng với lý do CHỜ DUYỆT', async () => {
    /*
     * Không đóng thì giờ công tiếp tục chạy trong lúc thợ ngồi chờ khách trả
     * lời — bảng lương ghi nhận thời gian CHỜ thành thời gian LÀM.
     */
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const bd = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: don.assignmentIds[0],
      });
      assert.equal(bd.status, 201, JSON.stringify(bd.body));

      const r = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Phát hiện thêm vấn đề khi đang làm, phải dừng để hỏi khách',
        blocksAssignmentIds: [don.assignmentIds[0]],
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    } finally {
      token = luu;
    }

    const { rows } = await pool.query<{ ended_at: Date | null; pause_reason: string | null }>(
      'SELECT ended_at, pause_reason FROM time_log WHERE work_assignment_id = $1',
      [don.assignmentIds[0]],
    );
    assert.ok(rows[0]!.ended_at !== null, 'giờ công vẫn chạy trong lúc chờ khách');
    assert.equal(rows[0]!.pause_reason, 'WAITING_APPROVAL');
  });
});

describe('🔒 BC-03 mục 5.5 — phát sinh chồng phát sinh', () => {
  test('báo giá bổ sung chưa được phản hồi bị THU HỒI, không chặn phát sinh mới', async () => {
    /*
     * INV-Q-03 chỉ cho phép MỘT báo giá SENT cùng lúc. Chặn thợ báo tiếp cho
     * tới khi khách trả lời là chậm, và bắt khách duyệt hai lần liên tiếp.
     * Thu hồi bản chưa phản hồi rồi gộp thì khách duyệt một lần cho cả hai.
     */
    const don = await donBaViec();
    const luuCoVan = token;

    token = await dangNhap('0901000004');
    let ps1 = '';
    try {
      const r1 = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Phát sinh thứ nhất — đĩa phanh vênh cần thay',
        blocksAssignmentIds: [don.assignmentIds[0]],
      });
      assert.equal(r1.status, 201, JSON.stringify(r1.body));
      ps1 = r1.body.id;
    } finally {
      token = luuCoVan;
    }

    // Cố vấn lập báo giá bổ sung và gửi khách
    const q = await call('POST', `/api/v1/repair-orders/${don.repairOrderId}/quotations`);
    assert.equal(q.status, 201, JSON.stringify(q.body));
    const l = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
      lineType: 'LABOR',
      serviceItemId: don.serviceItemIds[0],
      quantity: 1,
    });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    const gui = await call('POST', `/api/v1/quotations/${q.body.id}/send`);
    assert.equal(gui.status, 201, JSON.stringify(gui.body));
    const noi = await call('POST', `/api/v1/supplements/${ps1}/quotation/${q.body.id}`);
    assert.equal(noi.status, 201, JSON.stringify(noi.body));

    // Thợ phát hiện thêm vấn đề khi khách CHƯA trả lời
    token = await dangNhap('0901000004');
    try {
      const r2 = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[1],
        description: 'Phát sinh thứ hai — phát hiện thêm khi khách chưa trả lời',
        blocksAssignmentIds: [],
      });
      assert.equal(r2.status, 201, `phát sinh thứ hai bị chặn: ${JSON.stringify(r2.body)}`);
      assert.equal(r2.body.daThuHoiBaoGia, true, 'không thu hồi báo giá chưa phản hồi');
    } finally {
      token = luuCoVan;
    }

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM quotation WHERE id = $1',
      [q.body.id],
    );
    assert.equal(rows[0]!.status, 'SUPERSEDED', 'báo giá cũ không được thu hồi');
  });
});

describe('🔒 BC-03 mục 5.1/5.2 — khách từ chối phát sinh', () => {
  /** Dựng một phát sinh đã ở trạng thái REJECTED, sẵn sàng cho cố vấn quyết định */
  async function phatSinhBiTuChoi(): Promise<{
    supplementId: string;
    don: Awaited<ReturnType<typeof donBaViec>>;
  }> {
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004');
    let id = '';
    try {
      const r = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Đĩa phanh vênh, cần thay trước khi lắp má phanh mới',
        blocksAssignmentIds: [don.assignmentIds[0]],
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      id = r.body.id;
    } finally {
      token = luu;
    }
    // Khách từ chối — đặt thẳng trạng thái, luồng OTP đã có test riêng
    await pool.query(
      `UPDATE supplement_request SET status = 'REJECTED', quotation_id = (
         SELECT id FROM quotation WHERE repair_order_id = $2 LIMIT 1)
        WHERE id = $1`,
      [id, don.repairOrderId],
    );
    return { supplementId: id, don };
  }

  test('mục 5.1 — hạng mục gốc VẪN làm được: gỡ tạm dừng', async () => {
    const { supplementId, don } = await phatSinhBiTuChoi();
    const r = await call('POST', `/api/v1/supplements/${supplementId}/resolve`, {
      decision: 'CONTINUE',
      note: 'Khách từ chối thay đĩa, nhưng đĩa còn trong dung sai — vẫn lắp má mới được',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.soViecGo, 1);

    const tt = await don.trangThai();
    assert.equal(tt[0], 'SCHEDULED', 'không gỡ tạm dừng -> việc treo vĩnh viễn');
  });

  test('mục 5.2 — hạng mục gốc KHÔNG làm được: huỷ phân công và nhả giữ chỗ', async () => {
    const { supplementId, don } = await phatSinhBiTuChoi();
    const r = await call('POST', `/api/v1/supplements/${supplementId}/resolve`, {
      decision: 'CANNOT_PROCEED',
      note: 'Đĩa vênh quá dung sai, lắp má phanh mới lên sẽ hỏng ngay và nguy hiểm',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const tt = await don.trangThai();
    assert.equal(tt[0], 'CANCELLED', 'việc không làm được mà vẫn nằm trong lịch');
    assert.equal(tt[1], 'SCHEDULED', 'huỷ lan sang việc độc lập');
  });

  test('🔒 phải chọn quyết định, và phải ghi lý do kỹ thuật', async () => {
    // Mặc định "vẫn làm được" sẽ để thợ lắp má phanh lên đĩa vênh; mặc định
    // "không làm được" sẽ huỷ oan những việc vẫn làm được. Nên bắt chọn.
    const { supplementId } = await phatSinhBiTuChoi();
    const thieuLyDo = await call('POST', `/api/v1/supplements/${supplementId}/resolve`, {
      decision: 'CONTINUE',
      note: 'ok',
    });
    assert.equal(thieuLyDo.status, 400, 'quyết định không cần lý do');
  });

  test('không quyết định được khi khách CHƯA từ chối', async () => {
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004');
    let id = '';
    try {
      const r = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Phát sinh vừa báo, khách chưa trả lời gì cả',
        blocksAssignmentIds: [don.assignmentIds[0]],
      });
      id = r.body.id;
    } finally {
      token = luu;
    }
    const r = await call('POST', `/api/v1/supplements/${id}/resolve`, {
      decision: 'CANNOT_PROCEED',
      note: 'Quyết định trước khi khách kịp trả lời — phải bị chặn',
    });
    assert.equal(r.status, 409, 'quyết định thay khách khi họ chưa trả lời');
  });
});

describe('🔒 Phân quyền phát sinh', () => {
  test('BR-02-2: thợ báo được phát sinh nhưng KHÔNG quyết định được', async () => {
    // Người phát hiện vấn đề không phải người định giá, và cũng không phải
    // người quyết hạng mục gốc còn làm được không.
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const bao = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Thợ báo được — đây là quyền của thợ theo BR-02-2',
        blocksAssignmentIds: [],
      });
      assert.equal(bao.status, 201, JSON.stringify(bao.body));

      const quyet = await call('POST', `/api/v1/supplements/${bao.body.id}/resolve`, {
        decision: 'CANNOT_PROCEED',
        note: 'Thợ tự quyết định huỷ hạng mục — phải bị chặn',
      });
      assert.equal(quyet.status, 403, 'thợ tự quyết định được hạng mục nào bị huỷ');
    } finally {
      token = luu;
    }
  });

  test('thu ngân không báo được phát sinh', async () => {
    const don = await donBaViec();
    const luu = token;
    token = await dangNhap('0901000006');
    try {
      const r = await call('POST', '/api/v1/supplements', {
        repairOrderId: don.repairOrderId,
        serviceItemId: don.serviceItemIds[0],
        description: 'Thu ngân báo phát sinh — không thuộc vai này',
        blocksAssignmentIds: [],
      });
      assert.equal(r.status, 403, JSON.stringify(r.body));
    } finally {
      token = luu;
    }
  });
});
