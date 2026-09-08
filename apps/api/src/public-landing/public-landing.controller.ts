import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ErrorCode,
  LeadCreateInput,
  type ExperienceManifest,
  type LeadCreateResult,
  type PublicProductDetail,
  type PublicProductSummary,
  FaqSurface,
  type PublicArticleDetail,
  type PublicArticleSummary,
  type PublicFaqItem,
  type PublicTestimonial,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { LeadRateLimitGuard } from '../common/lead-rate-limit.guard';
import { ZodPipe } from '../common/zod.pipe';
import { SalesService } from '../sales/sales.service';
import { TenantContextService, type TenantResolution } from './tenant-context.service';
import { PublicLandingService } from './public-landing.service';
import { LandingPageService } from '../landing-page/landing-page.service';
import { ArticleService } from '../article/article.service';

/**
 * Public API cho landing — SRS Phase 1 mục 11.1.
 *
 * 🔒 Không có JwtGuard, không nhận tenantId từ client. Tenant chỉ đến từ host
 * đã được edge ký (INV-LS-01). Alias ACTIVE redirect 308 một bước về primary.
 */
@Controller('api/v1/public')
export class PublicLandingController {
  constructor(
    @Inject(PublicLandingService) private readonly svc: PublicLandingService,
    @Inject(SalesService) private readonly sales: SalesService,
    @Inject(TenantContextService) private readonly tenantCtx: TenantContextService,
    @Inject(LandingPageService) private readonly landingPages: LandingPageService,
    @Inject(ArticleService) private readonly articles_: ArticleService,
  ) {}

