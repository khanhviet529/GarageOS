/**
 * 🔒 Hồi quy cho bốn phát hiện còn lại của vòng review Phase 3.
 *
 * F-2 — phân bổ ngược dấu với phiếu thu: chặn ở API bằng Zod, KHÔNG chặn ở
 *       database. "UI không bao giờ tính là enforce" viết lại bằng một chữ khác.
 * F-3 — bảng quyết toán huỷ đơn còn `DRAFT` vẫn thành dòng trên hoá đơn, trong
 *       khi BC-10 đòi khách xác nhận trước.
 * F-4 — gọi nhà cung cấp hoá đơn điện tử BÊN TRONG giao dịch phát hành.
 * F-5 — hoá đơn tổng 0đ kẹt `ISSUED` vĩnh viễn.
 *
 * 💡 Ba trong bốn cái này KHÔNG phải lỗ hổng bảo mật, và chúng vẫn đáng sửa vì
 *    cùng một lý do: mỗi cái tạo ra một trạng thái mà hệ thống không có đường
 *    nào thoát ra — một dòng nợ âm, một hoá đơn thiếu tiền, một chứng từ nằm
 *    mãi trong danh sách chưa thu.
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
let tokenThuNgan = '';
let tokenCoVan = '';
let branchId = '';
let dem = 0;
const uniq = `${Date.now().toString().slice(-5)}${process.pid.toString().slice(-3)}`;

async function call(
  method: string,
  path: string,
  body: unknown,
  token: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

async function dangNhap(phone: string): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { phone, password: 'demo1234' }, '');
  assert.equal(r.status, 201, `không đăng nhập được ${phone}`);
  return r.body.accessToken;
}

interface Canh {
  orderId: string;
  invoiceId: string;
  lineIds: string[];
  customerId: string;
}

/** Hoá đơn với các dòng giá cho trước, ở chi nhánh của thu ngân */
async function hoaDon(gia: number[], phatHanh = true): Promise<Canh> {
  dem += 1;
  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: kh } = await pool.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone)
     VALUES ($1,'INDIVIDUAL',$2,$3) RETURNING id`,
    [TENANT_A, `Khách review ${uniq}${dem}`, `059${uniq}${dem}`],
  );
  const { rows: xe } = await pool.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain)
     VALUES ($1,$2,$3,'ICE') RETURNING id`,
    [TENANT_A, kh[0]!.id, `95R${uniq}${dem}`],
  );
  const { rows: ro } = await pool.query<{ id: string }>(
    `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                               customer_complaint, odometer_in, customer_access_token,
                               created_by_user_id, status)
     VALUES ($1,$2,$3,$4,$5,'Dựng cảnh review',1,$6,$7,'QUALITY_CHECK') RETURNING id`,
    [
      TENANT_A,
      branchId,
      `RO-RV-${uniq}${dem}`,
      kh[0]!.id,
      xe[0]!.id,
      `rv${uniq}${dem}${'x'.repeat(32)}`,
      u[0]!.id,
    ],
  );
  const { rows: hd } = await pool.query<{ id: string }>(
    `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                          created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [TENANT_A, branchId, ro[0]!.id, kh[0]!.id, `INV-RV-${uniq}${dem}`, u[0]!.id],
  );
  const lineIds: string[] = [];
  for (const [i, g] of gia.entries()) {
    const { rows: d } = await pool.query<{ id: string }>(
      `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                 quantity, unit_price, tax_rate_percent)
       VALUES ($1,$2,$3,'PART',$4,1,$5,0) RETURNING id`,
      [TENANT_A, hd[0]!.id, i + 1, `Dòng ${i + 1}`, g],
    );
    lineIds.push(d[0]!.id);
  }
  if (phatHanh) {
    await pool.query(
      `UPDATE invoice SET status = 'ISSUED', issued_at = now(),
                          customer_snapshot = '{}'::jsonb WHERE id = $1`,
      [hd[0]!.id],
    );
  }
  return { orderId: ro[0]!.id, invoiceId: hd[0]!.id, lineIds, customerId: kh[0]!.id };
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  tokenThuNgan = await dangNhap('0901000006');
  tokenCoVan = await dangNhap('0901000003');
  const { rows } = await pool.query<{ id: string }>(
    `SELECT ub.branch_id AS id FROM user_branch ub
       JOIN app_user u ON u.id = ub.user_id
      WHERE u.phone = '0901000006' LIMIT 1`,
  );
  branchId = rows[0]!.id;
});

after(async () => {
  /*
   * Xoá phân bổ và phiếu thu TRONG CÙNG một giao dịch.
   *
   * `trg_phan_bo_khop` là CONSTRAINT TRIGGER hoãn tới cuối giao dịch: xoá phân
   * bổ trước rồi commit thì tổng còn 0 trong khi phiếu thu vẫn ghi 700.000đ, và
   * INV-M-05 chặn — đúng như nó phải làm. Gói chung một giao dịch thì tới lúc
   * kiểm, cả hai đã biến mất.
   */
  const don = await pool.connect();
  try {
    await don.query('BEGIN');
    await don.query(
      `DELETE FROM payment_allocation WHERE payment_id IN
         (SELECT id FROM payment WHERE idempotency_key LIKE $1)`,
      [`rv-${uniq}%`],
    );
    await don.query(`DELETE FROM payment WHERE idempotency_key LIKE $1`, [`rv-${uniq}%`]);
    await don.query('COMMIT');
  } catch {
    await don.query('ROLLBACK');
  } finally {
    don.release();
  }
  await pool.query(`UPDATE invoice SET status = 'DRAFT' WHERE code LIKE $1`, [`INV-RV-${uniq}%`]);
  await pool.query(
    `DELETE FROM e_invoice WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`,
    [`INV-RV-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM invoice_line WHERE invoice_id IN (SELECT id FROM invoice WHERE code LIKE $1)`,
    [`INV-RV-${uniq}%`],
  );
  await pool.query(`DELETE FROM invoice WHERE code LIKE $1`, [`INV-RV-${uniq}%`]);
  /*
   * Mở khoá bảng quyết toán trước khi xoá dòng — `trg_settlement_line_khoa`
   * chặn cả DELETE trên bảng đã CONFIRMED, kể cả kết nối quản trị.
   */
  await pool.query(
    `UPDATE cancellation_settlement SET status = 'DRAFT' WHERE repair_order_id IN
       (SELECT id FROM repair_order WHERE code LIKE $1)`,
    [`RO-RV-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM cancellation_settlement_line WHERE settlement_id IN
       (SELECT s.id FROM cancellation_settlement s JOIN repair_order ro ON ro.id = s.repair_order_id
         WHERE ro.code LIKE $1)`,
    [`RO-RV-${uniq}%`],
  );
  await pool.query(
    `DELETE FROM cancellation_settlement WHERE repair_order_id IN
       (SELECT id FROM repair_order WHERE code LIKE $1)`,
    [`RO-RV-${uniq}%`],
  );
  await pool.query(`DELETE FROM repair_order WHERE code LIKE $1`, [`RO-RV-${uniq}%`]);
  await pool.query(
    `DELETE FROM vehicle_ownership WHERE vehicle_id IN
       (SELECT id FROM vehicle WHERE plate_number LIKE $1)`,
    [`95R${uniq}%`],
  );
  await pool.query(`DELETE FROM vehicle WHERE plate_number LIKE $1`, [`95R${uniq}%`]);
  await pool.query(`DELETE FROM customer WHERE phone LIKE $1`, [`059${uniq}%`]);
  await pool.end();
});

describe('🔒 F-2 — phân bổ phải cùng dấu với phiếu thu, chặn ở DATABASE', () => {
  test('cặp +2tr / −1tr trên một phiếu thu 1tr bị chặn ở tầng thấp nhất', async () => {
    /*
     * Tổng phân bổ vẫn khớp 1.000.000 nên INV-M-05 cho qua. Nhưng dòng thứ hai
     * tụt xuống "đã thu âm", công nợ khách tăng lên từ hư không, và không có gì
     * báo động.
     *
     * Zod chặn ở API — nhưng đó là UI-không-bao-giờ-tính-là-enforce viết lại
     * bằng chữ khác. Bài này đi THẲNG vào database, đường mà một script bảo trì
     * sẽ đi.
     */
    const c = await hoaDon([5_000_000, 1_000_000]);
    const { rows: u } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );

    await assert.rejects(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: pm } = await client.query<{ id: string }>(
          `INSERT INTO payment (tenant_id, branch_id, customer_id, amount, method,
                                idempotency_key, received_by_user_id)
           VALUES ($1,$2,$3,1000000,'CASH',$4,$5) RETURNING id`,
          [TENANT_A, branchId, c.customerId, `rv-${uniq}-am`, u[0]!.id],
        );
        await client.query(
          `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_line_id, amount)
           VALUES ($1,$2,$3,2000000)`,
          [TENANT_A, pm[0]!.id, c.lineIds[0]],
        );
        await client.query(
          `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_line_id, amount)
           VALUES ($1,$2,$3,-1000000)`,
          [TENANT_A, pm[0]!.id, c.lineIds[1]],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      /*
       * Nhận CẢ HAI thông báo, và đó không phải sự dễ dãi.
       *
       * Hai trigger cùng canh chỗ này: `trg_phan_bo_cung_dau` (ngược dấu với
       * phiếu thu) và `kiem_tra_khong_thu_qua` (tổng đã thu của dòng xuống dưới
       * 0). Cái nào bắn trước phụ thuộc DỮ LIỆU — nếu dòng đã có tiền thu trước
       * đó thì phân bổ âm chưa kéo tổng xuống dưới 0, và chỉ kiểm tra dấu bắt
       * được. Ép một thông báo cụ thể là ép một trật tự mà dữ liệu quyết định.
       */
    }, /ALLOCATION_SIGN|NEGATIVE_COLLECTED/);
  });

  test('chứng từ đảo (âm) vẫn phân bổ âm được — không chặn nhầm', async () => {
    /*
     * ĐỐI CHỨNG. Nếu chỉ cấm số âm thì chứng từ đảo — cách DUY NHẤT sửa một
     * khoản thu ghi nhầm — cũng không ghi được, và cả nguyên tắc "chứng từ tài
     * chính bất biến" sụp theo.
     */
    const c = await hoaDon([700_000]);
    const tra = await call(
      'POST',
      '/api/v1/payments',
      {
        customerId: c.customerId,
        amount: 700_000,
        method: 'CASH',
        idempotencyKey: `rv-${uniq}-goc`,
        allocations: [{ invoiceLineId: c.lineIds[0], amount: 700_000 }],
      },
      tokenThuNgan,
    );
    assert.equal(tra.status, 201, JSON.stringify(tra.body));

    const dao = await call(
      'POST',
      `/api/v1/payments/${tra.body.id}/reverse`,
      { reason: 'Thu nhầm của khách khác', idempotencyKey: `rv-${uniq}-dao` },
      tokenThuNgan,
    );
    assert.equal(dao.status, 201, JSON.stringify(dao.body));
    assert.equal(dao.body.amount, -700_000);

    const { rows } = await pool.query<{ t: string }>(
      `SELECT COALESCE(sum(amount), 0) AS t FROM payment_allocation WHERE invoice_line_id = $1`,
      [c.lineIds[0]],
    );
    assert.equal(Number(rows[0]!.t), 0, 'đảo xong mà dòng vẫn còn số đã thu');
  });
});

describe('🔒 F-3 — quyết toán huỷ đơn phải được khách CHỐT trước', () => {
  async function quyetToan(orderId: string, trangThai: string): Promise<void> {
    const { rows: u } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    await pool.query(
      `UPDATE repair_order SET status = 'CANCELLED', cancel_reason = 'Dựng cảnh review',
              cancel_category = 'CUSTOMER_REQUEST', cancelled_at = now()
        WHERE id = $1`,
      [orderId],
    );
    const { rows: s } = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_settlement (tenant_id, repair_order_id, chinh_sach_cong,
                                            thu_cong_chan_doan, settled_by_user_id)
       VALUES ($1,$2,'ACTUAL_HOURS',true,$3) RETURNING id`,
      [TENANT_A, orderId, u[0]!.id],
    );
    await pool.query(
      `INSERT INTO cancellation_settlement_line (tenant_id, settlement_id, seq, nguon,
                                                 description, unit_price, amount)
       VALUES ($1,$2,1,'LABOR','Công đã làm dở',450000,450000)`,
      [TENANT_A, s[0]!.id],
    );
    if (trangThai !== 'DRAFT') {
      await pool.query(
        `UPDATE cancellation_settlement SET status = $2, confirmed_at = now() WHERE id = $1`,
        [s[0]!.id, trangThai],
      );
    }
  }

  test('quyết toán còn DRAFT: không lên hoá đơn, VÀ không phát hành được', async () => {
    const c = await hoaDon([1_000_000], false);
    await quyetToan(c.orderId, 'DRAFT');

    const nhap = await call(
      'POST',
      '/api/v1/invoices',
      { repairOrderId: c.orderId },
      tokenCoVan,
    );
    assert.equal(nhap.status, 201, JSON.stringify(nhap.body));

    const coDongQt = (nhap.body.lines as { description: string }[]).some((l) =>
      l.description.includes('Quyết toán'),
    );
    assert.equal(coDongQt, false, 'khoản khách CHƯA đồng ý đã thành dòng tiền trên hoá đơn');

    /*
     * Và không phát hành được. Lọc dòng ra mới giải quyết một nửa: hoá đơn sẽ
     * THIẾU một khoản khách thật sự nợ, và không ai biết. Chặn ở đây là nửa còn
     * lại — nói thẳng rằng còn một bước chưa xong.
     */
    const ph = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Dựng cảnh review quyết toán' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 409, JSON.stringify(ph.body));
    assert.match(ph.body.error.message, /chưa xác nhận|quyết toán/i);
  });

  test('quyết toán đã CHỐT: lên hoá đơn và phát hành được', async () => {
    const c = await hoaDon([1_000_000], false);
    await quyetToan(c.orderId, 'CONFIRMED');

    const nhap = await call(
      'POST',
      '/api/v1/invoices',
      { repairOrderId: c.orderId },
      tokenCoVan,
    );
    assert.equal(nhap.status, 201, JSON.stringify(nhap.body));
    assert.ok(
      (nhap.body.lines as { description: string }[]).some((l) =>
        l.description.includes('Quyết toán'),
      ),
      'khoản khách ĐÃ đồng ý lại không có trên hoá đơn',
    );

    const ph = await call(
      'POST',
      `/api/v1/invoices/${nhap.body.id}/issue`,
      { varianceReason: 'Dựng cảnh review quyết toán đã chốt' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 201, JSON.stringify(ph.body));
  });
});

