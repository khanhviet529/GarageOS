/**
 * Phase 2.1 — kho (BC-04).
 *
 * 🔒 `CLAUDE.md` bắt buộc gọi `assertLedgerMatchesBalance()` sau MỌI kịch bản
 * chạm kho. Ở đây nó chạy trong `afterEach` chứ không để từng test tự nhớ gọi
 * — quy tắc mà người viết phải nhớ là quy tắc sẽ bị quên ở test thứ hai mươi.
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
let token = '';

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
 * 🔒 INV-S-02 — bảng tổng hợp phải khớp sổ, tới từng đơn vị.
 *
 * Đây là bài kiểm tra bắt bug THẦM LẶNG: nếu có ai thêm một đường ghi kho mới
 * mà quên cập nhật tồn, không tính năng nào hỏng và không test chức năng nào
 * đỏ — chỉ truy vấn này đỏ.
 *
 * Quét TOÀN BỘ tenant, không chỉ dòng mà test vừa chạm. Chỉ kiểm phần mình vừa
 * ghi thì bỏ sót đúng thứ cần bắt: một trigger sai làm hỏng dòng KHÁC.
 */
async function assertLedgerMatchesBalance(): Promise<void> {
  const { rows } = await pool.query<{
    warehouse_id: string;
    part_id: string;
    on_hand: string;
    ledger: string;
  }>(
    `SELECT b.warehouse_id, b.part_id, b.on_hand, COALESCE(SUM(m.quantity), 0) AS ledger
       FROM stock_balance b
       LEFT JOIN stock_movement m
         ON m.tenant_id = b.tenant_id
        AND m.warehouse_id = b.warehouse_id
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

async function khoMacDinh(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT w.id FROM warehouse w JOIN branch b ON b.id = w.branch_id
      WHERE w.tenant_id = $1 AND b.code = 'HN01'`,
    [TENANT_A],
  );
  return rows[0]!.id;
}

async function phuTung(sku: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM part WHERE tenant_id = $1 AND sku = $2',
    [TENANT_A, sku],
  );
  return rows[0]!.id;
}

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  token = await dangNhap('0901000005'); // thủ kho
});

after(async () => {
  await pool.end();
});

afterEach(assertLedgerMatchesBalance);

