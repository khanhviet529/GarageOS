import { Pool, type PoolClient } from 'pg';
import type { ActorContext } from '@garageos/contracts';

/**
 * Truy cập dữ liệu có cô lập tenant — 🔒 INV-T-01.
 *
 * ⚠️ ĐIỀU KIỆN TIÊN QUYẾT: pool này PHẢI kết nối bằng role KHÔNG đặc quyền
 * (không superuser, không BYPASSRLS). Superuser bỏ qua RLS kể cả khi bảng đã
 * bật FORCE ROW LEVEL SECURITY — cô lập sẽ vô hiệu một cách âm thầm.
 *
 * Xem infra/migrations/0001_init.sql và docs/adr/0001-multi-tenant.md
 */
export class TenantAwareDb {
  constructor(private readonly pool: Pool) {}

  /**
   * Chạy một khối lệnh trong transaction đã gắn tenant.
   *
   * 🔒 `tenantId` lấy từ ActorContext (nguồn gốc là token đã xác thực), không
   * bao giờ từ tham số request — INV-T-02.
   *
   * 🔒 Dùng set_config() CÓ THAM SỐ, không nội suy chuỗi vào SET LOCAL.
   */
  async withTenant<T>(
    actor: ActorContext,
    fn: (tx: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.tenant_id',
        actor.tenantId,
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'app.user_id',
        actor.userId,
      ]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Kiểm tra role kết nối không có đặc quyền bỏ qua RLS. Gọi lúc khởi động. */
  async assertNotPrivileged(): Promise<void> {
    const { rows } = await this.pool.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls
         FROM pg_roles WHERE rolname = current_user`,
    );
    const role = rows[0];
    if (role === undefined) throw new Error('Không xác định được current_user');
    if (role.rolsuper || role.rolbypassrls) {
      throw new Error(
        `Role "${role.rolname}" là superuser hoặc có BYPASSRLS — RLS sẽ bị bỏ qua ` +
          `và cô lập tenant vô hiệu. Ứng dụng phải kết nối bằng role thường ` +
          `(xem DATABASE_URL vs DATABASE_ADMIN_URL trong .env.example).`,
      );
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

export function createAppPool(connectionString?: string): Pool {
  const url =
    connectionString ??
    process.env.DATABASE_URL ??
    'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos';
  return new Pool({ connectionString: url, max: 10 });
}
