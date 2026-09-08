import {
  Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import {
  CategoryInput, CategoryUpdateInput, ErrorCode, FaqItemInput, FaqItemUpdateInput,
  TestimonialInput, TestimonialUpdateInput,
  type ActorContext, type FaqItemRow, type FaqSurface,
} from '@garageos/contracts';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';

/** Tenant-scoped flat categories and admin-authored testimonials. */
@Controller('api/v1/marketing')
@UseGuards(JwtGuard)
export class CatalogCmsController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Get('categories')
  async categories(@Actor() actor: ActorContext): Promise<{ items: Record<string, unknown>[] }> {
    assertCan(actor, 'marketing:categoryRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: (await tx.query(
        `SELECT id, name, slug, description, image_media_id AS "imageMediaId", status,
                sort_order AS "sortOrder", seo_title AS "seoTitle", seo_description AS "seoDescription", version
           FROM vehicle_product_category ORDER BY sort_order, name`,
      )).rows,
    }));
  }

  @Post('categories')
  async createCategory(@Actor() actor: ActorContext, @Body(new ZodPipe(CategoryInput)) input: CategoryInput): Promise<{ id: string }> {
    assertCan(actor, 'marketing:categoryWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO vehicle_product_category
          (tenant_id,name,slug,description,image_media_id,status,sort_order,seo_title,seo_description,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [actor.tenantId, input.name, input.slug, input.description ?? null, input.imageMediaId ?? null,
          input.status, input.sortOrder, input.seoTitle ?? null, input.seoDescription ?? null, actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  @Patch('categories/:id')
  async updateCategory(@Actor() actor: ActorContext, @Param('id') id: string, @Body(new ZodPipe(CategoryUpdateInput)) input: CategoryUpdateInput): Promise<{ item: Record<string, unknown> }> {
    assertCan(actor, 'marketing:categoryWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `UPDATE vehicle_product_category SET name=$2,slug=$3,description=$4,image_media_id=$5,status=$6,
             sort_order=$7,seo_title=$8,seo_description=$9,updated_by=$10
         WHERE id=$1 AND version=$11 RETURNING id, version`,
        [id, input.name, input.slug, input.description ?? null, input.imageMediaId ?? null, input.status,
          input.sortOrder, input.seoTitle ?? null, input.seoDescription ?? null, actor.userId, input.version],
      );
      if (rows[0] === undefined) throw new BusinessError(ErrorCode.STALE_VERSION, 'Category đã thay đổi hoặc không tồn tại.');
      return { item: rows[0] };
    });
  }

  @Delete('categories/:id')
  async deleteCategory(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ deleted: true }> {
    assertCan(actor, 'marketing:categoryWrite');
    return this.db.withTenant(actor, async (tx) => {
      const referenced = await tx.query('SELECT 1 FROM vehicle_product WHERE category_id=$1 LIMIT 1', [id]);
      if ((referenced.rowCount ?? 0) > 0) throw new BusinessError(ErrorCode.RESOURCE_CONFLICT, 'Category đang được gán cho sản phẩm; hãy gán lại sản phẩm trước khi xoá.');
      const result = await tx.query('DELETE FROM vehicle_product_category WHERE id=$1', [id]);
      if (result.rowCount !== 1) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy category.');
      return { deleted: true };
    });
  }

  @Get('testimonials')
  async testimonials(@Actor() actor: ActorContext): Promise<{ items: Record<string, unknown>[] }> {
    assertCan(actor, 'marketing:reviewRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: (await tx.query(
        `SELECT id, display_name AS "displayName", content, rating, vehicle_id AS "vehicleId", featured,
                sort_order AS "sortOrder", status, version FROM testimonial ORDER BY sort_order, created_at DESC`,
      )).rows,
    }));
  }

  @Post('testimonials')
  async createTestimonial(@Actor() actor: ActorContext, @Body(new ZodPipe(TestimonialInput)) input: TestimonialInput): Promise<{ id: string }> {
    assertCan(actor, 'marketing:reviewWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO testimonial
          (tenant_id,display_name,content,rating,vehicle_id,featured,sort_order,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
        [actor.tenantId, input.displayName, input.content, input.rating ?? null, input.vehicleId ?? null,
          input.featured, input.sortOrder, actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  @Patch('testimonials/:id')
  async updateTestimonial(@Actor() actor: ActorContext, @Param('id') id: string, @Body(new ZodPipe(TestimonialUpdateInput)) input: TestimonialUpdateInput): Promise<{ item: Record<string, unknown> }> {
    assertCan(actor, 'marketing:reviewWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `UPDATE testimonial SET display_name=$2,content=$3,rating=$4,vehicle_id=$5,featured=$6,sort_order=$7,updated_by=$8
          WHERE id=$1 AND status='DRAFT' AND version=$9 RETURNING id, version`,
        [id, input.displayName, input.content, input.rating ?? null, input.vehicleId ?? null,
          input.featured, input.sortOrder, actor.userId, input.version],
      );
      if (rows[0] === undefined) throw new BusinessError(ErrorCode.INVALID_STATE_TRANSITION, 'Chỉ testimonial nháp hiện tại mới được chỉnh sửa.');
      return { item: rows[0] };
    });
  }

  @Post('testimonials/:id/publish')
  publish(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ status: 'PUBLISHED' }> {
    assertCan(actor, 'marketing:reviewPublish');
    return this.status(actor, id, 'PUBLISHED', 'DRAFT');
  }

  @Post('testimonials/:id/hide')
  hide(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ status: 'HIDDEN' }> {
    assertCan(actor, 'marketing:reviewPublish');
    return this.status(actor, id, 'HIDDEN', 'PUBLISHED');
  }

  /* ========================= Câu hỏi thường gặp ========================== */

  @Get('faq-items')
  async faqItems(@Actor() actor: ActorContext): Promise<{ items: FaqItemRow[] }> {
    assertCan(actor, 'marketing:faqRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: (await tx.query<FaqItemRow>(
        `SELECT f.id, f.question, f.answer, f.topic, f.display_order AS "displayOrder",
                f.status, f.version,
                COALESCE(
                  (SELECT array_agg(p.surface::text ORDER BY p.surface)
                     FROM faq_placement p WHERE p.faq_item_id = f.id AND p.enabled),
                  '{}'
                ) AS surfaces
           FROM faq_item f
          ORDER BY f.display_order, f.created_at`,
      )).rows,
    }));
  }

  @Post('faq-items')
  async createFaqItem(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(FaqItemInput)) input: FaqItemInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:faqWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO faq_item (tenant_id, question, answer, topic, display_order, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [actor.tenantId, input.question, input.answer, input.topic ?? null, input.displayOrder, actor.userId],
      );
      const id = rows[0]!.id;
      await this.datViTri(tx, actor, id, input.surfaces);
      return { id };
    });
  }

  @Patch('faq-items/:id')
  async updateFaqItem(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(FaqItemUpdateInput)) input: FaqItemUpdateInput,
  ): Promise<{ item: Record<string, unknown> }> {
    assertCan(actor, 'marketing:faqWrite');
    return this.db.withTenant(actor, async (tx) => {
      /*
       * 🔒 Sửa được cả khi ĐANG PUBLISHED, khác với testimonial.
       *
       * Testimonial là lời của NGƯỜI KHÁC: sửa nội dung đã công bố là sửa lời
       * của họ, nên phải gỡ xuống trước. Câu hỏi thường gặp là lời của chính
       * xưởng — và một câu trả lời SAI đang hiện trên trang thì thứ cần nhất là
       * sửa được ngay, không phải một quy trình.
       *
       * Đổi lại, `version` vẫn phải khớp: hai người sửa cùng lúc thì một người
       * nhận lỗi, không phải mất bài.
       */
      const { rows } = await tx.query<Record<string, unknown>>(
        `UPDATE faq_item SET question=$2, answer=$3, topic=$4, display_order=$5, updated_by=$6
          WHERE id=$1 AND version=$7 RETURNING id, version`,
        [id, input.question, input.answer, input.topic ?? null, input.displayOrder, actor.userId, input.version],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Câu hỏi đã thay đổi, hãy tải lại.');
      }
      await this.datViTri(tx, actor, id, input.surfaces);
      return { item: rows[0] };
    });
  }

  @Delete('faq-items/:id')
  async deleteFaqItem(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ deleted: true }> {
    assertCan(actor, 'marketing:faqWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query('DELETE FROM faq_item WHERE id=$1', [id]);
      if (rowCount === 0) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy câu hỏi.');
      return { deleted: true };
    });
  }

  @Post('faq-items/:id/publish')
  publishFaq(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ status: 'PUBLISHED' }> {
    assertCan(actor, 'marketing:faqPublish');
    return this.trangThaiFaq(actor, id, 'PUBLISHED', ['DRAFT', 'HIDDEN']);
  }

  @Post('faq-items/:id/hide')
  hideFaq(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ status: 'HIDDEN' }> {
    assertCan(actor, 'marketing:faqPublish');
    return this.trangThaiFaq(actor, id, 'HIDDEN', ['PUBLISHED']);
  }

  private async trangThaiFaq<T extends 'PUBLISHED' | 'HIDDEN'>(
    actor: ActorContext,
    id: string,
    status: T,
    tu: ('DRAFT' | 'PUBLISHED' | 'HIDDEN')[],
  ): Promise<{ status: T }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ status: T }>(
        'UPDATE faq_item SET status=$2, updated_by=$3 WHERE id=$1 AND status = ANY($4) RETURNING status',
        [id, status, actor.userId, tu],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.INVALID_STATE_TRANSITION, 'Chuyển trạng thái câu hỏi không hợp lệ.');
      }
      return { status: rows[0].status };
    });
  }

  /**
   * Đặt lại TOÀN BỘ vị trí hiện của một câu hỏi.
   *
   * 🔒 Xoá-rồi-chèn ở đây là an toàn, khác với màu xe (0072): không bảng nào trỏ
   *    tới `faq_placement`, khoá chính của nó là `(faq_item_id, surface)` chứ
   *    không phải một uuid sinh ra, nên không có `id` nào để mất.
   */
  private async datViTri(
    tx: PoolClient,
    actor: ActorContext,
    faqItemId: string,
    surfaces: FaqSurface[],
  ): Promise<void> {
    await tx.query(
      `DELETE FROM faq_placement WHERE faq_item_id = $1 AND surface <> ALL($2::faq_surface[])`,
      [faqItemId, surfaces],
    );
    for (const s of surfaces) {
      await tx.query(
        `INSERT INTO faq_placement (tenant_id, faq_item_id, surface, enabled)
         VALUES ($1,$2,$3::faq_surface,true)
         ON CONFLICT (faq_item_id, surface) DO UPDATE SET enabled = true`,
        [actor.tenantId, faqItemId, s],
      );
    }
  }

  private async status<T extends 'PUBLISHED' | 'HIDDEN'>(actor: ActorContext, id: string, status: T, from: 'DRAFT' | 'PUBLISHED'): Promise<{ status: T }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ status: T }>(
        'UPDATE testimonial SET status=$2,updated_by=$3 WHERE id=$1 AND status=$4 RETURNING status',
        [id, status, actor.userId, from],
      );
      if (rows[0] === undefined) throw new BusinessError(ErrorCode.INVALID_STATE_TRANSITION, 'Chuyển trạng thái testimonial không hợp lệ.');
      return { status: rows[0].status };
    });
  }
}
