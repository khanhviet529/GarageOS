import { Injectable } from '@nestjs/common';
import { timingSafeEqual, scryptSync, randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Pool, PoolClient } from 'pg';
import { Inject } from '@nestjs/common';
import { ErrorCode, type LoginInput, type LoginOutput, type Role } from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { APP_POOL } from '../db/db.module';

interface UserRow {
  id: string;
  tenant_id: string;
  password_hash: string;
  full_name: string;
  roles: Role[];
  is_active: boolean;
}

/**
 * Kết quả một phiên vừa mở — token luôn CÓ ở tầng service.
 *
 * `LoginOutput` để token tuỳ chọn vì đó là hợp đồng với CLIENT, và web cố ý
 * không nhận token. Nhưng bên trong thì token luôn tồn tại: controller cần
 * chúng để đặt cookie. Trộn hai khái niệm vào một kiểu sẽ bắt controller phải
 * kiểm `undefined` cho một thứ không bao giờ `undefined`.
 */
export interface KetQuaPhien {
  accessToken: string;
  refreshToken: string;
  user: NonNullable<LoginOutput['user']>;
}

@Injectable()
export class AuthService {
  constructor(@Inject(APP_POOL) private readonly pool: Pool) {}

  /**
   * Đăng nhập.
   *
   * ⚠️ Truy vấn này chạy TRƯỚC khi có tenant context (chưa biết tenant nào),
   * nên bảng app_user cần được đọc không qua RLS ở đúng bước này. Giải pháp:
   * dùng SECURITY DEFINER function thay vì nới RLS. Xem ghi chú cuối file.
   */
  async login(input: LoginInput): Promise<KetQuaPhien> {
    const { rows } = await this.pool.query<UserRow>(
      // 🔒 roles::text[] — node-pg KHÔNG parse được mảng enum tuỳ biến
      //    (OID lạ), nó trả về chuỗi thô '{SERVICE_ADVISOR}'. Ép sang text[]
      //    để driver parse thành mảng JS thật.
      `SELECT id, tenant_id, password_hash, full_name, roles::text[] AS roles, is_active
         FROM auth_find_user_by_phone($1)`,
      [input.phone],
    );
    const user = rows[0];

    // 🔒 Cùng một thông báo cho "không tồn tại" và "sai mật khẩu"
    //    — không tiết lộ số điện thoại nào có trong hệ thống.
    const invalid = (): never => {
      throw new BusinessError(
        ErrorCode.UNAUTHENTICATED,
        'Số điện thoại hoặc mật khẩu không đúng',
      );
    };

    if (user === undefined || !user.is_active) return invalid();
    if (!verifyPassword(input.password, user.password_hash)) return invalid();

    const branchIds = await this.loadBranchIds(user.tenant_id, user.id);

    return {
      accessToken: this.signAccess(user, branchIds),
      refreshToken: await this.issueRefresh(user.tenant_id, user.id),
      user: {
        id: user.id,
        fullName: user.full_name,
        roles: user.roles,
        branchIds,
      },
    };
  }

