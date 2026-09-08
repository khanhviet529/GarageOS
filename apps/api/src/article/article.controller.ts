import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ArticleCategoryInput,
  ArticleCategoryUpdateInput,
  ArticleCreateInput,
  ArticleDraftInput,
  ErrorCode,
  type ActorContext,
  type ArticleDraftView,
  type ArticleRow,
} from '@garageos/contracts';
import { TenantAwareDb } from '@garageos/db';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';
import { ArticleService } from './article.service';

/**
 * Bài viết trên landing — bề mặt quản trị.
 *
 * 🔒 Ba quyền, ba việc: đọc, soạn, công bố. `articlePublish` là quyền hẹp nhất
 *    và nó canh đúng một hành động — đưa văn bản ra tên miền của khách.
 */
@Controller('api/v1/marketing')
@UseGuards(JwtGuard)
export class ArticleController {
  constructor(
    @Inject(ArticleService) private readonly svc: ArticleService,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  /* ------------------------------ Chuyên mục ------------------------------ */

  @Get('article-categories')
  async categories(@Actor() actor: ActorContext): Promise<{ items: Record<string, unknown>[] }> {
    assertCan(actor, 'marketing:articleRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: (await tx.query(
        `SELECT id, name, slug, display_order AS "displayOrder", version
           FROM article_category ORDER BY display_order, name`,
      )).rows,
    }));
  }

  @Post('article-categories')
  async createCategory(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(ArticleCategoryInput)) input: ArticleCategoryInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:articleWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO article_category (tenant_id, name, slug, display_order, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
        [actor.tenantId, input.name, input.slug, input.displayOrder, actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  @Patch('article-categories/:id')
  async updateCategory(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ArticleCategoryUpdateInput)) input: ArticleCategoryUpdateInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'marketing:articleWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ version: string }>(
        `UPDATE article_category SET name=$2, slug=$3, display_order=$4, updated_by=$5
          WHERE id=$1 AND version=$6 RETURNING version`,
        [id, input.name, input.slug, input.displayOrder, actor.userId, input.version],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Chuyên mục đã thay đổi hoặc không tồn tại.');
      }
      return { version: Number(rows[0].version) };
    });
  }

  /**
   * Xoá chuyên mục. Bài đang thuộc chuyên mục đó KHÔNG bị xoá theo — khoá ngoại
   * là `ON DELETE SET NULL` (0077): mất một nhãn phân loại không được kéo theo
   * mất một bài viết.
   */
  @Delete('article-categories/:id')
  async deleteCategory(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ deleted: true }> {
    assertCan(actor, 'marketing:articleWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query('DELETE FROM article_category WHERE id=$1', [id]);
      if (rowCount === 0) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy chuyên mục.');
      return { deleted: true };
    });
  }

  /* ------------------------------- Bài viết ------------------------------- */

  @Get('articles')
  async list(@Actor() actor: ActorContext): Promise<{ items: ArticleRow[] }> {
    assertCan(actor, 'marketing:articleRead');
    return { items: await this.svc.list(actor) };
  }

  @Post('articles')
  create(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(ArticleCreateInput)) input: ArticleCreateInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:articleWrite');
    return this.svc.create(actor, input);
  }

  @Get('articles/:id/draft')
  draft(@Actor() actor: ActorContext, @Param('id') id: string): Promise<ArticleDraftView> {
    /*
     * `articleWrite` chứ không phải `articleRead`: mở bản nháp CÓ THỂ tạo ra một
     * bản nháp mới (chép từ bản đang hiện). Một endpoint đọc mà ghi thì quyền
     * của nó phải là quyền ghi.
     */
    assertCan(actor, 'marketing:articleWrite');
    return this.svc.draft(actor, id);
  }

  @Patch('articles/:id/draft')
  patchDraft(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ArticleDraftInput.extend({ version: ArticleCategoryUpdateInput.shape.version })))
    input: ArticleDraftInput & { version: number },
  ): Promise<{ version: number }> {
    assertCan(actor, 'marketing:articleWrite');
    return this.svc.patchDraft(actor, id, input, input.version);
  }

  @Post('articles/:id/publish')
  publish(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ revisionId: string }> {
    assertCan(actor, 'marketing:articlePublish');
    return this.svc.publish(actor, id);
  }

  @Post('articles/:id/featured')
  setFeatured(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Query('on') on?: string,
  ): Promise<{ featured: boolean }> {
    assertCan(actor, 'marketing:articlePublish');
    return this.svc.setFeatured(actor, id, on !== 'false');
  }
}
