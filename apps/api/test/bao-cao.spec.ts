/**
 * Phase 6 — báo cáo (docs/09-reports.md).
 *
 * Báo cáo là chỗ dễ viết test vô nghĩa nhất: gọi endpoint, thấy 200, xanh. Test
 * kiểu đó không phát hiện được gì — một công thức sai vẫn trả 200.
 *
 * Nên mỗi bài dưới đây DỰNG một tình huống có con số biết trước, rồi đòi đúng
 * con số đó. Và ba bài quan trọng nhất không kiểm con số mà kiểm những thứ tài
 * liệu đánh dấu ⚠️:
 *
 *   · Xe bỏ quên phải bị LOẠI TRỪ, và việc loại trừ phải được NÓI RA
 *   · Thợ không xem được năng suất của người khác
 *   · Mẫu số quá nhỏ trả NULL, không trả một con số to vô nghĩa
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
let tokenChu = '';
let tokenTho = '';
let tokenThuKho = '';
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

/**
 * Một đơn có con số biết trước: một dòng công đã duyệt, một dòng phụ tùng đã
 * duyệt và đã xuất kho với giá vốn cố định.
 */
async function donCoSoLieu(opts: {
  giaVon: number;
  soLuong: number;
  boQuen?: boolean;
}): Promise<{ id: string; code: string; partId: string; doanhThu: number }> {
  dem += 1;
  const v = await call('POST', '/api/v1/vehicles', {
    customerId,
    plateNumber: `99E-${uniq}${dem}`,
    powertrain: 'ICE',
  });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId: v.body.id,
    branchId,
    customerComplaint: 'Dựng cảnh cho test báo cáo',
    odometerIn: 40_000,
  });
  assert.equal(o.status, 201, JSON.stringify(o.body));

  const { rows: sv } = await pool.query<{ id: string }>(
    `SELECT id FROM service_item
      WHERE tenant_id = $1 AND is_active AND category <> 'DIAGNOSIS'
        AND cardinality(required_certifications) = 0 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: p } = await pool.query<{ id: string }>(
    `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
     VALUES ($1,$2,'Phụ tùng thử báo cáo','cái','BC-THU',0) RETURNING id`,
    [TENANT_A, `PT-BC-${uniq}${dem}`],
  );
  const partId = p[0]!.id;

  const { rows: pl } = await pool.query<{ id: string }>(
    `SELECT id FROM price_list
      WHERE tenant_id = $1 AND effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC LIMIT 1`,
    [TENANT_A],
  );
  await pool.query(
    `INSERT INTO price_list_item (price_list_id, tenant_id, part_id, sell_price, tax_rate_percent)
     VALUES ($1,$2,$3,1000000,10)`,
    [pl[0]!.id, TENANT_A, partId],
  );

  const { rows: u } = await pool.query<{ id: string }>(
    'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
    [TENANT_A],
  );
  const { rows: w } = await pool.query<{ id: string }>(
    'SELECT w.id FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE b.id = $1 LIMIT 1',
    [branchId],
  );
  await pool.query(
    `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                 unit_cost, ref_type, created_by_user_id)
     VALUES ($1,$2,$3,'RECEIPT',$4,$5,'PURCHASE',$6)`,
    [TENANT_A, w[0]!.id, partId, opts.soLuong + 5, opts.giaVon, u[0]!.id],
  );

  const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`);
  const cong = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'LABOR',
    serviceItemId: sv[0]!.id,
    quantity: 1,
  });
  const pt = await call('POST', `/api/v1/quotations/${q.body.id}/lines`, {
    lineType: 'PART',
    partId,
    parentLineId: cong.body.id,
    quantity: opts.soLuong,
  });
  assert.equal(pt.status, 201, JSON.stringify(pt.body));

  /*
   * 🔒 Cha trước, con sau — `trg_qline_child_follows_parent` là trigger BEFORE
   * UPDATE FOR EACH ROW đọc trạng thái hiện tại của dòng cha. Gộp một câu
   * UPDATE cho cả báo giá thì thứ tự xử lý do Postgres quyết định, và trúng
   * thứ tự "con trước" là đỏ với thông báo `INV-Q-02`.
   */
  for (const dieuKien of ['parent_line_id IS NULL', 'parent_line_id IS NOT NULL']) {
    await pool.query(
      `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'COUNTER'
        WHERE quotation_id = $1 AND ${dieuKien}`,
      [q.body.id],
    );
  }

  // Doanh thu = tổng dòng đã duyệt, TRỪ thuế (thuế không phải doanh thu garage)
  const { rows: dt } = await pool.query<{ t: string }>(
    `SELECT COALESCE(sum(line_total - tax_amount), 0) AS t FROM quotation_line
      WHERE quotation_id = $1 AND status = 'APPROVED'`,
    [q.body.id],
  );

  // Xuất kho đúng số lượng đã duyệt
  await pool.query(
    `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                 unit_cost, ref_type, ref_id, created_by_user_id)
     VALUES ($1,$2,$3,'ISSUE',$4,$5,'REPAIR_ORDER',$6,$7)`,
    [TENANT_A, w[0]!.id, partId, -opts.soLuong, opts.giaVon, o.body.id, u[0]!.id],
  );

  for (const tt of ['AWAITING_APPROVAL', 'IN_PROGRESS']) {
    await pool.query('UPDATE repair_order SET status = $2 WHERE id = $1', [o.body.id, tt]);
  }
  if (opts.boQuen === true) {
    await pool.query(
      `UPDATE repair_order SET abandonment_status = 'DECLARED_ABANDONED' WHERE id = $1`,
      [o.body.id],
    );
  }

  return {
    id: o.body.id,
    code: o.body.code,
    partId,
    doanhThu: Math.round(Number(dt[0]!.t)),
  };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenCoVan = await dangNhap('0901000003');
  tokenChu = await dangNhap('0901000001');
  tokenTho = await dangNhap('0901000004');
  tokenThuKho = await dangNhap('0901000005');

  const me = await call(
    'POST',
    '/api/v1/auth/login',
    { phone: '0901000003', password: 'demo1234' },
    '',
  );
  branchId = me.body.user.branchIds[0];

  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL',
    displayName: `Khách báo cáo ${uniq}`,
    phone: `039${uniq}`,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;
});