  @Get('site')
  async site(@Req() req: Request, @Res() res: Response): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);
    res.json(await this.svc.site(ctx, this.tenantCtx.scheme()));
  }

  @Get('landing-page')
  async landingPage(@Req() req: Request, @Res() res: Response): Promise<void> {
    const resolution = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(resolution, req, res)) return;
    const ctx = this.requireContext(resolution);
    const document = await this.landingPages.publicPublished(ctx.tenantId);
    if (document === null) throw new BusinessError(ErrorCode.CONTENT_NOT_PUBLISHED, 'Chưa có landing page được publish');
    res.json(document);
  }

  @Get('landing-page-preview')
  async landingPagePreview(@Query('token') token: string | undefined, @Res() res: Response): Promise<void> {
    if (token === undefined || token.length > 256) throw new BusinessError(ErrorCode.PREVIEW_NOT_FOUND, 'Preview không tồn tại');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json(await this.landingPages.publicPreview(token));
  }

  @Get('testimonials')
  async testimonials(@Req() req: Request, @Res() res: Response): Promise<void> {
    const resolution = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(resolution, req, res)) return;
    res.json({ items: await this.svc.testimonials(this.requireContext(resolution)) } as { items: PublicTestimonial[] });
  }

  /**
   * Câu hỏi thường gặp của MỘT bề mặt.
   *
   * 🔒 `surface` bắt buộc, không có mặc định. Trả cả thư viện khi thiếu tham số
   *    nghe có vẻ tiện, nhưng nó đẩy việc lọc sang trình duyệt — và một khối FAQ
   *    của trang Liên hệ sẽ tải về cả những câu chỉ dành cho trang xe rồi giấu
   *    đi. Giấu ở trình duyệt không phải là không gửi.
   */
  @Get('faq')
  async faq(
    @Req() req: Request,
    @Res() res: Response,
    @Query('surface') surface?: string,
  ): Promise<void> {
    const resolution = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(resolution, req, res)) return;
    const mat = FaqSurface.safeParse(surface);
    if (!mat.success) {
      throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Thiếu hoặc sai tham số `surface`.');
    }
    res.json({ items: await this.svc.faq(this.requireContext(resolution), mat.data) } as {
      items: PublicFaqItem[];
    });
  }

  @Get('articles')
  async articles(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limitRaw?: string,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const limit = Number(limitRaw ?? 12);
    const items: PublicArticleSummary[] = await this.articles_.publicList(
      this.requireContext(r).tenantId,
      Number.isFinite(limit) ? limit : 12,
    );
    res.json({ items });
  }

  @Get('articles/:slug')
  async article(@Req() req: Request, @Res() res: Response, @Param('slug') slug: string): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const detail: PublicArticleDetail = await this.articles_.publicDetail(
      this.requireContext(r).tenantId,
      slug,
    );
    res.json(detail);
  }

  @Get('vehicle-products')
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('powertrain') powertrain?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);
    const limit = Number(limitRaw ?? 20);
    const result: { items: PublicProductSummary[]; nextCursor: string | null } =
      await this.svc.listProducts(ctx, { cursor, limit: Number.isFinite(limit) ? limit : 20, powertrain });
    res.json(result);
  }

  @Get('vehicle-products/:slug')
  async detail(
    @Req() req: Request,
    @Res() res: Response,
    @Param('slug') slug: string,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);
    const detail: PublicProductDetail = await this.svc.productDetail(ctx, slug);
    res.json(detail);
  }

  /**
   * Chi phí bảo dưỡng N năm — thứ mà chỉ hệ thống vừa bán xe vừa vận hành xưởng
   * mới trả lời được.
   */
  @Get('vehicle-products/:slug/chi-phi-so-huu')
  async chiPhiSoHuu(
    @Req() req: Request,
    @Res() res: Response,
    @Param('slug') slug: string,
    @Query('kmMoiNam') kmMoiNam?: string,
    @Query('soNam') soNam?: string,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);

    /*
     * Tham số từ URL công khai: `Number('abc')` cho `NaN`, và `NaN` lọt qua mọi
     * phép so sánh mà không ném lỗi. Chốt về mặc định thay vì tin đầu vào.
     */
    const km = Number(kmMoiNam);
    const nam = Number(soNam);
    const kq = await this.svc.chiPhiSoHuu(ctx, slug, {
      kmMoiNam: Number.isFinite(km) ? km : 15_000,
      soNam: Number.isFinite(nam) ? nam : 5,
    });
    res.json(kq);
  }

  /**
   * Bóc giá lăn bánh — phép cộng, khoản trả góp, ưu đãi và khả năng giao xe
   * trong MỘT lượt gọi. Xem `PublicLandingService.bocGiaLanBanh`.
   */
  @Get('vehicle-products/:slug/gia-lan-banh')
  async bocGia(
    @Req() req: Request,
    @Res() res: Response,
    @Param('slug') slug: string,
    @Query('provinceCode') provinceCode?: string,
    @Query('variantKey') variantKey?: string,
    @Query('colorId') colorId?: string,
    @Query('termMonths') termMonths?: string,
    @Query('downPaymentBp') downPaymentBp?: string,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);

    // Tham số từ URL công khai: chốt về mặc định thay vì tin đầu vào.
    if (provinceCode === undefined || !/^[0-9]{2,3}$/.test(provinceCode)) {
      throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Thiếu mã tỉnh/thành hợp lệ.');
    }
    const term = Number(termMonths);
    const down = Number(downPaymentBp);
    const kq = await this.svc.bocGiaLanBanh(ctx, slug, {
      provinceCode,
      variantKey,
      colorId: /^[0-9a-f-]{36}$/i.test(colorId ?? '') ? colorId : undefined,
      termMonths: Number.isInteger(term) && term > 0 ? term : undefined,
      downPaymentBp: Number.isInteger(down) && down >= 0 ? down : undefined,
    });
    // `bigint` không đi qua JSON.stringify mặc định — đổi sang chuỗi, không sang
    // `number`: một con số tiền tám chữ số vẫn an toàn, nhưng quy tắc phải đồng
    // nhất ở mọi bề mặt, nếu không có ngày nó lọt qua chỗ không an toàn.
    res.json(JSON.parse(JSON.stringify(kq, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))));
  }

  @Get('vehicle-products/:slug/experiences/:stableKey')
  async experience(
    @Req() req: Request,
    @Res() res: Response,
    @Param('slug') slug: string,
    @Param('stableKey') stableKey: string,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);
    const manifest: ExperienceManifest = await this.svc.experienceManifest(ctx, slug, stableKey);
    res.json(manifest);
  }

  /**
   * POST lead — P1-API-004, FR-LEAD-001/002.
   * Rate limit riêng cho lead (P1-API-T07); honeypot/consent trong service.
   * Không cache response form POST (edge không cache POST).
   */
  @Post('leads')
  @UseGuards(LeadRateLimitGuard)
  async createLead(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodPipe(LeadCreateInput)) input: LeadCreateInput,
  ): Promise<void> {
    const r = await this.tenantCtx.resolvePublic(req);
    if (!this.applyAliasRedirect(r, req, res)) return;
    const ctx = this.requireContext(r);
    const result: LeadCreateResult = await this.sales.createPublicLead(ctx, input, {
      landingPath: this.sanitizeLandingPath(input.landingPath),
    });
    res.status(201).json(result);
  }

  /** Landing path chỉ giữ relative path đã normalize (SRS 6.9) */
  private sanitizeLandingPath(raw: string | undefined): string {
    if (raw === undefined) return '/';
    const path = raw.split('?')[0] ?? '';
    return path.startsWith('/') ? path : '/';
  }

  /** Alias ACTIVE: 308 một bước về primary, giữ path/query. Trả false nếu đã redirect. */
  private applyAliasRedirect(r: TenantResolution, req: Request, res: Response): boolean {
    if (r.context !== null && r.redirectTo !== null) {
      res.redirect(308, `${r.redirectTo}${req.originalUrl}`);
      return false;
    }
    return true;
  }

  /** 404 chung cho domain không hợp lệ — không tiết lộ tenant (FR-TEN-003) */
  private requireContext(r: TenantResolution): NonNullable<TenantResolution['context']> {
    if (r.context === null) {
      throw new BusinessError(ErrorCode.SITE_NOT_FOUND, 'Không tìm thấy trang');
    }
    return r.context;
  }
}
