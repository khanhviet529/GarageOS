import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { normalizeSlug } from '@garageos/domain';
import { contentHashOf } from '../common/content-hash';
import { MOC_CON_TRO, ghepConTro, tachConTro } from '../common/con-tro-trang';
import { urlMediaCongKhai } from '../common/media-url';
import {
  ErrorCode,
  canonicalizeRichTextDocument,
  richTextFromPlainText,
  richTextToPlainText,
  type ActorContext,
  type CreateVariantInput,
  type CreateVehicleProductInput,
  type ExperienceManifest,
  type PatchProductDraftInput,
  type SeoCheck,
  type SeoValidationResult,
  type SiteProfileDraftInput,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';

/**
 * Catalog marketing + experience + site/branch profile — SRS Phase 1 mục 11.2.
 *
 * 🔒 Mọi mutation chạy trong transaction tenant (RLS FORCE). Payload đã
 * publish/archive bất biến: app role chỉ UPDATE row DRAFT (trigger
 * `chan_sua_version_bat_bien` ở migration 0055/0056 chặn phần còn lại), và
 * transition lifecycle chỉ qua hàm SECURITY DEFINER hẹp.
 */

const AUDIT = {
  PRODUCT_CREATED: 'MARKETING_PRODUCT_CREATED',
  PRODUCT_UPDATED: 'MARKETING_PRODUCT_UPDATED',
  PRODUCT_PUBLISHED: 'MARKETING_PRODUCT_PUBLISHED',
  PRODUCT_ARCHIVED: 'MARKETING_PRODUCT_ARCHIVED',
  EXPERIENCE_CREATED: 'MARKETING_EXPERIENCE_CREATED',
  EXPERIENCE_PUBLISHED: 'MARKETING_EXPERIENCE_PUBLISHED',
  EXPERIENCE_ARCHIVED: 'MARKETING_EXPERIENCE_ARCHIVED',
  SITE_PROFILE_DRAFT_UPDATED: 'MARKETING_SITE_PROFILE_DRAFT_UPDATED',
  SITE_PROFILE_PUBLISHED: 'MARKETING_SITE_PROFILE_PUBLISHED',
  BRANCH_PROFILE_DRAFT_UPDATED: 'MARKETING_BRANCH_PROFILE_DRAFT_UPDATED',
  BRANCH_PROFILE_PUBLISHED: 'MARKETING_BRANCH_PROFILE_PUBLISHED',
} as const;

export interface AdminProductRow {
  id: string;
  slug: string;
  lifecycleStatus: string;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  name: string | null;
  revisionNumber: number | null;
  status: string | null;
  /** Ảnh bìa của bản đang hiển thị. Null = mẫu xe chưa có ảnh bìa nào. */
  coverUrl: string | null;
  /** Giá của phiên bản RẺ NHẤT, dạng chuỗi. Null = chưa phiên bản nào có giá. */
  priceFrom: string | null;
  /** Số phiên bản đang bán của bản đang hiển thị. */
  variantCount: number;
  version: number;
  createdAt: Date;
}

@Injectable()
export class MarketingService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /* ============================== Catalog ============================== */

  async listProducts(actor: ActorContext, opts: { cursor?: string; limit: number }): Promise<{
    items: AdminProductRow[];
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(opts.limit, 1), 100);
    const moc = tachConTro(opts.cursor);
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        /*
         * 🔒 Bản HIỂN THỊ là bản nháp nếu có, không thì bản đã publish.
         *
         * ⚠️ Bản trước viết `r.id IN (draft, published) AND r.id = draft`, tức
         *    là chỉ lấy bản nháp — cách viết vòng vo của `r.id = draft`. Hệ quả
         *    đo được: mọi mẫu xe đã publish mà không ai đang sửa đều trả
         *    `name: null`. Danh sách catalog trong admin là một bảng KHÔNG CÓ
         *    TÊN XE — trạng thái bình thường của mọi mẫu xe sau khi phát hành.
         *
         *    Đó là lý do màn quản trị catalog trông như chưa có dữ liệu.
         *
         * `COALESCE(draft, published)`: đang sửa thì thấy cái mình đang sửa,
         * không sửa thì thấy cái khách đang thấy. Ba trường `name`,
         * `revision_number`, `status` cùng đi theo một bản, không trộn.
         */
        `SELECT p.id, p.slug, p.lifecycle_status, p.draft_revision_id,
                p.published_revision_id, p.version, p.created_at,
                ${MOC_CON_TRO('p')},
                r.name, r.revision_number, r.status,
                v.gia_thap_nhat, v.so_phien_ban,
                cover.public_storage_key AS cover_key
           FROM vehicle_product p
           LEFT JOIN vehicle_product_revision r
             ON r.id = COALESCE(p.draft_revision_id, p.published_revision_id)
           LEFT JOIN LATERAL (
             SELECT min(vvr.display_price_amount) AS gia_thap_nhat,
                    count(*)                      AS so_phien_ban
               FROM vehicle_variant_revision vvr
              WHERE vvr.product_revision_id = r.id
                AND vvr.inclusion_status = 'ACTIVE'
           ) v ON true
           -- Chỉ ảnh bìa, và chỉ bản dựng đã publish xong (status = 'READY').
           -- Ảnh đang xử lý mà hiện ra là một ô vỡ — thà không có ảnh.
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key
               FROM vehicle_product_media vpm
               JOIN media_rendition rn ON rn.asset_id = vpm.media_asset_id
               JOIN media_publication mp ON mp.rendition_id = rn.id AND mp.status = 'READY'
              WHERE vpm.product_revision_id = r.id AND vpm.is_cover
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) cover ON true
          WHERE ($2::timestamptz IS NULL OR (
                  p.created_at < $2::timestamptz
                  OR (p.created_at = $2::timestamptz AND p.id > $3::uuid)
                ))
          ORDER BY p.created_at DESC, p.id
          LIMIT $1 + 1`,
        [limit, moc?.moc ?? null, moc?.id ?? null],
      );
      const conNua = rows.length > limit;
      const items: AdminProductRow[] = [];
      let nextCursor: string | null = null;
      for (const row of rows) {
        if (items.length === limit) break;
        if (conNua && items.length === limit - 1) nextCursor = ghepConTro(row);
        items.push(this.toAdminProductRow(row));
      }
      return { items, nextCursor };
    });
  }

  async getProduct(actor: ActorContext, id: string): Promise<Record<string, unknown>> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows: prodRows } = await tx.query<Record<string, unknown>>(
        `SELECT id, slug, lifecycle_status, draft_revision_id, published_revision_id,
                first_published_at, version, created_at, updated_at
           FROM vehicle_product WHERE id = $1`,
        [id],
      );
      const p = prodRows[0];
      if (p === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy sản phẩm');
      }
      const { rows: revs } = await tx.query<Record<string, unknown>>(
        `SELECT id, revision_number, status, schema_version, name, make_name, model_name,
                summary, description, description_document, seo_title, seo_description, content_hash,
                published_at, published_by, version
           FROM vehicle_product_revision
          WHERE product_id = $1
            AND id IN ($2, $3)
          ORDER BY revision_number`,
        [id, p.draft_revision_id ?? null, p.published_revision_id ?? null],
      );
      const draft = revs.find((r) => r.status === 'DRAFT') ?? null;
      const published = revs.find((r) => r.status === 'PUBLISHED') ?? null;
      const variants = await this.variantsForRevision(
        tx,
        ((draft ?? published)?.['id'] ?? null) as string | null,
      );
      return {
        id: p.id,
        slug: p.slug,
        lifecycleStatus: p.lifecycle_status,
        version: Number(p.version),
        firstPublishedAt: p.first_published_at,
        draft: draft === null ? null : this.revisionView(draft),
        published: published === null ? null : this.revisionView(published),
        variants,
      };
    });
  }

  async createProduct(
    actor: ActorContext,
    input: CreateVehicleProductInput,
  ): Promise<{ id: string }> {
    const slug = normalizeSlug(input.slug);
    if (slug === null) throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Slug không hợp lệ');
    return this.db.withTenant(actor, async (tx) => {
      const id = randomUUID();
      try {
        await tx.query(
          `INSERT INTO vehicle_product (id, tenant_id, slug, stable_key, category_id, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [id, actor.tenantId, slug, `product-${id.slice(0, 8)}`, input.categoryId ?? null, actor.userId],
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new BusinessError(ErrorCode.SLUG_ALREADY_EXISTS, 'Slug đã được dùng');
        }
        throw err;
      }

      const revisionId = randomUUID();
      const descriptionDocument = input.descriptionDocument ?? richTextFromPlainText(input.description);
      const description = richTextToPlainText(descriptionDocument);
      const contentHash = contentHashOf(
        JSON.stringify({
          schemaVersion: 1,
          name: input.name,
          makeName: input.makeName,
          modelName: input.modelName,
          summary: input.summary,
          descriptionDocument: canonicalizeRichTextDocument(descriptionDocument),
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
        }),
      );
      await tx.query(
        `INSERT INTO vehicle_product_revision
           (id, tenant_id, product_id, revision_number, name, make_name, model_name,
            summary, description, description_document, seo_title, seo_description, content_hash,
            created_by, updated_by)
         VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$13)`,
        [
          revisionId, actor.tenantId, id, input.name, input.makeName, input.modelName,
          input.summary, description, canonicalizeRichTextDocument(descriptionDocument), input.seoTitle ?? null,
          input.seoDescription ?? null, contentHash, actor.userId,
        ],
      );
      await tx.query('SELECT marketing_set_product_draft($1,$2,$3)', [
        actor.tenantId, id, revisionId,
      ]);
      await this.audit(tx, actor, AUDIT.PRODUCT_CREATED, 'vehicle_product', id);
      return { id };
    });
  }

  async patchProductDraft(
    actor: ActorContext,
    id: string,
    input: PatchProductDraftInput,
  ): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const draftId = await this.requireProductDraft(tx, id);
      const sets: string[] = [];
      const params: unknown[] = [];
      const push = (col: string, value: unknown): void => {
        params.push(value);
        sets.push(`${col} = $${params.length}`);
      };
      if (input.name !== undefined) push('name', input.name);
      if (input.summary !== undefined) push('summary', input.summary);
      if (input.descriptionDocument !== undefined) {
        push('description_document', canonicalizeRichTextDocument(input.descriptionDocument));
        push('description', richTextToPlainText(input.descriptionDocument));
      } else if (input.description !== undefined) {
        const document = richTextFromPlainText(input.description);
        push('description_document', canonicalizeRichTextDocument(document));
        push('description', richTextToPlainText(document));
      }
      if (input.seoTitle !== undefined) push('seo_title', input.seoTitle ?? null);
      if (input.seoDescription !== undefined) push('seo_description', input.seoDescription ?? null);
      if (input.categoryId !== undefined) {
        await tx.query('UPDATE vehicle_product SET category_id=$2, updated_by=$3 WHERE id=$1', [id, input.categoryId, actor.userId]);
      }
      if (sets.length > 0) {
        params.push(actor.userId);
        sets.push(`updated_by = $${params.length}`);
        params.push(draftId, input.version);
        const result = await tx.query(
          `UPDATE vehicle_product_revision SET ${sets.join(', ')}
            WHERE id = $${params.length - 1}
              AND status = 'DRAFT' AND version = $${params.length}`,
          params,
        );
        if (result.rowCount === 0) {
          throw new BusinessError(
            ErrorCode.STALE_VERSION,
            'Bản nháp đã thay đổi ở nơi khác, hãy tải lại',
          );
        }
        const contentHash = await this.rehashProductDraft(tx, draftId);
        await tx.query(
          'UPDATE vehicle_product_revision SET content_hash = $2 WHERE id = $1',
          [draftId, contentHash],
        );
      }
      await this.audit(tx, actor, AUDIT.PRODUCT_UPDATED, 'vehicle_product', id);
      const { rows } = await tx.query<{ version: string }>(
        'SELECT version FROM vehicle_product_revision WHERE id = $1',
        [draftId],
      );
      return { version: Number(rows[0]?.version ?? input.version) };
    });
  }

  async createVariant(
    actor: ActorContext,
    productId: string,
    input: CreateVariantInput,
  ): Promise<{ id: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const draftId = await this.requireProductDraft(tx, productId);
      const variantId = randomUUID();
      const baseKey = normalizeSlug(input.name) ?? 'variant';
      const stableKey = await this.uniqueVariantKey(tx, productId, baseKey);
      await tx.query(
        `INSERT INTO vehicle_variant (id, tenant_id, product_id, stable_key, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)`,
        [variantId, actor.tenantId, productId, stableKey, actor.userId],
      );
      await tx.query(
        `INSERT INTO vehicle_variant_revision
           (id, tenant_id, product_revision_id, variant_id, name, sku, powertrain,
            model_year, display_price_amount, specifications, is_featured, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
        [
          randomUUID(), actor.tenantId, draftId, variantId, input.name,
          input.sku ?? null, input.powertrain, input.modelYear,
          input.displayPrice ?? null, JSON.stringify(input.specifications),
          input.isFeatured, input.sortOrder,
        ],
      );
      await this.audit(tx, actor, AUDIT.PRODUCT_UPDATED, 'vehicle_product', productId);
      return { id: variantId };
    });
  }

  /**
   * POST /vehicle-products/:id/draft — mở lại đường sửa sau khi đã publish.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ Vì sao route này phải tồn tại
   *
   * `marketing_promote_product_draft` đặt `draft_revision_id = NULL` sau khi
   * publish — đúng, vì bản nháp đã trở thành bản publish. Nhưng nhánh này chưa
   * bao giờ có đường dựng lại bản nháp cho SẢN PHẨM (trải nghiệm thì có).
   * Hệ quả đo được, một sản phẩm sau lần publish đầu tiên:
   *
   *   PATCH /vehicle-products/:id/draft  -> 404 "Không có bản nháp, hãy tạo
   *                                              bản nháp mới"   ← không có route nào tạo
   *   POST  /vehicle-products/:id/publish -> 422 "Không có bản nháp để duyệt"
   *   POST  /vehicle-products/:id/rollback -> 422 "Không có bản cũ để khôi phục"
   *
   * Bản `SUPERSEDED` đầu tiên chỉ sinh ra ở lần publish THỨ HAI, mà lần thứ hai
   * thì không tới được. Nên `rollbackProduct` — cùng với nút "Rollback bản
   * publish trước" trong sales-admin — chưa từng có khả năng chạy thành công.
   *
   * 💡 Một xe đã đăng là không sửa được nữa: sai chính tả trong mô tả, sai giá,
   *    đổi ảnh — tất cả đều phải xoá sản phẩm và tạo lại từ đầu, mất luôn slug
   *    (mà slug là URL công khai đã được đánh chỉ mục).
   *
   * Bản nháp mới nhân từ bản ĐANG PUBLISH, kèm variant và media — giống hệt
   * `cloneExperienceDraft`. Đã có bản nháp thì trả về chính nó.
   */
  async cloneProductDraft(actor: ActorContext, id: string): Promise<{ draftId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT draft_revision_id, published_revision_id, lifecycle_status
           FROM vehicle_product WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const prod = rows[0];
      if (prod === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy sản phẩm');
      }
      const draftSan = (prod.draft_revision_id ?? null) as string | null;
      if (draftSan !== null) return { draftId: draftSan };

      if ((prod.lifecycle_status as string) !== 'ACTIVE') {
        throw new BusinessError(
          ErrorCode.PRODUCT_NOT_PUBLISHABLE,
          'Sản phẩm đã lưu trữ — không soạn thảo tiếp được',
        );
      }
      const published = (prod.published_revision_id ?? null) as string | null;
      if (published === null) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Chưa có phiên bản nào để nhân bản');
      }

      const draftId = await this.cloneRevisionAsDraft(tx, actor, published);
      await tx.query('SELECT marketing_set_product_draft($1,$2,$3)', [
        actor.tenantId, id, draftId,
      ]);
      return { draftId };
    });
  }

  /**
   * Publish — SRS mục 6.4: khoá product, kiểm expectedVersion, validate, ghi
   * content_hash canonical rồi swap nguyên tử qua hàm SECURITY DEFINER.
   */
  async publishProduct(
    actor: ActorContext,
    id: string,
    input: { version: number },
  ): Promise<{ revisionId: string; version: number }> {
    return this.db.withTenant(actor, async (tx) =>
      this.publishProductInTx(tx, actor, id, input),
    );
  }

  /** Publish chạy trên transaction SẴN CÓ — để rollback gọi trong cùng giao dịch. */
  private async publishProductInTx(
    tx: PoolClient,
    actor: ActorContext,
    id: string,
    input: { version: number },
  ): Promise<{ revisionId: string; version: number }> {
      const { rows: lockRows } = await tx.query<{ draft: string | null; version: string }>(
        `SELECT draft_revision_id AS draft, version
           FROM vehicle_product WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const product = lockRows[0];
      if (product === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy sản phẩm');
      }
      if (Number(product.version) !== input.version) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Sản phẩm đã thay đổi, hãy tải lại');
      }
      if (product.draft === null) {
        throw new BusinessError(ErrorCode.PRODUCT_NOT_PUBLISHABLE, 'Không có bản nháp để duyệt');
      }

      await this.validatePublishableProduct(tx, product.draft);
      const contentHash = await this.rehashProductDraft(tx, product.draft);
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE vehicle_product_revision SET content_hash = $1, updated_by = $2
          WHERE id = $3 AND status = 'DRAFT'
          RETURNING id`,
        [contentHash, actor.userId, product.draft],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.PRODUCT_NOT_PUBLISHABLE, 'Không có bản nháp để duyệt');
      }

      const { rows: promoted } = await tx.query<{ promote: string }>(
        'SELECT marketing_promote_product_draft($1,$2,$3) AS promote',
        [actor.tenantId, id, actor.userId],
      );
      await this.audit(tx, actor, AUDIT.PRODUCT_PUBLISHED, 'vehicle_product', id);
      return { revisionId: promoted[0]!.promote, version: input.version + 1 };
  }

  /** Rollback: clone bản SUPERSEDED gần nhất thành draft mới rồi publish (SRS 6.4). */
  async rollbackProduct(actor: ActorContext, id: string): Promise<{ revisionId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows: prodRows } = await tx.query<Record<string, unknown>>(
        `SELECT id, version, draft_revision_id FROM vehicle_product WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const prod = prodRows[0];
      if (prod === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy sản phẩm');

      // Cùng lập luận với `rollbackExperience`: `uq_product_revision_one_draft`
      // chỉ cho một bản nháp, và bản nháp đang có là việc dở của người khác.
      if (prod.draft_revision_id !== null) {
        throw new BusinessError(
          ErrorCode.PRODUCT_NOT_PUBLISHABLE,
          'Đang có bản nháp chưa duyệt — hãy duyệt hoặc bỏ bản nháp trước khi khôi phục bản cũ',
        );
      }

      const { rows: oldRows } = await tx.query<Record<string, unknown>>(
        `SELECT id FROM vehicle_product_revision
          WHERE product_id = $1 AND status = 'SUPERSEDED'
          ORDER BY revision_number DESC LIMIT 1`,
        [id],
      );
      const oldRev = oldRows[0];
      if (oldRev === undefined) {
        throw new BusinessError(ErrorCode.PRODUCT_NOT_PUBLISHABLE, 'Không có bản cũ để khôi phục');
      }

      const newRevisionId = await this.cloneRevisionAsDraft(tx, actor, oldRev.id as string);
      await tx.query('SELECT marketing_set_product_draft($1,$2,$3)', [
        actor.tenantId, id, newRevisionId,
      ]);
      // set_draft đã touch product -> version mới; đọc lại trước khi publish
      const { rows: verRows } = await tx.query<{ version: string }>(
        'SELECT version FROM vehicle_product WHERE id = $1', [id],
      );
      const result = await this.publishProductInTx(tx, actor, id, {
        version: Number(verRows[0]?.version ?? prod.version),
      });
      return { revisionId: result.revisionId };
    });
  }

  async archiveProduct(actor: ActorContext, id: string): Promise<{ lifecycleStatus: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const result = await tx.query(
        `UPDATE vehicle_product SET lifecycle_status = 'ARCHIVED'
          WHERE id = $1 AND lifecycle_status = 'ACTIVE'`,
        [id],
      );
      if (result.rowCount === 0) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy sản phẩm đang hoạt động');
      }
      await this.audit(tx, actor, AUDIT.PRODUCT_ARCHIVED, 'vehicle_product', id);
      return { lifecycleStatus: 'ARCHIVED' };
    });
  }

  /* ============================= Experience ============================= */

  async listExperiences(
    actor: ActorContext,
    productId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT e.id, e.stable_key, e.kind, e.lifecycle_status, e.draft_version_id,
                e.published_version_id, e.version,
                v.label, v.revision_number, v.status, v.content_hash
           FROM vehicle_experience e
           LEFT JOIN vehicle_experience_version v
             ON v.id = e.draft_version_id OR v.id = e.published_version_id
          WHERE e.product_id = $1
          ORDER BY e.stable_key`,
        [productId],
      );
      const byId = new Map<string, Record<string, unknown>[]>();
      for (const r of rows) {
        const list = byId.get(r.id as string) ?? [];
        list.push(r);
        byId.set(r.id as string, list);
      }
      return [...byId.entries()].map(([id, rs]) => {
        const r = rs[0]!;
        return {
          id,
          stableKey: r.stable_key,
          kind: r.kind,
          lifecycleStatus: r.lifecycle_status,
          version: Number(r.version),
          draft: rs.find((x) => x.status === 'DRAFT')?.label ?? null,
          published: rs.find((x) => x.status === 'PUBLISHED')?.label ?? null,
        };
      });
    });
  }

  async createExperience(
    actor: ActorContext,
    productId: string,
    input: { kind: ExperienceManifest['kind']; label: string; config?: Record<string, unknown> },
  ): Promise<{ id: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows: prodRows } = await tx.query<{ id: string }>(
        'SELECT id FROM vehicle_product WHERE id = $1',
        [productId],
      );
      if (prodRows[0] === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy sản phẩm');
      }
      const id = randomUUID();
      const baseKey = normalizeSlug(input.label) ?? 'experience';
      const stableKey = await this.uniqueExperienceKey(tx, productId, baseKey);
      await tx.query(
        `INSERT INTO vehicle_experience
           (id, tenant_id, product_id, kind, stable_key, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [id, actor.tenantId, productId, input.kind, stableKey, actor.userId],
      );
      const versionId = await this.insertExperienceVersion(
        tx, actor, id, input.label,
        /*
         * 🔒 `kind` đặt SAU phần rải của `input.config` — nói cách khác, cột
         * `kind` thắng.
         *
         * ⚠️ Trước bản sửa, `{ kind: input.kind, ...input.config }` để client
         *    ghi đè `kind` bằng cách nhét `kind` vào `config`. Khi đó cột
         *    `vehicle_experience.kind` và `config.kind` nói hai điều khác nhau,
         *    và hệ thống đọc chúng ở hai nơi khác nhau:
         *
         *      · `experiencesOf()` (danh sách trên trang xe) đọc CỘT
         *      · `experienceManifest()` (trình xem) đọc CONFIG
         *
         *    Kết quả: danh sách ghi "ảnh 360 ngoại thất", nhưng khách bấm vào
         *    thì trình xem panorama nội thất mở ra.
         */
        { ...(input.config ?? {}), kind: input.kind },
      );
      await tx.query('SELECT marketing_set_experience_draft($1,$2,$3)', [
        actor.tenantId, id, versionId,
      ]);
      await this.audit(tx, actor, AUDIT.EXPERIENCE_CREATED, 'vehicle_experience', id);
      return { id };
    });
  }

  /** POST /vehicle-experiences/:id/draft — clone current publication thành draft mới. */
  async cloneExperienceDraft(actor: ActorContext, id: string): Promise<{ draftId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      // FOR UPDATE: hai cú bấm SONG SONG cũng phải xếp hàng, nếu không cả hai
      // cùng thấy `draft_version_id IS NULL` rồi cùng dựng một bản nháp.
      const { rows: expRows } = await tx.query<Record<string, unknown>>(
        `SELECT id, published_version_id, draft_version_id
           FROM vehicle_experience WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const exp = expRows[0];
      if (exp === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy trải nghiệm');
      }

      /*
       * 🔒 Đã có bản nháp thì TRẢ VỀ bản nháp đó, không dựng thêm cái nữa.
       *
       * ⚠️ Trước bản sửa, bấm "Tạo bản nháp" lần thứ hai trả HTTP 500. Đo được:
       *
       *      clone lần 1: 201 {"draftId":"aaddd64d-…"}
       *      clone lần 2: 500 {"code":"INTERNAL_ERROR"}
       *
       *    Hai ràng buộc cùng chặn — `UNIQUE (…, revision_number)` và chỉ mục
       *    riêng phần `uq_experience_version_one_draft` — nên DB vẫn giữ được sự
       *    thật. Nhưng người dùng chỉ thấy "Đã có lỗi xảy ra", trong khi bản
       *    nháp họ muốn ĐANG CÓ SẴN.
       *
       * 💡 Nút này về bản chất là "cho tôi một bản nháp để sửa". Nếu bản nháp đã
       *    tồn tại thì yêu cầu đó đã được thoả — trả về nó là câu trả lời đúng,
       *    không phải một lỗi.
       */
      const draftSan = (exp.draft_version_id ?? null) as string | null;
      if (draftSan !== null) return { draftId: draftSan };

      const sourceId = (exp.published_version_id ?? null) as string | null;
      if (sourceId === null) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Chưa có phiên bản nào để nhân bản');
      }
      const { rows: srcRows } = await tx.query<Record<string, unknown>>(
        `SELECT label, config, schema_version, content_hash
           FROM vehicle_experience_version WHERE id = $1`,
        [sourceId],
      );
      const src = srcRows[0]!;
      const newVersionId = await this.insertExperienceVersion(
        tx, actor, id, src.label as string,
        src.config as Record<string, unknown>,
      );
      await tx.query('SELECT marketing_set_experience_draft($1,$2,$3)', [
        actor.tenantId, id, newVersionId,
      ]);
      return { draftId: newVersionId };
    });
  }

  async patchExperienceDraft(
    actor: ActorContext,
    id: string,
    input: { version: number; label?: string; config?: Record<string, unknown> },
  ): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const draftId = await this.requireExperienceDraft(tx, id);
      const sets: string[] = [];
      const params: unknown[] = [];
      if (input.label !== undefined) {
        params.push(input.label);
        sets.push(`label = $${params.length}`);
      }
      if (input.config !== undefined) {
        /*
         * 🔒 `kind` KHÔNG sửa được qua `config` — nó là cột, và cột là gốc.
         *
         * ⚠️ PATCH thay nguyên cục `config`. Không chốt lại `kind` ở đây thì
         *    một PATCH thường (đổi số khung hình) mà quên chép `kind` sẽ XOÁ
         *    `kind` khỏi config, và `publishExperience` chặn ngay với "kind
         *    không hợp lệ" — bản nháp kẹt cứng, không hiểu vì sao.
         *
         *    Còn nếu PATCH gửi `kind` KHÁC cột thì tệ hơn: publish qua được, và
         *    từ đó danh sách với trình xem mô tả hai thứ khác nhau.
         *
         * Đổi loại trải nghiệm là tạo trải nghiệm mới, không phải sửa tại chỗ:
         * media đã gắn theo binding của loại cũ sẽ không còn nghĩa gì.
         */
        const { rows: kindRows } = await tx.query<{ kind: string }>(
          'SELECT kind FROM vehicle_experience WHERE id = $1',
          [id],
        );
        params.push(JSON.stringify({ ...input.config, kind: kindRows[0]?.kind }));
        sets.push(`config = $${params.length}::jsonb`);
      }
      if (sets.length > 0) {
        params.push(actor.userId);
        sets.push(`updated_by = $${params.length}`);
        params.push(draftId, input.version);
        const result = await tx.query(
          `UPDATE vehicle_experience_version SET ${sets.join(', ')}
            WHERE id = $${params.length - 1}
              AND status = 'DRAFT' AND version = $${params.length}`,
          params,
        );
        if (result.rowCount === 0) {
          throw new BusinessError(ErrorCode.STALE_VERSION, 'Bản nháp đã thay đổi, hãy tải lại');
        }
      }
      const { rows } = await tx.query<{ version: string }>(
        'SELECT version FROM vehicle_experience_version WHERE id = $1',
        [draftId],
      );
      return { version: Number(rows[0]?.version ?? input.version) };
    });
  }

  async publishExperience(
    actor: ActorContext,
    id: string,
    input: { version: number },
  ): Promise<{ versionId: string }> {
    return this.db.withTenant(actor, async (tx) =>
      this.publishExperienceInTx(tx, actor, id, input),
    );
  }

  /** Publish experience trên transaction SẴN CÓ — cho rollback dùng chung giao dịch. */
  private async publishExperienceInTx(
    tx: PoolClient,
    actor: ActorContext,
    id: string,
    input: { version: number },
  ): Promise<{ versionId: string }> {
      const { rows: lockRows } = await tx.query<{ draft: string | null; version: string }>(
        `SELECT draft_version_id AS draft, version
           FROM vehicle_experience WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const exp = lockRows[0];
      if (exp === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy trải nghiệm');
      if (Number(exp.version) !== input.version) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Trải nghiệm đã thay đổi, hãy tải lại');
      }
      if (exp.draft === null) {
        throw new BusinessError(ErrorCode.EXPERIENCE_NOT_PUBLISHABLE, 'Không có bản nháp để duyệt');
      }

      const { rows: draftRows } = await tx.query<Record<string, unknown>>(
        `SELECT v.schema_version, v.config, v.label
           FROM vehicle_experience_version v WHERE v.id = $1 AND v.status = 'DRAFT'`,
        [exp.draft],
      );
      const draft = draftRows[0];
      if (draft === undefined) {
        throw new BusinessError(ErrorCode.EXPERIENCE_NOT_PUBLISHABLE, 'Không có bản nháp để duyệt');
      }
      this.validateExperienceConfig(Number(draft.schema_version), draft.config as Record<string, unknown>);

      const contentHash = contentHashOf(
        JSON.stringify({
          schemaVersion: Number(draft.schema_version),
          label: draft.label as string,
          config: draft.config as Record<string, unknown>,
        }),
      );
      const updated = await tx.query(
        `UPDATE vehicle_experience_version SET content_hash = $1, updated_by = $2
          WHERE id = $3 AND status = 'DRAFT'`,
        [contentHash, actor.userId, exp.draft],
      );
      if (updated.rowCount === 0) {
        throw new BusinessError(ErrorCode.EXPERIENCE_NOT_PUBLISHABLE, 'Không có bản nháp để duyệt');
      }

      await tx.query('SELECT marketing_promote_experience_draft($1,$2,$3)', [
        actor.tenantId, id, actor.userId,
      ]);
      await this.audit(tx, actor, AUDIT.EXPERIENCE_PUBLISHED, 'vehicle_experience', id);
      return { versionId: exp.draft };
  }

  async rollbackExperience(actor: ActorContext, id: string): Promise<{ versionId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows: expRows } = await tx.query<Record<string, unknown>>(
        `SELECT id, version, draft_version_id FROM vehicle_experience WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const exp = expRows[0];
      if (exp === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy trải nghiệm');

      /*
       * 🔒 Đang có bản nháp thì từ chối, và nói rõ vì sao.
       *
       * Rollback dựng một bản nháp mới rồi publish ngay. `uq_experience_version_
       * one_draft` chỉ cho phép một bản nháp mỗi trải nghiệm, nên nếu ai đó đang
       * soạn dở thì lệnh INSERT vỡ ngay ở tầng DB — và người dùng nhận 500.
       *
       * 💡 Không tự ý huỷ bản nháp đang soạn để lấy chỗ: đó là công việc chưa
       *    lưu của một người khác. Ràng buộc thật ở đây là nghiệp vụ chứ không
       *    phải kỹ thuật — "khôi phục bản cũ" và "đang sửa bản mới" là hai ý
       *    định trái nhau, và chỉ người dùng mới quyết được bỏ cái nào.
       */
      if (exp.draft_version_id !== null) {
        throw new BusinessError(
          ErrorCode.EXPERIENCE_NOT_PUBLISHABLE,
          'Đang có bản nháp chưa duyệt — hãy duyệt hoặc bỏ bản nháp trước khi khôi phục bản cũ',
        );
      }

      const { rows: oldRows } = await tx.query<Record<string, unknown>>(
        `SELECT id, label, config, revision_number
           FROM vehicle_experience_version
          WHERE experience_id = $1 AND status = 'SUPERSEDED'
          ORDER BY revision_number DESC LIMIT 1`,
        [id],
      );
      const oldVer = oldRows[0];
      if (oldVer === undefined) {
        throw new BusinessError(ErrorCode.EXPERIENCE_NOT_PUBLISHABLE, 'Không có bản cũ để khôi phục');
      }
      const newVersionId = await this.insertExperienceVersion(
        tx, actor, id, oldVer.label as string, oldVer.config as Record<string, unknown>,
      );
      await tx.query('SELECT marketing_set_experience_draft($1,$2,$3)', [
        actor.tenantId, id, newVersionId,
      ]);
      // set_draft đã touch experience -> version mới; đọc lại trước khi publish
      const { rows: verRows } = await tx.query<{ version: string }>(
        'SELECT version FROM vehicle_experience WHERE id = $1', [id],
      );
      const result = await this.publishExperienceInTx(tx, actor, id, {
        version: Number(verRows[0]?.version ?? exp.version),
      });
      return { versionId: result.versionId };
    });
  }

  async archiveExperience(actor: ActorContext, id: string): Promise<{ lifecycleStatus: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const result = await tx.query(
        `UPDATE vehicle_experience SET lifecycle_status = 'ARCHIVED'
          WHERE id = $1 AND lifecycle_status = 'ACTIVE'`,
        [id],
      );
      if (result.rowCount === 0) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy trải nghiệm đang hoạt động');
      }
      await this.audit(tx, actor, AUDIT.EXPERIENCE_ARCHIVED, 'vehicle_experience', id);
      return { lifecycleStatus: 'ARCHIVED' };
    });
  }

  /* ========================= Site / Branch profile ========================= */

  async getSiteProfile(actor: ActorContext): Promise<Record<string, unknown>> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT id, version_number, status, brand_name, legal_name, default_title_suffix,
                default_description, phone, address, version, published_at
           FROM site_profile
          ORDER BY CASE status WHEN 'DRAFT' THEN 0 WHEN 'PUBLISHED' THEN 1 ELSE 2 END
          LIMIT 2`,
      );
      /*
       * 🔒 Trả đúng hình dạng contract, không trả thẳng row của Postgres.
       *
       * Hai chỗ lệch, và cả hai đều làm client không dùng được kết quả:
       *  · `version` là `bigint` nên driver trả về CHUỖI. Contract khai
       *    `z.number()`, nên lấy version từ GET rồi PATCH lại luôn nhận 400 —
       *    API tự mâu thuẫn với chính nó.
       *  · Cột DB là `snake_case`; contract và toàn bộ API còn lại dùng
       *    `camelCase`.
       */
      const view = (r: Record<string, unknown> | undefined): Record<string, unknown> | null =>
        r === undefined
          ? null
          : {
              id: r.id,
              versionNumber: Number(r.version_number),
              status: r.status,
              brandName: r.brand_name,
              legalName: r.legal_name ?? null,
              defaultTitleSuffix: r.default_title_suffix,
              defaultDescription: r.default_description ?? null,
              phone: r.phone ?? null,
              address: r.address ?? null,
              version: Number(r.version),
              publishedAt:
                r.published_at === null || r.published_at === undefined
                  ? null
                  : (r.published_at as Date).toISOString(),
            };
      return {
        draft: view(rows.find((r) => r.status === 'DRAFT')),
        published: view(rows.find((r) => r.status === 'PUBLISHED')),
      };
    });
  }

  async patchSiteProfileDraft(
    actor: ActorContext,
    draftId: string,
    input: SiteProfileDraftInput,
  ): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const sets: string[] = [];
      const params: unknown[] = [];
      const push = (col: string, value: unknown): void => {
        params.push(value);
        sets.push(`${col} = $${params.length}`);
      };
      if (input.brandName !== undefined) push('brand_name', input.brandName);
      if (input.legalName !== undefined) push('legal_name', input.legalName ?? null);
      if (input.defaultTitleSuffix !== undefined) push('default_title_suffix', input.defaultTitleSuffix);
      if (input.defaultDescription !== undefined) push('default_description', input.defaultDescription);
      if (input.phone !== undefined) push('phone', input.phone ?? null);
      if (input.address !== undefined) push('address', input.address === null ? null : JSON.stringify(input.address));
      if (sets.length > 0) {
        params.push(actor.userId);
        sets.push(`updated_by = $${params.length}`);
        params.push(draftId, input.version);
        const result = await tx.query(
          `UPDATE site_profile SET ${sets.join(', ')}
            WHERE id = $${params.length - 1}
              AND status = 'DRAFT' AND version = $${params.length}`,
          params,
        );
        if (result.rowCount === 0) {
          throw new BusinessError(ErrorCode.STALE_VERSION, 'Bản nháp đã thay đổi, hãy tải lại');
        }
      }
      await this.audit(tx, actor, AUDIT.SITE_PROFILE_DRAFT_UPDATED, 'site_profile', draftId);
      const { rows } = await tx.query<{ version: string }>(
        'SELECT version FROM site_profile WHERE id = $1', [draftId],
      );
      return { version: Number(rows[0]?.version ?? input.version) };
    });
  }

  async publishSiteProfile(actor: ActorContext, draftId: string): Promise<{ nextDraftId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const checks = await this.seoChecksSiteProfile(tx, draftId);
      const blocking = checks.filter((c) => c.severity === 'BLOCKING');
      if (blocking.length > 0) {
        throw new BusinessError(ErrorCode.SEO_VALIDATION_FAILED, 'SEO chưa đủ điều kiện duyệt', {
          checks: blocking,
        });
      }
      const { rows } = await tx.query<{ next: string }>(
        'SELECT marketing_publish_site_profile($1,$2,$3) AS next',
        [actor.tenantId, draftId, actor.userId],
      );
      await this.audit(tx, actor, AUDIT.SITE_PROFILE_PUBLISHED, 'site_profile', draftId);
      return { nextDraftId: rows[0]!.next };
    });
  }

  async listBranchProfiles(actor: ActorContext): Promise<Record<string, unknown>[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT bpp.branch_id, bpp.id AS draft_id, bpp.stable_key, bpp.public_name,
                bpp.public_phone, bpp.public_address, bpp.status, bpp.version,
                b.name AS branch_name, b.is_active
           FROM branch_public_profile bpp
           JOIN branch b ON b.id = bpp.branch_id
          WHERE bpp.status IN ('DRAFT','PUBLISHED')
          ORDER BY b.name, bpp.status`,
      );
      return rows.map((r) => ({
        branchId: r.branch_id,
        draftId: r.status === 'DRAFT' ? r.draft_id : null,
        stableKey: r.stable_key,
        publicName: r.public_name,
        publicPhone: r.public_phone ?? null,
        publicAddress: r.public_address ?? null,
        published: r.status === 'PUBLISHED',
        branchName: r.branch_name,
        isActive: r.is_active,
        version: Number(r.version),
      }));
    });
  }

  /**
   * Danh bạ chi nhánh của tenant.
   *
   * 🔒 Khác `listBranchProfiles`, và khác ở chỗ quan trọng: hàm kia liệt kê
   *    HỒ SƠ CÔNG KHAI đã dựng cho landing, nên chi nhánh chưa có hồ sơ thì
   *    không xuất hiện. Hàm này liệt kê CHI NHÁNH.
   *
   *    Lấy danh bạ từ danh sách hồ sơ là đúng loại lỗi im lặng: màn khai khả
   *    năng giao xe sẽ không cho chọn đúng những chi nhánh chưa được khai —
   *    tức là đúng những chi nhánh cần khai.
   *
   * Trả cả chi nhánh đã ngừng hoạt động, kèm `isActive`: dữ liệu cũ vẫn trỏ tới
   * chúng, và một cái tên biến mất thì bảng hiện uuid.
   */
  async listBranches(
    actor: ActorContext,
  ): Promise<{ id: string; code: string; name: string; isActive: boolean }[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string; code: string; name: string; is_active: boolean }>(
        `SELECT id, code, name, is_active FROM branch ORDER BY is_active DESC, name`,
      );
      return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, isActive: r.is_active }));
    });
  }

  async patchBranchProfileDraft(
    actor: ActorContext,
    branchId: string,
    input: { version: number; publicName?: string; publicPhone?: string | null; publicAddress?: string | null },
  ): Promise<{ version: number; draftId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const draftId = await this.ensureBranchProfileDraft(tx, actor, branchId);
      const sets: string[] = [];
      const params: unknown[] = [];
      const push = (col: string, value: unknown): void => {
        params.push(value);
        sets.push(`${col} = $${params.length}`);
      };
      if (input.publicName !== undefined) push('public_name', input.publicName);
      if (input.publicPhone !== undefined) push('public_phone', input.publicPhone ?? null);
      if (input.publicAddress !== undefined) push('public_address', input.publicAddress ?? null);
      if (sets.length > 0) {
        params.push(actor.userId);
        sets.push(`updated_by = $${params.length}`);
        params.push(draftId, input.version);
        const result = await tx.query(
          `UPDATE branch_public_profile SET ${sets.join(', ')}
            WHERE id = $${params.length - 1}
              AND status = 'DRAFT' AND version = $${params.length}`,
          params,
        );
        if (result.rowCount === 0) {
          throw new BusinessError(ErrorCode.STALE_VERSION, 'Bản nháp đã thay đổi, hãy tải lại');
        }
      }
      await this.audit(tx, actor, AUDIT.BRANCH_PROFILE_DRAFT_UPDATED, 'branch_public_profile', draftId);
      const { rows } = await tx.query<{ version: string }>(
        'SELECT version FROM branch_public_profile WHERE id = $1', [draftId],
      );
      return { draftId, version: Number(rows[0]?.version ?? input.version) };
    });
  }

  async publishBranchProfile(actor: ActorContext, branchId: string): Promise<{ nextDraftId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const draftId = await this.ensureBranchProfileDraft(tx, actor, branchId);
      const { rows } = await tx.query<{ next: string }>(
        'SELECT marketing_publish_branch_profile($1,$2,$3) AS next',
        [actor.tenantId, draftId, actor.userId],
      );
      await this.audit(tx, actor, AUDIT.BRANCH_PROFILE_PUBLISHED, 'branch_public_profile', draftId);
      return { nextDraftId: rows[0]!.next };
    });
  }

  /* ============================= SEO validate ============================= */

  async seoValidate(
    actor: ActorContext,
    input: { targetType: string; targetId: string; draftVersion: number },
  ): Promise<SeoValidationResult> {
    return this.db.withTenant(actor, async (tx) => {
      let checks: SeoCheck[];
      if (input.targetType === 'site_profile') {
        checks = await this.seoChecksSiteProfile(tx, input.targetId);
      } else if (input.targetType === 'vehicle_product') {
        const draftId = await this.requireProductDraft(tx, input.targetId);
        checks = await this.seoChecksProductDraft(tx, draftId);
      } else {
        throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'targetType không hợp lệ');
      }
      return { targetVersion: input.draftVersion, checks };
    });
  }

  /* ============================== Helpers ============================== */

  private async requireProductDraft(tx: PoolClient, productId: string): Promise<string> {
    const { rows } = await tx.query<{ draft: string | null }>(
      `SELECT draft_revision_id AS draft FROM vehicle_product WHERE id = $1`,
      [productId],
    );
    const draft = rows[0]?.draft ?? null;
    if (draft === null) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không có bản nháp, hãy tạo bản nháp mới');
    }
    return draft;
  }

  private async requireExperienceDraft(tx: PoolClient, id: string): Promise<string> {
    const { rows } = await tx.query<{ draft: string | null }>(
      `SELECT draft_version_id AS draft FROM vehicle_experience WHERE id = $1`,
      [id],
    );
    const draft = rows[0]?.draft ?? null;
    if (draft === null) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không có bản nháp, hãy tạo bản nháp mới');
    }
    return draft;
  }

  private async validatePublishableProduct(tx: PoolClient, draftId: string): Promise<void> {
    const { rows: varRows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_variant_revision
        WHERE product_revision_id = $1 AND inclusion_status = 'ACTIVE'`,
      [draftId],
    );
    if (Number(varRows[0]?.n ?? 0) === 0) {
      throw new BusinessError(ErrorCode.PRODUCT_NOT_PUBLISHABLE, 'Cần ít nhất một phiên bản xe');
    }
    const { rows: coverRows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_product_media
        WHERE product_revision_id = $1 AND is_cover`,
      [draftId],
    );
    if (Number(coverRows[0]?.n ?? 0) === 0) {
      throw new BusinessError(ErrorCode.PRODUCT_NOT_PUBLISHABLE, 'Cần ảnh cover hợp lệ');
    }
    const { rows: altRows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_product_media
        WHERE product_revision_id = $1 AND length(alt_text) = 0`,
      [draftId],
    );
    if (Number(altRows[0]?.n ?? 0) > 0) {
      throw new BusinessError(ErrorCode.PRODUCT_NOT_PUBLISHABLE, 'Ảnh phải có alt text');
    }
  }

  /** Hash canonical projection của draft gồm revision + variant + media. */
  private async rehashProductDraft(tx: PoolClient, draftId: string): Promise<string> {
    const { rows: revRows } = await tx.query<Record<string, unknown>>(
      `SELECT schema_version, name, make_name, model_name, summary, description_document,
              seo_title, seo_description
         FROM vehicle_product_revision WHERE id = $1`,
      [draftId],
    );
    const rev = revRows[0];
    if (rev === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản nháp');
    const { rows: varRows } = await tx.query<Record<string, unknown>>(
      `SELECT vv.stable_key, vvr.name, vvr.sku, vvr.powertrain, vvr.model_year,
              vvr.display_price_amount, vvr.specifications, vvr.is_featured, vvr.sort_order
         FROM vehicle_variant_revision vvr
         JOIN vehicle_variant vv ON vv.id = vvr.variant_id
        WHERE vvr.product_revision_id = $1 AND vvr.inclusion_status = 'ACTIVE'
        ORDER BY vvr.sort_order, vv.stable_key`,
      [draftId],
    );
    const { rows: mediaRows } = await tx.query<Record<string, unknown>>(
      `SELECT vpm.role, vpm.alt_text, vpm.sort_order, vpm.is_cover, a.stable_key
         FROM vehicle_product_media vpm
         JOIN media_asset a ON a.id = vpm.media_asset_id
        WHERE vpm.product_revision_id = $1
        ORDER BY vpm.sort_order`,
      [draftId],
    );
    return contentHashOf(
      JSON.stringify({
        schemaVersion: Number(rev.schema_version),
        name: rev.name,
        makeName: rev.make_name,
        modelName: rev.model_name,
        summary: rev.summary,
        descriptionDocument: canonicalizeRichTextDocument(rev.description_document as Parameters<typeof canonicalizeRichTextDocument>[0]),
        seoTitle: rev.seo_title ?? null,
        seoDescription: rev.seo_description ?? null,
        variants: varRows.map((v) => ({
          stableKey: v.stable_key,
          name: v.name,
          sku: v.sku ?? null,
          powertrain: v.powertrain,
          modelYear: Number(v.model_year),
          displayPrice: v.display_price_amount === null ? null : Number(v.display_price_amount),
          isFeatured: v.is_featured,
          sortOrder: Number(v.sort_order),
        })),
        media: mediaRows.map((m) => ({
          stableKey: m.stable_key,
          role: m.role,
          alt: m.alt_text,
          sortOrder: Number(m.sort_order),
          isCover: m.is_cover,
        })),
      }),
    );
  }

  /**
   * Số revision kế tiếp = MAX + 1 trên TOÀN BỘ lịch sử, không phải "bản nguồn + 1".
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 🔒 Vì sao khác biệt này quan trọng
   *
   * Cả hai bảng revision đều có `UNIQUE (tenant_id, <cha>, revision_number)`
   * (migration 0056). Lấy số từ BẢN NGUỒN chỉ đúng khi bản nguồn tình cờ là bản
   * mới nhất — mà rollback thì theo định nghĩa KHÔNG PHẢI vậy: nó nhân bản một
   * bản `SUPERSEDED`, tức một bản cũ.
   *
   * ⚠️ Dấu vết đo được trước bản sửa, trên trải nghiệm đã publish hai lần:
   *
   *     rev 1 SUPERSEDED · rev 2 PUBLISHED
   *     rollback -> nhân bản rev 1 -> xin số 1+1 = 2 -> đã có
   *
   *     ERROR: duplicate key value violates unique constraint
   *            "vehicle_experience_version_tenant_id_experience_id_revision_key"
   *
   *    Người dùng nhận HTTP 500 "Đã có lỗi xảy ra". Không phải một trường hợp
   *    biên: rollback ĐẦU TIÊN của MỌI trải nghiệm đều rơi đúng vào đây, vì
   *    rollback cần ít nhất một bản SUPERSEDED, và bản SUPERSEDED đầu tiên chỉ
   *    xuất hiện khi đã có bản PUBLISHED số cao hơn nó.
   *
   * 💡 Cùng khuôn với ba lần "check-then-act" đã ghi ở `STATUS.md`: một giá trị
   *    được suy ra từ một hàng đọc trước đó, trong khi sự thật nằm ở tập hợp.
   *
   * Khoá hàng cha TRƯỚC khi đếm — hai người bấm cùng lúc thì đọc cùng một MAX
   * và lại đụng nhau, lần này vì đua chứ không vì tính sai.
   */
  private async soRevisionKeTiep(
    tx: PoolClient,
    bang: 'vehicle_product_revision' | 'vehicle_experience_version',
    cotCha: 'product_id' | 'experience_id',
    idCha: string,
  ): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT COALESCE(MAX(revision_number), 0)::text AS n
         FROM ${bang} WHERE ${cotCha} = $1`,
      [idCha],
    );
    return Number(rows[0]?.n ?? 0) + 1;
  }

  private async cloneRevisionAsDraft(
    tx: PoolClient,
    actor: ActorContext,
    sourceRevisionId: string,
  ): Promise<string> {
    const { rows: srcRows } = await tx.query<Record<string, unknown>>(
      `SELECT product_id FROM vehicle_product_revision WHERE id = $1`,
      [sourceRevisionId],
    );
    const src = srcRows[0];
    if (src === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản cũ');
    const soMoi = await this.soRevisionKeTiep(
      tx, 'vehicle_product_revision', 'product_id', src.product_id as string,
    );

    const newId = randomUUID();
    await tx.query(
      `INSERT INTO vehicle_product_revision
         (id, tenant_id, product_id, revision_number, name, make_name, model_name,
          summary, description, description_document, seo_title, seo_description, content_hash, created_by, updated_by)
       SELECT $1, tenant_id, product_id, $2, name, make_name, model_name,
              summary, description, description_document, seo_title, seo_description, content_hash, $3, $3
         FROM vehicle_product_revision WHERE id = $4`,
      [newId, soMoi, actor.userId, sourceRevisionId],
    );

    // Sao chép variant + media sang draft mới (clone-to-draft, không mutate lịch sử)
    await tx.query(
      `INSERT INTO vehicle_variant_revision
         (id, tenant_id, product_revision_id, variant_id, name, sku, powertrain,
          model_year, display_price_amount, specifications, inclusion_status,
          is_featured, sort_order)
       SELECT gen_random_uuid(), tenant_id, $1, variant_id, name, sku, powertrain,
              model_year, display_price_amount, specifications, inclusion_status,
              is_featured, sort_order
         FROM vehicle_variant_revision WHERE product_revision_id = $2`,
      [newId, sourceRevisionId],
    );
    await tx.query(
      `INSERT INTO vehicle_product_media
         (id, tenant_id, product_revision_id, media_asset_id, role, alt_text,
          sort_order, is_cover)
       SELECT gen_random_uuid(), tenant_id, $1, media_asset_id, role, alt_text,
              sort_order, is_cover
         FROM vehicle_product_media WHERE product_revision_id = $2`,
      [newId, sourceRevisionId],
    );
    return newId;
  }

  /**
   * Số revision do CHÍNH hàm này tính, không nhận từ nơi gọi.
   *
   * Trước đây mỗi nơi gọi tự tính một kiểu — `1`, `src + 1`, `oldVer + 1` — và
   * hai trong ba kiểu đó sai. Khi một giá trị phải tuân theo một ràng buộc DB,
   * để nơi gọi tự tính là mời mỗi nơi gọi sai một cách khác nhau.
   */
  private async insertExperienceVersion(
    tx: PoolClient,
    actor: ActorContext,
    experienceId: string,
    label: string,
    config: Record<string, unknown>,
  ): Promise<string> {
    const revisionNumber = await this.soRevisionKeTiep(
      tx, 'vehicle_experience_version', 'experience_id', experienceId,
    );
    const id = randomUUID();
    const contentHash = contentHashOf(
      JSON.stringify({ schemaVersion: 1, label, config }),
    );
    await tx.query(
      `INSERT INTO vehicle_experience_version
         (id, tenant_id, experience_id, revision_number, schema_version, label,
          config, content_hash, created_by, updated_by)
       VALUES ($1,$2,$3,$4,1,$5,$6::jsonb,$7,$8,$8)`,
      [id, actor.tenantId, experienceId, revisionNumber, label,
        JSON.stringify(config), contentHash, actor.userId],
    );
    return id;
  }

  private validateExperienceConfig(
    schemaVersion: number,
    config: Record<string, unknown>,
  ): void {
    if (schemaVersion !== 1) {
      throw new BusinessError(
        ErrorCode.EXPERIENCE_NOT_PUBLISHABLE,
        `schema_version ${schemaVersion} không được hỗ trợ`,
      );
    }
    const kind = config['kind'];
    if (kind !== 'EXTERIOR_SPIN' && kind !== 'INTERIOR_PANORAMA') {
      throw new BusinessError(ErrorCode.EXPERIENCE_NOT_PUBLISHABLE, 'kind không hợp lệ');
    }
  }

  private async uniqueVariantKey(
    tx: PoolClient,
    productId: string,
    baseKey: string,
  ): Promise<string> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_variant
        WHERE product_id = $1 AND stable_key LIKE $2`,
      [productId, `${baseKey}%`],
    );
    const n = Number(rows[0]?.n ?? 0);
    return n === 0 ? baseKey : `${baseKey}-${n + 1}`;
  }

  private async uniqueExperienceKey(
    tx: PoolClient,
    productId: string,
    baseKey: string,
  ): Promise<string> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_experience
        WHERE product_id = $1 AND stable_key LIKE $2`,
      [productId, `${baseKey}%`],
    );
    const n = Number(rows[0]?.n ?? 0);
    return n === 0 ? baseKey : `${baseKey}-${n + 1}`;
  }

  private async ensureBranchProfileDraft(
    tx: PoolClient,
    actor: ActorContext,
    branchId: string,
  ): Promise<string> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT id FROM branch_public_profile
        WHERE branch_id = $1 AND status = 'DRAFT'`,
      [branchId],
    );
    if (rows[0] !== undefined) return rows[0].id as string;

    // Tạo draft đầu tiên từ dữ liệu branch vận hành (không tự đồng bộ âm thầm sau này)
    const { rows: branchRows } = await tx.query<Record<string, unknown>>(
      'SELECT id, code, name, phone, address FROM branch WHERE id = $1',
      [branchId],
    );
    const b = branchRows[0];
    if (b === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy chi nhánh');

    const id = randomUUID();
    const stableKey = normalizeSlug(`${b.code as string}`) ?? `branch-${id.slice(0, 8)}`;
    /*
     * 🔒 `version_number` phải tiếp nối bản đã có, không dùng DEFAULT 1.
     *
     * `UNIQUE (tenant_id, branch_id, version_number)` nghĩa là mỗi chi nhánh
     * chỉ có một bản mang mỗi số hiệu. Chi nhánh nào đã publish một lần thì đã
     * có bản số 1 — và đó là trạng thái BÌNH THƯỜNG, không phải hiếm gặp. Để
     * DEFAULT chạy sẽ nổ `duplicate key` ngay lần soạn nội dung thứ hai.
     */
    await tx.query(
      `INSERT INTO branch_public_profile
         (id, tenant_id, branch_id, version_number, stable_key, public_name, public_phone,
          public_address, created_by, updated_by)
       SELECT $1, $2, $3,
              COALESCE(MAX(version_number), 0) + 1,
              $4, $5, $6, $7, $8, $8
         FROM branch_public_profile
        WHERE tenant_id = $2 AND branch_id = $3`,
      [id, actor.tenantId, branchId, stableKey, b.name as string,
        (b.phone ?? null) as string | null, (b.address ?? null) as string | null, actor.userId],
    );
    return id;
  }

  private async seoChecksSiteProfile(tx: PoolClient, draftId: string): Promise<SeoCheck[]> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT brand_name, default_title_suffix, default_description, status
         FROM site_profile WHERE id = $1`,
      [draftId],
    );
    const p = rows[0];
    const checks: SeoCheck[] = [];
    if (p === undefined || p.status !== 'DRAFT') {
      checks.push({ requirementId: 'SEO-META-002', severity: 'BLOCKING',
        code: 'MISSING_DRAFT', message: 'Không tìm thấy bản nháp site profile' });
      return checks;
    }
    const description = (p.default_description ?? '') as string;
    if (description.length < 50 || description.length > 300) {
      checks.push({ requirementId: 'SEO-META-001', severity: 'BLOCKING',
        code: 'DESCRIPTION_LENGTH', message: 'Mô tả mặc định phải 50–300 ký tự',
        fieldPath: 'defaultDescription' });
    }
    if (String(p.brand_name ?? '').trim() === '') {
      checks.push({ requirementId: 'SEO-META-002', severity: 'BLOCKING',
        code: 'MISSING_BRAND', message: 'Thiếu tên thương hiệu', fieldPath: 'brandName' });
    }
    if (checks.length === 0) {
      checks.push({ requirementId: 'SEO-META-002', severity: 'INFO',
        code: 'OK', message: 'Site profile đạt điều kiện publish' });
    }
    return checks;
  }

  private async seoChecksProductDraft(tx: PoolClient, draftId: string): Promise<SeoCheck[]> {
    const checks: SeoCheck[] = [];
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT seo_title, seo_description, summary, description
         FROM vehicle_product_revision WHERE id = $1`,
      [draftId],
    );
    const r = rows[0];
    if (r === undefined) {
      checks.push({ requirementId: 'SEO-META-001', severity: 'BLOCKING',
        code: 'MISSING_DRAFT', message: 'Không tìm thấy bản nháp' });
      return checks;
    }
    if ((r.seo_title ?? null) === null) {
      checks.push({ requirementId: 'SEO-META-002', severity: 'INFO',
        code: 'AUTO_SEO_TITLE', message: 'Chưa đặt SEO title — dùng Auto SEO' });
    }
    if ((r.seo_description ?? null) === null) {
      checks.push({ requirementId: 'SEO-META-002', severity: 'INFO',
        code: 'AUTO_SEO_DESCRIPTION', message: 'Chưa đặt SEO description — dùng Auto SEO' });
    }
    const { rows: varRows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_variant_revision
        WHERE product_revision_id = $1 AND inclusion_status = 'ACTIVE'`,
      [draftId],
    );
    if (Number(varRows[0]?.n ?? 0) === 0) {
      checks.push({ requirementId: 'FR-CAT-001', severity: 'BLOCKING',
        code: 'NO_ACTIVE_VARIANT', message: 'Cần ít nhất một phiên bản xe' });
    }
    const { rows: coverRows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vehicle_product_media
        WHERE product_revision_id = $1 AND is_cover`,
      [draftId],
    );
    if (Number(coverRows[0]?.n ?? 0) === 0) {
      checks.push({ requirementId: 'FR-CAT-005', severity: 'BLOCKING',
        code: 'NO_COVER', message: 'Cần ảnh cover' });
    }
    if (checks.filter((c) => c.severity === 'BLOCKING').length === 0) {
      checks.push({ requirementId: 'SEO-META-001', severity: 'INFO',
        code: 'OK', message: 'Sản phẩm đạt điều kiện publish' });
    }
    return checks;
  }

  private revisionView(r: Record<string, unknown>): Record<string, unknown> {
    return {
      id: r.id,
      revisionNumber: Number(r.revision_number),
      status: r.status,
      schemaVersion: Number(r.schema_version),
      name: r.name,
      makeName: r.make_name,
      modelName: r.model_name,
      summary: r.summary,
      description: r.description,
      descriptionDocument: r.description_document,
      seoTitle: r.seo_title ?? null,
      seoDescription: r.seo_description ?? null,
      contentHash: r.content_hash,
      version: Number(r.version),
      publishedAt: r.published_at ?? null,
    };
  }

  private async variantsForRevision(
    tx: PoolClient,
    revisionId: string | null,
  ): Promise<Record<string, unknown>[]> {
    if (revisionId === null) return [];
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT vvr.id, vv.id AS variant_identity_id, vv.stable_key, vvr.name, vvr.sku,
              vvr.powertrain, vvr.model_year, vvr.display_price_amount,
              vvr.specifications, vvr.inclusion_status, vvr.is_featured, vvr.sort_order
         FROM vehicle_variant_revision vvr
         JOIN vehicle_variant vv ON vv.id = vvr.variant_id
        WHERE vvr.product_revision_id = $1
        ORDER BY vvr.sort_order, vvr.name`,
      [revisionId],
    );
    return rows.map((v) => ({
      id: v.id,
      variantIdentityId: v.variant_identity_id,
      stableKey: v.stable_key,
      name: v.name,
      sku: v.sku ?? null,
      powertrain: v.powertrain,
      modelYear: Number(v.model_year),
      displayPrice: v.display_price_amount === null ? null : Number(v.display_price_amount),
      specifications: v.specifications ?? {},
      inclusionStatus: v.inclusion_status,
      isFeatured: v.is_featured,
      sortOrder: Number(v.sort_order),
    }));
  }

  private toAdminProductRow(row: Record<string, unknown>): AdminProductRow {
    return {
      id: row.id as string,
      slug: row.slug as string,
      lifecycleStatus: row.lifecycle_status as string,
      draftRevisionId: (row.draft_revision_id ?? null) as string | null,
      publishedRevisionId: (row.published_revision_id ?? null) as string | null,
      name: (row.name ?? null) as string | null,
      revisionNumber: row.revision_number === null ? null : Number(row.revision_number),
      status: (row.status ?? null) as string | null,
      coverUrl:
        row.cover_key === null || row.cover_key === undefined
          ? null
          : urlMediaCongKhai(row.cover_key as string),
      /*
       * 🔒 Giá giữ nguyên CHUỖI. `min(bigint)` về đây là chuỗi, và `Number()`
       *    một số tiền hàng tỉ đồng là bước đầu tiên của mọi lỗi làm tròn
       *    (CLAUDE.md nguyên tắc 3). Bề mặt nào cần định dạng thì định dạng từ
       *    chuỗi.
       */
      priceFrom: row.gia_thap_nhat === null || row.gia_thap_nhat === undefined
        ? null
        : String(row.gia_thap_nhat),
      variantCount: row.so_phien_ban === null || row.so_phien_ban === undefined
        ? 0
        : Number(row.so_phien_ban),
      version: Number(row.version),
      createdAt: row.created_at as Date,
    };
  }

  private async audit(
    tx: PoolClient,
    actor: ActorContext,
    action: string,
    entityType: string,
    entityId: string,
    reason?: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor.tenantId, actor.userId, action, entityType, entityId, reason ?? null],
    );
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}