after(async () => {
  await pool.query(`DELETE FROM stock_movement WHERE part_id IN (SELECT id FROM part WHERE sku LIKE $1)`, [
    `PT-BC-${uniq}%`,
  ]);
  await pool.query(`DELETE FROM stock_balance WHERE part_id IN (SELECT id FROM part WHERE sku LIKE $1)`, [
    `PT-BC-${uniq}%`,
  ]);
  await pool.end();
});

describe('🔒 R-F-02 — lãi/lỗ theo đơn', () => {
  test('doanh thu trừ giá vốn ra đúng con số dựng sẵn', async () => {
    const don = await donCoSoLieu({ giaVon: 300_000, soLuong: 2 });

    const r = await call('GET', '/api/v1/reports/profit');
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const cua = r.body.orders.find((o: { code: string }) => o.code === don.code);
    assert.ok(cua, 'đơn vừa tạo không có trong báo cáo lãi/lỗ');
    assert.equal(cua.doanhThuDuKien, don.doanhThu);
    assert.equal(cua.giaVonPhuTung, 600_000, '2 cái × 300.000đ giá vốn LÚC XUẤT');
    assert.equal(cua.lai, cua.doanhThuDuKien - cua.giaVonPhuTung - cua.chiPhiCong - cua.chiPhiRework - cua.chiPhiBaoHanh);
  });

  test('🔒 trả hàng về kho thì giá vốn GIẢM tương ứng', async () => {
    const don = await donCoSoLieu({ giaVon: 500_000, soLuong: 2 });
    const truoc = await call('GET', '/api/v1/reports/profit');
    const a = truoc.body.orders.find((o: { code: string }) => o.code === don.code);
    assert.equal(a.giaVonPhuTung, 1_000_000);

    const { rows: mv } = await pool.query<{ id: string }>(
      `SELECT id FROM stock_movement WHERE part_id = $1 AND type = 'ISSUE'`,
      [don.partId],
    );
    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    const { rows: w } = await pool.query<{ id: string }>(
      `SELECT warehouse_id AS id FROM stock_movement WHERE id = $1`,
      [mv[0]!.id],
    );
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, ref_type, ref_id, reason, created_by_user_id)
       VALUES ($1,$2,$3,'RETURN',1,500000,'RETURN_OF',$4,'Trả lại một cái',$5)`,
      [TENANT_A, w[0]!.id, don.partId, mv[0]!.id, u[0]!.id],
    );

    const sau = await call('GET', '/api/v1/reports/profit');
    const b = sau.body.orders.find((o: { code: string }) => o.code === don.code);
    assert.equal(
      b.giaVonPhuTung,
      500_000,
      'trả một cái về kho mà giá vốn của đơn không giảm — đơn bị tính tiền cho hàng đang nằm trên kệ',
    );
  });

  test('⚠️ xe bỏ quên bị LOẠI TRỪ, và việc loại trừ được NÓI RA', async () => {
    /*
     * Nguyên tắc 4 của docs/09: loại trừ dữ liệu bất thường VÀ ghi rõ đã loại
     * trừ. Vế sau quan trọng ngang vế trước — một báo cáo lặng lẽ bỏ bớt dữ liệu
     * là một báo cáo nói dối, kể cả khi việc bỏ bớt là đúng.
     */
    const boQuen = await donCoSoLieu({ giaVon: 100_000, soLuong: 1, boQuen: true });

    const r = await call('GET', '/api/v1/reports/profit');
    const co = r.body.orders.some((o: { code: string }) => o.code === boQuen.code);
    assert.equal(co, false, 'xe bỏ quên vẫn nằm trong báo cáo lãi/lỗ');

    assert.ok(Array.isArray(r.body.daLoaiTru) && r.body.daLoaiTru.length >= 2);
    assert.ok(
      r.body.daLoaiTru.some((x: string) => /bỏ quên/i.test(x)),
      'loại trừ xe bỏ quên mà không nói ra',
    );
  });

  test('🔒 thợ KHÔNG đọc được báo cáo lãi/lỗ', async () => {
    const r = await call('GET', '/api/v1/reports/profit', undefined, tokenTho);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test('báo cáo LUÔN trả về khoảng thời gian nó đã dùng', async () => {
    // Nguyên tắc 3: một bảng số không kèm kỳ là bảng số không so sánh được với
    // bất cứ thứ gì.
    const r = await call('GET', '/api/v1/reports/profit');
    assert.ok(r.body.from && r.body.to, 'báo cáo không nói nó tính cho kỳ nào');
    assert.ok(new Date(r.body.from) < new Date(r.body.to));
  });
});

describe('🔒 R-O-01 — thời gian chờ theo bộ phận', () => {
  test('quy trạng thái về BỘ PHẬN chịu trách nhiệm, dùng trung vị và p90', async () => {
    const r = await call('GET', '/api/v1/reports/wait-time?from=' +
      encodeURIComponent(new Date(Date.now() - 90 * 86_400_000).toISOString()));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.stages.length > 0, 'seed có chuyển trạng thái mà báo cáo rỗng');

    const cho = r.body.stages.find((s: { trangThai: string }) => s.trangThai === 'AWAITING_APPROVAL');
    assert.ok(cho, 'thiếu chặng chờ khách duyệt');
    assert.equal(cho.boPhan, 'Khách hàng', 'chờ khách duyệt mà quy trách nhiệm cho xưởng');

    // ⚠️ Không có trường "trung bình" — cố ý, để không ai vô tình dùng nó
    assert.equal(cho.trungBinh, undefined);
    assert.ok(typeof cho.trungViGio === 'number' && typeof cho.p90Gio === 'number');
  });

  test('thợ xem được thời gian chờ — nó không có đồng nào', async () => {
    const r = await call('GET', '/api/v1/reports/wait-time', undefined, tokenTho);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
});

describe('🔒 R-O-03 — năng suất KÈM tỉ lệ làm lại', () => {
  test('ba chỉ số nằm trên cùng một dòng, không tách rời', async () => {
    const r = await call('GET', '/api/v1/reports/productivity', undefined, tokenChu);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.length > 0, 'seed có thợ mà báo cáo rỗng');

    for (const t of r.body) {
      /*
       * ⚠️ Năng suất cao + rework cao = làm ẩu, không phải giỏi. Ba chỉ số phải
       * ở cùng một chỗ; tách thành hai endpoint là mở đường cho việc chỉ nhìn
       * một nửa và khen nhầm người.
       */
      assert.ok('nangSuat' in t && 'tiLeRework' in t && 'soLanQcTruot' in t);
    }
  });

  test('🔒 mẫu số quá nhỏ trả NULL, không trả con số to vô nghĩa', async () => {
    /*
     * Seed có một phân công với 0,0001 giờ — dấu vết một lần bấm nhầm. Bản đầu
     * của view chỉ phòng chia cho 0, nên nó trả về NĂNG SUẤT 12000.
     *
     * Đây là loại lỗi báo cáo nguy hiểm nhất: nó không lỗi. Không ngoại lệ,
     * không log, chỉ có một người thợ tự nhiên giỏi gấp mười hai nghìn lần.
     * Con số 12000 thì ai cũng thấy sai — con số 3,4 thì không, và nó sẽ được
     * dùng để đánh giá con người.
     */
    const r = await call('GET', '/api/v1/reports/productivity', undefined, tokenChu);
    for (const t of r.body) {
      if (t.nangSuat !== null) {
        assert.ok(
          t.nangSuat < 50,
          `năng suất ${t.nangSuat} của ${t.technicianName} — mẫu số quá nhỏ lọt lưới`,
        );
        assert.ok((t.gioThucTe ?? 0) >= 0.05, 'có năng suất mà giờ thực tế dưới ba phút');
      }
    }
  });

  test('🔒 thợ CHỈ xem được của chính mình', async () => {
    const cuaTho = await call('GET', '/api/v1/reports/productivity', undefined, tokenTho);
    assert.equal(cuaTho.status, 200, JSON.stringify(cuaTho.body));

    const cuaChu = await call('GET', '/api/v1/reports/productivity', undefined, tokenChu);
    assert.ok(
      cuaChu.body.length > cuaTho.body.length,
      'thợ thấy đúng bằng chủ xưởng — phạm vi SELF không có tác dụng',
    );
    assert.ok(cuaTho.body.length <= 1);

    // 🔒 Và không thấy chi phí — đó là tiền
    for (const t of cuaTho.body) assert.equal(t.chiPhiLamLai, 0);
  });
});

describe('🔒 R-S-01/02/03 — kho', () => {
  test('cảnh báo dưới mức tối thiểu và nhận diện VỐN CHẾT', async () => {
    const don = await donCoSoLieu({ giaVon: 200_000, soLuong: 1 });

    const r = await call('GET', '/api/v1/reports/stock', undefined, tokenThuKho);
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const cua = r.body.find((x: { partId: string }) => x.partId === don.partId);
    assert.ok(cua, 'mã hàng vừa nhập không có trong báo cáo tồn');
    assert.equal(cua.onHand, 5, 'nhập 6, xuất 1');
    assert.ok(cua.giaTriTon > 0);
    /*
     * Vừa xuất trong kỳ nên KHÔNG phải vốn chết. Điểm đáng chú ý: cách tính
     * dùng "365 ngày không xuất đồng nào" chứ không dùng `soNgayTon > 365` —
     * khi vòng quay bằng 0 thì `soNgayTon` là null và phép so sánh im lặng trả
     * false, tức là đúng những mã tệ nhất lại lọt lưới.
     */
    assert.equal(cua.laVonChet, false);

    // Mã hàng có tồn mà chưa từng xuất -> vốn chết
    const { rows: chet } = await pool.query<{ id: string }>(
      `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
       VALUES ($1,$2,'Hàng nằm im','cái','BC-THU',0) RETURNING id`,
      [TENANT_A, `PT-BC-${uniq}CHET`],
    );
    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    const { rows: w } = await pool.query<{ id: string }>(
      'SELECT w.id FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE b.id = $1 LIMIT 1',
      [branchId],
    );
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, ref_type, created_by_user_id)
       VALUES ($1,$2,$3,'RECEIPT',4,750000,'PURCHASE',$4)`,
      [TENANT_A, w[0]!.id, chet[0]!.id, u[0]!.id],
    );

    const r2 = await call('GET', '/api/v1/reports/stock', undefined, tokenThuKho);
    const vonChet = r2.body.find((x: { partId: string }) => x.partId === chet[0]!.id);
    assert.equal(vonChet.laVonChet, true, '3 triệu nằm im 365 ngày mà không bị nhận diện');
    assert.equal(vonChet.vongQuay, 0);
  });

  test('🔒 thợ không đọc được báo cáo kho — nó có giá vốn', async () => {
    const r = await call('GET', '/api/v1/reports/stock', undefined, tokenTho);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test('chênh lệch kiểm kê gom theo LÝ DO', async () => {
    const r = await call('GET', '/api/v1/reports/stock-variance', undefined, tokenThuKho);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body));
    /*
     * 💡 Giá trị của báo cáo này nằm ở phân loại: nếu ISSUE_NOT_RECORDED chiếm
     * đa số thì vấn đề ở QUY TRÌNH xuất kho, không phải ở thủ kho. Một ô ghi
     * chú tự do không trả lời được câu đó — và đó là lý do 0037 dùng enum.
     */
    for (const d of r.body) {
      assert.ok(typeof d.reason === 'string' && d.reason.length > 0);
      assert.ok(d.giaTriTuyetDoi >= Math.abs(d.giaTriRong), 'thừa và thiếu KHÔNG được bù nhau');
    }
  });
});

