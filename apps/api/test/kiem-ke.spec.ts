/**
 * Phase 5.4 — kiểm kê kho (BC-12).
 *
 * Kiểm kê là đường DUY NHẤT làm tồn kho đổi mà không có chứng từ mua bán đối
 * ứng. Tám bài của BC-12 mục 7, và bài quan trọng nhất không phải bài tính
 * đúng chênh lệch — mà là bài chứng minh MỘT NGƯỜI không tự cân sổ được.
 *
 * 🔒 Sau mọi kịch bản đều đối soát INV-S-02.
 */
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

let pool: Pool;
let tokenThuKho = '';
let tokenQuanLy = '';
let tokenChu = '';
let khoId = '';
let dem = 0;
const uniq = `${Date.now().toString().slice(-5)}${process.pid.toString().slice(-3)}`;

async function call(
  method: string,
  path: string,
  body?: unknown,
  token = tokenThuKho,
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
  const r = await call('POST', '/api/v1/auth/login', { phone, password: 'demo1234' }, '');
  assert.equal(r.status, 201, `không đăng nhập được ${phone}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

async function assertLedgerMatchesBalance(): Promise<void> {
  const { rows } = await pool.query<{ warehouse_id: string; part_id: string; on_hand: string; ledger: string }>(
    `SELECT b.warehouse_id, b.part_id, b.on_hand, COALESCE(SUM(m.quantity), 0) AS ledger
       FROM stock_balance b
       LEFT JOIN stock_movement m
         ON m.tenant_id = b.tenant_id AND m.warehouse_id = b.warehouse_id
        AND m.part_id = b.part_id
      GROUP BY b.tenant_id, b.warehouse_id, b.part_id, b.on_hand
     HAVING b.on_hand <> COALESCE(SUM(m.quantity), 0)`,
  );
  assert.deepEqual(
    rows.map((r) => `${r.warehouse_id}/${r.part_id}: tồn ${r.on_hand} vs sổ ${r.ledger}`),
    [],
    '🔒 INV-S-02 — tồn tổng hợp lệch với sổ kho',
  );
}

/**
 * Một mã hàng RIÊNG với tồn ban đầu cho trước, thuộc một nhóm hàng riêng.
 *
 * Nhóm riêng để kiểm kê PARTIAL chỉ chạm đúng mã này — kiểm kê toàn kho trong
 * môi trường test sẽ kéo theo mọi mã của seed, và số liệu của bài này phụ thuộc
 * bài khác.
 */
async function maHangRieng(ton: number, giaVon = 200_000): Promise<{ id: string; nhom: string }> {
  dem += 1;
  const nhom = `KK-${uniq}-${dem}`;
  const { rows: u } = await pool.query<{ id: string }>(
    'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
    [TENANT_A],
  );
  const { rows: p } = await pool.query<{ id: string }>(
    `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
     VALUES ($1,$2,'Phụ tùng thử kiểm kê','cái',$3,0) RETURNING id`,
    [TENANT_A, `PT-KK-${uniq}${dem}`, nhom],
  );
  if (ton > 0) {
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, ref_type, created_by_user_id)
       VALUES ($1,$2,$3,'RECEIPT',$4,$5,'PURCHASE',$6)`,
      [TENANT_A, khoId, p[0]!.id, ton, giaVon, u[0]!.id],
    );
  }
  return { id: p[0]!.id, nhom };
}

async function tonKho(partId: string): Promise<number> {
  const { rows } = await pool.query<{ on_hand: string }>(
    'SELECT on_hand FROM stock_balance WHERE part_id = $1',
    [partId],
  );
  return rows[0] === undefined ? 0 : Number(rows[0].on_hand);
}