describe('🔒 F-5 — hoá đơn tổng 0đ không kẹt ở ISSUED', () => {
  test('đơn toàn hạng mục bảo hành: phát hành xong là PAID', async () => {
    /*
     * Xảy ra thật với đơn bảo hành: mọi dòng 0đ (INV-M-06), tổng 0đ, và chứng
     * từ vẫn phải phát hành để khách có giấy.
     *
     * Trigger cập nhật trạng thái chỉ chạy khi có phân bổ thanh toán — mà không
     * ai thu 0đ được. Để `ISSUED` thì nó nằm mãi trong danh sách chưa thu.
     */
    const c = await hoaDon([0], false);
    const ph = await call(
      'POST',
      `/api/v1/invoices/${c.invoiceId}/issue`,
      { varianceReason: 'Đơn bảo hành, không thu tiền khách' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 201, JSON.stringify(ph.body));
    assert.equal(ph.body.totalAmount, 0);
    assert.equal(ph.body.status, 'PAID', 'hoá đơn 0đ kẹt ở ISSUED — không đường nào ra');

    // Và nó KHÔNG nằm trong công nợ
    const no = await call('GET', '/api/v1/reports/debt', undefined, tokenThuNgan);
    assert.ok(
      !(no.body as { customerId: string }[]).some((d) => d.customerId === c.customerId),
      'hoá đơn 0đ vẫn hiện trong báo cáo công nợ',
    );
  });
});

describe('🔒 F-4 — gọi nhà cung cấp hoá đơn điện tử NGOÀI giao dịch', () => {
  test('lỗi nhà cung cấp không làm hỏng việc phát hành, và có bản ghi để thử lại', async () => {
    /*
     * Bản mock trả lỗi khi mã hoá đơn chứa "LOI" — điều khiển bằng dữ liệu chứ
     * không bằng ngẫu nhiên.
     *
     * Điều bài này kiểm KHÔNG chỉ là "không ném ngoại lệ" (đã có ở
     * hoa-don.spec.ts), mà là hoá đơn vẫn ISSUED **và** bản ghi HĐĐT tồn tại —
     * tức là lời gọi mạng đã chạy xong SAU khi giao dịch phát hành commit,
     * không phải bên trong nó.
     */
    const c = await hoaDon([500_000], false);
    await pool.query(`UPDATE invoice SET code = code || '-LOI' WHERE id = $1`, [c.invoiceId]);

    const ph = await call(
      'POST',
      `/api/v1/invoices/${c.invoiceId}/issue`,
      { varianceReason: 'Dựng cảnh review hoá đơn điện tử lỗi' },
      tokenThuNgan,
    );
    assert.equal(ph.status, 201, JSON.stringify(ph.body));
    assert.equal(ph.body.status, 'ISSUED');

    const { rows } = await pool.query<{ status: string; attempt_count: number }>(
      `SELECT status::text AS status, attempt_count FROM e_invoice WHERE invoice_id = $1`,
      [c.invoiceId],
    );
    assert.equal(rows[0]?.status, 'FAILED', 'không có bản ghi HĐĐT — lời gọi ngoài giao dịch bị mất');

    const lai = await call(
      'POST',
      `/api/v1/invoices/${c.invoiceId}/e-invoice/retry`,
      undefined,
      tokenThuNgan,
    );
    assert.equal(lai.status, 201, JSON.stringify(lai.body));
    const { rows: sau } = await pool.query<{ attempt_count: number }>(
      `SELECT attempt_count FROM e_invoice WHERE invoice_id = $1`,
      [c.invoiceId],
    );
    assert.equal(sau[0]!.attempt_count, 2, 'gửi lại không tăng số lần thử');
  });

  test('🔒 mã nguồn: không hàm nào vừa giữ giao dịch vừa gọi mạng', async () => {
    /*
     * Hàng rào ở tầng MÃ NGUỒN, không phải hành vi.
     *
     * Với adapter giả lập, một lời gọi treo 30 giây không bao giờ xảy ra — nên
     * không bài kiểm hành vi nào bắt được lỗi này. Nhưng nó là lỗi thật với nhà
     * cung cấp thật, và cách duy nhất giữ cho nó không quay lại là đối chiếu
     * chính cấu trúc mã.
     *
     * Quy tắc: hàm gọi nhà cung cấp (`goiNhaCungCap`) KHÔNG nhận `tx`.
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // `process.cwd()` là `apps/api` khi chạy test — cùng cách các bài khác dùng
    const src = readFileSync(join(process.cwd(), 'src/invoice/einvoice.ts'), 'utf8');

    const chuKy = (ten: string): string => {
      const m = new RegExp(`export async function ${ten}\\(([\\s\\S]{0,300}?)\\):`).exec(src);
      assert.ok(m, `không tìm thấy hàm ${ten}`);
      return m[1]!;
    };

    /*
     * Bất biến kiểm được: hàm nào chạm MẠNG thì không nhận `PoolClient`, và hàm
     * nào chạm DATABASE thì có nhận. Kiến trúc nằm ngay trong chữ ký.
     *
     * Bản đầu của bài này thử một cách khác — regex tìm `goiNhaCungCap` nằm
     * trong vòng 4000 ký tự sau `withTenant(` — và nó ĐỎ trên mã nguồn đã đúng.
     * Biểu thức chính quy không phân biệt được "nằm trong lời gọi" với "nằm sau
     * lời gọi"; nó chỉ biết khoảng cách. Một bài kiểm nói sai về điều nó đo còn
     * tệ hơn không có bài kiểm, vì nó bắt người ta sửa mã đang đúng.
     */
    assert.ok(
      !/PoolClient/.test(chuKy('goiNhaCungCap')),
      '🔒 hàm gọi mạng nhận PoolClient — nó giữ khoá database trong lúc chờ nhà cung cấp',
    );
    assert.ok(
      /PoolClient/.test(chuKy('docYeuCauHoaDonDienTu')),
      'hàm đọc dữ liệu phải nhận PoolClient',
    );
    assert.ok(
      /PoolClient/.test(chuKy('ghiKetQuaHoaDonDienTu')),
      'hàm ghi kết quả phải nhận PoolClient',
    );
  });
});
