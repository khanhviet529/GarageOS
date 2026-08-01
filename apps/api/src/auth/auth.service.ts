import { Injectable } from '@nestjs/common';
import { timingSafeEqual, scryptSync, randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
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
  async login(input: LoginInput): Promise<LoginOutput> {
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
      const { rows } = await client.query<{ branch_id: string }>(
        'SELECT branch_id FROM user_branch WHERE user_id = $1',
        [userId],
      );
      await client.query('COMMIT');
      return rows.map((r) => r.branch_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
      { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
    );
  }

  /** Refresh token xoay vòng — lưu dạng băm, không lưu bản gốc */
  private async issueRefresh(tenantId: string, userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(raw).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');   // ⚠️ set_config local cần transaction
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
      await client.query(
        `INSERT INTO refresh_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1,$2,$3, now() + interval '30 days')`,
        [tenantId, userId, hash],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return raw;
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