/** Kiểm kê một nhóm hàng, trả về phiếu đang COUNTING */
async function moPhieu(nhom: string): Promise<any> {
  const r = await call('POST', '/api/v1/stock-takes', {
    warehouseId: khoId,
    scope: 'PARTIAL',
    scopeCategory: nhom,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenThuKho = await dangNhap('0901000005');
  tokenQuanLy = await dangNhap('0901000002');
  tokenChu = await dangNhap('0901000001');

  const { rows: w } = await pool.query<{ id: string }>(
    /*
     * 🔒 Kho của CHÍNH thủ kho, không phải "kho đầu tiên theo mã".
     *
     * `ORDER BY b.code LIMIT 1` trúng HCM01, trong khi thủ kho seed thuộc HN01.
     * Bài này chạy xanh suốt Phase 5.4 vì lúc đó `StockTakeService` chưa có
     * phạm vi chi nhánh — nó vô tình kiểm kê kho của chi nhánh khác và không ai
     * biết. Vòng review sau Phase 3 vá lỗ hổng đó, và bài test đổ ngay.
     *
     * 💡 Một bài test đỏ VÌ một lỗ hổng vừa được bịt là bằng chứng tốt nhất
     *    rằng lỗ hổng ấy có thật.
     */
    `SELECT w.id FROM warehouse w
       JOIN branch b ON b.id = w.branch_id
       JOIN user_branch ub ON ub.branch_id = b.id
       JOIN app_user u ON u.id = ub.user_id
      WHERE b.tenant_id = $1 AND u.phone = '0901000005' LIMIT 1`,
    [TENANT_A],
  );
  assert.ok(w[0], 'seed thiếu kho ở chi nhánh của thủ kho');
  khoId = w[0].id;
});

afterEach(assertLedgerMatchesBalance);

after(async () => {
  /*
   * Mở khoá phiếu trước khi xoá dòng.
   *
   * `chan_sua_kiem_ke_da_duyet` chặn cả DELETE trên phiếu đã APPROVED, kể cả
   * kết nối quản trị — và đó là điều đúng. Dọn dẹp trong test cũng phải đi qua
   * cùng một cửa, không có lối tắt riêng.
   */
  /*
   * 🔒 MỘT phiếu một lượt, không mở khoá cả loạt.
   *
   * `uniq_stock_take_dang_mo` (0050) chỉ cho mỗi kho một phiếu đang mở. Bản
   * trước `UPDATE ... WHERE id IN (...)` kéo tất cả phiếu của bộ test này về
   * COUNTING cùng lúc — mà chúng dùng chung một kho, nên câu dọn dẹp đụng ngay
   * ràng buộc vừa thêm.
   *
   * Đây là dấu hiệu tốt, không phải phiền toái: dọn dẹp trong test đi qua đúng
   * cửa mà mã nguồn thật đi qua, nên nó cũng gặp đúng ràng buộc.
   */
  const { rows: phieu } = await pool.query<{ id: string }>(
    `SELECT DISTINCT l.stock_take_id AS id FROM stock_take_line l
       JOIN part p ON p.id = l.part_id WHERE p.sku LIKE $1`,
    [`PT-KK-${uniq}%`],
  );
  for (const p of phieu) {
    // Về COUNTING chứ không PENDING_APPROVAL: chuyển sang PENDING_APPROVAL sẽ
    // kích `kiem_tra_kiem_ke_du_ly_do` và phiếu nào còn dòng chưa đếm sẽ chặn.
    await pool.query(`UPDATE stock_take SET status = 'COUNTING' WHERE id = $1`, [p.id]);
    await pool.query(`DELETE FROM stock_take_line WHERE stock_take_id = $1`, [p.id]);
    await pool.query(`UPDATE stock_take SET status = 'CANCELLED' WHERE id = $1`, [p.id]);
  }
  await pool.query(
    `DELETE FROM stock_take_line WHERE part_id IN (SELECT id FROM part WHERE sku LIKE $1)`,
    [`PT-KK-${uniq}%`],
  );
  await pool.end();
});

describe('🔒 BC-12 — kiểm kê là lỗ hổng kiểm soát nội bộ lớn nhất', () => {
  test('bài 1: đếm khớp sổ — KHÔNG sinh dòng sổ nào', async () => {
    const pt = await maHangRieng(10);
    const phieu = await moPhieu(pt.nhom);
    assert.equal(phieu.lines.length, 1, 'phiếu PARTIAL phải chỉ có đúng mã hàng của nhóm');
    assert.equal(phieu.lines[0].systemQuantity, 10);

    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 10,
    });
    const gui = await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    assert.equal(gui.status, 201, JSON.stringify(gui.body));
    assert.equal(gui.body.lines[0].variance, 0);

    const duyet = await call(
      'POST',
      `/api/v1/stock-takes/${phieu.id}/approve`,
      { note: 'Khớp sổ' },
      tokenQuanLy,
    );
    assert.equal(duyet.status, 201, JSON.stringify(duyet.body));

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM stock_movement WHERE part_id = $1 AND type = 'ADJUSTMENT'`,
      [pt.id],
    );
    assert.equal(Number(rows[0]!.n), 0, 'khớp sổ mà vẫn sinh chứng từ điều chỉnh');
    assert.equal(await tonKho(pt.id), 10);
  });

  test('bài 2: đếm thiếu — sinh ADJUSTMENT âm, tồn giảm đúng', async () => {
    const pt = await maHangRieng(10);
    const phieu = await moPhieu(pt.nhom);

    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 7,
      reason: 'DAMAGED',
      note: 'Ba cái vỡ do rơi kệ',
    });
    const gui = await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    assert.equal(gui.body.lines[0].variance, -3);
    // Giá trị chênh = 3 × 200.000 — thủ kho có `stock:readCost` nên thấy
    assert.equal(gui.body.totalVarianceValue, 600_000);

    await call(
      'POST',
      `/api/v1/stock-takes/${phieu.id}/approve`,
      { note: 'Xác nhận hư hỏng' },
      tokenQuanLy,
    );

    const { rows } = await pool.query<{ quantity: string; unit_cost: string; ref_type: string }>(
      `SELECT quantity, unit_cost, ref_type FROM stock_movement
        WHERE part_id = $1 AND type = 'ADJUSTMENT'`,
      [pt.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0]!.quantity), -3);
    assert.equal(rows[0]!.ref_type, 'STOCK_TAKE', 'dòng sổ không lần ngược về phiếu kiểm kê được');
    assert.equal(await tonKho(pt.id), 7);
  });

  test('bài 3: có xuất kho TRONG LÚC đếm — không thành chênh lệch giả', async () => {
    /*
     * Đây là bài khó nhất của BC-12 và là chỗ dễ thiết kế sai nhất.
     *
     * Snapshot lúc mở phiếu: 10. Trong lúc thủ kho đi đếm, xưởng xuất 2 cái cho
     * một đơn. Thủ kho đếm được 8 — ĐÚNG. So với tồn sổ lúc mở (10) thì lệch −2
     * và thủ kho phải giải trình một việc chính hệ thống vừa làm.
     */
    const pt = await maHangRieng(10);
    const phieu = await moPhieu(pt.nhom);
    assert.equal(phieu.lines[0].systemQuantity, 10);

    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    const { rows: ro } = await pool.query<{ id: string }>(
      `SELECT id FROM repair_order WHERE tenant_id = $1
        AND status NOT IN ('DELIVERED','CANCELLED') LIMIT 1`,
      [TENANT_A],
    );
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, ref_type, ref_id, created_by_user_id)
       VALUES ($1,$2,$3,'ISSUE',-2,200000,'REPAIR_ORDER',$4,$5)`,
      [TENANT_A, khoId, pt.id, ro[0]!.id, u[0]!.id],
    );

    const r = await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 8,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.lines[0].movementDelta, -2, 'không ghi nhận giao dịch phát sinh');
    assert.equal(
      r.body.lines[0].variance,
      0,
      '🔒 giao dịch trong lúc đếm biến thành chênh lệch GIẢ — thủ kho phải giải trình việc của hệ thống',
    );

    await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {}, tokenQuanLy);
    assert.equal(await tonKho(pt.id), 8, 'không chênh lệch mà tồn vẫn bị đụng');
  });

  test('bài 4: chênh lệch không có lý do — không gửi duyệt được', async () => {
    const pt = await maHangRieng(10);
    const phieu = await moPhieu(pt.nhom);

    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 4,
    });
    const gui = await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    assert.equal(gui.status, 400, JSON.stringify(gui.body));

    // Và cho lý do vào thì gửi được — không có vế này thì chưa chứng minh
    // được chính LÝ DO là thứ đang chặn
    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 4,
      reason: 'THEFT_SUSPECTED',
      note: 'Sáu cái biến mất, không có phiếu xuất nào',
    });
    const lai = await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    assert.equal(lai.status, 201, JSON.stringify(lai.body));

    await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {}, tokenQuanLy);
  });

  test('bài 5: chênh lệch vượt ngưỡng — phiếu tự đánh dấu cần quản lý duyệt', async () => {
    const { rows: t } = await pool.query<{ nguong: string }>(
      'SELECT adjustment_threshold_amount AS nguong FROM tenant WHERE id = $1',
      [TENANT_A],
    );
    const nguong = Number(t[0]!.nguong);

    // Giá vốn đủ lớn để MỘT đơn vị chênh cũng vượt ngưỡng
    const pt = await maHangRieng(10, nguong + 1);
    const phieu = await moPhieu(pt.nhom);
    assert.equal(phieu.needsManagerApproval, false, 'chưa đếm mà đã đòi duyệt');

    const r = await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 9,
      reason: 'COUNT_ERROR_PREVIOUS',
    });
    assert.equal(r.body.needsManagerApproval, true, 'vượt ngưỡng mà không đánh dấu');

    await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);

    // 🔒 Thủ kho KHÔNG duyệt được, dù chính họ đếm
    const tuDuyet = await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {});
    assert.equal(
      tuDuyet.status,
      403,
      '🔒 thủ kho tự duyệt được = kiểm soát nội bộ bằng 0, mọi mất mát đều cân sổ được',
    );

    const duyet = await call(
      'POST',
      `/api/v1/stock-takes/${phieu.id}/approve`,
      { note: 'Đã kiểm tra lại cùng thủ kho' },
      tokenQuanLy,
    );
    assert.equal(duyet.status, 201, JSON.stringify(duyet.body));
    assert.equal(await tonKho(pt.id), 9);
  });

  test('bài 6: đếm ít hơn phần ĐANG GIỮ CHỖ — chặn, và nói rõ đơn nào', async () => {
    const pt = await maHangRieng(10);
    /*
     * 🔒 Chọn đơn và dòng phụ tùng trong MỘT truy vấn.
     *
     * Bản trước chọn đơn trước, rồi tìm dòng PART của đơn đó. Hai bước, và
     * bước hai có thể không tìm thấy gì — đơn được chọn có thể chỉ có dòng
     * công. Khi đó `ql[0]` là undefined và câu INSERT sau ném "null value in
     * column quotation_line_id", một thông báo không nói gì về nguyên nhân.
     *
     * Hỏi thẳng "đơn nào CÓ dòng phụ tùng" thì không có bước hai để hụt.
     */
    const { rows: ql } = await pool.query<{ id: string; ro_id: string; ro_code: string }>(
      `SELECT ql.id, ro.id AS ro_id, ro.code AS ro_code
         FROM quotation_line ql
         JOIN quotation q ON q.id = ql.quotation_id
         JOIN repair_order ro ON ro.id = q.repair_order_id
        WHERE ro.tenant_id = $1 AND ro.status NOT IN ('DELIVERED','CANCELLED')
          AND ql.line_type = 'PART'
        ORDER BY ro.code, ql.seq LIMIT 1`,
      [TENANT_A],
    );
    assert.ok(ql[0], 'seed không còn đơn nào có dòng phụ tùng — bài này cần một cái');
    const ro = [{ id: ql[0].ro_id, code: ql[0].ro_code }];
    await pool.query(
      `INSERT INTO stock_reservation (tenant_id, warehouse_id, part_id, repair_order_id,
                                      quotation_line_id, quantity, expires_at)
       VALUES ($1,$2,$3,$4,$5,8, now() + interval '7 days')`,
      [TENANT_A, khoId, pt.id, ro[0]!.id, ql[0]?.id ?? null],
    );

    const phieu = await moPhieu(pt.nhom);
    assert.equal(phieu.lines[0].reserved, 8, 'màn kiểm kê không hiện phần đang giữ chỗ');

    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 5,
      reason: 'THEFT_SUSPECTED',
    });
    await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);

    const duyet = await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {}, tokenQuanLy);
    assert.equal(duyet.status, 409, JSON.stringify(duyet.body));
    assert.match(duyet.body.error.message, /giữ chỗ/i);
    /*
     * 💡 Thông báo phải KÈM danh sách đơn: BC-12 mục 4 nói rõ đây là chỗ ràng
     * buộc kỹ thuật buộc nghiệp vụ phải rõ ràng. "Không điều chỉnh được" mà
     * không nói đơn nào thì quản lý không quyết định được ai chịu thiệt.
     */
    const donGiu = duyet.body.error.details?.blockingReservations;
    assert.ok(Array.isArray(donGiu) && donGiu.length === 1, 'thiếu danh sách đơn đang giữ chỗ');
    assert.equal(donGiu[0].repairOrderCode, ro[0]!.code);
    assert.equal(donGiu[0].quantity, 8);

    // 🔒 Và tồn KHÔNG bị đụng — cả giao dịch phải rollback
    assert.equal(await tonKho(pt.id), 10);

    // Nhả giữ chỗ rồi thì duyệt được — vế này chứng minh việc chặn là đúng chỗ
    await pool.query(
      `UPDATE stock_reservation SET status = 'RELEASED', released_reason = 'Kiểm kê phát hiện thiếu'
        WHERE part_id = $1 AND status = 'ACTIVE'`,
      [pt.id],
    );
    const lai = await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {}, tokenQuanLy);
    assert.equal(lai.status, 201, JSON.stringify(lai.body));
    assert.equal(await tonKho(pt.id), 5);
  });

  test('bài 8: kiểm kê MỘT PHẦN chỉ chạm mã hàng trong phạm vi', async () => {
    const trong = await maHangRieng(10);
    const ngoai = await maHangRieng(10);

    const phieu = await moPhieu(trong.nhom);
    assert.deepEqual(
      phieu.lines.map((l: { partId: string }) => l.partId),
      [trong.id],
      'kiểm kê một phần kéo theo mã hàng ngoài phạm vi',
    );

    const ngoaiPhamVi = await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: ngoai.id,
      countedQuantity: 0,
    });
    assert.equal(ngoaiPhamVi.status, 404, 'đếm được mã hàng không thuộc phiếu');

    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: trong.id,
      countedQuantity: 9,
      reason: 'OTHER',
      note: 'Một cái để nhầm kệ khác',
    });
    await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {}, tokenQuanLy);

    assert.equal(await tonKho(trong.id), 9);
    assert.equal(await tonKho(ngoai.id), 10, 'mã hàng ngoài phạm vi bị đụng');
  });
});