describe('Nhập kho', () => {
  test('nhập làm tăng tồn và tính lại bình quân gia quyền', async () => {
    const kho = await khoMacDinh();
    const part = await phuTung('PT-FILTER-OIL');

    const truoc = await pool.query<{ on_hand: string; avg_cost: string }>(
      'SELECT on_hand, avg_cost FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
      [kho, part],
    );
    const tonCu = Number(truoc.rows[0]!.on_hand);
    const giaCu = Number(truoc.rows[0]!.avg_cost);

    const r = await call('POST', '/api/v1/stock/receipts', {
      warehouseId: kho,
      partId: part,
      quantity: 10,
      unitCost: 150_000,
      reference: 'HD-2026-001',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.onHand, tonCu + 10);

    // Bình quân gia quyền, làm tròn về đồng — cùng công thức với trigger
    const mongDoi = Math.round((tonCu * giaCu + 10 * 150_000) / (tonCu + 10));
    assert.equal(r.body.avgCost, mongDoi, 'giá vốn bình quân sai');
  });

  test('🔒 tồn đầu kỳ và mọi lần nhập đều để lại dòng sổ', async () => {
    // Không có dòng sổ thì không giải thích được tồn đến từ đâu, và bảng đối
    // soát mất luôn ý nghĩa. `stock_balance` không nhận INSERT từ ứng dụng nên
    // điều này không thể sai — test ở đây để nếu ai đó cấp lại quyền thì đỏ.
    const kho = await khoMacDinh();
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM stock_balance b
        WHERE b.warehouse_id = $1
          AND NOT EXISTS (SELECT 1 FROM stock_movement m
                           WHERE m.warehouse_id = b.warehouse_id AND m.part_id = b.part_id)`,
      [kho],
    );
    assert.equal(Number(rows[0]!.n), 0, 'có dòng tồn không có chứng từ nào đối ứng');
  });

  test('nhập số lượng lẻ 2 chữ số thập phân được chấp nhận', async () => {
    const r = await call('POST', '/api/v1/stock/receipts', {
      warehouseId: await khoMacDinh(),
      partId: await phuTung('PT-OIL-5W30'),
      quantity: 4.75,
      unitCost: 130_000,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test('nhập số lượng 3 chữ số thập phân bị từ chối, không làm tròn thầm lặng', async () => {
    // Cột là numeric(12,2). Không chặn ở contract thì database lặng lẽ làm tròn
    // 1,005 thành 1,01 và người nhập không hề biết tồn của mình bị đổi.
    const r = await call('POST', '/api/v1/stock/receipts', {
      warehouseId: await khoMacDinh(),
      partId: await phuTung('PT-OIL-5W30'),
      quantity: 1.005,
      unitCost: 130_000,
    });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  test('nhập số lượng 0 hoặc âm bị từ chối', async () => {
    const kho = await khoMacDinh();
    const part = await phuTung('PT-OIL-5W30');
    for (const quantity of [0, -5]) {
      const r = await call('POST', '/api/v1/stock/receipts', {
        warehouseId: kho, partId: part, quantity, unitCost: 100_000,
      });
      assert.equal(r.status, 400, `số lượng ${quantity} lọt qua`);
    }
  });
});

describe('🔒 Bất biến kho', () => {
  test('INV-S-01: điều chỉnh âm quá tồn bị chặn, tồn không đổi', async () => {
    const kho = await khoMacDinh();
    const part = await phuTung('PT-HV-MODULE');
    const quanLy = token;
    token = await dangNhap('0901000002'); // quản lý chi nhánh — vai được điều chỉnh
    try {
      const truoc = await pool.query<{ on_hand: string }>(
        'SELECT on_hand FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      const ton = Number(truoc.rows[0]!.on_hand);

      const r = await call('POST', '/api/v1/stock/adjustments', {
        warehouseId: kho,
        partId: part,
        delta: -(ton + 1),
        reason: 'Thử rút quá tồn',
      });
      assert.equal(r.status, 409, `rút quá tồn mà vẫn qua: ${JSON.stringify(r.body)}`);
      // Thông báo phải đọc được, không phải tên ràng buộc của Postgres
      assert.match(r.body.error.message, /Không đủ hàng/);

      const sau = await pool.query<{ on_hand: string }>(
        'SELECT on_hand FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      assert.equal(Number(sau.rows[0]!.on_hand), ton, 'tồn đổi dù giao dịch phải rollback');
    } finally {
      token = quanLy;
    }
  });

  test('INV-S-03: sổ kho chỉ-thêm — vai ứng dụng không sửa, không xoá được', async () => {
    /*
     * Kiểm bằng chính role của ứng dụng, không phải role migration. Thử bằng
     * role quản trị sẽ luôn thành công và test thành vô nghĩa — đây đúng là
     * loại nhầm lẫn mà `docs/14` cảnh báo: superuser bỏ qua cả RLS lẫn GRANT.
     */
    const app = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos',
    });
    try {
      const { rows } = await pool.query<{ id: string }>(
        'SELECT id FROM stock_movement LIMIT 1',
      );
      const id = rows[0]!.id;
      await app.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A]);

      await assert.rejects(
        () => app.query('UPDATE stock_movement SET quantity = 999 WHERE id = $1', [id]),
        /permission denied/i,
        'sửa được dòng sổ -> sửa sai không cần chứng từ đảo',
      );
      await assert.rejects(
        () => app.query('DELETE FROM stock_movement WHERE id = $1', [id]),
        /permission denied/i,
        'xoá được dòng sổ -> lịch sử kho biến mất không dấu vết',
      );
    } finally {
      await app.end();
    }
  });

  test('🔒 stock_balance không ghi thẳng được — mọi thay đổi phải qua sổ', async () => {
    const app = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos',
    });
    try {
      await app.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A]);
      await assert.rejects(
        () => app.query('UPDATE stock_balance SET on_hand = on_hand + 100'),
        /permission denied/i,
        'nâng được tồn mà không có chứng từ -> INV-S-02 vô nghĩa',
      );
      // INSERT cũng phải bị chặn: `ALTER DEFAULT PRIVILEGES` ở 0003 tự cấp
      // INSERT cho mọi bảng mới, nên đây là quyền không ai gõ ra mà vẫn có.
      await assert.rejects(
        () =>
          app.query(
            `INSERT INTO stock_balance (tenant_id, warehouse_id, part_id, on_hand)
             SELECT $1, w.id, p.id, 500 FROM warehouse w, part p
              WHERE w.tenant_id = $1 AND p.tenant_id = $1 LIMIT 1`,
            [TENANT_A],
          ),
        /permission denied/i,
        'dựng được dòng tồn từ hư không',
      );
    } finally {
      await app.end();
    }
  });

  test('điều chỉnh không lý do bị từ chối ở cả hai tầng', async () => {
    const kho = await khoMacDinh();
    const part = await phuTung('PT-OIL-5W30');
    const luu = token;
    token = await dangNhap('0901000002');
    try {
      const r = await call('POST', '/api/v1/stock/adjustments', {
        warehouseId: kho, partId: part, delta: 5, reason: 'ok',
      });
      assert.equal(r.status, 400, 'lý do 2 ký tự lọt qua contract');
    } finally {
      token = luu;
    }

    // Tầng DB: chặn ngay cả khi contract bị bỏ qua
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                       unit_cost, created_by_user_id)
           SELECT $1, $2, $3, 'ADJUSTMENT', 5, 0, u.id
             FROM app_user u WHERE u.tenant_id = $1 LIMIT 1`,
          [TENANT_A, kho, part],
        ),
      /adjustment_needs_reason/,
      'ghi được điều chỉnh không lý do ở tầng DB',
    );
  });

  test('🔒 dấu số lượng phải khớp loại chuyển động', async () => {
    const kho = await khoMacDinh();
    const part = await phuTung('PT-OIL-5W30');
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                       unit_cost, created_by_user_id)
           SELECT $1, $2, $3, 'RECEIPT', -5, 100000, u.id
             FROM app_user u WHERE u.tenant_id = $1 LIMIT 1`,
          [TENANT_A, kho, part],
        ),
      /sign_matches_type/,
      'RECEIPT âm = rút hàng khỏi kho mà báo cáo đọc thành nhập hàng',
    );
  });
});

describe('🔒 Phân quyền kho', () => {
  test('thợ không xem được tồn, không nhập được kho', async () => {
    const luu = token;
    token = await dangNhap('0901000004'); // thợ
    try {
      const xem = await call('GET', '/api/v1/stock/balances');
      assert.equal(xem.status, 403, 'thợ xem được tồn kho');

      const nhap = await call('POST', '/api/v1/stock/receipts', {
        warehouseId: await khoMacDinh(),
        partId: await phuTung('PT-OIL-5W30'),
        quantity: 1,
        unitCost: 1000,
      });
      assert.equal(nhap.status, 403, 'thợ nhập được kho');
    } finally {
      token = luu;
    }
  });

  test('🔒 thủ kho KHÔNG tự điều chỉnh tồn được — cần quản lý', async () => {
    // docs/02 mục 2.4: thủ kho không được "điều chỉnh tồn vượt ngưỡng giá trị
    // mà không có duyệt của quản lý". Điều chỉnh trực tiếp là đường duy nhất
    // để tồn đổi mà không có chứng từ mua bán — tức là đường che một mất mát.
    const r = await call('POST', '/api/v1/stock/adjustments', {
      warehouseId: await khoMacDinh(),
      partId: await phuTung('PT-OIL-5W30'),
      delta: -1,
      reason: 'Thủ kho tự điều chỉnh',
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test('🔒 giá vốn chỉ trả về cho vai được xem', async () => {
    // Ẩn cột trên giao diện không làm nó biến mất khỏi response JSON.
    const thuKho = await call('GET', '/api/v1/stock/balances');
    assert.equal(thuKho.status, 200);
    assert.ok(thuKho.body.length > 0);
    assert.equal(
      typeof thuKho.body[0].avgCost,
      'number',
      'thủ kho phải xem được giá vốn (docs/02 mục 2.4)',
    );

    const luu = token;
    token = await dangNhap('0901000006'); // thu ngân — không có stock:read
    try {
      const r = await call('GET', '/api/v1/stock/balances');
      assert.equal(r.status, 403, 'thu ngân đọc được tồn kho');
    } finally {
      token = luu;
    }
  });

  test('🔒 không nhập được vào kho của chi nhánh ngoài phạm vi', async () => {
    // Thủ kho được gán chi nhánh 1. Kho của chi nhánh 3 cùng tenant nên RLS
    // KHÔNG chặn — chỉ cần biết UUID là ghi được nếu service quên kiểm.
    const { rows } = await pool.query<{ id: string }>(
      `SELECT w.id FROM warehouse w JOIN branch b ON b.id = w.branch_id
        WHERE w.tenant_id = $1 AND b.code = 'HCM01'`,
      [TENANT_A],
    );
    const r = await call('POST', '/api/v1/stock/receipts', {
      warehouseId: rows[0]!.id,
      partId: await phuTung('PT-OIL-5W30'),
      quantity: 1,
      unitCost: 100_000,
    });
    assert.equal(r.status, 404, `nhập được vào kho chi nhánh khác: ${JSON.stringify(r.body)}`);
  });

  test('🔒 tenant khác không thấy tồn của tenant này', async () => {
    const luu = token;
    token = await dangNhap('0902000001');
    try {
      const r = await call('GET', '/api/v1/stock/balances');
      // Vai của tài khoản đối chứng quyết định 200 hay 403; điều phải đúng là
      // KHÔNG dòng nào thuộc tenant A lọt sang.
      if (r.status === 200) {
        const { rows } = await pool.query<{ id: string }>(
          'SELECT id FROM warehouse WHERE tenant_id = $1',
          [TENANT_A],
        );
        const idsA = new Set(rows.map((x) => x.id));
        const ro = r.body.filter((b: { warehouseId: string }) => idsA.has(b.warehouseId));
        assert.deepEqual(ro, [], 'RÒ RỈ: thấy tồn kho của tenant khác');
      }
    } finally {
      token = luu;
    }
  });
});

describe('Đồng thời — 🔒 INV-S-01 dưới tranh chấp thật', () => {
  test('20 phiếu rút cùng lúc cho món chỉ còn 1: đúng 1 thành công', async () => {
    /*
     * Đây là test mà `docs/05` mô tả ở INV-S-01. Nó phải bắn SONG SONG THẬT,
     * mỗi lời gọi một kết nối riêng — chạy tuần tự thì không có tranh chấp nào
     * và test xanh giả.
     *
     * Kịch bản dựng một mã hàng riêng để không phụ thuộc tồn của seed.
     */
    const kho = await khoMacDinh();
    const { rows: p } = await pool.query<{ id: string }>(
      `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
       VALUES ($1, $2, 'Phụ tùng thử tranh chấp', 'cái', 'Thử', 0) RETURNING id`,
      [TENANT_A, `PT-RACE-${Date.now().toString().slice(-8)}`],
    );
    const part = p[0]!.id;

    const { rows: u } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, created_by_user_id)
       VALUES ($1,$2,$3,'RECEIPT',1,100000,$4)`,
      [TENANT_A, kho, part, u[0]!.id],
    );

    // Mỗi lệnh rút một kết nối riêng — dùng chung một client thì Postgres xếp
    // hàng chúng lại và tranh chấp biến mất.
    const rut = async (): Promise<'ok' | 'chan'> => {
      const c = new Pool({ connectionString: ADMIN_URL, max: 1 });
      try {
        await c.query(
          `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                       unit_cost, created_by_user_id)
           VALUES ($1,$2,$3,'ISSUE',-1,100000,$4)`,
          [TENANT_A, kho, part, u[0]!.id],
        );
        return 'ok';
      } catch {
        return 'chan';
      } finally {
        await c.end();
      }
    };

    try {
      const ketQua = await Promise.allSettled(Array.from({ length: 20 }, rut));
      const thanhCong = ketQua.filter(
        (r) => r.status === 'fulfilled' && r.value === 'ok',
      ).length;

      assert.equal(thanhCong, 1, `${thanhCong} phiếu rút thành công cho món chỉ còn 1`);

      const { rows: cuoi } = await pool.query<{ on_hand: string }>(
        'SELECT on_hand FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      assert.equal(Number(cuoi[0]!.on_hand), 0, 'tồn cuối phải là 0');
    } finally {
      /*
       * Dọn phụ tùng do test dựng lên.
       *
       * Cần thiết vì không dọn thì MỖI LẦN chạy để lại một mã "PT-RACE-…" tồn 0
       * trong danh mục — nó hiện lên màn kho, lọt vào ảnh chụp màn hình dùng cho
       * README, và làm bẩn dữ liệu demo.
       *
       * 🔒 Dọn bằng role QUẢN TRỊ, và đó không phải đường tắt: INV-S-03 thu hồi
       * quyền xoá sổ kho của `garageos_app` chứ không của role migration. Dữ
       * liệu test không phải chứng từ thật, nhưng đường xoá nó phải là đường mà
       * ứng dụng KHÔNG đi được — nếu ứng dụng xoá được thì bất biến đã hỏng.
       */
      await pool.query('DELETE FROM stock_movement WHERE part_id = $1', [part]);
      await pool.query('DELETE FROM stock_balance WHERE part_id = $1', [part]);
      await pool.query('DELETE FROM part WHERE id = $1', [part]);
    }
  });
});

