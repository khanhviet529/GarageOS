import { Body, Controller, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  ConsentVersionInput,
  ErrorCode,
  LeadFormInput,
  type ActorContext,
  type ConsentVersionRow,
  type LeadFormView,
} from '@garageos/contracts';
import { TenantAwareDb } from '@garageos/db';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';

/** Mã biểu mẫu duy nhất hiện có. Landing chỉ có một form thu nhu cầu. */
export const MA_BIEU_MAU = 'LANDING';

/**
 * Cấu hình biểu mẫu thu nhu cầu khách, và LỊCH SỬ câu đồng ý.
 *
 * 🔒 Phần quan trọng ở đây là câu đồng ý, không phải hai công tắc hiển thị.
 *
 *    `sales_lead.consent_version` từng được ghi bằng một hằng số trong mã, còn
 *    câu chữ thì nằm trong JSX của landing. Hệ thống lưu "khách đã đồng ý phiên
 *    bản 2026-08-1" mà không lưu ở đâu phiên bản đó NÓI GÌ — và đó chính là thứ
 *    NĐ 13/2023 đòi chứng minh được.
 */
@Controller('api/v1/marketing')
@UseGuards(JwtGuard)
export class LeadFormController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Get('lead-form')
  async get(@Actor() actor: ActorContext): Promise<LeadFormView> {
    assertCan(actor, 'marketing:leadFormRead');
    return this.db.withTenant(actor, async (tx) => this.docHoacTao(tx, actor));
  }

  @Put('lead-form')
  async update(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(LeadFormInput)) input: LeadFormInput,
  ): Promise<LeadFormView> {
    assertCan(actor, 'marketing:leadFormWrite');
    return this.db.withTenant(actor, async (tx) => {
      const hienTai = await this.docHoacTao(tx, actor);
      await tx.query(
        `UPDATE lead_form
            SET success_title=$2, success_body=$3, show_message_field=$4,
                show_branch_field=$5, updated_by=$6
          WHERE id=$1`,
        [hienTai.id, input.successTitle, input.successBody, input.showMessageField,
          input.showBranchField, actor.userId],
      );
      return this.docHoacTao(tx, actor);
    });
  }

  @Get('lead-form/consent-versions')
  async consentVersions(@Actor() actor: ActorContext): Promise<{ items: ConsentVersionRow[] }> {
    assertCan(actor, 'marketing:leadFormRead');
    return this.db.withTenant(actor, async (tx) => {
      const form = await this.docHoacTao(tx, actor);
      const { rows } = await tx.query<ConsentVersionRow>(
        `SELECT id, version, body,
                to_char(effective_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "effectiveFrom"
           FROM lead_form_consent_version
          WHERE form_id = $1
          ORDER BY effective_from DESC`,
        [form.id],
      );
      return { items: rows };
    });
  }

  /**
   * Thêm một phiên bản câu đồng ý. Không có endpoint sửa và không có endpoint
   * xoá — bảng là chỉ-thêm, và trigger ở database canh điều đó độc lập với
   * việc controller này có endpoint hay không.
   */
  @Post('lead-form/consent-versions')
  async addConsentVersion(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(ConsentVersionInput)) input: ConsentVersionInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'marketing:leadFormWrite');
    return this.db.withTenant(actor, async (tx) => {
      const form = await this.docHoacTao(tx, actor);
      const trung = await tx.query(
        'SELECT 1 FROM lead_form_consent_version WHERE form_id=$1 AND version=$2',
        [form.id, input.version],
      );
      if ((trung.rowCount ?? 0) > 0) {
        throw new BusinessError(
          ErrorCode.RESOURCE_CONFLICT,
          `Phiên bản "${input.version}" đã tồn tại. Câu đồng ý cũ không sửa được — hãy đặt một nhãn phiên bản mới.`,
        );
      }
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO lead_form_consent_version (tenant_id, form_id, version, body, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [actor.tenantId, form.id, input.version, input.body, actor.userId],
      );
      return { id: rows[0]!.id };
    });
  }

  /**
   * Đọc biểu mẫu, TẠO nếu chưa có.
   *
   * Mỗi tenant có đúng một biểu mẫu và nó luôn phải tồn tại — landing gọi nó ở
   * mỗi lượt render form. Tạo trong seed thì tenant lập sau seed sẽ thiếu; tạo
   * ở đây thì không có trạng thái "chưa có biểu mẫu" nào để xử lý.
   */
  private async docHoacTao(tx: PoolClient, actor: ActorContext): Promise<LeadFormView> {
    const doc = async (): Promise<LeadFormView | undefined> => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT f.id, f.code, f.success_title, f.success_body,
                f.show_message_field, f.show_branch_field, f.version,
                c.version AS consent_version, c.body AS consent_body
           FROM lead_form f
           LEFT JOIN LATERAL (
             SELECT version, body FROM lead_form_consent_version v
              WHERE v.form_id = f.id AND v.effective_from <= now()
              ORDER BY v.effective_from DESC LIMIT 1
           ) c ON true
          WHERE f.code = $1`,
        [MA_BIEU_MAU],
      );
      const r = rows[0];
      if (r === undefined) return undefined;
      return {
        id: r.id as string,
        code: r.code as string,
        successTitle: r.success_title as string,
        successBody: r.success_body as string,
        showMessageField: r.show_message_field as boolean,
        showBranchField: r.show_branch_field as boolean,
        version: Number(r.version),
        consentVersion: (r.consent_version ?? null) as string | null,
        consentBody: (r.consent_body ?? null) as string | null,
      };
    };

    const co = await doc();
    if (co !== undefined) return co;

    await tx.query(
      'INSERT INTO lead_form (tenant_id, code, created_by, updated_by) VALUES ($1,$2,$3,$3)',
      [actor.tenantId, MA_BIEU_MAU, actor.userId],
    );
    const moi = await doc();
    if (moi === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tạo được biểu mẫu.');
    return moi;
  }
}
