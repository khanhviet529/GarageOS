/**
 * Ma trận quyền — `docs/02-actors-and-permissions.md` mục 3.
 *
 * Vì sao file này tồn tại:
 *
 * Sáu vòng codex-review đã sửa lỗ hổng phân quyền ở ĐÚNG MỘT endpoint
 * (`changeStatus`, GARAGEOS-REV-002). Một vòng rà soát bằng nhiều reviewer song
 * song sau đó phát hiện năm endpoint khác không có kiểm tra nào, và tôi kiểm
 * chứng bằng cách chạy thật: một `TECHNICIAN` tạo được khách hàng, tạo được xe,
 * tiếp nhận được đơn, lập được báo giá, và đẩy đơn qua hai bước máy trạng thái.
 *
 * Bài học không phải "quên một chỗ" mà là: **kiểm tra quyền rải rác theo từng
 * service thì chỉ chỗ nào được review kỹ mới có.** File này quét theo VAI chứ
 * không theo endpoint, nên endpoint mới thêm mà quên khai báo quyền sẽ lộ ra ở
 * đây thay vì lộ ra ở production.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

let pool: Pool;
const uniq = Date.now().toString().slice(-6);

/** Tài khoản seed theo vai — `infra/seed.ts` */
const TAI_KHOAN = {
  OWNER: '0901000001',
  BRANCH_MANAGER: '0901000002',
  SERVICE_ADVISOR: '0901000003',
  TECHNICIAN: '0901000004',
  STORE_KEEPER: '0901000005',
  CASHIER: '0901000006',
} as const;

type Vai = keyof typeof TAI_KHOAN;

const token: Partial<Record<Vai, string>> = {};
const branchOf: Partial<Record<Vai, string>> = {};

async function call(
  method: string,
  path: string,
  body?: unknown,
  bearer?: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

/** Dữ liệu nền do CỐ VẤN tạo, để test vai khác không phụ thuộc bước trước */
let customerId = '';
let vehicleId = '';
let orderId = '';
let quotationId = '';

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });

  for (const [vai, phone] of Object.entries(TAI_KHOAN) as [Vai, string][]) {
    const r = await call('POST', '/api/v1/auth/login', { phone, password: 'demo1234' });
    assert.equal(r.status, 201, `không đăng nhập được bằng ${vai} (${phone})`);
    token[vai] = r.body.accessToken;
    branchOf[vai] = r.body.user.branchIds[0];
    assert.deepEqual(r.body.user.roles, [vai], `seed sai vai cho ${phone}`);
  }

  const advisor = token.SERVICE_ADVISOR;
  const c = await call('POST', '/api/v1/customers', {
    type: 'INDIVIDUAL', displayName: `Khách nền ${uniq}`, phone: `033${uniq}`,
  }, advisor);
  assert.equal(c.status, 201, JSON.stringify(c.body));
  customerId = c.body.id;

  const v = await call('POST', '/api/v1/vehicles', {
    customerId, plateNumber: `19P-${uniq}`, powertrain: 'ICE',
  }, advisor);
  assert.equal(v.status, 201, JSON.stringify(v.body));
  vehicleId = v.body.id;

  const o = await call('POST', '/api/v1/repair-orders', {
    vehicleId, branchId: branchOf.SERVICE_ADVISOR,
    customerComplaint: 'Dữ liệu nền cho test phân quyền',
    odometerIn: 10_000,
  }, advisor);
  assert.equal(o.status, 201, JSON.stringify(o.body));
  orderId = o.body.id;

  const q = await call('POST', `/api/v1/repair-orders/${orderId}/quotations`, undefined, advisor);
  assert.equal(q.status, 201, JSON.stringify(q.body));
  quotationId = q.body.id;
});

after(async () => {
  await pool.end();
});

/**
 * Bảng dưới đây là bản dịch trực tiếp của ma trận quyền trong tài liệu.
 * Mỗi dòng: thao tác · vai ĐƯỢC làm · cách gọi.
 */
