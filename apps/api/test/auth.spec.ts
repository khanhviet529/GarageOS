/**
 * Test tích hợp luồng xác thực.
 *
 * Mỗi test ở đây khoá lại một lỗi đã thực sự xảy ra trong quá trình dựng
 * Phase 0 — không phải test viết cho có:
 *
 *  1. set_config(..., is_local=true) gọi NGOÀI transaction -> reset về rỗng
 *     ở câu lệnh sau -> lỗi `invalid input syntax for type uuid: ""`
 *  2. node-pg không parse mảng enum tuỳ biến -> roles về dạng chuỗi thô
 *     '{SERVICE_ADVISOR}' -> ActorContext.safeParse thất bại
 *  3. Thông báo lỗi đăng nhập phải GIỐNG NHAU giữa "sai mật khẩu" và
 *     "số không tồn tại" -> chống dò số điện thoại có trong hệ thống
 *
 * Yêu cầu: API đang chạy tại API_URL, DB đã migrate và seed.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:3001';
const PHONE = '0901000003';       // Cố vấn dịch vụ, tenant A
const PHONE_OTHER_TENANT = '0902000001';
const PASSWORD = 'demo1234';

interface LoginBody {
  accessToken?: string;
  refreshToken?: string;
  user?: { id: string; fullName: string; roles: string[]; branchIds: string[] };
  error?: { code: string; message: string };
}

async function post(path: string, body: unknown): Promise<{ status: number; body: LoginBody }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as LoginBody };
}

async function get(path: string, token?: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  const res = await fetch(`${API}/health`).catch(() => null);
  if (res === null || !res.ok) {
    throw new Error(
      `API không chạy tại ${API}. Chạy: pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm --filter @garageos/api dev`,
    );
  }
});

describe('Điều kiện tiên quyết hạ tầng', () => {
  test('API kết nối DB bằng role KHÔNG đặc quyền', async () => {
    const { body } = await get('/health');
    assert.equal(body.status, 'ok');
    // 🔒 Nếu là superuser thì RLS bị bỏ qua và cô lập tenant vô hiệu
    assert.notEqual(body.role, 'garageos', 'API đang dùng role chủ sở hữu — RLS vô hiệu');
  });
});

describe('Đăng nhập', () => {
  test('đăng nhập đúng trả về token và thông tin người dùng', async () => {
    const { status, body } = await post('/api/v1/auth/login', {
      phone: PHONE,
      password: PASSWORD,
    });
    assert.equal(status, 201);
    assert.ok(body.accessToken, 'thiếu accessToken');
    assert.ok(body.refreshToken, 'thiếu refreshToken');
    assert.equal(body.user?.fullName, 'Lê Văn Cố Vấn');
  });

  test('roles là MẢNG, không phải chuỗi thô của Postgres', async () => {
    // Lỗi đã xảy ra: node-pg trả '{SERVICE_ADVISOR}' dạng chuỗi
    const { body } = await post('/api/v1/auth/login', { phone: PHONE, password: PASSWORD });
    assert.ok(Array.isArray(body.user?.roles), 'roles phải là mảng');
    assert.deepEqual(body.user?.roles, ['SERVICE_ADVISOR']);
  });

  test('branchIds tải được (set_config phải nằm trong transaction)', async () => {
    // Lỗi đã xảy ra: invalid input syntax for type uuid: ""
    const { body } = await post('/api/v1/auth/login', { phone: PHONE, password: PASSWORD });
    assert.ok(Array.isArray(body.user?.branchIds));
    assert.equal(body.user?.branchIds.length, 1);
  });

  test('sai mật khẩu bị từ chối', async () => {
    const { status, body } = await post('/api/v1/auth/login', {
      phone: PHONE,
      password: 'saibetroi123',
    });
    assert.equal(status, 401);
    assert.equal(body.error?.code, 'UNAUTHENTICATED');
  });

  test('🔒 số không tồn tại trả về ĐÚNG thông báo như sai mật khẩu', async () => {
    // Chống dò: kẻ tấn công không được biết số nào có trong hệ thống
    const wrongPass = await post('/api/v1/auth/login', { phone: PHONE, password: 'saibetroi123' });
    const noSuchUser = await post('/api/v1/auth/login', {
      phone: '0988888888',
      password: PASSWORD,
    });
    assert.equal(noSuchUser.status, wrongPass.status);
    assert.equal(noSuchUser.body.error?.message, wrongPass.body.error?.message);
  });

  test('dữ liệu vào không hợp lệ bị Zod chặn', async () => {
    const { status, body } = await post('/api/v1/auth/login', { phone: '1', password: 'x' });
    assert.equal(status, 400);
    assert.equal(body.error?.code, 'VALIDATION_FAILED');
  });
});

describe('INV-T-02 — tenantId chỉ đến từ token', () => {
  test('/me trả về tenantId lấy từ token', async () => {
    const { body: login } = await post('/api/v1/auth/login', {
      phone: PHONE,
      password: PASSWORD,
    });
    const { status, body } = await get('/api/v1/auth/me', login.accessToken);
    assert.equal(status, 200);
    assert.equal(body.tenantId, '11111111-1111-1111-1111-111111111111');
  });

  test('hai tenant khác nhau nhận tenantId khác nhau', async () => {
    const a = await post('/api/v1/auth/login', { phone: PHONE, password: PASSWORD });
    const b = await post('/api/v1/auth/login', {
      phone: PHONE_OTHER_TENANT,
      password: PASSWORD,
    });
    const meA = await get('/api/v1/auth/me', a.body.accessToken);
    const meB = await get('/api/v1/auth/me', b.body.accessToken);
    assert.notEqual(meA.body.tenantId, meB.body.tenantId);
  });

  test('không có token bị từ chối', async () => {
    const { status, body } = await get('/api/v1/auth/me');
    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  test('token rác bị từ chối', async () => {
    const { status } = await get('/api/v1/auth/me', 'rac.rac.rac');
    assert.equal(status, 401);
  });
});

describe('Định dạng lỗi', () => {
  test('mọi lỗi đều có code và requestId', async () => {
    const { body } = await get('/api/v1/auth/me');
    assert.ok(body.error.code);
    assert.ok(body.error.requestId);
  });

  test('🔒 lỗi hệ thống KHÔNG lộ chi tiết nội bộ', async () => {
    const { body } = await get('/api/v1/auth/me');
    const text = JSON.stringify(body);
    for (const leak of ['SELECT', 'app_user', 'pg_', 'at Object.', 'node_modules']) {
      assert.ok(!text.includes(leak), `Lỗi lộ thông tin nội bộ: ${leak}`);
    }
  });
});
