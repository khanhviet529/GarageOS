/**
 * 🔒 Kiểm chứng ba phát hiện của Codex — vòng review Phase 3.
 *
 * Ba phát hiện đều là **lời khẳng định về hành vi đồng thời hoặc về phạm vi**,
 * và cả ba đều test được. Theo luật L3 của quy trình review: hai LLM đồng ý
 * nhau không chứng minh được gì, một test đỏ thì có.
 *
 *   BRANCH-001   thu tiền trộn dòng hoá đơn của hai chi nhánh
 *   PAYMENT-001  hai khoản thu đồng thời cùng phân bổ hết một dòng
 *   STOCKTAKE-001 hai phiếu kiểm kê mở đồng thời trên một kho
 *
 * 💡 Ba bài này được GIỮ LẠI dù kết quả nghiêng về bên nào. Nếu Codex đúng,
 *    chúng là test hồi quy. Nếu Codex sai, chúng là bằng chứng vì sao — và
 *    ngăn người sau "sửa" lại thành sai.
 *
 * ⚠️ Test đồng thời phải bắn `Promise.allSettled` THẬT song song, mỗi lời gọi
 *    một kết nối riêng. Gọi tuần tự thì lỗi đua không bao giờ lộ ra, và bài
 *    test xanh trở thành lời nói dối.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const NHAN = `CDX2${Date.now().toString().slice(-8)}${process.pid.toString().slice(-3)}`;

let pool: Pool;
let tokenThuNgan = '';
let tokenThuKho = '';

async function dangNhap(phone: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
    body: JSON.stringify({ phone, password: 'demo1234' }),
  });
  const j = (await res.json()) as { accessToken?: string };
  assert.ok(j.accessToken, `không đăng nhập được ${phone}`);
  return j.accessToken;
}

async function goi(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

/** Một hoá đơn ĐÃ PHÁT HÀNH ở chi nhánh chỉ định, trả về id dòng duy nhất */
async function hoaDonMotDong(
  branchCode: string,
  customerId: string,
  orderCode: string,
  tien: number,
): Promise<{ invoiceId: string; lineId: string }> {
  const { rows: b } = await pool.query<{ id: string }>(
    `SELECT id FROM branch WHERE tenant_id = $1 AND code = $2`,
    [TENANT_A, branchCode],
  );
  assert.ok(b[0], `seed thiếu chi nhánh ${branchCode}`);
  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: xe } = await pool.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain)
     VALUES ($1,$2,$3,'ICE') RETURNING id`,
    [TENANT_A, customerId, `${orderCode}X`],
  );
  const { rows: ro } = await pool.query<{ id: string }>(
    `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                               customer_complaint, odometer_in, customer_access_token,
                               created_by_user_id, status, odometer_out, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,1000,$7,$8,'DELIVERED',1010, now())
     RETURNING id`,
    [
      TENANT_A,
      b[0].id,
      orderCode,
      customerId,
      xe[0]!.id,
      `Than phien ${orderCode}`,
      `tok${orderCode}${'y'.repeat(32)}`,
      u[0]!.id,
    ],
  );
  const { rows: hd } = await pool.query<{ id: string }>(
    `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                          created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [TENANT_A, b[0].id, ro[0]!.id, customerId, `INV-${orderCode}`, u[0]!.id],
  );
  const { rows: dong } = await pool.query<{ id: string }>(
    `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                               quantity, unit_price, tax_rate_percent)
     VALUES ($1,$2,1,'PART',$3,1,$4,0) RETURNING id`,
    [TENANT_A, hd[0]!.id, `Dong ${orderCode}`, tien],
  );
  await pool.query(
    `UPDATE invoice SET status = 'ISSUED', issued_at = now(),
                        customer_snapshot = jsonb_build_object('displayName', $2::text)
      WHERE id = $1`,
    [hd[0]!.id, `Khach ${NHAN}`],
  );
  return { invoiceId: hd[0]!.id, lineId: dong[0]!.id };
}