describe('🔒 Hai người, không phải một', () => {
  test('người đếm KHÔNG tự duyệt được, dù có quyền duyệt', async () => {
    /*
     * Bài này khác bài 5: ở đó thủ kho bị chặn vì THIẾU QUYỀN. Ở đây người mở
     * phiếu là CHỦ XƯỞNG — có thừa quyền duyệt — và vẫn phải bị chặn.
     *
     * Không có bài này thì "hai người" chỉ đúng với những vai không được duyệt,
     * tức là đúng với những người vốn đã không làm được gì.
     */
    const pt = await maHangRieng(10);
    const r = await call(
      'POST',
      '/api/v1/stock-takes',
      { warehouseId: khoId, scope: 'PARTIAL', scopeCategory: pt.nhom },
      tokenChu,
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));

    await call(
      'POST',
      `/api/v1/stock-takes/${r.body.id}/count`,
      { partId: pt.id, countedQuantity: 6, reason: 'DAMAGED' },
      tokenChu,
    );
    await call('POST', `/api/v1/stock-takes/${r.body.id}/submit`, undefined, tokenChu);

    const tuDuyet = await call('POST', `/api/v1/stock-takes/${r.body.id}/approve`, {}, tokenChu);
    assert.equal(tuDuyet.status, 403, JSON.stringify(tuDuyet.body));

    const nguoiKhac = await call(
      'POST',
      `/api/v1/stock-takes/${r.body.id}/approve`,
      { note: 'Quản lý duyệt' },
      tokenQuanLy,
    );
    assert.equal(nguoiKhac.status, 201, JSON.stringify(nguoiKhac.body));
    assert.equal(await tonKho(pt.id), 6);
  });

  test('🔒 duyệt xong thì phiếu đóng băng — không sửa số đếm được nữa', async () => {
    const pt = await maHangRieng(10);
    const phieu = await moPhieu(pt.nhom);
    await call('POST', `/api/v1/stock-takes/${phieu.id}/count`, {
      partId: pt.id,
      countedQuantity: 8,
      reason: 'EXPIRED',
    });
    await call('POST', `/api/v1/stock-takes/${phieu.id}/submit`);
    await call('POST', `/api/v1/stock-takes/${phieu.id}/approve`, {}, tokenQuanLy);

    await assert.rejects(
      () =>
        pool.query(`UPDATE stock_take_line SET counted_quantity = 10 WHERE part_id = $1`, [pt.id]),
      /STOCKTAKE_LOCKED/,
      'sửa được số đếm sau khi duyệt = sửa được căn cứ của một thay đổi tồn kho đã xảy ra',
    );
  });

  test('một kho không mở được hai phiếu kiểm kê cùng lúc', async () => {
    const pt = await maHangRieng(5);
    const phieu = await moPhieu(pt.nhom);

    const hai = await call('POST', '/api/v1/stock-takes', {
      warehouseId: khoId,
      scope: 'PARTIAL',
      scopeCategory: pt.nhom,
    });
    assert.equal(hai.status, 409, JSON.stringify(hai.body));

    await pool.query(`UPDATE stock_take SET status = 'CANCELLED' WHERE id = $1`, [phieu.id]);
  });
});
