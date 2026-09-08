import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { normalizeVnPhone, scopeForAction, validateLeadTransition, isLeadClosed } from '@garageos/domain';
import {
  ErrorCode,
  type ActorContext,
  type ExperienceSelection,
  type LeadActivityView,
  type LeadAddActivityInput,
  type LeadAssignInput,
  type LeadCreateInput,
  type LeadCreateResult,
  type LeadRedactInput,
  type LeadRedactResult,
  type LeadTransitionInput,
  type LeadView,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { MOC_CON_TRO, ghepConTro, tachConTro } from '../common/con-tro-trang';
import type { PublicTenantContext } from '../public-landing/tenant-context.service';

/**
 * Lead sales — SRS Phase 1 mục 9, 11.3.
 *
 * 🔒 Phạm vi theo ACTION (scopeForAction — P1-UT-007): advisor chỉ thấy lead
 * được GÁN; manager BRANCH; owner TENANT. Marketing role KHÔNG nâng scope
 * sales. Lead ngoài phạm vi trả 404 như không tồn tại.
 */

/**
 * Phiên bản consent DỰ PHÒNG — NFR-PRIV-001.
 *
 * ⚠️ Đây từng là nguồn sự thật duy nhất, và đó là lỗi: hệ thống lưu "khách đã
 *    đồng ý phiên bản 2026-08-1" mà không lưu ở đâu phiên bản đó NÓI GÌ — câu
 *    chữ nằm trong JSX của landing. Sửa câu chữ mà quên đổi hằng số thì mọi lead
 *    cũ lẫn mới cùng mang một nhãn cho hai nội dung khác nhau.
 *
 *    Từ 0079, câu chữ và phiên bản sống cùng nhau trong
 *    `lead_form_consent_version` — một bảng CHỈ-THÊM. Hằng số này chỉ còn dùng
 *    khi tenant chưa khai phiên bản nào, để một lead vẫn ghi được một nhãn thay
 *    vì để trống ô bằng chứng.
 */
export const LEAD_CONSENT_VERSION = '2026-08-1';

export interface LeadListResult {
  items: LeadView[];
  nextCursor: string | null;
}

@Injectable()
export class SalesService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /* ============================ Admin (auth) ============================ */

  async listLeads(
    actor: ActorContext,
    opts: { status?: string; cursor?: string; limit: number },
  ): Promise<LeadListResult> {
    const limit = Math.min(Math.max(opts.limit, 1), 100);
    return this.db.withTenant(actor, async (tx) => {
      const scope = scopeForAction(actor, 'sales:leadRead');
      const cond: string[] = [];
      const params: unknown[] = [];
      /*
       * ⚠️ `push` chỉ nhận MỘT tham số, và `String.replace` với mẫu là chuỗi chỉ
       *    thay lần xuất hiện ĐẦU TIÊN. Đưa cho nó một câu có hai chỗ giữ thì
       *    chỗ thứ hai đi thẳng vào PostgreSQL nguyên văn — xem điều kiện keyset
       *    bên dưới. Chỉ dùng cho điều kiện một tham số.
       */
      const push = (sql: string, value: unknown): void => {
        params.push(value);
        cond.push(sql.replace('$#', `$${params.length}`));
      };
      if (scope === 'SELF') push('sl.assigned_to = $#', actor.userId);
      if (scope === 'BRANCH') push('sl.branch_id = ANY($#)', actor.branchIds);
      if (opts.status !== undefined && opts.status !== '') push('sl.status = $#', opts.status);
      /*
       * 🔒 Điều kiện keyset ghi thẳng hai tham số, không đi qua `push`.
       *
       * ─────────────────────────────────────────────────────────────────────
       * ⚠️ Câu điều kiện cũ có HAI chỗ giữ nhưng `push` chỉ thay được một:
       *
       *      push('(sl.created_at, sl.id) < ($#::timestamptz, $#::uuid)', createdAt)
       *                                       ↑ được thay        ↑ CÒN NGUYÊN
       *
       *    nên chuỗi `$#` đi thẳng vào PostgreSQL. Đo được trên nhánh này:
       *
       *      GET /api/v1/sales/leads?limit=2&cursor=…  ->  HTTP 500
       *      error: syntax error at or near "$"
       *
       *    Trang một luôn chạy, nên lỗi chỉ hiện ra khi danh sách đủ dài để có
       *    trang hai — tức ở nơi dữ liệu thật, không phải ở máy dev.
       *
       *    Dòng `sl.id < $#` đi kèm vừa thừa vừa sai: nó loại mọi lead có id lớn
       *    hơn kể cả ở ngày cũ hơn, nên trang hai mất bản ghi ngay cả khi câu
       *    lệnh chạy được.
       *
       * 💡 So sánh bộ giá trị `(a, b) < (x, y)` đúng ở ĐÂY vì ORDER BY giảm dần
       *    trên CẢ HAI cột. Chỗ khác không chắc như vậy:
       *    `PublicLandingService.listProducts` xếp `created_at DESC, id ASC`
       *    nên phải viết tách ra. Cùng một bài toán, hai lời giải, vì hai thứ tự.
       *
       * Việc TÁCH con trỏ nằm ở `common/con-tro-trang.ts` — cùng một bản với hai
       * chỗ phân trang còn lại. Mốc ở lại dạng chuỗi để không mất micro giây.
       */
      const moc = tachConTro(opts.cursor);
      if (moc !== null) {
        params.push(moc.moc, moc.id);
        cond.push(
          `(sl.created_at, sl.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
        );
      }
      const where = cond.length > 0 ? `WHERE ${cond.join(' AND ')}` : '';
      params.push(limit);
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT ${this.leadColumns('sl')}
           FROM sales_lead sl
           ${this.leadJoins()}
           ${where}
          ORDER BY sl.created_at DESC, sl.id DESC
          LIMIT $${params.length} + 1`,
        params,
      );
      /*
       * 🔒 Cùng một lỗi lệch-một với `PublicLandingService.listProducts`, cùng
       *    một cách sửa: con trỏ là bản ghi CUỐI CÙNG ĐÃ TRẢ.
       *
       * ⚠️ `rows[limit]` là bản ghi đầu tiên BỊ LOẠI. Lấy nó làm con trỏ rồi lọc
       *    trang sau bằng `<` ngặt thì chính nó không bao giờ được trả về — mỗi
       *    ranh giới trang nuốt đúng một lead.
       *
       *    Với danh sách lead thì đây không phải lỗi hiển thị: một lead biến mất
       *    là một khách hàng không ai gọi lại.
       */
      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const cuoi = rows[limit - 1]!;
        nextCursor = ghepConTro(cuoi);
      }
      return { items: rows.slice(0, limit).map((r) => this.toLeadView(r)), nextCursor };
    });
  }

  async getLead(actor: ActorContext, id: string): Promise<{ lead: LeadView; activities: LeadActivityView[] }> {
    return this.db.withTenant(actor, async (tx) => {
      const lead = await this.requireLeadInScope(tx, actor, id, 'sales:leadRead');
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT la.id, la.type, la.actor_user_id, la.from_status, la.to_status,
                la.note, la.created_at, au.full_name AS actor_name
           FROM lead_activity la
           LEFT JOIN app_user au ON au.id = la.actor_user_id
          WHERE la.lead_id = $1
          ORDER BY la.created_at, la.id`,
        [id],
      );
      return {
        lead,
        activities: rows.map((a) => ({
          id: a.id as string,
          type: a.type as LeadActivityView['type'],
          actorUserId: (a.actor_user_id ?? null) as string | null,
          actorName: (a.actor_name ?? null) as string | null,
          fromStatus: (a.from_status ?? null) as LeadActivityView['fromStatus'],
          toStatus: (a.to_status ?? null) as LeadActivityView['toStatus'],
          note: (a.note ?? null) as string | null,
          createdAt: (a.created_at as Date).toISOString(),
        })),
      };
    });
  }

  /**
   * 🔒 "Ai được nhận lead của chi nhánh này" — MỘT định nghĩa, hai chỗ dùng.
   *
   * Danh sách để CHỌN và điều kiện để KIỂM phải là cùng một câu. Viết hai lần là
   * để chúng lệch nhau, và lệch theo hướng tệ nhất: giao diện gợi ý một người mà
   * máy chủ từ chối, hoặc gợi ý một người lẽ ra không được gán.
   *
   * `$1` = branch_id.
   */
  private static readonly AI_NHAN_DUOC = `
    FROM app_user u
   WHERE u.is_active
     AND 'SALES_ADVISOR' = ANY(u.roles::text[])
     AND EXISTS (
       SELECT 1 FROM user_branch ub
        WHERE ub.user_id = u.id AND ub.branch_id = $1
     )`;

  /**
   * Tư vấn viên có thể nhận lead của một chi nhánh.
   *
   * 🔒 Chi nhánh phải nằm trong phạm vi của người gọi. `SALES_MANAGER` có phạm vi
   *    BRANCH — không có kiểm này thì họ liệt kê được nhân sự của chi nhánh khác
   *    bằng cách đổi một tham số trên URL. Chủ doanh nghiệp đi qua vì phạm vi của
   *    họ là cả tenant.
   */
  async assignableAdvisors(
    actor: ActorContext,
    branchId: string,
  ): Promise<{ id: string; fullName: string }[]> {
    const toanChuoi = actor.roles.includes('OWNER');
    if (!toanChuoi && !actor.branchIds.includes(branchId)) {
      throw new BusinessError(
        ErrorCode.BRANCH_OUT_OF_SCOPE,
        'Bạn chỉ xem được tư vấn viên của chi nhánh mình.',
      );
    }
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string; full_name: string }>(
        `SELECT u.id, u.full_name ${SalesService.AI_NHAN_DUOC} ORDER BY u.full_name`,
        [branchId],
      );
      return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
    });
  }

  /** Gán lead — chỉ manager/owner, người nhận phải là advisor cùng branch. */
  async assignLead(
    actor: ActorContext,
    id: string,
    input: LeadAssignInput,
  ): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const lead = await this.requireLeadInScope(tx, actor, id, 'sales:leadAssign', true);
      if (isLeadClosed(lead.status)) {
        throw new BusinessError(ErrorCode.LEAD_ALREADY_CLOSED, 'Lead đã đóng, không thể gán');
      }
      if (Number(lead.version) !== input.version) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Lead đã thay đổi, hãy tải lại');
      }

      const { rows: userRows } = await tx.query<Record<string, unknown>>(
        `SELECT u.id, u.full_name ${SalesService.AI_NHAN_DUOC} AND u.id = $2`,
        [lead.branchId, input.assigneeId],
      );
      const assignee = userRows[0];
      if (assignee === undefined) {
        throw new BusinessError(ErrorCode.ASSIGNEE_OUT_OF_SCOPE, 'Người được gán không hợp lệ');
      }

      const updated = await tx.query(
        `UPDATE sales_lead SET assigned_to = $1 WHERE id = $2 AND version = $3`,
        [input.assigneeId, id, input.version],
      );
      if (updated.rowCount === 0) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Lead đã thay đổi, hãy tải lại');
      }
      await this.insertActivity(tx, actor, id, lead.branchId, 'ASSIGNED', {
        assigneeName: assignee.full_name as string,
      });
      return { version: input.version + 1 };
    });
  }

  /** Chuyển trạng thái — advisor (được gán) / manager / owner, theo state machine. */
  async transitionLead(
    actor: ActorContext,
    id: string,
    input: LeadTransitionInput,
  ): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const lead = await this.requireLeadInScope(tx, actor, id, 'sales:leadTransition', true);
      if (isLeadClosed(lead.status)) {
        throw new BusinessError(ErrorCode.LEAD_ALREADY_CLOSED, 'Lead đã đóng, không thể đổi trạng thái');
      }
      const invalid = validateLeadTransition(lead.status, input);
      if (invalid !== null) {
        throw new BusinessError(ErrorCode.INVALID_LEAD_TRANSITION, invalid);
      }
      if (Number(lead.version) !== input.version) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Lead đã thay đổi, hãy tải lại');
      }

      const updated = await tx.query(
        `UPDATE sales_lead SET status = $1 WHERE id = $2 AND version = $3`,
        [input.to, id, input.version],
      );
      if (updated.rowCount === 0) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Lead đã thay đổi, hãy tải lại');
      }
      await this.insertActivity(tx, actor, id, lead.branchId, 'STATUS_CHANGED', {
        fromStatus: lead.status,
        toStatus: input.to,
        note: input.note ?? null,
        lostReason: input.lostReason ?? null,
      });
      return { version: input.version + 1 };
    });
  }

  /** Ghi hoạt động (note / contact attempt) lên lead trong phạm vi. */
  async addActivity(
    actor: ActorContext,
    id: string,
    input: LeadAddActivityInput,
  ): Promise<{ activityId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const lead = await this.requireLeadInScope(tx, actor, id, 'sales:leadAddActivity', true);
      if (isLeadClosed(lead.status)) {
        throw new BusinessError(ErrorCode.LEAD_ALREADY_CLOSED, 'Lead đã đóng, không thể ghi hoạt động');
      }
      const activityId = await this.insertActivity(tx, actor, id, lead.branchId, input.type, {
        note: input.note,
      });
      return { activityId };
    });
  }

  /**
   * Xoá dữ liệu cá nhân của một lead — LS-006, `INV-LS-15`.
   *
   * 🔒 Ghi đè PII, KHÔNG xoá dòng. Lead là dữ liệu truy vết nối một khoản chi
   * quảng cáo với một chiếc xe đã bán; xoá cả dòng làm thủng thống kê chuyển
   * đổi theo cách không ai phát hiện — con số chỉ đơn giản nhỏ đi.
   *
   * Hoạt động được ghi TRƯỚC khi PII biến mất, và cố ý không nhắc gì tới nội
   * dung vừa xoá. Nhật ký của việc xoá dữ liệu cá nhân không được trở thành
   * bản sao cuối cùng của chính dữ liệu đó.
   */
  async redactLead(
    actor: ActorContext,
    id: string,
    input: LeadRedactInput,
  ): Promise<LeadRedactResult> {
    return this.db.withTenant(actor, async (tx) => {
      const lead = await this.requireLeadInScope(tx, actor, id, 'sales:leadRedact', true);
      const daRedactTruocDo = lead.redactedAt !== null;

      if (!daRedactTruocDo) {
        await this.insertActivity(tx, actor, id, lead.branchId, 'NOTE', {
          note: 'Đã xoá dữ liệu cá nhân theo yêu cầu',
          redactReason: input.reason,
        });
      }

      const { rows } = await tx.query<{ redacted_at: Date }>(
        `SELECT redact_sales_lead($1, $2, $3, $4) AS redacted_at`,
        [actor.tenantId, id, actor.userId, input.reason],
      );
      return {
        redactedAt: rows[0]!.redacted_at.toISOString(),
        daRedactTruocDo,
      };
    });
  }

  /* ============================ Public lead ============================ */

  /**
   * Tạo lead từ form landing — P1-API-004, FR-LEAD-001/002/007.
   *
   * 🔒 Server xác minh lại branch/product/variant/experience trong published
   * snapshot của tenant; client KHÔNG được gửi tenant/label/giá. Snapshot là
   * server-derived. Honeypot khác rỗng → xử lý như spam mà không tiết lộ rule.
   */
  async createPublicLead(
    ctx: PublicTenantContext,
    input: LeadCreateInput,
    meta: { landingPath: string },
  ): Promise<LeadCreateResult> {
    return this.db.withTenantId(ctx.tenantId, null, async (tx) => {
      // Honeypot: trả kết quả giả hệt như thành công, không ghi gì
      if ((input.honeypot ?? '') !== '') {
        return { reference: this.newReference(), duplicateSuspected: false };
      }

      const phone = normalizeVnPhone(input.phone);
      if (phone === null) {
        throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Số điện thoại không hợp lệ');
      }

      const branch = await this.verifyBranch(tx, input.branchId);
      if (branch === null) {
        throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Chi nhánh không hợp lệ');
      }

      // Product/variant trong current publication — server resolve snapshot
      let productSnapshot: Record<string, unknown> | null = null;
      if (input.productId !== undefined) {
        const snap = await this.publishedProductSnapshot(tx, input.productId, input.variantId ?? null);
        if (snap === null) {
          throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Xe quan tâm không hợp lệ');
        }
        productSnapshot = snap;
      }

      let experienceSnapshot: Record<string, unknown> | null = null;
      if (input.experienceSelection !== undefined) {
        experienceSnapshot = await this.verifyExperienceSelection(
          tx, input.experienceSelection, input.productId,
        );
      }

      const duplicate = await this.findDuplicate(tx, phone);
      const reference = await this.uniqueReference(tx);
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO sales_lead
           (tenant_id, branch_id, reference, full_name, phone_normalized, email,
            product_id, variant_id, catalog_revision_id, intent, message, source,
            landing_path, catalog_context_snapshot, experience_context_snapshot,
            utm_source, utm_medium, utm_campaign, consent_version, consented_at,
            duplicate_of_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'LANDING',$12,$13,$14,$15,$16,$17,
                 $18, now(), $19)
         RETURNING id`,
        [
          ctx.tenantId, branch.id, reference, input.fullName, phone,
          input.email ?? null,
          (productSnapshot?.['productId'] ?? null) as string | null,
          (productSnapshot?.['variantId'] ?? null) as string | null,
          (productSnapshot?.['revisionId'] ?? null) as string | null,
          input.intent, input.message ?? null,
          meta.landingPath,
          productSnapshot === null ? null : JSON.stringify(productSnapshot),
          experienceSnapshot === null ? null : JSON.stringify(experienceSnapshot),
          input.utmSource ?? null, input.utmMedium ?? null, input.utmCampaign ?? null,
          await this.phienBanDongY(tx), duplicate,
        ],
      );
      await tx.query(
        `INSERT INTO lead_activity (lead_id, tenant_id, branch_id, type, metadata)
         VALUES ($1,$2,$3,'CREATED', '{}'::jsonb)`,
        [rows[0]!.id, ctx.tenantId, branch.id],
      );
      return { reference, duplicateSuspected: duplicate !== null };
    });
  }

  /* ============================== Helpers ============================== */

  private async requireLeadInScope(
    tx: PoolClient,
    actor: ActorContext,
    id: string,
    action:
      | 'sales:leadRead'
      | 'sales:leadAssign'
      | 'sales:leadTransition'
      | 'sales:leadAddActivity'
      | 'sales:leadRedact',
    forUpdate = false,
  ): Promise<LeadView> {
    const scope = scopeForAction(actor, action);
    const cond: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown): void => {
      params.push(value);
      cond.push(sql.replace('$#', `$${params.length}`));
    };
    if (scope === 'SELF') push('sl.assigned_to = $#', actor.userId);
    if (scope === 'BRANCH') push('sl.branch_id = ANY($#)', actor.branchIds);
    params.push(id);
    const where = cond.length > 0 ? `${cond.join(' AND ')} AND` : '';

    /*
     * 🔒 Khoá dòng bằng MỘT CÂU RIÊNG, không gắn `FOR UPDATE` vào câu đọc.
     *
     * Câu đọc có `LEFT JOIN` sang `app_user` và hai bảng revision để lấy tên
     * người được gán và tên xe. Postgres từ chối thẳng:
     *
     *   ERROR: FOR UPDATE cannot be applied to the nullable side of an outer join
     *
     * Nghĩa là mọi lời gọi `forUpdate = true` đều ném lỗi — assign, transition,
     * addActivity và redact đều trả 500. Không phải "khoá yếu": không có thao
     * tác ghi nào trên lead từng chạy được. Lỗi này sống sót vì không bài kiểm
     * nào gọi vào chúng.
     *
     * Khoá trước rồi đọc là đúng thứ tự: từ lúc này tới hết transaction, không
     * ai sửa được dòng, nên dữ liệu đọc ra ở câu sau không thể cũ.
     */
    if (forUpdate) {
      await tx.query(`SELECT 1 FROM sales_lead WHERE id = $1 FOR UPDATE`, [id]);
    }

    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT ${this.leadColumns('sl')}
         FROM sales_lead sl
         ${this.leadJoins()}
        WHERE ${where} sl.id = $${params.length}`,
      params,
    );
    const row = rows[0];
    if (row === undefined) {
      // Lead ngoài phạm vi cũng trả 404 — không tiết lộ sự tồn tại (P1-API-T06)
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy lead');
    }
    return this.toLeadView(row);
  }

  private leadColumns(alias: string): string {
    return `
      ${alias}.id, ${alias}.branch_id, ${alias}.reference, ${alias}.full_name,
      ${alias}.phone_normalized, ${alias}.email, ${alias}.intent, ${alias}.message,
      ${alias}.status, ${alias}.assigned_to, ${alias}.source, ${alias}.landing_path,
      ${alias}.utm_source, ${alias}.utm_medium, ${alias}.utm_campaign,
      ${alias}.next_action_at, ${alias}.duplicate_of_id, ${alias}.redacted_at,
      ${alias}.version, ${alias}.created_at, ${alias}.updated_at,
      ${MOC_CON_TRO(alias)},
      b.name AS branch_name,
      au.full_name AS assignee_name,
      vpr.name AS product_name, vvr.name AS variant_name`;
  }

  private leadJoins(): string {
    return `
      JOIN branch b ON b.id = sl.branch_id
      LEFT JOIN app_user au ON au.id = sl.assigned_to
      LEFT JOIN vehicle_product_revision vpr ON vpr.id = sl.catalog_revision_id
      LEFT JOIN vehicle_variant_revision vvr
        ON vvr.product_revision_id = sl.catalog_revision_id
       AND vvr.variant_id = sl.variant_id`;
  }

  private toLeadView(row: Record<string, unknown>): LeadView {
    return {
      id: row.id as string,
      reference: row.reference as string,
      branchId: row.branch_id as string,
      branchName: row.branch_name as string,
      fullName: row.full_name as string,
      phoneNormalized: row.phone_normalized as string,
      email: (row.email ?? null) as string | null,
      intent: row.intent as LeadView['intent'],
      message: (row.message ?? null) as string | null,
      status: row.status as LeadView['status'],
      assignedTo: (row.assigned_to ?? null) as string | null,
      assigneeName: (row.assignee_name ?? null) as string | null,
      productName: (row.product_name ?? null) as string | null,
      variantName: (row.variant_name ?? null) as string | null,
      source: row.source as LeadView['source'],
      landingPath: (row.landing_path ?? null) as string | null,
      utmSource: (row.utm_source ?? null) as string | null,
      utmMedium: (row.utm_medium ?? null) as string | null,
      utmCampaign: (row.utm_campaign ?? null) as string | null,
      nextActionAt: row.next_action_at === null || row.next_action_at === undefined
        ? null
        : (row.next_action_at as Date).toISOString(),
      duplicateOfId: (row.duplicate_of_id ?? null) as string | null,
      redactedAt:
        row.redacted_at === null || row.redacted_at === undefined
          ? null
          : (row.redacted_at as Date).toISOString(),
      version: Number(row.version),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private async insertActivity(
    tx: PoolClient,
    actor: ActorContext,
    leadId: string,
    branchId: string,
    type: 'ASSIGNED' | 'STATUS_CHANGED' | 'NOTE' | 'CONTACT_ATTEMPT',
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO lead_activity
         (lead_id, tenant_id, branch_id, type, actor_user_id, from_status, to_status,
          note, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [
        leadId, actor.tenantId, branchId, type, actor.userId,
        (metadata['fromStatus'] ?? null) as string | null,
        (metadata['toStatus'] ?? null) as string | null,
        (metadata['note'] ?? null) as string | null,
        JSON.stringify(metadata),
      ],
    );
    return rows[0]!.id;
  }

  private async verifyBranch(
    tx: PoolClient,
    branchId: string,
  ): Promise<{ id: string } | null> {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT b.id
         FROM branch b
         JOIN branch_public_profile bpp ON bpp.branch_id = b.id AND bpp.status = 'PUBLISHED'
        WHERE b.id = $1 AND b.is_active`,
      [branchId],
    );
    return rows[0] === undefined ? null : { id: rows[0].id };
  }

  private async publishedProductSnapshot(
    tx: PoolClient,
    productId: string,
    variantId: string | null,
  ): Promise<Record<string, unknown> | null> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT p.id AS product_id, p.slug, p.stable_key AS product_stable_key,
              r.id AS revision_id, r.revision_number, r.content_hash, r.name AS product_name,
              vv.id AS variant_id, vv.stable_key AS variant_stable_key,
              vvr.name AS variant_name, vvr.display_price_amount
         FROM vehicle_product p
         JOIN vehicle_product_revision r ON r.id = p.published_revision_id
         JOIN vehicle_variant_revision vvr
           ON vvr.product_revision_id = r.id AND vvr.inclusion_status = 'ACTIVE'
         JOIN vehicle_variant vv ON vv.id = vvr.variant_id
        WHERE p.id = $1 AND p.lifecycle_status = 'ACTIVE'
          AND ($2::uuid IS NULL OR vv.id = $2)
        ORDER BY vvr.display_price_amount ASC NULLS LAST, vvr.sort_order LIMIT 1`,
      [productId, variantId],
    );
    const row = rows[0];
    if (row === undefined) return null;

    /*
     * 🔒 Chỉ ghi phiên bản xe khi khách THỰC SỰ chọn một phiên bản.
     *
     * ─────────────────────────────────────────────────────────────────────
     * ⚠️ Trước bản sửa, khách để trống ô "phiên bản" vẫn bị gán một phiên bản
     *    cụ thể — cái đứng đầu theo `sort_order` — kèm tên và giá của nó. Màn
     *    chi tiết lead in thẳng ra:
     *
     *        Xe quan tâm: Toyota Vios · Bản cao cấp
     *
     *    Tư vấn gọi lại và chào đúng bản đó, đúng giá đó. Khách chưa từng nói
     *    thế. Không ai trong chuỗi này biết con số ấy do máy tự điền.
     *
     * 💡 Snapshot tồn tại để ghi lại ĐIỀU KHÁCH ĐÃ THẤY, không phải để điền cho
     *    đủ ô. Một ô trống trung thực hơn một ô được đoán.
     *
     * `priceFrom` là mức giá thật sự hiện trên thẻ xe — biến thể rẻ nhất, cùng
     * phép chọn với `PublicLandingService.listProducts`. Ghi kèm cờ để người
     * đọc snapshot biết đây là "giá từ", không phải giá của một bản cụ thể.
     */
    const daChon = variantId !== null;
    const gia = row.display_price_amount === null ? null : Number(row.display_price_amount);
    return {
      productId: row.product_id,
      productStableKey: row.product_stable_key,
      slug: row.slug,
      productName: row.product_name,
      revisionId: row.revision_id,
      revisionNumber: Number(row.revision_number),
      contentHash: row.content_hash,
      variantId: daChon ? (row.variant_id as string) : null,
      variantStableKey: daChon ? (row.variant_stable_key as string) : null,
      variantName: daChon ? (row.variant_name as string) : null,
      displayPrice: daChon ? gia : null,
      priceFrom: daChon ? null : gia,
    };
  }

  private async verifyExperienceSelection(
    tx: PoolClient,
    selection: ExperienceSelection,
    productId: string | undefined,
  ): Promise<Record<string, unknown>> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT e.stable_key, e.kind, v.revision_number, v.content_hash, v.label
         FROM vehicle_experience e
         JOIN vehicle_experience_version v ON v.id = e.published_version_id
        WHERE e.stable_key = $1
          AND e.lifecycle_status = 'ACTIVE'
          AND ($2::uuid IS NULL OR e.product_id = $2)
        LIMIT 1`,
      [selection.experienceStableKey, productId ?? null],
    );
    const exp = rows[0];
    if (exp === undefined) {
      throw new BusinessError(ErrorCode.EXPERIENCE_NOT_FOUND, 'Trải nghiệm không còn hiệu lực');
    }
    if (
      Number(exp.revision_number) !== selection.revision ||
      exp.content_hash !== selection.contentHash
    ) {
      throw new BusinessError(
        ErrorCode.PUBLISHED_CONTEXT_STALE,
        'Trải nghiệm đã thay đổi, vui lòng tải lại trang',
      );
    }
    return {
      experienceStableKey: exp.stable_key,
      kind: exp.kind,
      label: exp.label,
      revision: Number(exp.revision_number),
      contentHash: exp.content_hash,
      optionKeys: selection.optionKeys ?? [],
    };
  }

  /**
   * Phiên bản câu đồng ý ĐANG HIỆU LỰC của tenant này.
   *
   * 🔒 Đọc trong CÙNG transaction với lượt ghi lead. Đọc trước rồi ghi sau là để
   *    ngỏ một khe: phiên bản đổi giữa hai lượt và lead ghi nhãn của phiên bản
   *    khách KHÔNG nhìn thấy.
   */
  private async phienBanDongY(tx: PoolClient): Promise<string> {
    const { rows } = await tx.query<{ version: string }>(
      `SELECT v.version
         FROM lead_form_consent_version v
         JOIN lead_form f ON f.id = v.form_id
        WHERE v.effective_from <= now()
        ORDER BY v.effective_from DESC LIMIT 1`,
    );
    return rows[0]?.version ?? LEAD_CONSENT_VERSION;
  }

  private async findDuplicate(tx: PoolClient, phone: string): Promise<string | null> {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM sales_lead
        WHERE phone_normalized = $1
          AND created_at > now() - interval '90 days'
        ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    return rows[0]?.id ?? null;
  }

  private newReference(): string {
    // Mã công khai cho khách, không phải bí mật: 5 byte ngẫu nhiên -> 10 ký tự hex.
    return `LS-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private async uniqueReference(tx: PoolClient): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const reference = this.newReference();
      const { rows } = await tx.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM sales_lead WHERE reference = $1`,
        [reference],
      );
      if (Number(rows[0]?.n ?? 0) === 0) return reference;
    }
    throw new BusinessError(ErrorCode.INTERNAL_ERROR, 'Không sinh được mã tham chiếu');
  }
}