describe('🔒 Kiểm chứng ba phát hiện của Codex — Phase 3', () => {
  const rac: { customerId?: string; lineIds: string[]; invoiceIds: string[] } = {
    lineIds: [],
    invoiceIds: [],
  };

  before(async () => {
    pool = new Pool({ connectionString: ADMIN_URL, max: 20 });
    tokenThuNgan = await dangNhap('0901000006');
    tokenThuKho = await dangNhap('0901000005');

    const { rows: kh } = await pool.query<{ id: string }>(
      `INSERT INTO customer (tenant_id, type, display_name, phone)
       VALUES ($1,'INDIVIDUAL',$2,$3) RETURNING id`,
      [TENANT_A, `Khach ${NHAN}`, `0355${NHAN.slice(-6)}`],
    );
    rac.customerId = kh[0]!.id;
  });

  after(async () => {
    /*
     * Dọn theo đúng thứ tự mà các bất biến CHO PHÉP: phân bổ và phiếu thu phải
     * xoá trong CÙNG một giao dịch (INV-M-05 hoãn tới cuối giao dịch), và hoá
     * đơn phải trở về DRAFT trước khi đụng vào dòng (INV-M-03).
     */
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `DELETE FROM payment_allocation WHERE payment_id IN
           (SELECT id FROM payment WHERE idempotency_key LIKE $1)`,
        [`%${NHAN}%`],
      );
      await c.query(`DELETE FROM payment WHERE idempotency_key LIKE $1`, [`%${NHAN}%`]);
      await c.query('COMMIT');
    } catch {
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    await pool.query(`UPDATE invoice SET status = 'DRAFT' WHERE code LIKE $1`, [`INV-%${NHAN}%`]);
    await pool.query(
      `DELETE FROM invoice_line WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`,
      [`INV-%${NHAN}%`],
    );
    await pool.query(`DELETE FROM invoice WHERE code LIKE $1`, [`INV-%${NHAN}%`]);
    await pool.query(
      `DELETE FROM stock_take_line WHERE stock_take_id IN
         (SELECT id FROM stock_take WHERE started_by_user_id IN
            (SELECT id FROM app_user WHERE phone = '0901000005') AND created_at > now() - interval '10 minute')`,
    );
    await pool.query(
      `DELETE FROM stock_take WHERE started_by_user_id IN
         (SELECT id FROM app_user WHERE phone = '0901000005')
         AND created_at > now() - interval '10 minute'`,
    );
    await pool.query(`DELETE FROM repair_order WHERE code LIKE $1`, [`%${NHAN}%`]);
    await pool.query(`DELETE FROM vehicle WHERE plate_number LIKE $1`, [`%${NHAN}%`]);
    await pool.query(`DELETE FROM customer WHERE display_name = $1`, [`Khach ${NHAN}`]);
    await pool.end();
  });

  test('BRANCH-001: khoản thu trộn dòng của chi nhánh khác phải bị chặn HOÀN TOÀN', async () => {
    /*
     * Codex: query đếm ở `payment.service.ts` chạy trên TOÀN tenant, trong khi
     * query lấy hoá đơn đã lọc theo chi nhánh. Nên một payload trộn một dòng
     * HN01 với một dòng HCM01 đi lọt: `hd.length !== 0` (thấy dòng HN01) và số
     * đếm cũng khớp (đếm cả hai) — rồi allocation được ghi cho CẢ HAI.
     *
     * Cùng một khách cho cả hai hoá đơn, để bài này kiểm ĐÚNG cái nó định kiểm.
     * Khác khách thì `khacKhach` chặn trước và ta không biết được phạm vi chi
     * nhánh có làm việc hay không.
     */
    const hn = await hoaDonMotDong('HN01', rac.customerId!, `RO-HN-${NHAN}`, 1_000_000);
    const hcm = await hoaDonMotDong('HCM01', rac.customerId!, `RO-HCM-${NHAN}`, 1_000_000);
    rac.lineIds.push(hn.lineId, hcm.lineId);

    const r = await goi('POST', '/api/v1/payments', tokenThuNgan, {
      customerId: rac.customerId,
      amount: 2_000_000,
      method: 'CASH',
      idempotencyKey: `mix-${NHAN}`,
      allocations: [
        { invoiceLineId: hn.lineId, amount: 1_000_000 },
        { invoiceLineId: hcm.lineId, amount: 1_000_000 },
      ],
    });

    // Bằng chứng quyết định: dòng của chi nhánh khác có nhận tiền hay không
    const { rows: da } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM payment_allocation WHERE invoice_line_id = $1`,
      [hcm.lineId],
    );
    assert.equal(
      Number(da[0]!.n),
      0,
      `thu ngân HN01 vừa phân bổ tiền vào dòng hoá đơn HCM01 — HTTP ${r.status}`,
    );
    assert.ok(r.status >= 400, `phải từ chối, nhưng trả ${r.status}`);
  });

  test('PAYMENT-001: hai khoản thu đồng thời không được cùng thu hết một dòng', async () => {
    /*
     * Codex: `kiem_tra_khong_thu_qua()` cộng tổng phân bổ nhưng không khoá dòng,
     * nên hai giao dịch song song mỗi cái chỉ thấy phân bổ của chính mình.
     *
     * Phản biện của tôi: trigger `trg_hoa_don_theo_tien` chạy TRƯỚC (thứ tự
     * chữ cái: hoa_don < khong_thu) và nó `UPDATE invoice` — tức là giành khoá
     * dòng hoá đơn. Giao dịch thứ hai bị chặn ở đó tới khi cái đầu commit, rồi
     * mới cộng tổng, và lúc đó nó thấy cả hai.
     *
     * Cả hai đều chỉ là lập luận. Bài này phân xử.
     */
    const hn = await hoaDonMotDong('HN01', rac.customerId!, `RO-RACE-${NHAN}`, 500_000);
    rac.lineIds.push(hn.lineId);

    const banRa = (i: number) =>
      goi('POST', '/api/v1/payments', tokenThuNgan, {
        customerId: rac.customerId,
        amount: 500_000,
        method: 'CASH',
        idempotencyKey: `race-${NHAN}-${i}`,
        allocations: [{ invoiceLineId: hn.lineId, amount: 500_000 }],
      });

    const kq = await Promise.allSettled([banRa(1), banRa(2)]);
    const thanhCong = kq.filter(
      (r) => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300,
    );

    const { rows: tong } = await pool.query<{ s: string }>(
      `SELECT COALESCE(sum(amount), 0) AS s FROM payment_allocation WHERE invoice_line_id = $1`,
      [hn.lineId],
    );
    assert.equal(
      Number(tong[0]!.s),
      500_000,
      `dòng trị giá 500.000 nhưng đã phân bổ ${tong[0]!.s} — thu quá (${thanhCong.length}/2 request thành công)`,
    );
    assert.equal(thanhCong.length, 1, `phải đúng 1 request thành công, có ${thanhCong.length}`);
  });

  test('STOCKTAKE-001: hai phiếu kiểm kê đồng thời trên một kho — chỉ một cái được', async () => {
    /*
     * Codex: `create()` kiểm "kho này có phiếu nào đang mở không" rồi mới INSERT,
     * và không có ràng buộc DB nào chặn. Hai request song song cùng thấy trống,
     * cùng ghi — hai snapshot của cùng một kệ hàng, hai bộ điều chỉnh.
     *
     * 🔒 Đây là nguyên tắc số 1 của CLAUDE.md: bất biến enforce ở tầng thấp
     *    nhất có thể. Kiểm ở service rồi INSERT là kiểm ở tầng KHÔNG enforce
     *    được — giữa hai câu lệnh luôn có một khe hở.
     */
    const { rows: w } = await pool.query<{ id: string }>(
      `SELECT w.id FROM warehouse w
         JOIN branch b ON b.id = w.branch_id
        WHERE w.tenant_id = $1 AND b.code = 'HN01'
          AND NOT EXISTS (SELECT 1 FROM stock_take s
                           WHERE s.warehouse_id = w.id
                             AND s.status IN ('DRAFT','COUNTING','PENDING_APPROVAL'))
        LIMIT 1`,
      [TENANT_A],
    );
    assert.ok(w[0], 'không tìm được kho HN01 rảnh — bài này mất ý nghĩa');

    const tao = () =>
      goi('POST', '/api/v1/stock-takes', tokenThuKho, {
        warehouseId: w[0]!.id,
        scope: 'FULL',
      });

    const kq = await Promise.allSettled([tao(), tao()]);
    const thanhCong = kq.filter(
      (r) => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300,
    );

    const { rows: dang } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM stock_take
        WHERE warehouse_id = $1 AND status IN ('DRAFT','COUNTING','PENDING_APPROVAL')`,
      [w[0]!.id],
    );
    assert.equal(
      Number(dang[0]!.n),
      1,
      `kho có ${dang[0]!.n} phiếu kiểm kê đang mở cùng lúc — hai snapshot, hai bộ điều chỉnh`,
    );
    assert.equal(thanhCong.length, 1, `phải đúng 1 request thành công, có ${thanhCong.length}`);
  });
});
