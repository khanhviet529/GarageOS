/**
 * Phase 2.5 — giờ công (BC-06).
 *
 * Điều đáng kiểm nhất không phải "bấm giờ được", mà là ba thứ dễ sai và sai thì
 * KHÔNG lộ ra ở đâu cả:
 *
 *  1. Thời gian CHỜ không được tính vào giờ công (chờ phụ tùng ≠ thợ chậm)
 *  2. Các đoạn không chồng nhau, nên phép cộng mới có nghĩa
 *  3. Khách trả theo ĐỊNH MỨC, không theo thực tế
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const APP_URL =
  process.env.DATABASE_URL ??
  'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

let pool: Pool;
let token = '';
let branchId = '';
let customerId = '';
let demXe = 0;
let ngayLech = 0;
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

async function nguoiTheoDienThoai(phone: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM app_user WHERE tenant_id = $1 AND phone = $2',
    [TENANT_A, phone],
  );
  return rows[0]!.id;
}

/** Khung giờ ở tương lai xa, mỗi lần gọi lệch một ngày để không đụng nhau */
function khungGio(): string {
  ngayLech += 1;
  const d = new Date('2027-09-01T01:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + ngayLech);
  return d.toISOString();
}

/** Dựng một phân công SCHEDULED cho thợ `0901000004` */
async function phanCongSanSang(): Promise<{ assignmentId: string; standardHours: number }> {
  demXe += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `77G-${uniq}${demXe}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test giờ công',
    odometerIn: 5000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const cat = await call('GET', `/api/v1/catalog/vehicle/${v.body.id}`);
  const sv = cat.body.serviceItems.find((s: { code: string }) => s.code === 'SV-OIL-ENGINE');
  assert.ok(sv, 'danh mục thiếu SV-OIL-ENGINE');

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

  const { rows: bay } = await pool.query<{ id: string }>(
    `SELECT id FROM bay WHERE tenant_id = $1 AND code = 'K1-01'`,
    [TENANT_A],
  );
  const pc = await call('POST', '/api/v1/assignments', {
    quotationLineId: line.body.id,
    technicianId: await nguoiTheoDienThoai('0901000004'),
    bayId: bay[0]!.id,
    plannedStart: khungGio(),
  });
  assert.equal(pc.status, 201, JSON.stringify(pc.body));
  return { assignmentId: pc.body.id, standardHours: Number(sv.standardHours) };
}

/**
 * Dịch mốc giờ của đoạn đang mở để mô phỏng thời gian đã trôi qua.
 *
 * Cần thiết vì test không chờ được 45 phút thật. Dùng role quản trị: cột
 * `started_at` cố ý KHÔNG cấp UPDATE cho vai ứng dụng (0030), và đó chính là
 * điều một test khác trong tệp này khẳng định.
 */
async function dichDoan(
  assignmentId: string,
  batDauTruocPhut: number,
  ketThucTruocPhut: number | null,
): Promise<void> {
  await pool.query(
    `UPDATE time_log
        SET started_at = now() - ($2 || ' minutes')::interval,
            ended_at   = CASE WHEN $3::text IS NULL THEN NULL
                              ELSE now() - ($3 || ' minutes')::interval END
      WHERE work_assignment_id = $1 AND ended_at IS NULL`,
    [assignmentId, String(batDauTruocPhut), ketThucTruocPhut === null ? null : String(ketThucTruocPhut)],
  );
}

/**
 * Dọn sau mỗi test: xoá các đoạn giờ VÀ đóng phân công lại.
 *
 * 🔒 Phần thứ hai là bắt buộc, và tôi đã bỏ sót nó ở bản đầu. `INV-W-05`
 * (`one_active_assignment_per_tech`) chỉ cho một thợ có ĐÚNG MỘT phân công
 * `IN_PROGRESS`. Test nào bấm "bắt đầu" mà không đóng lại thì test SAU đó
 * không bấm được nữa — và nó đỏ ở chỗ chẳng liên quan gì ("không có đoạn giờ
 * nào đang mở"), vì lời gọi `start` đã lặng lẽ thất bại từ trước.
 *
 * Cùng loại lỗi với "giữ chỗ không nhả" ở 2.2: một bất biến làm đúng việc của
 * nó, còn bộ test thì tích luỹ trạng thái qua từng test.
 */
async function donGio(assignmentId: string): Promise<void> {
  await pool.query('DELETE FROM time_log WHERE work_assignment_id = $1', [assignmentId]);
  await pool.query(`UPDATE work_assignment SET status = 'CANCELLED' WHERE id = $1`, [
    assignmentId,
  ]);
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  const me = await call('POST', '/api/v1/auth/login', {
    phone: '0901000002',
    password: 'demo1234',
  });
  assert.equal(me.status, 201, 'seed chưa sẵn sàng');
  token = me.body.accessToken;
  branchId = me.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách giờ công ${uniq}`,
    phone: `034${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  /*
   * Dọn giờ công và phân công của lần chạy này.
   *
   * Bắt buộc: một đoạn giờ còn MỞ chiếm chỗ tới vô cùng
   * (`coalesce(ended_at, 'infinity')`), nên lần chạy sau thợ đó không bấm được
   * việc nào nữa và những test chẳng liên quan sẽ đỏ. Cùng loại lỗi với "giữ
   * chỗ không nhả" đã ghi ở STATUS.md.
   */
  await pool.query(
    `DELETE FROM time_log WHERE work_assignment_id IN (
       SELECT wa.id FROM work_assignment wa
         JOIN repair_order ro ON ro.id = wa.repair_order_id
         JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number LIKE $1)`,
    [`77G-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM work_assignment WHERE repair_order_id IN (
       SELECT ro.id FROM repair_order ro JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number LIKE $1)`,
    [`77G-${uniq}%`],
  );
  await pool.end();
});

describe('Bấm giờ — luồng chính', () => {
  test('🔒 BC-06 test 1: giờ thực tế bằng tổng các đoạn', async () => {
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      // Đoạn 1: 45 phút
      const d1 = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(d1.status, 201, JSON.stringify(d1.body));
      await dichDoan(pc.assignmentId, 200, 155);
      // Đoạn 2: 20 phút
      await call('POST', '/api/v1/time-logs/start', { workAssignmentId: pc.assignmentId });
      await dichDoan(pc.assignmentId, 120, 100);
      // Đoạn 3: 10 phút
      await call('POST', '/api/v1/time-logs/start', { workAssignmentId: pc.assignmentId });
      await dichDoan(pc.assignmentId, 50, 40);
    } finally {
      token = luu;
    }

    const s = await call('GET', `/api/v1/assignments/${pc.assignmentId}/time`);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.segments.length, 3);
    // 45 + 20 + 10 = 75 phút = 1,25 giờ
    assert.equal(s.body.actualHours, 1.25, 'tổng giờ không bằng tổng các đoạn');
    await donGio(pc.assignmentId);
  });

  test('🔒 BC-06 test 2: thời gian CHỜ không tính vào giờ công', async () => {
    /*
     * Đây là lý do phải lưu các ĐOẠN chứ không lưu một con số tổng. Chờ phụ
     * tùng 2 giờ khác hẳn thợ làm chậm 2 giờ, nhưng một con số tổng thì không
     * phân biệt được — và báo cáo năng suất đọc cả hai thành như nhau.
     */
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      // Làm 30 phút rồi tạm dừng chờ phụ tùng
      const mo = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(mo.status, 201, JSON.stringify(mo.body));
      const dung = await call('POST', '/api/v1/time-logs/stop', {
        workAssignmentId: pc.assignmentId,
        reason: 'WAITING_PARTS',
      });
      assert.equal(dung.status, 201, JSON.stringify(dung.body));
      await pool.query(
        `UPDATE time_log SET started_at = now() - interval '200 minutes',
                             ended_at   = now() - interval '170 minutes'
          WHERE work_assignment_id = $1`,
        [pc.assignmentId],
      );

      // 2 giờ sau mới làm tiếp, 15 phút
      await call('POST', '/api/v1/time-logs/start', { workAssignmentId: pc.assignmentId });
      await dichDoan(pc.assignmentId, 50, 35);
    } finally {
      token = luu;
    }

    const s = await call('GET', `/api/v1/assignments/${pc.assignmentId}/time`);
    // 30 + 15 = 45 phút = 0,75 giờ. Hai giờ chờ KHÔNG có trong đó.
    assert.equal(s.body.actualHours, 0.75, 'thời gian chờ bị tính thành giờ công');

    const cho = s.body.segments.filter(
      (x: { pauseReason: string | null }) => x.pauseReason === 'WAITING_PARTS',
    );
    assert.equal(cho.length, 1, 'lý do chờ không được ghi -> không biết xe nằm lâu vì ai');
    await donGio(pc.assignmentId);
  });

  test('tạm dừng đưa phân công về PAUSED, kết thúc đưa về DONE', async () => {
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const mo = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(mo.status, 201, JSON.stringify(mo.body));
      const dung = await call('POST', '/api/v1/time-logs/stop', {
        workAssignmentId: pc.assignmentId,
        reason: 'SHIFT_END',
      });
      assert.equal(dung.status, 201, JSON.stringify(dung.body));
      assert.equal(dung.body.assignmentStatus, 'PAUSED');

      await call('POST', '/api/v1/time-logs/start', { workAssignmentId: pc.assignmentId });
      const xong = await call('POST', '/api/v1/time-logs/stop', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(xong.status, 201, JSON.stringify(xong.body));
      assert.equal(xong.body.assignmentStatus, 'DONE', 'kết thúc không đưa phân công về DONE');
    } finally {
      token = luu;
      await donGio(pc.assignmentId);
    }
  });

  test('bấm tạm dừng hai lần liên tiếp không ăn mất giờ ở giữa', async () => {
    // Mạng chậm, thợ bấm lại. Nếu điều kiện `ended_at IS NULL` không nằm TRONG
    // câu UPDATE thì lần thứ hai ghi đè `ended_at` của đoạn đã đóng.
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const mo = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(mo.status, 201, JSON.stringify(mo.body));
      const l1 = await call('POST', '/api/v1/time-logs/stop', {
        workAssignmentId: pc.assignmentId,
        reason: 'OTHER',
        note: 'Bấm lần một',
      });
      assert.equal(l1.status, 201, JSON.stringify(l1.body));

      const l2 = await call('POST', '/api/v1/time-logs/stop', {
        workAssignmentId: pc.assignmentId,
        reason: 'OTHER',
        note: 'Bấm lần hai',
      });
      assert.notEqual(l2.status, 201, 'bấm dừng lần hai vẫn được -> ghi đè đoạn đã đóng');
    } finally {
      token = luu;
      await donGio(pc.assignmentId);
    }
  });
});

describe('🔒 Bất biến giờ công', () => {
  test('🔒 INV-W-06 / BC-06 test 3: hai đoạn chồng nhau bị chặn', async () => {
    /*
     * Hậu quả nếu thiếu: thợ bấm giờ hai việc song song, tổng giờ vô nghĩa, số
     * liệu năng suất và lương sản lượng đều sai. Và cái sai đó KHÔNG lộ ra —
     * mọi con số vẫn cộng ra một kết quả trông hợp lý.
     *
     * Đoạn đang MỞ chiếm chỗ tới vô cùng, nên nó bao luôn cả trường hợp thợ bấm
     * việc thứ hai mà chưa đóng việc thứ nhất.
     */
    const a = await phanCongSanSang();
    const b = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const r1 = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: a.assignmentId,
      });
      assert.equal(r1.status, 201, JSON.stringify(r1.body));

      const r2 = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: b.assignmentId,
      });
      assert.equal(r2.status, 409, `bấm giờ chồng nhau vẫn qua: ${JSON.stringify(r2.body)}`);
    } finally {
      token = luu;
      await donGio(a.assignmentId);
      await donGio(b.assignmentId);
    }
  });

  test('🔒 không ghi được giờ vào sổ của người KHÔNG làm', async () => {
    /*
     * Trigger `kiem_tra_bam_gio()` buộc `time_log.technician_id` phải là người
     * được phân công. Không có nó thì `INV-W-06` không bắt được: nó chỉ kiểm
     * theo người của DÒNG GIỜ, nên hai người bấm cho cùng một việc không đụng
     * nhau — giờ của người làm thật bị thiếu, của người bấm hộ thì thừa.
     */
    const pc = await phanCongSanSang();
    const nguoiKhac = await nguoiTheoDienThoai('0901000003');
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id,
                                 started_at, entered_by_user_id)
           VALUES ($1,$2,$3, now(), $3)`,
          [TENANT_A, pc.assignmentId, nguoiKhac],
        ),
      /WRONG_TECHNICIAN/,
      'ghi được giờ công vào sổ của người không làm',
    );
  });

  test('🔒 vai ứng dụng không sửa được started_at của đoạn đã ghi', async () => {
    // Lùi giờ bắt đầu là viết lại số liệu năng suất và lương của quá khứ.
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const r = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    } finally {
      token = luu;
    }

    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM time_log WHERE work_assignment_id = $1 LIMIT 1',
      [pc.assignmentId],
    );
    const app = new Pool({ connectionString: APP_URL });
    try {
      await app.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A]);
      await assert.rejects(
        () =>
          app.query(`UPDATE time_log SET started_at = now() - interval '5 hours' WHERE id = $1`, [
            rows[0]!.id,
          ]),
        /permission denied/i,
        'lùi được giờ bắt đầu -> viết lại số liệu lương của quá khứ',
      );
      await assert.rejects(
        () => app.query('DELETE FROM time_log WHERE id = $1', [rows[0]!.id]),
        /permission denied/i,
        'xoá được đoạn giờ -> giờ công biến mất không dấu vết',
      );
    } finally {
      await app.end();
      await donGio(pc.assignmentId);
    }
  });

  test('🔒 lý do OTHER bắt buộc kèm ghi chú', async () => {
    // `OTHER` là lý do dễ chọn nhất khi người dùng muốn bấm cho nhanh, và cũng
    // là lý do vô dụng nhất nếu không kèm ghi chú.
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const mo = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(mo.status, 201, JSON.stringify(mo.body));
      const r = await call('POST', '/api/v1/time-logs/stop', {
        workAssignmentId: pc.assignmentId,
        reason: 'OTHER',
      });
      assert.notEqual(r.status, 201, 'OTHER không ghi chú vẫn qua -> không phân tích được gì');
    } finally {
      token = luu;
      await donGio(pc.assignmentId);
    }
  });
});