describe('🔒 Giá vốn dưới tranh chấp — phát hiện của codex-review trên 0025', () => {
  test('phiếu nhập chen vào giữa không làm phiếu điều chỉnh kéo lệch bình quân', async () => {
    /*
     * Kịch bản mà review mô tả, diễn lại đúng theo mốc:
     *
     *   T2  mở giao dịch, ĐỌC bình quân = 100.000
     *   T1  nhập 10 @ 200.000 và commit -> bình quân thật thành 150.000
     *   T2  ghi phiếu điều chỉnh +5 với con số đã đọc (cũ)
     *
     * Đúng: bình quân cuối vẫn 150.000. Chính sách của hệ thống là điều chỉnh
     * được định giá theo bình quân hiện tại, mà thêm n đơn vị ĐÚNG BẰNG bình
     * quân thì bình quân không đổi. Nói ngược lại: một phiếu điều chỉnh làm đổi
     * giá vốn chính là bằng chứng nó đã đọc số cũ.
     */
    const kho = await khoMacDinh();
    const { rows: p } = await pool.query<{ id: string }>(
      `INSERT INTO part (tenant_id, sku, name, unit, category)
       VALUES ($1, $2, 'Phụ tùng thử giá vốn', 'cái', 'Thử') RETURNING id`,
      [TENANT_A, `PT-COST-${Date.now().toString().slice(-8)}`],
    );
    const part = p[0]!.id;
    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    const nguoi = u[0]!.id;

    const ghi = async (
      client: { query: (s: string, v?: unknown[]) => Promise<unknown> },
      type: string,
      qty: number,
      cost: number,
      reason: string | null = null,
    ): Promise<void> => {
      await client.query(
        `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                     unit_cost, reason, created_by_user_id)
         VALUES ($1,$2,$3,$4::movement_type,$5,$6,$7,$8)`,
        [TENANT_A, kho, part, type, qty, cost, reason, nguoi],
      );
    };

    const t2 = new Pool({ connectionString: ADMIN_URL, max: 1 });
    try {
      await ghi(pool, 'RECEIPT', 10, 100_000);

      const c2 = await t2.connect();
      await c2.query('BEGIN');
      const { rows: doc } = await c2.query<{ avg_cost: string }>(
        'SELECT avg_cost FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      const daDoc = Number(doc[0]!.avg_cost);
      assert.equal(daDoc, 100_000);

      // Phiếu nhập khác commit TRƯỚC khi T2 ghi
      await ghi(pool, 'RECEIPT', 10, 200_000);

      await ghi(c2, 'ADJUSTMENT', 5, daDoc, 'Kiểm kê thừa 5 cái');
      await c2.query('COMMIT');
      c2.release();

      const { rows: cuoi } = await pool.query<{ on_hand: string; avg_cost: string }>(
        'SELECT on_hand, avg_cost FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      assert.equal(Number(cuoi[0]!.on_hand), 25);
      assert.equal(
        Number(cuoi[0]!.avg_cost),
        150_000,
        'phiếu điều chỉnh ghi bằng giá đã cũ -> bình quân bị kéo lệch',
      );

      // Và con số THỰC SỰ lưu trên phiếu phải là giá tại thời điểm áp dụng,
      // không phải giá ứng dụng gửi lên.
      const { rows: dc } = await pool.query<{ unit_cost: string }>(
        `SELECT unit_cost FROM stock_movement WHERE part_id = $1 AND type = 'ADJUSTMENT'`,
        [part],
      );
      assert.equal(Number(dc[0]!.unit_cost), 150_000, 'giá trên phiếu điều chỉnh là số cũ');
    } finally {
      await t2.end();
      await pool.query('DELETE FROM stock_movement WHERE part_id = $1', [part]);
      await pool.query('DELETE FROM stock_balance WHERE part_id = $1', [part]);
      await pool.query('DELETE FROM part WHERE id = $1', [part]);
    }
  });
});

describe('🔒 Giữ chỗ — Phase 2.2 (BC-04)', () => {
  let demGiuCho = 0;
  function uniqGiuCho(): string {
    demGiuCho += 1;
    return `${process.pid.toString().slice(-4)}${demGiuCho.toString().padStart(3, '0')}`;
  }

  /**
   * Dựng một đơn có báo giá đã gửi kèm N dòng phụ tùng, trả về hàm "khách
   * duyệt". Dựng cảnh bằng SQL vì luồng API đầy đủ đã có test riêng — trọng tâm
   * ở đây là chuyện xảy ra LÚC duyệt, dưới tranh chấp.
   */
  async function dungDonChoDuyet(
    phuTungCanDuyet: { partId: string; quantity: number }[],
  ): Promise<{ orderId: string; duyet: () => Promise<void>; donDep: () => Promise<void> }> {
    const { rows: br } = await pool.query<{ id: string }>(
      `SELECT id FROM branch WHERE tenant_id = $1 AND code = 'HN01'`,
      [TENANT_A],
    );
    const { rows: u } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    const { rows: cust } = await pool.query<{ id: string }>(
      `INSERT INTO customer (tenant_id, type, display_name, phone)
       VALUES ($1,'INDIVIDUAL',$2,$3) RETURNING id`,
      [TENANT_A, `Khách giữ chỗ ${uniqGiuCho()}`, `036${uniqGiuCho()}`],
    );
    const { rows: veh } = await pool.query<{ id: string }>(
      `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain)
       VALUES ($1,$2,$3,'ICE') RETURNING id`,
      [TENANT_A, cust[0]!.id, `99A-${uniqGiuCho()}`],
    );
    const { rows: ro } = await pool.query<{ id: string }>(
      `INSERT INTO repair_order (tenant_id, branch_id, vehicle_id, customer_id, code,
                                 customer_complaint, odometer_in, status,
                                 customer_access_token, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,'Thử giữ chỗ',1000,'AWAITING_APPROVAL',$6,$7) RETURNING id`,
      [
        TENANT_A,
        br[0]!.id,
        veh[0]!.id,
        cust[0]!.id,
        `RO-GC-${uniqGiuCho()}`,
        `tok-giu-cho-${uniqGiuCho()}-${uniqGiuCho()}-${uniqGiuCho()}-${uniqGiuCho()}`,
        u[0]!.id,
      ],
    );
    const { rows: pl } = await pool.query<{ id: string; labor_rate_per_hour: string }>(
      `SELECT id, labor_rate_per_hour FROM price_list
        WHERE tenant_id = $1 AND effective_from <= now()
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY (branch_id IS NULL) LIMIT 1`,
      [TENANT_A],
    );
    const { rows: q } = await pool.query<{ id: string }>(
      // Tạo ở NHÁP rồi mới gửi — trigger INV-Q-05 (0019) đóng băng mọi thay đổi
      // sau khi gửi, kể cả việc thêm dòng. Đây đúng là thứ tự của luồng thật.
      `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                              price_list_id, created_by_user_id)
       VALUES ($1,$2,1,$3,$4,$5) RETURNING id`,
      [TENANT_A, ro[0]!.id, pl[0]!.labor_rate_per_hour, pl[0]!.id, u[0]!.id],
    );

    // Dòng công làm cha — INV-Q-02 bắt buộc phụ tùng phải gắn vào một hạng mục
    const { rows: sv } = await pool.query<{ id: string }>(
      `SELECT id FROM service_item WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_A],
    );
    const { rows: cha } = await pool.query<{ id: string }>(
      `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, service_item_id,
                                   description, quantity, unit_price)
       VALUES ($1,$2,1,'LABOR',$3,'Công thử',1,100000) RETURNING id`,
      [TENANT_A, q[0]!.id, sv[0]!.id],
    );
    let seq = 1;
    for (const pt of phuTungCanDuyet) {
      seq += 1;
      await pool.query(
        `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, part_id,
                                     parent_line_id, description, quantity, unit_price)
         VALUES ($1,$2,$3,'PART',$4,$5,'Phụ tùng thử',$6,100000)`,
        [TENANT_A, q[0]!.id, seq, pt.partId, cha[0]!.id, pt.quantity],
      );
    }

    await pool.query(
      `UPDATE quotation
          SET status = 'SENT', sent_at = now(), valid_until = now() + interval '7 days'
        WHERE id = $1`,
      [q[0]!.id],
    );

    /*
     * "Khách duyệt": đặt dòng công APPROVED (trigger lan xuống dòng phụ tùng)
     * rồi giữ chỗ — TRONG CÙNG MỘT giao dịch, như luồng thật.
     *
     * `ORDER BY ql.part_id` ở đây phải khớp với `reserveApprovedParts`: đó
     * chính là thứ đang được kiểm ở test chống deadlock bên dưới.
     */
    const duyet = async (): Promise<void> => {
      const p = new Pool({ connectionString: ADMIN_URL, max: 1 });
      try {
        const c = await p.connect();
        try {
          await c.query('BEGIN');
          await c.query(
            `UPDATE quotation_line SET status = 'APPROVED', approval_source = 'CUSTOMER'
              WHERE id = $1`,
            [cha[0]!.id],
          );
          await c.query(
            `INSERT INTO stock_reservation (tenant_id, warehouse_id, part_id, repair_order_id,
                                            quotation_line_id, quantity, expires_at)
             SELECT $1, w.id, ql.part_id, $2, ql.id, ql.quantity, now() + interval '7 days'
               FROM quotation_line ql
               JOIN quotation qq   ON qq.id = ql.quotation_id
               JOIN repair_order r ON r.id = qq.repair_order_id
               JOIN warehouse w    ON w.branch_id = r.branch_id AND w.is_default
              WHERE qq.repair_order_id = $2 AND ql.line_type = 'PART'
                AND ql.status = 'APPROVED'
              ORDER BY ql.part_id`,
            [TENANT_A, ro[0]!.id],
          );
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      } finally {
        await p.end();
      }
    };

    /*
     * Dọn sạch cảnh đã dựng, theo đúng thứ tự ngược.
     *
     * Phải hạ báo giá về NHÁP trước khi xoá dòng: trigger INV-Q-05 chặn cả
     * DELETE trên báo giá đã gửi — đúng như nó phải làm. Đây là lý do dọn dẹp
     * cần một hàm riêng chứ không phải vài câu DELETE rải rác ở `finally`.
     *
     * Không dọn thì mỗi lần chạy để lại một đơn + xe + khách trong dữ liệu
     * demo, và màn "Xe trong xưởng" đầy xe 99A-… không có thật.
     */
    const donDep = async (): Promise<void> => {
      await pool.query(
        `UPDATE stock_reservation SET status = 'RELEASED', released_reason = 'Dọn test'
          WHERE repair_order_id = $1 AND status = 'ACTIVE'`,
        [ro[0]!.id],
      );
      await pool.query('DELETE FROM stock_reservation WHERE repair_order_id = $1', [ro[0]!.id]);
      await pool.query(`UPDATE quotation SET status = 'DRAFT' WHERE id = $1`, [q[0]!.id]);
      await pool.query('DELETE FROM quotation_line WHERE quotation_id = $1', [q[0]!.id]);
      await pool.query('DELETE FROM quotation WHERE id = $1', [q[0]!.id]);
      await pool.query('DELETE FROM repair_order WHERE id = $1', [ro[0]!.id]);
      await pool.query('DELETE FROM vehicle_ownership WHERE vehicle_id = $1', [veh[0]!.id]);
      await pool.query('DELETE FROM vehicle WHERE id = $1', [veh[0]!.id]);
      await pool.query('DELETE FROM customer WHERE id = $1', [cust[0]!.id]);
    };

    return { orderId: ro[0]!.id, duyet, donDep };
  }

  test('🔒 INV-S-05: hai đơn tranh món cuối cùng, chỉ một đơn giữ được', async () => {
    /*
     * Đúng kịch bản mở đầu BC-04: kho còn một bộ má phanh, hai khách duyệt
     * cách nhau một phút. Chỉ kiểm `tồn > 0` rồi cho qua thì cả hai đều nhận,
     * và thợ thứ hai ra kho không có hàng — sau khi hệ thống đã hứa với khách
     * và đã xếp lịch thợ.
     */
    const kho = await khoMacDinh();
    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    const { rows: p } = await pool.query<{ id: string }>(
      `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
       VALUES ($1, $2, 'Phụ tùng khan hiếm', 'cái', 'Thử', 0) RETURNING id`,
      [TENANT_A, `PT-KHAN-${uniqGiuCho()}`],
    );
    const part = p[0]!.id;
    await pool.query(
      `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                   unit_cost, created_by_user_id)
       VALUES ($1,$2,$3,'RECEIPT',1,500000,$4)`,
      [TENANT_A, kho, part, u[0]!.id],
    );

    const donA = await dungDonChoDuyet([{ partId: part, quantity: 1 }]);
    const donB = await dungDonChoDuyet([{ partId: part, quantity: 1 }]);

    try {
      const kq = await Promise.allSettled([donA.duyet(), donB.duyet()]);
      const thanhCong = kq.filter((r) => r.status === 'fulfilled').length;
      assert.equal(thanhCong, 1, `${thanhCong} đơn giữ được chỗ cho món chỉ còn 1`);

      const { rows: bal } = await pool.query<{ on_hand: string; reserved: string }>(
        'SELECT on_hand, reserved FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      // 🔒 Giữ chỗ KHÔNG đụng tồn thực tế — hàng vẫn nằm trên kệ tới lúc xuất
      assert.equal(Number(bal[0]!.on_hand), 1, 'giữ chỗ làm đổi tồn thực tế');
      assert.equal(Number(bal[0]!.reserved), 1);
    } finally {
      await donA.donDep();
      await donB.donDep();
      await pool.query('DELETE FROM stock_movement WHERE part_id = $1', [part]);
      await pool.query('DELETE FROM stock_balance WHERE part_id = $1', [part]);
      await pool.query('DELETE FROM part WHERE id = $1', [part]);
    }
  });

  test('🔒 khoá theo thứ tự part_id: hai đơn cần cùng hai món, không deadlock', async () => {
    /*
     * Đơn 1 và đơn 2 cùng cần món A và món B. Nếu đơn 1 khoá A rồi chờ B trong
     * khi đơn 2 khoá B rồi chờ A thì thành chu trình chờ, và PostgreSQL giết
     * một trong hai sau `deadlock_timeout` — nạn nhân là một khách đang bấm
     * duyệt trên điện thoại.
     *
     * `ORDER BY part_id` làm mọi giao dịch giành khoá cùng một thứ tự, nên
     * không tạo được chu trình. CẢ HAI phải qua.
     *
     * Chú ý hai đơn khai phụ tùng theo thứ tự NGƯỢC nhau: nếu code khoá theo
     * thứ tự dòng báo giá thay vì theo `part_id`, test này đỏ.
     */
    const kho = await khoMacDinh();
    const { rows: u } = await pool.query<{ id: string }>(
      'SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1',
      [TENANT_A],
    );
    const taoPart = async (ten: string): Promise<string> => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO part (tenant_id, sku, name, unit, category, min_stock_level)
         VALUES ($1, $2, $3, 'cái', 'Thử', 0) RETURNING id`,
        [TENANT_A, `PT-DL-${uniqGiuCho()}`, ten],
      );
      await pool.query(
        `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                     unit_cost, created_by_user_id)
         VALUES ($1,$2,$3,'RECEIPT',50,100000,$4)`,
        [TENANT_A, kho, rows[0]!.id, u[0]!.id],
      );
      return rows[0]!.id;
    };
    const partA = await taoPart('Món A');
    const partB = await taoPart('Món B');

    const don1 = await dungDonChoDuyet([
      { partId: partA, quantity: 2 },
      { partId: partB, quantity: 2 },
    ]);
    const don2 = await dungDonChoDuyet([
      { partId: partB, quantity: 3 },
      { partId: partA, quantity: 3 },
    ]);

    try {
      const kq = await Promise.allSettled([don1.duyet(), don2.duyet()]);
      assert.deepEqual(
        kq
          .filter((r) => r.status === 'rejected')
          .map((r) => String((r as PromiseRejectedResult).reason).slice(0, 90)),
        [],
        'có giao dịch bị giết — nhiều khả năng deadlock do khoá sai thứ tự',
      );

      for (const part of [partA, partB]) {
        const { rows } = await pool.query<{ reserved: string }>(
          'SELECT reserved FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
          [kho, part],
        );
        assert.equal(Number(rows[0]!.reserved), 5, 'phần giữ chỗ cộng dồn sai');
      }
    } finally {
      await don1.donDep();
      await don2.donDep();
      for (const part of [partA, partB]) {
        await pool.query('DELETE FROM stock_movement WHERE part_id = $1', [part]);
        await pool.query('DELETE FROM stock_balance WHERE part_id = $1', [part]);
        await pool.query('DELETE FROM part WHERE id = $1', [part]);
      }
    }
  });

  test('🔒 nhả chỗ trả lại hàng khả dụng, tồn thực tế không đổi', async () => {
    const kho = await khoMacDinh();
    const part = await phuTung('PT-CABIN-FILTER');
    const doc = async (): Promise<{ onHand: number; reserved: number }> => {
      const { rows } = await pool.query<{ on_hand: string; reserved: string }>(
        'SELECT on_hand, reserved FROM stock_balance WHERE warehouse_id = $1 AND part_id = $2',
        [kho, part],
      );
      return { onHand: Number(rows[0]!.on_hand), reserved: Number(rows[0]!.reserved) };
    };

    const truoc = await doc();
    const don = await dungDonChoDuyet([{ partId: part, quantity: 3 }]);
    await don.duyet();

    const giua = await doc();
    assert.equal(giua.reserved, truoc.reserved + 3);
    assert.equal(giua.onHand, truoc.onHand, 'giữ chỗ làm đổi tồn thực tế');

    await pool.query(
      `UPDATE stock_reservation SET status = 'RELEASED', released_reason = 'Huỷ đơn thử'
        WHERE repair_order_id = $1 AND status = 'ACTIVE'`,
      [don.orderId],
    );

    const sau = await doc();
    assert.equal(sau.reserved, truoc.reserved, 'nhả chỗ không trả lại hàng khả dụng');
    assert.equal(sau.onHand, truoc.onHand, 'nhả chỗ làm đổi tồn thực tế');

    await don.donDep();
  });
});