const THAO_TAC: {
  ten: string;
  duocPhep: Vai[];
  goi: (bearer: string, i: number) => Promise<{ status: number; body: any }>;
}[] = [
  {
    ten: 'Tạo khách hàng',
    duocPhep: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
    goi: (b, i) =>
      call('POST', '/api/v1/customers', {
        type: 'INDIVIDUAL', displayName: `Khách quyền ${uniq}${i}`, phone: `036${uniq}${i}`,
      }, b),
  },
  {
    ten: 'Tạo xe',
    duocPhep: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
    goi: (b, i) =>
      call('POST', '/api/v1/vehicles', {
        customerId, plateNumber: `19Q-${uniq}${i}`, powertrain: 'ICE',
      }, b),
  },
  {
    ten: 'Tiếp nhận xe (tạo đơn)',
    duocPhep: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
    // Xe riêng cho mỗi lần thử: INV-V-03 chặn hai đơn mở trên cùng một xe,
    // và ta muốn đo QUYỀN chứ không đo bất biến đó.
    goi: async (b, i) => {
      const v = await call('POST', '/api/v1/vehicles', {
        customerId, plateNumber: `19R-${uniq}${i}`, powertrain: 'ICE',
      }, token.SERVICE_ADVISOR);
      return call('POST', '/api/v1/repair-orders', {
        vehicleId: v.body?.id,
        branchId: branchOf.SERVICE_ADVISOR,
        customerComplaint: 'Thử quyền tiếp nhận xe',
        odometerIn: 100,
      }, b);
    },
  },
  {
    ten: 'Lập báo giá',
    duocPhep: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
    goi: async (b, i) => {
      const v = await call('POST', '/api/v1/vehicles', {
        customerId, plateNumber: `19S-${uniq}${i}`, powertrain: 'ICE',
      }, token.SERVICE_ADVISOR);
      const o = await call('POST', '/api/v1/repair-orders', {
        vehicleId: v.body?.id,
        branchId: branchOf.SERVICE_ADVISOR,
        customerComplaint: 'Thử quyền lập báo giá',
        odometerIn: 100,
      }, token.SERVICE_ADVISOR);
      return call('POST', `/api/v1/repair-orders/${o.body?.id}/quotations`, undefined, b);
    },
  },
  {
    ten: 'Thêm dòng vào báo giá',
    duocPhep: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
    goi: async (b) => {
      const cat = await call('GET', `/api/v1/catalog/vehicle/${vehicleId}`, undefined,
                             token.SERVICE_ADVISOR);
      const item = cat.body?.serviceItems?.[0];
      return call('POST', `/api/v1/quotations/${quotationId}/lines`, {
        lineType: 'LABOR', serviceItemId: item?.id, quantity: 1,
      }, b);
    },
  },
  {
    ten: 'Gửi báo giá cho khách',
    duocPhep: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
    goi: (b) => call('POST', `/api/v1/quotations/${quotationId}/send`, undefined, b),
  },
];

describe('🔒 Ma trận quyền — vai KHÔNG được phép thì phải bị chặn', () => {
  let i = 0;
  for (const tt of THAO_TAC) {
    const biCam = (Object.keys(TAI_KHOAN) as Vai[]).filter((v) => !tt.duocPhep.includes(v));
    for (const vai of biCam) {
      test(`${vai} KHÔNG được "${tt.ten}"`, async () => {
        i += 1;
        const r = await tt.goi(token[vai]!, i);
        assert.equal(
          r.status,
          403,
          `${vai} làm được "${tt.ten}" (nhận ${r.status}) — ` +
            `docs/02 ma trận quyền nói vai này không được phép`,
        );
        assert.equal(r.body.error.code, 'FORBIDDEN');
      });
    }
  }
});

describe('Ma trận quyền — vai ĐƯỢC phép thì phải làm được', () => {
  // Chiều này quan trọng không kém: một bản sửa quá tay khoá luôn người đúng
  // vai sẽ làm cả xưởng dừng, và loại lỗi đó không ai báo cho tới khi có người
  // không làm việc được.
  let i = 100;
  for (const tt of THAO_TAC) {
    for (const vai of tt.duocPhep) {
      test(`${vai} ĐƯỢC "${tt.ten}"`, async () => {
        i += 1;
        const r = await tt.goi(token[vai]!, i);
        assert.notEqual(
          r.status,
          403,
          `${vai} bị chặn khỏi "${tt.ten}" — bản sửa phân quyền quá tay`,
        );
      });
    }
  }
});