describe('🔒 R-O-02 — đúng hẹn, luôn kèm số lần dời hẹn', () => {
  test('không bao giờ trả tỉ lệ mà thiếu số lần dời hẹn', async () => {
    const r = await call('GET', '/api/v1/reports/on-time');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    /*
     * Tỉ lệ đúng hẹn 95% mà mỗi đơn dời hẹn ba lần thì con số kia vô giá trị.
     * Hai số phải đi cùng nhau trong CÙNG một phản hồi — để trên hai màn hình
     * là để người đọc chỉ nhìn số đẹp.
     */
    assert.ok('tiLeDungHen' in r.body);
    assert.ok(typeof r.body.tongSoLanDoiHen === 'number');
    assert.ok(typeof r.body.soDonCoDoiHen === 'number');
    assert.ok(Array.isArray(r.body.daLoaiTru));
  });

  test('không có đơn nào trong kỳ thì tỉ lệ là NULL, không phải 0', async () => {
    // 0% đúng hẹn và "chưa có đơn nào" là hai điều hoàn toàn khác nhau; trả 0
    // cho trường hợp thứ hai là bịa ra một tin xấu không có thật.
    const r = await call(
      'GET',
      '/api/v1/reports/on-time?from=' +
        encodeURIComponent(new Date(Date.now() + 300 * 86_400_000).toISOString()) +
        '&to=' +
        encodeURIComponent(new Date(Date.now() + 400 * 86_400_000).toISOString()),
    );
    assert.equal(r.body.soDonBanGiao, 0);
    assert.equal(r.body.tiLeDungHen, null);
  });
});
