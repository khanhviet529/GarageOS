import {
  Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  CreateVariantInput,
  CreateVehicleProductInput,
  PatchProductDraftInput,
  SiteProfileDraftInput,
  type ActorContext,
  type SeoValidationResult,
} from '@garageos/contracts';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';
import { MarketingService, type AdminProductRow } from './marketing.service';

/**
 * Marketing authenticated — SRS Phase 1 mục 11.2.
 *
 * 🔒 Quyền enforce ở API (không dựa vào UI). PATCH chỉ sửa field bản nháp,
 * không nhận `status`; publish/archive là endpoint hành động riêng.
 */
@Controller('api/v1/marketing')
@UseGuards(JwtGuard)
export class MarketingController {
  constructor(@Inject(MarketingService) private readonly svc: MarketingService) {}

  /* ---------------- Catalog ---------------- */

  @Get('vehicle-products')
  async listProducts(
    @Actor() actor: ActorContext,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ items: AdminProductRow[]; nextCursor: string | null }> {
    assertCan(actor, 'marketing:catalogRead');
    const limit = Number(limitRaw ?? 20);
    return this.svc.listProducts(actor, {
      cursor,
      limit: Number.isFinite(limit) ? limit : 20,
    });
  }

  @Post('vehicle-products')
  createProduct(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateVehicleProductInput)) input: CreateVehicleProductInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:catalogWrite');
    return this.svc.createProduct(actor, input);
  }

  @Get('vehicle-products/:id')
  getProduct(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    assertCan(actor, 'marketing:catalogRead');
    return this.svc.getProduct(actor, id);
  }

  /** Nhân bản đang-publish thành bản nháp mới — đối xứng với experience. */
  @Post('vehicle-products/:id/draft')
  cloneProductDraft(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ draftId: string }> {
    assertCan(actor, 'marketing:catalogWrite');
    return this.svc.cloneProductDraft(actor, id);
  }

  @Patch('vehicle-products/:id/draft')
  patchProductDraft(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(PatchProductDraftInput)) input: PatchProductDraftInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'marketing:catalogWrite');
    return this.svc.patchProductDraft(actor, id, input);
  }

  @Post('vehicle-products/:id/variants')
  createVariant(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(CreateVariantInput)) input: CreateVariantInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:catalogWrite');
    return this.svc.createVariant(actor, id, input);
  }

  @Post('vehicle-products/:id/publish')
  publishProduct(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body() input: { version: number },
  ): Promise<{ revisionId: string; version: number }> {
    assertCan(actor, 'marketing:catalogPublish');
    return this.svc.publishProduct(actor, id, input);
  }

  @Post('vehicle-products/:id/rollback')
  rollbackProduct(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ revisionId: string }> {
    assertCan(actor, 'marketing:catalogPublish');
    return this.svc.rollbackProduct(actor, id);
  }

  @Post('vehicle-products/:id/archive')
  archiveProduct(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ lifecycleStatus: string }> {
    assertCan(actor, 'marketing:catalogPublish');
    return this.svc.archiveProduct(actor, id);
  }

  /* ---------------- Experience ---------------- */

  @Get('vehicle-products/:id/experiences')
  listExperiences(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>[]> {
    assertCan(actor, 'marketing:experienceRead');
    return this.svc.listExperiences(actor, id);
  }

  @Post('vehicle-products/:id/experiences')
  createExperience(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body() input: { kind: 'EXTERIOR_SPIN' | 'INTERIOR_PANORAMA'; label: string; config?: Record<string, unknown> },
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:experienceWrite');
    return this.svc.createExperience(actor, id, input);
  }

  @Post('vehicle-experiences/:id/draft')
  cloneExperienceDraft(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ draftId: string }> {
    assertCan(actor, 'marketing:experienceWrite');
    return this.svc.cloneExperienceDraft(actor, id);
  }

  @Patch('vehicle-experiences/:id/draft')
  patchExperienceDraft(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body() input: { version: number; label?: string; config?: Record<string, unknown> },
  ): Promise<{ version: number }> {
    assertCan(actor, 'marketing:experienceWrite');
    return this.svc.patchExperienceDraft(actor, id, input);
  }

  @Post('vehicle-experiences/:id/publish')
  publishExperience(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body() input: { version: number },
  ): Promise<{ versionId: string }> {
    assertCan(actor, 'marketing:experiencePublish');
    return this.svc.publishExperience(actor, id, input);
  }

  @Post('vehicle-experiences/:id/rollback')
  rollbackExperience(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ versionId: string }> {
    assertCan(actor, 'marketing:experiencePublish');
    return this.svc.rollbackExperience(actor, id);
  }

  @Post('vehicle-experiences/:id/archive')
  archiveExperience(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ lifecycleStatus: string }> {
    assertCan(actor, 'marketing:experiencePublish');
    return this.svc.archiveExperience(actor, id);
  }

  /* ---------------- Site / Branch profile ---------------- */

  @Get('site-profile')
  getSiteProfile(@Actor() actor: ActorContext): Promise<Record<string, unknown>> {
    assertCan(actor, 'marketing:seoRead');
    return this.svc.getSiteProfile(actor);
  }

  @Patch('site-profile/:draftId')
  patchSiteProfileDraft(
    @Actor() actor: ActorContext,
    @Param('draftId') draftId: string,
    @Body(new ZodPipe(SiteProfileDraftInput)) input: SiteProfileDraftInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'marketing:seoWrite');
    return this.svc.patchSiteProfileDraft(actor, draftId, input);
  }

  @Post('site-profile/:draftId/publish')
  publishSiteProfile(
    @Actor() actor: ActorContext,
    @Param('draftId') draftId: string,
  ): Promise<{ nextDraftId: string }> {
    assertCan(actor, 'marketing:seoPublish');
    return this.svc.publishSiteProfile(actor, draftId);
  }

  /**
   * Danh bạ chi nhánh — bảng tra cứu cho mọi màn hiện tên thay cho uuid, và cho
   * màn khai khả năng giao xe (phải chọn được chi nhánh CHƯA có khai báo).
   */
  @Get('branches')
  listBranches(
    @Actor() actor: ActorContext,
  ): Promise<{ id: string; code: string; name: string; isActive: boolean }[]> {
    assertCan(actor, 'org:branchRead');
    return this.svc.listBranches(actor);
  }

  @Get('branch-public-profiles')
  listBranchProfiles(@Actor() actor: ActorContext): Promise<Record<string, unknown>[]> {
    assertCan(actor, 'marketing:seoRead');
    return this.svc.listBranchProfiles(actor);
  }

  @Patch('branch-public-profiles/:branchId/draft')
  patchBranchProfileDraft(
    @Actor() actor: ActorContext,
    @Param('branchId') branchId: string,
    @Body() input: { version: number; publicName?: string; publicPhone?: string | null; publicAddress?: string | null },
  ): Promise<{ version: number; draftId: string }> {
    assertCan(actor, 'marketing:seoWrite');
    return this.svc.patchBranchProfileDraft(actor, branchId, input);
  }

  @Post('branch-public-profiles/:branchId/publish')
  publishBranchProfile(
    @Actor() actor: ActorContext,
    @Param('branchId') branchId: string,
  ): Promise<{ nextDraftId: string }> {
    assertCan(actor, 'marketing:seoPublish');
    return this.svc.publishBranchProfile(actor, branchId);
  }

  /* ---------------- SEO validate ---------------- */

  @Post('seo/validate')
  seoValidate(
    @Actor() actor: ActorContext,
    @Body() input: { targetType: string; targetId: string; draftVersion: number },
  ): Promise<SeoValidationResult> {
    assertCan(actor, 'marketing:seoRead');
    return this.svc.seoValidate(actor, input);
  }
}