describe('🔒 Phạm vi chi nhánh áp cho CẢ module báo giá', () => {
  test('cố vấn không đọc được báo giá của chi nhánh khác', async () => {
    // Chủ chuỗi có mọi chi nhánh; cố vấn chỉ có chi nhánh 1.
    const owner = token.OWNER!;
    const ownerBranches = branchOf.OWNER;
    const other = await call('POST', '/api/v1/auth/login',
                             { phone: TAI_KHOAN.OWNER, password: 'demo1234' });
    const otherBranch = other.body.user.branchIds.find(
      (b: string) => b !== branchOf.SERVICE_ADVISOR,
    );
    assert.ok(otherBranch, 'seed phải có ít nhất hai chi nhánh');
    assert.ok(ownerBranches);

    const v = await call('POST', '/api/v1/vehicles', {
      customerId, plateNumber: `19T-${uniq}`, powertrain: 'ICE',
    }, owner);
    const o = await call('POST', '/api/v1/repair-orders', {
      vehicleId: v.body.id, branchId: otherBranch,
      customerComplaint: 'Đơn ở chi nhánh khác', odometerIn: 1,
    }, owner);
    assert.equal(o.status, 201, JSON.stringify(o.body));

    const q = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`,
                         undefined, owner);
    assert.equal(q.status, 201, JSON.stringify(q.body));

    // Cố vấn chi nhánh 1 KHÔNG được thấy báo giá đó
    const doc = await call('GET', `/api/v1/quotations/${q.body.id}`, undefined,
                           token.SERVICE_ADVISOR);
    assert.equal(doc.status, 404, 'RÒ RỈ: đọc được báo giá của chi nhánh khác');

    const ds = await call('GET', `/api/v1/repair-orders/${o.body.id}/quotations`,
                          undefined, token.SERVICE_ADVISOR);
    assert.deepEqual(ds.body, [], 'RÒ RỈ: báo giá chi nhánh khác lọt vào danh sách');

    // Và không lập được báo giá mới cho đơn đó
    const them = await call('POST', `/api/v1/repair-orders/${o.body.id}/quotations`,
                            undefined, token.SERVICE_ADVISOR);
    assert.equal(them.status, 404, 'lập được báo giá cho đơn của chi nhánh khác');
  });
});

describe('🔒 Kiểm tra cấu hình lúc khởi động', () => {
  test('bí mật JWT mẫu bị từ chối, bí mật thật được chấp nhận', async () => {
    // Không khởi động lại API được trong test tích hợp, nên kiểm thẳng hàm.
    // Đây là hàm quyết định API có chạy hay không — logic của nó phải đúng.
    const { assertSecretsUsable } = await import('../src/common/startup-checks');
    const goc = { ...process.env };

    const thu = (env: Record<string, string | undefined>) => {
      Object.assign(process.env, env);
      try {
        assertSecretsUsable();
        return null;
      } catch (e) {
        return (e as Error).message;
      } finally {
        process.env = { ...goc };
      }
    };

    // Giá trị mẫu đang nằm công khai trong repo — dài 32 ký tự nên qua được
    // kiểm tra độ dài, đó chính là lý do phải có danh sách chặn riêng.
    assert.match(
      thu({
        JWT_ACCESS_SECRET: 'doi-gia-tri-nay-trong-production',
        JWT_REFRESH_SECRET: 'x'.repeat(40),
      }) ?? '',
      /giá trị mẫu/,
      'bí mật mẫu công khai vẫn khởi động được',
    );

    assert.match(thu({ JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: 'x'.repeat(40) }) ?? '',
                 /chưa được đặt/);

    assert.match(thu({ JWT_ACCESS_SECRET: 'ngan', JWT_REFRESH_SECRET: 'x'.repeat(40) }) ?? '',
                 /ít nhất 32/);

    // Dùng chung một bí mật: refresh token 30 ngày dùng thay access token được
    assert.match(thu({ JWT_ACCESS_SECRET: 'y'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40) }) ?? '',
                 /phải khác nhau/);

    assert.match(
      thu({
        NODE_ENV: 'production',
        OTP_DEV_ECHO: 'true',
        JWT_ACCESS_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'b'.repeat(40),
      }) ?? '',
      /OTP_DEV_ECHO/,
      'bật echo OTP ở production vẫn khởi động được',
    );

    assert.equal(
      thu({
        JWT_ACCESS_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'b'.repeat(40),
        NODE_ENV: 'development',
        OTP_DEV_ECHO: 'true',
      }),
      null,
      'cấu hình hợp lệ bị từ chối — bản sửa quá tay',
    );
  });
});
