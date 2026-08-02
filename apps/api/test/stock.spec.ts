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