describe('🔒 Định mức và thực tế là hai thứ khác nhau', () => {
  test('🔒 BC-06 test 5: tiền công theo ĐỊNH MỨC, năng suất = định mức / thực tế', async () => {
    /*
     * Sai lầm nặng nhất mà BC-06 mục 6 liệt kê: tính tiền khách theo giờ thực
     * tế. Khách trả tiền cho sự chậm chạp của garage là mất công bằng và mất
     * khách.
     *
     * Test này khẳng định hai điều cùng lúc: giờ thực tế được ghi đúng, VÀ đơn
     * giá dòng công trên báo giá không hề đổi theo nó.
     */
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const mo = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(mo.status, 201, JSON.stringify(mo.body));
      const phut = Math.round(pc.standardHours * 60 * 2); // làm gấp đôi định mức
      await dichDoan(pc.assignmentId, phut + 10, 10);
    } finally {
      token = luu;
    }

    const s = await call('GET', `/api/v1/assignments/${pc.assignmentId}/time`);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.ok(
      Math.abs(s.body.actualHours - pc.standardHours * 2) < 0.05,
      `giờ thực tế sai: ${s.body.actualHours} vs mong đợi ~${pc.standardHours * 2}`,
    );
    // Năng suất ~0,5 = làm chậm gấp đôi. Đảo hai vế thì thành 2, và một thợ
    // chậm bị đọc thành xuất sắc — lỗi không ai phát hiện tới lúc tính lương.
    assert.ok(
      s.body.efficiency !== null && s.body.efficiency < 1,
      `năng suất phải < 1 khi làm chậm: ${s.body.efficiency}`,
    );
    assert.equal(s.body.vuotDinhMucNhieu, true, 'vượt gấp đôi định mức mà không cảnh báo');

    const { rows } = await pool.query<{ unit_price: string; standard_hours: string; rate: string }>(
      `SELECT ql.unit_price, si.standard_hours, q.labor_rate_per_hour AS rate
         FROM work_assignment wa
         JOIN quotation_line ql ON ql.id = wa.quotation_line_id
         JOIN quotation q       ON q.id = ql.quotation_id
         JOIN service_item si   ON si.id = ql.service_item_id
        WHERE wa.id = $1`,
      [pc.assignmentId],
    );
    const mongDoi = Math.round(Number(rows[0]!.standard_hours) * Number(rows[0]!.rate));
    assert.equal(
      Number(rows[0]!.unit_price),
      mongDoi,
      'tiền công đổi theo giờ thực tế -> khách trả cho sự chậm chạp của garage',
    );
    await donGio(pc.assignmentId);
  });
});