  /**
   * ⚠️ BẮT BUỘC bọc trong transaction.
   *
   * `set_config(..., is_local => true)` chỉ có hiệu lực trong PHẠM VI
   * TRANSACTION. Gọi ngoài transaction thì nó chỉ tồn tại đúng một câu lệnh,
   * rồi reset về chuỗi rỗng — câu lệnh tiếp theo sẽ lỗi
   * `invalid input syntax for type uuid: ""` khi RLS ép kiểu.
   */
  private async loadBranchIds(tenantId: string, userId: string): Promise<string[]> {
    return this.trongTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ branch_id: string }>(
        'SELECT branch_id FROM user_branch WHERE user_id = $1',
        [userId],
      );
      return rows.map((r) => r.branch_id);
    });
  }

  private signAccess(user: UserRow, branchIds: string[]): string {
    return jwt.sign(
      {
        sub: user.id,
        tid: user.tenant_id, // 🔒 nguồn duy nhất của tenantId — INV-T-02
        roles: user.roles,
        branches: branchIds,
      },
      requireSecret('JWT_ACCESS_SECRET'),
      // Kiểu của `expiresIn` trong @types/jsonwebtoken là template literal
      // (vd '15m'), không nhận `string` chung. Giá trị đến từ env nên phải
      // ép kiểu tường minh tại đúng biên này.
      { expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '15m') as jwt.SignOptions['expiresIn'] },
    );
  }

  /**
   * Đổi refresh token lấy phiên mới — và phát hiện token bị đánh cắp.
   *
   * 🔒 `docs/13-nfr.md`: "xoay vòng, sống 30 ngày; dùng lại token cũ → thu hồi
   *    TOÀN BỘ phiên". Vế sau mới là phần đáng giá.
   *
   * Vì sao: refresh token xoay vòng nghĩa là mỗi lần dùng sinh ra một cái mới
   * và cái cũ bị thu hồi. Nếu một token ĐÃ THU HỒI được đem ra dùng, chỉ có
   * hai khả năng — và cả hai đều nghĩa là có hai bên đang giữ cùng một token:
   *
   *   · kẻ tấn công lấy được token cũ và đang dùng nó, hoặc
   *   · người dùng thật đang dùng token mà kẻ tấn công đã xoay vòng
   *
   * Không phân biệt được hai bên nào là thật, nên cách đúng là **thu hồi tất
   * cả** và bắt đăng nhập lại. Bất tiện cho một người, chặn đứng một phiên bị
   * chiếm.
   *
   * 💡 Đây là lý do bảng `refresh_token` có `revoked_at` và `replaced_by_id`
   *    từ migration 0001 — thiết kế đã tính tới, chỉ chưa ai cài.
   */
  async refresh(raw: string): Promise<KetQuaPhien> {
    const hash = createHash('sha256').update(raw).digest('hex');

    const { rows } = await this.pool.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      revoked_at: Date | null;
      het_han: boolean;
    }>(
      // Truy vấn này chạy TRƯỚC khi biết tenant — cùng lý do với `login`, nên
      // đi qua hàm SECURITY DEFINER hẹp thay vì nới RLS.
      `SELECT id, tenant_id, user_id, revoked_at, expires_at <= now() AS het_han
         FROM auth_find_refresh_token($1)`,
      [hash],
    );
    const rt = rows[0];

    // Cùng một câu trả lời cho mọi kiểu hỏng — không nói cho người gọi biết
    // token của họ sai ở chỗ nào.
    const hong = (): never => {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Phiên đã hết hạn, đăng nhập lại');
    };
    if (rt === undefined || rt.het_han) return hong();

    if (rt.revoked_at !== null) {
      await this.thuHoiToanBoPhien(rt.tenant_id, rt.user_id);
      return hong();
    }

    const { rows: u } = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, password_hash, full_name, roles::text[] AS roles, is_active
         FROM auth_find_user_by_id($1)`,
      [rt.user_id],
    );
    const user = u[0];
    if (user === undefined || !user.is_active) {
      await this.thuHoiToanBoPhien(rt.tenant_id, rt.user_id);
      return hong();
    }

    const branchIds = await this.loadBranchIds(user.tenant_id, user.id);
    const moi = await this.issueRefresh(user.tenant_id, user.id, rt.id);

    return {
      accessToken: this.signAccess(user, branchIds),
      refreshToken: moi,
      user: { id: user.id, fullName: user.full_name, roles: user.roles, branchIds },
    };
  }

  /** Đăng xuất: thu hồi đúng token đang dùng, không đụng phiên khác của người đó */
  async logout(raw: string): Promise<void> {
    const hash = createHash('sha256').update(raw).digest('hex');
    const { rows } = await this.pool.query<{ tenant_id: string; id: string }>(
      `SELECT id, tenant_id FROM auth_find_refresh_token($1)`,
      [hash],
    );
    const rt = rows[0];
    if (rt === undefined) return;   // đăng xuất một phiên không tồn tại vẫn là thành công

    await this.trongTenant(rt.tenant_id, async (c) => {
      await c.query(`UPDATE refresh_token SET revoked_at = now() WHERE id = $1`, [rt.id]);
    });
  }

  private async thuHoiToanBoPhien(tenantId: string, userId: string): Promise<void> {
    await this.trongTenant(tenantId, async (c) => {
      await c.query(
        `UPDATE refresh_token SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    });
  }

  /** Refresh token xoay vòng — lưu dạng băm, không lưu bản gốc */
  private async issueRefresh(
    tenantId: string,
    userId: string,
    thayCho?: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(raw).digest('hex');
    await this.trongTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO refresh_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1,$2,$3, now() + interval '30 days') RETURNING id`,
        [tenantId, userId, hash],
      );
      /*
       * 🔒 Thu hồi cái cũ và trỏ sang cái mới TRONG CÙNG giao dịch.
       *
       * Tách ra hai giao dịch thì có một khoảnh khắc hai token cùng sống — và
       * nếu tiến trình chết đúng lúc đó, token cũ sống mãi. Cả hai đều làm
       * hỏng chính điều mà việc xoay vòng sinh ra để bảo đảm.
       */
      if (thayCho !== undefined) {
        await client.query(
          `UPDATE refresh_token SET revoked_at = now(), replaced_by_id = $2 WHERE id = $1`,
          [thayCho, rows[0]!.id],
        );
      }
    });
    return raw;
  }

  /**
   * Chạy một khối trong ngữ cảnh tenant.
   *
   * ⚠️ `set_config(..., is_local => true)` chỉ sống trong phạm vi TRANSACTION.
   * Ba chỗ trong file này từng chép lại nguyên khối BEGIN/set_config/COMMIT —
   * và mỗi bản chép là một cơ hội quên `ROLLBACK` ở nhánh lỗi.
   */
  private async trongTenant<T>(
    tenantId: string,
    than: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
      const kq = await than(client);
      await client.query('COMMIT');
      return kq;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

function requireSecret(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length < 16) {
    throw new Error(`Thiếu hoặc quá ngắn biến môi trường ${name} (cần ≥ 16 ký tự)`);
  }
  return v;
}

/** Định dạng: scrypt$<salt>$<hash> — khớp infra/seed.ts */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const expected = parts[2];
  if (salt === undefined || expected === undefined) return false;
  const actual = scryptSync(plain, salt, 64).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  // 🔒 So sánh thời gian hằng định — chống timing attack
  return a.length === b.length && timingSafeEqual(a, b);
}
