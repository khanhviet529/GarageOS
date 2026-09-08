import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import {
  ErrorCode,
  UserRolesInput,
  type ActorContext,
  type AdminUserRow,
} from '@garageos/contracts';
import { TenantAwareDb } from '@garageos/db';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';

/**
 * Người dùng và vai.
 *
 * 🔒 Màn này chỉ ĐỌC và GÁN vai. Nó KHÔNG định nghĩa lại quyền: ma trận nằm ở
 *    `ACTION_ROLES` trong `packages/contracts` và service kiểm bằng `assertCan`.
 *    Cho giao diện sửa ma trận là để một lần bấm nhầm mở được đường vào mà không
 *    có test nào canh.
 *
 * Ba hàng rào dưới đây đều là hàng rào CHỐNG TỰ KHOÁ hoặc CHỐNG LEO THANG, và cả
 * ba đều phải nằm ở service — không ràng buộc database nào diễn đạt được chúng.
 */
@Controller('api/v1/admin')
@UseGuards(JwtGuard)
export class UserAdminController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Get('users')
  async list(@Actor() actor: ActorContext): Promise<{ items: AdminUserRow[] }> {
    assertCan(actor, 'org:userRead');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        /*
         * KHÔNG chọn `password_hash`, kể cả khi nó có bị lược ở tầng map.
         * Một cột không được SELECT thì không có đường nào lọt ra ngoài; lược ở
         * tầng map thì chỉ cần một lần `res.json(row)` là xong.
         */
        /*
         * 🔒 `roles::text[]` — node-pg KHÔNG parse được mảng enum tuỳ biến, nó trả
         *    về nguyên chuỗi `{OWNER,SALES_MANAGER}`. Cùng cách xử lý với
         *    `auth.service.ts`, và đây là lần thứ hai cùng một cái bẫy.
         *
         *    Nó im lặng theo cách khó chịu nhất: `roles.includes('OWNER')` trên
         *    chuỗi vẫn đúng nhờ so khớp chuỗi con, nên một bài kiểm hời hợt vẫn
         *    xanh trong khi giao diện nhận về một chuỗi và render từng ký tự.
         */
        `SELECT u.id, u.full_name, u.phone, u.email, u.roles::text[] AS roles, u.is_active, u.version,
                COALESCE((SELECT array_agg(b.name ORDER BY b.name)
                            FROM user_branch ub JOIN branch b ON b.id = ub.branch_id
                           WHERE ub.user_id = u.id), '{}') AS branch_names
           FROM app_user u
          ORDER BY u.is_active DESC, u.full_name`,
      );
      return {
        items: rows.map((r) => ({
          id: r.id as string,
          fullName: r.full_name as string,
          phone: r.phone as string,
          email: (r.email ?? null) as string | null,
          roles: r.roles as AdminUserRow['roles'],
          isActive: r.is_active as boolean,
          branchNames: r.branch_names as string[],
          version: Number(r.version),
        })),
      };
    });
  }

  @Put('users/:id/roles')
  async setRoles(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(UserRolesInput)) input: UserRolesInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'org:userRoleWrite');

    /*
     * 🔒 HÀNG RÀO 1 — không tự sửa vai của chính mình.
     *
     * Chủ doanh nghiệp tự gỡ vai `OWNER` của mình là tự khoá mình ra khỏi màn
     * này, và không còn đường nào quay lại ngoài `psql`. Tự thêm vai thì vô
     * nghĩa (họ đã có quyền cao nhất), nên chặn cả hai chiều là không mất gì.
     */
    if (id === actor.userId) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        'Không tự đổi vai của chính mình. Nhờ một chủ doanh nghiệp khác đổi giúp.',
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const { rows: cu } = await tx.query<{ roles: string[]; version: string }>(
        // `::text[]` như trên — so sánh mảng vai phải là so sánh MẢNG.
        'SELECT roles::text[] AS roles, version FROM app_user WHERE id = $1 FOR UPDATE',
        [id],
      );
      const nguoi = cu[0];
      if (nguoi === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
      if (Number(nguoi.version) !== input.version) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Người dùng đã thay đổi, hãy tải lại.');
      }

      /*
       * 🔒 HÀNG RÀO 2 — sau thay đổi phải CÒN ít nhất một chủ đang hoạt động.
       *
       * Không còn chủ nào nghĩa là doanh nghiệp mất quyền gán vai, mất quyền
       * duyệt xuất bản và mất quyền sửa biểu phí — không có đường nào lấy lại
       * ngoài `psql`.
       *
       * ⚠️ Với LUẬT HIỆN TẠI, nhánh này KHÔNG VỚI TỚI ĐƯỢC, và nói ra điều đó
       *    quan trọng hơn là giả vờ có test cho nó:
       *
       *      · chỉ `OWNER` có `org:userRoleWrite`, nên người bấm luôn là một chủ
       *        đang hoạt động;
       *      · hàng rào 1 cấm tự sửa mình, nên người bấm KHÁC người bị sửa;
       *      · vậy sau khi gỡ vai của người kia, người bấm vẫn là một chủ.
       *
       *    Nó ở lại vì nó là bất biến đúng độc lập với hai điều kiện trên. Nới
       *    hàng rào 1 ("chủ được tự hạ mình") là hàng rào này thành thứ duy nhất
       *    chặn cả doanh nghiệp tự khoá mình — và lúc đó không ai nhớ để thêm.
       *
       * Đếm TRONG transaction đã khoá dòng: hai lượt gỡ song song mà đếm ngoài
       * transaction thì cả hai đều thấy "còn hai chủ" và cùng đi qua.
       */
      const boOwner = nguoi.roles.includes('OWNER') && !input.roles.includes('OWNER');
      if (boOwner) {
        const { rows: dem } = await tx.query<{ n: string }>(
          `SELECT count(*) AS n FROM app_user
            WHERE is_active AND 'OWNER' = ANY(roles) AND id <> $1`,
          [id],
        );
        if (Number(dem[0]!.n) === 0) {
          throw new BusinessError(
            ErrorCode.RESOURCE_CONFLICT,
            'Đây là chủ doanh nghiệp duy nhất đang hoạt động. Hãy chỉ định một chủ khác trước khi gỡ vai này.',
          );
        }
      }

      const { rows } = await tx.query<{ version: string }>(
        'UPDATE app_user SET roles = $2::user_role[] WHERE id = $1 RETURNING version',
        [id, input.roles],
      );
      return { version: Number(rows[0]!.version) };
    });
  }
}