describe('🔒 Nhập hộ và đóng hộ', () => {
  test('quản lý nhập hộ được, thợ tự khai thì không', async () => {
    const pc = await phanCongSanSang();
    const batDau = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const ketThuc = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const tho = await call('POST', '/api/v1/time-logs/enter', {
        workAssignmentId: pc.assignmentId,
        startedAt: batDau,
        endedAt: ketThuc,
        note: 'Tôi tự khai giờ đã làm',
      });
      assert.equal(tho.status, 403, 'thợ tự khai được giờ trong quá khứ');
    } finally {
      token = luu;
    }

    const ql = await call('POST', '/api/v1/time-logs/enter', {
      workAssignmentId: pc.assignmentId,
      startedAt: batDau,
      endedAt: ketThuc,
      note: 'Thợ quên bấm, quản lý nhập hộ',
    });
    assert.equal(ql.status, 201, JSON.stringify(ql.body));
    assert.equal(ql.body.hours, 1);

    // `enteredBy` khác thợ -> giao diện nhìn ra ngay là nhập hộ, không cần cờ riêng
    const s = await call('GET', `/api/v1/assignments/${pc.assignmentId}/time`);
    const d = s.body.segments[0];
    assert.notEqual(d.enteredByName, d.technicianName, 'không nhìn ra được là nhập hộ');
    await donGio(pc.assignmentId);
  });

  test('🔒 không nhập hộ giờ lùi quá 24 tiếng, và không khai trước giờ chưa làm', async () => {
    const pc = await phanCongSanSang();

    const qua = await call('POST', '/api/v1/time-logs/enter', {
      workAssignmentId: pc.assignmentId,
      startedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
      endedAt: new Date(Date.now() - 29 * 3600 * 1000).toISOString(),
      note: 'Nhập số liệu của hôm trước',
    });
    assert.equal(qua.status, 400, 'nhập được giờ lùi 30 tiếng -> sửa số liệu đã vào báo cáo');

    const tuongLai = await call('POST', '/api/v1/time-logs/enter', {
      workAssignmentId: pc.assignmentId,
      startedAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      endedAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      note: 'Khai trước cho việc chưa làm',
    });
    assert.equal(tuongLai.status, 400, 'khai trước được giờ chưa làm');
  });

  test('🔒 BC-06 mục 4.1: job đóng hộ đoạn bỏ quên, cắt ở NGƯỠNG chứ không ở now()', async () => {
    /*
     * Đóng ở `now()` thì một đoạn bỏ quên qua đêm được ghi 20 tiếng làm việc
     * liên tục — con số vừa sai vừa trông như thật. Cắt ở ngưỡng thì nó sai một
     * cách RÕ RÀNG, và `autoClosed` nói cho bảng lương biết đừng tin nó.
     */
    const pc = await phanCongSanSang();
    const luu = token;
    token = await dangNhap('0901000004');
    try {
      const r = await call('POST', '/api/v1/time-logs/start', {
        workAssignmentId: pc.assignmentId,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    } finally {
      token = luu;
    }
    await pool.query(
      `UPDATE time_log SET started_at = now() - interval '20 hours'
        WHERE work_assignment_id = $1 AND ended_at IS NULL`,
      [pc.assignmentId],
    );

    const job = await call('POST', '/api/v1/time-logs/close-forgotten');
    assert.equal(job.status, 201, JSON.stringify(job.body));
    assert.ok(job.body.daDong >= 1, 'job không đóng đoạn nào');

    const s = await call('GET', `/api/v1/assignments/${pc.assignmentId}/time`);
    const d = s.body.segments[0];
    assert.equal(d.autoClosed, true, 'không đánh dấu autoClosed -> lương dùng số liệu không tin được');
    assert.notEqual(d.endedAt, null);
    assert.ok(Math.abs(d.hours - 8) < 0.05, `đoạn đóng hộ phải cắt ở 8 giờ, nhận ${d.hours}`);
    assert.equal(s.body.coDoanDongHo, true);
    await donGio(pc.assignmentId);
  });

  test('🔒 cố vấn và thu ngân không bấm giờ được', async () => {
    const pc = await phanCongSanSang();
    for (const phone of ['0901000003', '0901000006']) {
      const luu = token;
      token = await dangNhap(phone);
      try {
        const r = await call('POST', '/api/v1/time-logs/start', {
          workAssignmentId: pc.assignmentId,
        });
        assert.equal(r.status, 403, `${phone} bấm giờ công được`);
      } finally {
        token = luu;
      }
    }
  });
});
