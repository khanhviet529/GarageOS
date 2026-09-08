import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  ErrorCode,
  NavItemInput,
  RedirectInput,
  type ActorContext,
  type NavItemRow,
  type RedirectRow,
} from '@garageos/contracts';
import { TenantAwareDb } from '@garageos/db';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';

/**
 * Menu đầu trang / chân trang và bảng chuyển hướng.
 *
 * 🔒 Không có vòng nháp/duyệt ở đây, khác với bài viết và trang landing. Một
 *    mục menu là một dòng chữ và một đường dẫn — không có gì để "đọc lại trước
 *    khi đăng", và bắt nó qua vòng duyệt sẽ khiến sửa một lỗi chính tả trong
 *    menu mất hai người. Đổi lại, quyền GHI hẹp hơn quyền soạn nội dung.
 */
@Controller('api/v1/marketing')
@UseGuards(JwtGuard)
export class NavigationController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /* ------------------------------ Menu ------------------------------ */

  @Get('navigation')
  async list(@Actor() actor: ActorContext): Promise<{ items: NavItemRow[] }> {
    assertCan(actor, 'marketing:navigationRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: (await tx.query<NavItemRow>(
        `SELECT id, placement, column_index AS "columnIndex", label, path,
                external_url AS "externalUrl", display_order AS "displayOrder",
                visible, version
           FROM site_navigation
          ORDER BY placement, column_index, display_order, label`,
      )).rows,
    }));
  }

  @Post('navigation')
  async create(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(NavItemInput)) input: NavItemInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:navigationWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO site_navigation
           (tenant_id, placement, column_index, label, path, external_url,
            display_order, visible, created_by, updated_by)
         VALUES ($1,$2::nav_placement,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
        [actor.tenantId, input.placement, input.columnIndex, input.label,
          input.path ?? null, input.externalUrl ?? null, input.displayOrder,
          input.visible, actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  @Patch('navigation/:id')
  async update(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(NavItemInput)) input: NavItemInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'marketing:navigationWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ version: string }>(
        `UPDATE site_navigation
            SET placement=$2::nav_placement, column_index=$3, label=$4, path=$5,
                external_url=$6, display_order=$7, visible=$8, updated_by=$9
          WHERE id=$1 RETURNING version`,
        [id, input.placement, input.columnIndex, input.label, input.path ?? null,
          input.externalUrl ?? null, input.displayOrder, input.visible, actor.userId],
      );
      if (rows[0] === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy mục menu.');
      return { version: Number(rows[0].version) };
    });
  }

  @Delete('navigation/:id')
  async remove(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ deleted: true }> {
    assertCan(actor, 'marketing:navigationWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query('DELETE FROM site_navigation WHERE id=$1', [id]);
      if (rowCount === 0) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy mục menu.');
      return { deleted: true };
    });
  }

  /* --------------------------- Chuyển hướng --------------------------- */

  @Get('redirects')
  async redirects(@Actor() actor: ActorContext): Promise<{ items: RedirectRow[] }> {
    assertCan(actor, 'marketing:navigationRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: (await tx.query<RedirectRow>(
        `SELECT id, from_path AS "fromPath", to_path AS "toPath",
                status_code AS "statusCode", note, version
           FROM site_redirect ORDER BY from_path`,
      )).rows,
    }));
  }

  @Post('redirects')
  async createRedirect(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(RedirectInput)) input: RedirectInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:navigationWrite');
    return this.db.withTenant(actor, async (tx) => {
      await this.chanVongLap(tx, input.fromPath, input.toPath, null);
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO site_redirect (tenant_id, from_path, to_path, status_code, note, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [actor.tenantId, input.fromPath, input.toPath, input.statusCode, input.note ?? null, actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  @Delete('redirects/:id')
  async removeRedirect(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ deleted: true }> {
    assertCan(actor, 'marketing:navigationWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query('DELETE FROM site_redirect WHERE id=$1', [id]);
      if (rowCount === 0) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy chuyển hướng.');
      return { deleted: true };
    });
  }

  /**
   * 🔒 Chặn VÒNG LẶP, không chỉ chặn tự-trỏ.
   *
   * `redirect_khong_tu_tro` (0078) bắt được `/a → /a`. Nó KHÔNG bắt được
   * `/a → /b` khi đã có `/b → /a` — và vòng hai bước cho ra đúng cùng một kết
   * quả: `ERR_TOO_MANY_REDIRECTS`, không nói dòng nào sai.
   *
   * Đi theo chuỗi tối đa mười bước. Mười là quá đủ cho một trang bán xe, và một
   * giới hạn cứng ở đây quan trọng hơn sự đầy đủ: hàm này chạy trong transaction
   * của người dùng, nên nó phải kết thúc kể cả khi dữ liệu đã hỏng sẵn.
   */
  private async chanVongLap(
    tx: PoolClient,
    from: string,
    to: string,
    boQuaId: string | null,
  ): Promise<void> {
    let hienTai = to;
    for (let i = 0; i < 10; i += 1) {
      if (hienTai === from) {
        throw new BusinessError(
          ErrorCode.RESOURCE_CONFLICT,
          `Chuyển hướng tạo thành vòng lặp: ${from} quay về chính nó sau ${i + 1} bước.`,
        );
      }
      const { rows } = await tx.query<{ to_path: string }>(
        'SELECT to_path FROM site_redirect WHERE from_path = $1 AND ($2::uuid IS NULL OR id <> $2)',
        [hienTai, boQuaId],
      );
      if (rows[0] === undefined) return;
      hienTai = rows[0].to_path;
    }
    throw new BusinessError(
      ErrorCode.RESOURCE_CONFLICT,
      'Chuỗi chuyển hướng dài quá mười bước — nhiều khả năng đã có vòng lặp sẵn.',
    );
  }
}
