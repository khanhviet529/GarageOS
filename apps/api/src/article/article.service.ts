import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  RichTextDocumentV1,
  canonicalizeRichTextDocument,
  richTextFromPlainText,
  type ActorContext,
  type ArticleCreateInput,
  type ArticleDraftInput,
  type ArticleDraftView,
  type ArticleRow,
  type PublicArticleDetail,
  type PublicArticleSummary,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { contentHashOf } from '../common/content-hash';
import { urlMediaCongKhai } from '../common/media-url';

/**
 * Bài viết trên landing — SRS-LS-EXP-001 §4.10.
 *
 * 🔒 Dùng LẠI vòng nháp/duyệt của trình soạn trang, không dựng bản thứ hai:
 *    một bảng bài + một bảng bản sửa, con trỏ `draft`/`published`, và việc đổi
 *    trạng thái nằm trong MỘT hàm SQL (`marketing_promote_article_draft`) chứ
 *    không rải ra ba câu UPDATE. Hai vòng xuất bản khác nhau trong cùng một hệ
 *    là hai bộ luật, và sớm muộn một bộ sẽ thiếu một bước.
 *
 * 🔒 Nội dung là `RichTextDocumentV1` — cùng định dạng với mô tả xe (0068), nên
 *    `INV-LS-10` (cấm HTML/CSS/JS tự do) áp nguyên vẹn. Zod từ chối mọi khối
 *    ngoài danh sách trước khi jsonb chạm database.
 */

const AUDIT = {
  CREATED: 'ARTICLE_CREATED',
  DRAFT_UPDATED: 'ARTICLE_DRAFT_UPDATED',
  PUBLISHED: 'ARTICLE_PUBLISHED',
  FEATURED: 'ARTICLE_FEATURED',
} as const;

