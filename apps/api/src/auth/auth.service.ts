import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Pool, PoolClient } from 'pg';
import { Inject } from '@nestjs/common';
import { ErrorCode, type LoginInput, type LoginOutput, type Role } from '@garageos/contracts';
/*
 * 🔒 Định dạng mật khẩu ở `@garageos/domain`, không còn một bản riêng ở đây.
 *
 * Bản cũ nằm ngay trong file này, mang chú thích "khớp infra/seed.ts" — nghĩa
 * là hai nửa của một định dạng (bên ghi và bên đọc) được giữ đồng bộ bằng trí
 * nhớ. Đổi `64` thành số khác ở một bên thì không lỗi cú pháp, không lỗi kiểu,
 * không lỗi lúc chạy: chỉ là không ai đăng nhập được nữa, và câu người dùng
 * thấy là "sai mật khẩu".
 */
import { khopMatKhau } from '@garageos/domain';
import { BusinessError } from '../common/errors';
import { APP_POOL } from '../db/db.module';

/**
 * Cửa sổ coi một lần dùng lại là "thua cuộc đua" chứ không phải "bị đánh cắp".
 *
 * Đủ rộng để bao một cú bấm đúp hoặc hai tab cùng gia hạn; đủ hẹp để một token
 * thật sự bị đánh cắp và đem dùng sau đó vẫn kích hoạt thu hồi toàn bộ phiên.
 */
const AN_HAN_GIAY = 10;

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
    if (!khopMatKhau(input.password, user.password_hash)) return invalid();

    const branchIds = await this.loadBranchIds(user.tenant_id, user.id);

    return {
      accessToken: this.signAccess(user, branchIds),
      // Không truyền `thayCho` nên không có cuộc đua nào để thua -> luôn có giá trị
      refreshToken: (await this.issueRefresh(user.tenant_id, user.id))!,
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
      replaced_by_id: string | null;
      het_han: boolean;
      vua_thay_the: boolean;
    }>(
      // Truy vấn này chạy TRƯỚC khi biết tenant — cùng lý do với `login`, nên
      // đi qua hàm SECURITY DEFINER hẹp thay vì nới RLS.
      `SELECT id, tenant_id, user_id, revoked_at, replaced_by_id,
              expires_at <= now() AS het_han,
              revoked_at > now() - make_interval(secs => $2::int) AS vua_thay_the
         FROM auth_find_refresh_token($1)`,
      [hash, AN_HAN_GIAY],
    );
    const rt = rows[0];

    // Cùng một câu trả lời cho mọi kiểu hỏng — không nói cho người gọi biết
    // token của họ sai ở chỗ nào.
    const hong = (): never => {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Phiên đã hết hạn, đăng nhập lại');
    };
    if (rt === undefined || rt.het_han) return hong();

    if (rt.revoked_at !== null) {
      /*
       * 🔒 Phân biệt "dùng lại token cũ" với "thua một cuộc đua".
       *
       * Token vừa bị thay thế trong vài giây gần đây là hai tab, một cú bấm
       * đúp, hoặc một lần thử lại của client — không phải tấn công. Gộp nó vào
       * diện "token bị đánh cắp" có hậu quả đo được: bài kiểm chứng cho thấy
       * sau hai request đồng thời, người dùng còn ĐÚNG 0 token sống. Kẻ thua
       * kích hoạt thu hồi toàn bộ, và cái bị thu hồi gồm cả token mà kẻ thắng
       * vừa cấp. Một cú bấm đúp đá người dùng ra khỏi hệ thống.
       *
       * Cửa sổ ân hạn KHÔNG nới lỏng bảo mật: kẻ tấn công dùng token cũ trong
       * cửa sổ đó vẫn nhận 401 và vẫn không có phiên nào. Nó chỉ ngăn phản ứng
       * hạt nhân khi hai request HỢP LỆ chạm nhau.
       */
      if (!(rt.vua_thay_the && rt.replaced_by_id !== null)) {
        await this.thuHoiToanBoPhien(rt.tenant_id, rt.user_id);
      }
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
    if (moi === null) return hong();   // thua cuộc đua — token đã bị request khác dùng

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
  ): Promise<string | null> {
    const raw = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(raw).digest('hex');

    const thang = await this.trongTenant(tenantId, async (client) => {
      /*
       * 🔒 GIÀNH token cũ TRƯỚC khi phát token mới, bằng một câu vừa kiểm vừa ghi.
       *
       * `WHERE ... AND revoked_at IS NULL` biến câu này thành compare-and-set:
       * PostgreSQL khoá hàng, và chỉ giao dịch nào còn thấy `NULL` mới ghi
       * được. Giao dịch thứ hai chờ, rồi thấy 0 dòng bị ảnh hưởng — nó biết
       * mình thua và không phát token nào.
       *
       * Bản trước đọc trạng thái ở một câu và ghi ở câu khác. Giữa hai câu đó
       * là một cửa sổ, và Codex chỉ đúng vào nó (AUTH-001). Cùng họ với
       * STOCKTAKE-001 ở vòng review trước: kiểm rồi mới ghi thì luôn có một
       * khoảng ở giữa.
       */
      if (thayCho !== undefined) {
        const { rowCount } = await client.query(
          `UPDATE refresh_token SET revoked_at = now()
            WHERE id = $1 AND revoked_at IS NULL`,
          [thayCho],
        );
        if (rowCount !== 1) return false;
      }

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO refresh_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1,$2,$3, now() + interval '30 days') RETURNING id`,
        [tenantId, userId, hash],
      );
      /*
       * Nối cũ sang mới TRONG CÙNG giao dịch. Tách ra thì có một khoảnh khắc
       * token cũ đã thu hồi mà chưa trỏ đi đâu — và `refresh()` dùng đúng con
       * trỏ đó để phân biệt "thua cuộc đua" với "token bị đánh cắp".
       */
      if (thayCho !== undefined) {
        await client.query(`UPDATE refresh_token SET replaced_by_id = $2 WHERE id = $1`, [
          thayCho,
          rows[0]!.id,
        ]);
      }
      return true;
    });

    return thang ? raw : null;
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

