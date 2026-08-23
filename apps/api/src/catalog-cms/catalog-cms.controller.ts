import {
  Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import {
  CategoryInput, CategoryUpdateInput, ErrorCode, TestimonialInput,
  TestimonialUpdateInput, type ActorContext,
} from '@garageos/contracts';
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
