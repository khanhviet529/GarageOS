import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ErrorCode,
  FinancingTemplateInput,
  type ActorContext,
  type FinancingDriftRow,
  type FinancingTemplateRow,
} from '@garageos/contracts';
import { TenantAwareDb } from '@garageos/db';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';

/**
 * Thư viện chương trình trả góp — màn *Ngân hàng liên kết*.
 *
 * 🔒 Dùng lại quyền của biểu phí lăn bánh (`showroom:feeScheduleRead/Write`) chứ
 *    không đẻ thêm cặp quyền mới. Hai thứ cùng một loại: cấu hình giá dùng chung
 *    cả chuỗi, sai một dòng là sai mọi trang xe, và cùng nhóm người sửa.
 *
 * 🔒 Mẫu KHÔNG được đọc lúc hiển thị. Nó được CHÉP vào bản nháp của một mẫu xe,
 *    rồi đi qua publish như mọi nội dung khác — nếu không thì sửa lãi suất ở đây
 *    sẽ đổi con số trên trang đã xuất bản mà không ai duyệt (INV-LS-13).
 */
@Controller('api/v1/showroom')
@UseGuards(JwtGuard)
export class FinancingTemplateController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Bốn cột lãi suất/kỳ hạn quyết định "bản chép có còn khớp mẫu không".
   *
   * So sánh theo GIÁ TRỊ chứ không theo một số hiệu phiên bản: người dùng sửa
   * được bản chép ở màn mẫu xe, và lúc đó số hiệu phiên bản của mẫu không đổi
   * nhưng bản chép đã khác. So giá trị thì luôn đúng, kể cả khi lệch đến từ phía
   * bản chép.
   */
  private static readonly SO_KHOP = `
    p.min_down_payment_bp = t.min_down_payment_bp
    AND p.promo_rate_bp = t.promo_rate_bp
    AND p.promo_months = t.promo_months
    AND p.standard_rate_bp = t.standard_rate_bp
    AND p.allowed_terms_months = t.allowed_terms_months
    AND p.down_payment_options_bp = t.down_payment_options_bp`;

  @Get('financing-templates')
  async list(@Actor() actor: ActorContext): Promise<{ items: FinancingTemplateRow[] }> {
    assertCan(actor, 'showroom:feeScheduleRead');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT t.id, t.bank_name, t.bank_logo_media_id, t.min_down_payment_bp,
                t.promo_rate_bp, t.promo_months, t.standard_rate_bp,
                t.allowed_terms_months, t.down_payment_options_bp,
                to_char(t.rate_updated_at,'YYYY-MM-DD') AS rate_updated_at,
                t.display_order, t.is_active, t.version,
                /*
                 * 🔒 Đếm MẪU XE, không đếm dòng.
                 *
                 * ⚠️ Một mẫu xe có thể có hai bản sửa cùng lúc (bản đang hiện và
                 *    bản nháp), và cả hai đều mang một bản chép của mẫu này. Đếm
                 *    dòng thì "1 mẫu xe đang chào" hiện thành 2 ngay khi ai đó bấm
                 *    Tạo bản nháp — một con số không sai về kỹ thuật nhưng trả lời
                 *    sai câu người dùng đang hỏi.
                 */
                (SELECT count(DISTINCT r.product_id)
                   FROM financing_program p
                   JOIN vehicle_product_revision r ON r.id = p.product_revision_id
                  WHERE p.template_id = t.id) AS used_by,
                (SELECT count(DISTINCT r.product_id)
                   FROM financing_program p
                   JOIN vehicle_product_revision r ON r.id = p.product_revision_id
                  WHERE p.template_id = t.id AND NOT (${FinancingTemplateController.SO_KHOP})) AS drift
           FROM financing_program_template t
          ORDER BY t.is_active DESC, t.display_order, t.bank_name`,
      );
      return {
        items: rows.map((r) => ({
          id: r.id as string,
          bankName: r.bank_name as string,
          bankLogoMediaId: (r.bank_logo_media_id ?? null) as string | null,
          minDownPaymentBp: Number(r.min_down_payment_bp),
          promoRateBp: Number(r.promo_rate_bp),
          promoMonths: Number(r.promo_months),
          standardRateBp: Number(r.standard_rate_bp),
          allowedTermsMonths: r.allowed_terms_months as number[],
          downPaymentOptionsBp: r.down_payment_options_bp as number[],
          rateUpdatedAt: r.rate_updated_at as string,
          displayOrder: Number(r.display_order),
          isActive: r.is_active as boolean,
          version: Number(r.version),
          usedByCount: Number(r.used_by),
          driftCount: Number(r.drift),
        })),
      };
    });
  }

  @Post('financing-templates')
  async create(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(FinancingTemplateInput)) input: FinancingTemplateInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'showroom:feeScheduleWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO financing_program_template
           (tenant_id, bank_name, bank_logo_media_id, min_down_payment_bp, promo_rate_bp,
            promo_months, standard_rate_bp, allowed_terms_months, down_payment_options_bp,
            rate_updated_at, display_order, is_active, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::int[],$9::int[],$10::date,$11,$12,$13,$13)
         RETURNING id`,
        [actor.tenantId, input.bankName, input.bankLogoMediaId ?? null, input.minDownPaymentBp,
          input.promoRateBp, input.promoMonths, input.standardRateBp, input.allowedTermsMonths,
          input.downPaymentOptionsBp, input.rateUpdatedAt, input.displayOrder, input.isActive,
          actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  @Patch('financing-templates/:id')
  async update(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(FinancingTemplateInput)) input: FinancingTemplateInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'showroom:feeScheduleWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ version: string }>(
        `UPDATE financing_program_template
            SET bank_name=$2, bank_logo_media_id=$3, min_down_payment_bp=$4, promo_rate_bp=$5,
                promo_months=$6, standard_rate_bp=$7, allowed_terms_months=$8::int[],
                down_payment_options_bp=$9::int[], rate_updated_at=$10::date,
                display_order=$11, is_active=$12, updated_by=$13
          WHERE id=$1 RETURNING version`,
        [id, input.bankName, input.bankLogoMediaId ?? null, input.minDownPaymentBp,
          input.promoRateBp, input.promoMonths, input.standardRateBp, input.allowedTermsMonths,
          input.downPaymentOptionsBp, input.rateUpdatedAt, input.displayOrder, input.isActive,
          actor.userId],
      );
      if (rows[0] === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu.');
      return { version: Number(rows[0].version) };
    });
  }

  /**
   * Xoá mẫu khỏi thư viện.
   *
   * 🔒 KHÔNG gỡ chương trình đang chào trên các mẫu xe — khoá ngoại là
   *    `ON DELETE SET NULL` (0081). Con số đã công bố không được biến mất vì một
   *    thao tác dọn dẹp ở màn khác; bản chép chỉ mất liên kết về thư viện.
   */
  @Delete('financing-templates/:id')
  async remove(@Actor() actor: ActorContext, @Param('id') id: string): Promise<{ deleted: true }> {
    assertCan(actor, 'showroom:feeScheduleWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query('DELETE FROM financing_program_template WHERE id=$1', [id]);
      if (rowCount === 0) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu.');
      return { deleted: true };
    });
  }

  /**
   * Những bản chép đã LỆCH so với thư viện.
   *
   * 🔒 Đây là thứ làm cho việc "chép thay vì tham chiếu" chấp nhận được. Không có
   *    màn này thì đổi lãi suất trong thư viện là một thao tác không có hệ quả
   *    nhìn thấy được, và các mẫu xe cứ lệch dần mà không ai biết.
   *
   * `published` nói bản lệch nằm ở bản ĐÃ XUẤT BẢN hay chỉ ở bản nháp — lệch ở
   * bản khách đang đọc là việc gấp, lệch ở nháp thì không.
   */
  @Get('financing-drift')
  async drift(@Actor() actor: ActorContext): Promise<{ items: FinancingDriftRow[] }> {
    assertCan(actor, 'showroom:feeScheduleRead');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT vp.id AS product_id, vp.slug, p.product_revision_id, t.id AS template_id,
                t.bank_name, vp.published_revision_id = p.product_revision_id AS published
           FROM financing_program p
           JOIN financing_program_template t ON t.id = p.template_id
           JOIN vehicle_product_revision r ON r.id = p.product_revision_id
           JOIN vehicle_product vp ON vp.id = r.product_id
          WHERE NOT (${FinancingTemplateController.SO_KHOP})
          ORDER BY published DESC, vp.slug, t.bank_name`,
      );
      return {
        items: rows.map((r) => ({
          productId: r.product_id as string,
          productSlug: r.slug as string,
          revisionId: r.product_revision_id as string,
          published: r.published as boolean,
          templateId: r.template_id as string,
          bankName: r.bank_name as string,
        })),
      };
    });
  }

  /**
   * Áp một mẫu vào bản NHÁP của một mẫu xe.
   *
   * 🔒 Chỉ vào bản nháp. Trigger `chan_sua_noi_dung_revision_da_publish` (0072)
   *    chặn ghi vào revision đã publish, nên chỗ này không thể lách được kể cả
   *    khi controller viết sai — nhưng vẫn kiểm ở đây để trả về một câu tiếng
   *    Việt thay vì một lỗi Postgres.
   */
  @Post('revisions/:revisionId/financing/from-template/:templateId')
  async apply(
    @Actor() actor: ActorContext,
    @Param('revisionId') revisionId: string,
    @Param('templateId') templateId: string,
  ): Promise<{ id: string }> {
    assertCan(actor, 'showroom:commerceWrite');
    return this.db.withTenant(actor, async (tx) => {
      const { rows: tt } = await tx.query<{ status: string }>(
        'SELECT status FROM vehicle_product_revision WHERE id = $1',
        [revisionId],
      );
      if (tt[0] === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản sửa.');
      if (tt[0].status !== 'DRAFT') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ áp mẫu vào bản NHÁP. Bản đã xuất bản là bất biến — tạo bản nháp mới trước.',
        );
      }

      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO financing_program
           (tenant_id, product_revision_id, template_id, bank_name, bank_logo_media_id,
            min_down_payment_bp, promo_rate_bp, promo_months, standard_rate_bp,
            allowed_terms_months, down_payment_options_bp, rate_updated_at, display_order)
         SELECT $1, $2, t.id, t.bank_name, t.bank_logo_media_id,
                t.min_down_payment_bp, t.promo_rate_bp, t.promo_months, t.standard_rate_bp,
                t.allowed_terms_months, t.down_payment_options_bp, t.rate_updated_at,
                t.display_order
           FROM financing_program_template t
          WHERE t.id = $3 AND t.is_active
         RETURNING id`,
        [actor.tenantId, revisionId, templateId],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu, hoặc mẫu đã ngừng dùng.');
      }
      return { id: rows[0].id };
    });
  }
}