@Injectable()
export class ArticleService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /* ============================== Quản trị ============================== */

  async list(actor: ActorContext): Promise<ArticleRow[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT a.id, a.slug, a.featured, a.version,
                a.category_id, c.name AS category_name,
                a.draft_revision_id IS NOT NULL AS has_draft,
                a.published_revision_id IS NOT NULL AS published,
                to_char(a.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS published_at,
                -- Tiêu đề lấy từ bản ĐANG SỬA nếu có, không thì bản đang hiện.
                COALESCE(dr.title, pr.title) AS title,
                cover.public_storage_key AS cover_key,
                COALESCE((SELECT array_agg(t.tag ORDER BY t.tag)
                            FROM article_tag t WHERE t.article_id = a.id), '{}') AS tags
           FROM article a
           LEFT JOIN article_category c ON c.id = a.category_id
           LEFT JOIN article_revision dr ON dr.id = a.draft_revision_id
           LEFT JOIN article_revision pr ON pr.id = a.published_revision_id
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key
               FROM media_rendition rn
               JOIN media_publication mp ON mp.rendition_id = rn.id AND mp.status = 'READY'
              WHERE rn.asset_id = a.cover_media_id
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) cover ON true
          ORDER BY a.featured DESC, a.published_at DESC NULLS FIRST, a.created_at DESC`,
      );
      return rows.map((r) => ({
        id: r.id as string,
        slug: r.slug as string,
        title: (r.title ?? '') as string,
        categoryId: (r.category_id ?? null) as string | null,
        categoryName: (r.category_name ?? null) as string | null,
        coverUrl: r.cover_key === null || r.cover_key === undefined
          ? null
          : urlMediaCongKhai(r.cover_key as string),
        featured: r.featured as boolean,
        hasDraft: r.has_draft as boolean,
        published: r.published as boolean,
        publishedAt: (r.published_at ?? null) as string | null,
        tags: r.tags as string[],
        version: Number(r.version),
      }));
    });
  }

  /**
   * Tạo bài mới — bài mới LUÔN bắt đầu bằng một bản nháp rỗng.
   *
   * Không có trạng thái "bài chưa có nội dung nào": một bài không có bản nào là
   * một dòng không sửa được và không publish được, và người dùng sẽ không hiểu
   * vì sao nút Sửa không làm gì.
   */
  async create(actor: ActorContext, input: ArticleCreateInput): Promise<{ id: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const articleId = randomUUID();
      const revisionId = randomUUID();
      await tx.query(
        `INSERT INTO article (id, tenant_id, slug, category_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)`,
        [articleId, actor.tenantId, input.slug, input.categoryId ?? null, actor.userId],
      );
      await this.chenNhap(tx, actor, articleId, revisionId, 1, {
        title: input.title,
        excerpt: null,
        bodyDocument: richTextFromPlainText(''),
        seoTitle: null,
        seoDescription: null,
        categoryId: input.categoryId ?? null,
        coverMediaId: null,
        tags: [],
      });
      await tx.query('SELECT marketing_set_article_draft($1,$2,$3)', [actor.tenantId, articleId, revisionId]);
      await this.ghiVet(tx, actor, AUDIT.CREATED, articleId);
      return { id: articleId };
    });
  }

  /**
   * Bản nháp hiện tại. Chưa có nháp thì CHÉP từ bản đang hiện — đó là ý nghĩa
   * của "sửa một bài đã đăng": bắt đầu từ nội dung khách đang đọc.
   */
  async draft(actor: ActorContext, id: string): Promise<ArticleDraftView> {
    return this.db.withTenant(actor, async (tx) => {
      const bai = await this.khoaBai(tx, id);
      let revisionId = bai.draft;
      if (revisionId === null) {
        if (bai.published === null) {
          throw new BusinessError(ErrorCode.NOT_FOUND, 'Bài viết không có bản nào — dữ liệu hỏng.');
        }
        revisionId = await this.chepTuBanDaDang(tx, actor, id, bai.published);
      }
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT r.id, r.revision_number, r.title, r.excerpt, r.body_document,
                r.seo_title, r.seo_description, r.version,
                a.slug, a.category_id, a.cover_media_id,
                COALESCE((SELECT array_agg(t.tag ORDER BY t.tag)
                            FROM article_tag t WHERE t.article_id = a.id), '{}') AS tags
           FROM article_revision r JOIN article a ON a.id = r.article_id
          WHERE r.id = $1`,
        [revisionId],
      );
      const r = rows[0];
      if (r === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản nháp.');
      return {
        articleId: id,
        slug: r.slug as string,
        revisionId: r.id as string,
        revisionNumber: Number(r.revision_number),
        version: Number(r.version),
        title: r.title as string,
        excerpt: (r.excerpt ?? null) as string | null,
        bodyDocument: RichTextDocumentV1.parse(r.body_document),
        seoTitle: (r.seo_title ?? null) as string | null,
        seoDescription: (r.seo_description ?? null) as string | null,
        categoryId: (r.category_id ?? null) as string | null,
        coverMediaId: (r.cover_media_id ?? null) as string | null,
        tags: r.tags as string[],
      };
    });
  }

  async patchDraft(
    actor: ActorContext,
    id: string,
    input: ArticleDraftInput,
    version: number,
  ): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const bai = await this.khoaBai(tx, id);
      const draftId = bai.draft ?? (bai.published === null
        ? null
        : await this.chepTuBanDaDang(tx, actor, id, bai.published));
      if (draftId === null) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không có bản nháp để sửa.');

      const canonical = canonicalizeRichTextDocument(input.bodyDocument);
      const { rows } = await tx.query<{ version: string }>(
        `UPDATE article_revision
            SET title=$2, excerpt=$3, body_document=$4::jsonb, seo_title=$5, seo_description=$6,
                content_hash=$7, updated_by=$8
          WHERE id=$1 AND status='DRAFT' AND version=$9 RETURNING version`,
        [draftId, input.title, input.excerpt ?? null, canonical, input.seoTitle ?? null,
          input.seoDescription ?? null, contentHashOf(canonical), actor.userId, version],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.STALE_VERSION, 'Bản nháp đã thay đổi, hãy tải lại.');
      }

      /*
       * Chuyên mục, ảnh bìa và thẻ nằm trên BÀI chứ không trên bản sửa — chúng
       * là siêu dữ liệu phân loại, không phải nội dung. Đổi chuyên mục của một
       * bài đã đăng có hiệu lực ngay và không cần duyệt lại: nó không đổi một
       * chữ nào khách đọc.
       */
      await tx.query(
        'UPDATE article SET category_id=$2, cover_media_id=$3, updated_by=$4 WHERE id=$1',
        [id, input.categoryId ?? null, input.coverMediaId ?? null, actor.userId],
      );
      await this.datThe(tx, actor, id, input.tags);
      await this.ghiVet(tx, actor, AUDIT.DRAFT_UPDATED, id);
      return { version: Number(rows[0].version) };
    });
  }

  async publish(actor: ActorContext, id: string): Promise<{ revisionId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const bai = await this.khoaBai(tx, id);
      if (bai.draft === null) {
        throw new BusinessError(ErrorCode.INVALID_STATE_TRANSITION, 'Không có bản nháp để công bố.');
      }
      const { rows } = await tx.query<{ id: string }>(
        'SELECT marketing_promote_article_draft($1,$2,$3) AS id',
        [actor.tenantId, id, actor.userId],
      );
      await this.ghiVet(tx, actor, AUDIT.PUBLISHED, id);
      return { revisionId: rows[0]!.id };
    });
  }

  /**
   * Đặt bài nổi bật.
   *
   * 🔒 Gỡ bài cũ TRƯỚC, trong cùng transaction. Partial unique index (0077) cho
   *    đúng một dòng `featured` mỗi tenant, nên nếu chỉ bật bài mới thì câu lệnh
   *    lỗi với một thông điệp của Postgres mà không ai đọc được. Gỡ trước là để
   *    thao tác "đổi bài nổi bật" làm được đúng một lần bấm.
   */
  async setFeatured(actor: ActorContext, id: string, featured: boolean): Promise<{ featured: boolean }> {
    return this.db.withTenant(actor, async (tx) => {
      if (featured) {
        await tx.query('UPDATE article SET featured = false, updated_by = $1 WHERE featured', [actor.userId]);
      }
      const { rowCount } = await tx.query(
        'UPDATE article SET featured = $2, updated_by = $3 WHERE id = $1',
        [id, featured, actor.userId],
      );
      if (rowCount === 0) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bài viết.');
      await this.ghiVet(tx, actor, AUDIT.FEATURED, id);
      return { featured };
    });
  }

  /* ============================== Công khai ============================== */

  /**
   * 🔒 Chỉ bài ĐÃ CÓ bản publish, và nội dung lấy từ `published_revision_id` —
   *    không bao giờ từ `draft_revision_id`. Đây là chỗ một bản nháp lọt ra
   *    công khai nếu ai đó viết nhầm một chữ.
   */
  async publicList(tenantId: string, limit: number): Promise<PublicArticleSummary[]> {
    return this.db.withTenantId(tenantId, null, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT a.slug, a.featured, r.title, r.excerpt, c.name AS category_name,
                to_char(a.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS published_at,
                cover.public_storage_key AS cover_key
           FROM article a
           JOIN article_revision r ON r.id = a.published_revision_id
           LEFT JOIN article_category c ON c.id = a.category_id
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key
               FROM media_rendition rn
               JOIN media_publication mp ON mp.rendition_id = rn.id AND mp.status = 'READY'
              WHERE rn.asset_id = a.cover_media_id
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) cover ON true
          ORDER BY a.featured DESC, a.published_at DESC
          LIMIT $1`,
        [Math.min(Math.max(limit, 1), 50)],
      );
      return rows.map((r) => this.tomTat(r));
    });
  }

  async publicDetail(tenantId: string, slug: string): Promise<PublicArticleDetail> {
    return this.db.withTenantId(tenantId, null, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT a.slug, a.featured, r.title, r.excerpt, r.body_document,
                r.seo_title, r.seo_description, c.name AS category_name,
                to_char(a.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS published_at,
                cover.public_storage_key AS cover_key,
                COALESCE((SELECT array_agg(t.tag ORDER BY t.tag)
                            FROM article_tag t WHERE t.article_id = a.id), '{}') AS tags
           FROM article a
           JOIN article_revision r ON r.id = a.published_revision_id
           LEFT JOIN article_category c ON c.id = a.category_id
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key
               FROM media_rendition rn
               JOIN media_publication mp ON mp.rendition_id = rn.id AND mp.status = 'READY'
              WHERE rn.asset_id = a.cover_media_id
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) cover ON true
          WHERE a.slug = $1`,
        [slug],
      );
      const r = rows[0];
      if (r === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bài viết');
      return {
        ...this.tomTat(r),
        bodyDocument: RichTextDocumentV1.parse(r.body_document),
        seoTitle: (r.seo_title ?? null) as string | null,
        seoDescription: (r.seo_description ?? null) as string | null,
        tags: r.tags as string[],
      };
    });
  }

  /* =============================== Riêng tư ============================== */

  private tomTat(r: Record<string, unknown>): PublicArticleSummary {
    return {
      slug: r.slug as string,
      title: r.title as string,
      excerpt: (r.excerpt ?? null) as string | null,
      categoryName: (r.category_name ?? null) as string | null,
      coverUrl: r.cover_key === null || r.cover_key === undefined
        ? null
        : urlMediaCongKhai(r.cover_key as string),
      publishedAt: (r.published_at ?? null) as string | null,
      featured: r.featured as boolean,
    };
  }

  private async khoaBai(
    tx: PoolClient,
    id: string,
  ): Promise<{ draft: string | null; published: string | null }> {
    const { rows } = await tx.query<{ draft_revision_id: string | null; published_revision_id: string | null }>(
      'SELECT draft_revision_id, published_revision_id FROM article WHERE id = $1 FOR UPDATE',
      [id],
    );
    const r = rows[0];
    if (r === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bài viết.');
    return { draft: r.draft_revision_id, published: r.published_revision_id };
  }

  private async chepTuBanDaDang(
    tx: PoolClient,
    actor: ActorContext,
    articleId: string,
    publishedId: string,
  ): Promise<string> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT title, excerpt, body_document, seo_title, seo_description, revision_number
         FROM article_revision WHERE id = $1`,
      [publishedId],
    );
    const cu = rows[0]!;
    const revisionId = randomUUID();
    await this.chenNhap(tx, actor, articleId, revisionId, Number(cu.revision_number) + 1, {
      title: cu.title as string,
      excerpt: (cu.excerpt ?? null) as string | null,
      bodyDocument: RichTextDocumentV1.parse(cu.body_document),
      seoTitle: (cu.seo_title ?? null) as string | null,
      seoDescription: (cu.seo_description ?? null) as string | null,
      categoryId: null,
      coverMediaId: null,
      tags: [],
    });
    await tx.query('SELECT marketing_set_article_draft($1,$2,$3)', [actor.tenantId, articleId, revisionId]);
    return revisionId;
  }

  private async chenNhap(
    tx: PoolClient,
    actor: ActorContext,
    articleId: string,
    revisionId: string,
    soThuTu: number,
    noiDung: ArticleDraftInput,
  ): Promise<void> {
    const canonical = canonicalizeRichTextDocument(noiDung.bodyDocument);
    await tx.query(
      `INSERT INTO article_revision
         (id, tenant_id, article_id, revision_number, status, title, excerpt, body_document,
          seo_title, seo_description, content_hash, created_by, updated_by)
       VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7::jsonb,$8,$9,$10,$11,$11)`,
      [revisionId, actor.tenantId, articleId, soThuTu, noiDung.title, noiDung.excerpt ?? null,
        canonical, noiDung.seoTitle ?? null, noiDung.seoDescription ?? null,
        contentHashOf(canonical), actor.userId],
    );
  }

  /** Đặt lại toàn bộ thẻ. Không bảng nào trỏ tới `article_tag` nên xoá-chèn an toàn. */
  private async datThe(tx: PoolClient, actor: ActorContext, articleId: string, tags: string[]): Promise<void> {
    await tx.query('DELETE FROM article_tag WHERE article_id = $1 AND tag <> ALL($2::text[])', [articleId, tags]);
    for (const t of tags) {
      await tx.query(
        `INSERT INTO article_tag (tenant_id, article_id, tag) VALUES ($1,$2,$3)
         ON CONFLICT (article_id, tag) DO NOTHING`,
        [actor.tenantId, articleId, t],
      );
    }
  }

  private async ghiVet(
    tx: PoolClient,
    actor: ActorContext,
    action: string,
    articleId: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_json)
       VALUES ($1,$2,$3,'article',$4,'{}'::jsonb)`,
      [actor.tenantId, actor.userId, action, articleId],
    );
  }
}
