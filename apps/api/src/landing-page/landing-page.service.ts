import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode, LandingPageDocument, type ActorContext, type LandingPageDraftInput,
  type LandingPageView, type LandingPageRevisionView,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { contentHashOf } from '../common/content-hash';

const AUDIT = {
  CREATED: 'MARKETING_LANDING_PAGE_CREATED', DRAFT_UPDATED: 'MARKETING_LANDING_PAGE_DRAFT_UPDATED',
  PUBLISHED: 'MARKETING_LANDING_PAGE_PUBLISHED', ROLLED_BACK: 'MARKETING_LANDING_PAGE_ROLLED_BACK',
  PREVIEW_CREATED: 'MARKETING_LANDING_PAGE_PREVIEW_CREATED',
} as const;

type RevisionRow = Record<string, unknown>;

@Injectable()
export class LandingPageService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async list(actor: ActorContext): Promise<LandingPageView[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM landing_page ORDER BY slug');
      return Promise.all(rows.map((row) => this.getInTx(tx, row.id)));
    });
  }

  async createHome(actor: ActorContext): Promise<{ id: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const existing = await tx.query<{ id: string }>("SELECT id FROM landing_page WHERE slug = '/' LIMIT 1");
      if (existing.rows[0] !== undefined) return { id: existing.rows[0].id };
      const pageId = randomUUID();
      const revisionId = randomUUID();
      const document = this.defaultDocument();
      await tx.query('INSERT INTO landing_page (id, tenant_id, slug, created_by, updated_by) VALUES ($1,$2,$3,$4,$4)', [pageId, actor.tenantId, '/', actor.userId]);
      await this.insertDraft(tx, actor, pageId, revisionId, 1, document);
      await tx.query('SELECT marketing_set_landing_page_draft($1,$2,$3)', [actor.tenantId, pageId, revisionId]);
      await this.audit(tx, actor, AUDIT.CREATED, pageId);
      return { id: pageId };
    });
  }

  async get(actor: ActorContext, id: string): Promise<LandingPageView> {
    return this.db.withTenant(actor, (tx) => this.getInTx(tx, id));
  }

  async patchDraft(actor: ActorContext, id: string, input: LandingPageDraftInput): Promise<{ version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const page = await this.lockPage(tx, id);
      if (page.draft === null) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Không có bản nháp để sửa');
      await this.assertMediaReferences(tx, input.document);
      const result = await tx.query<{ version: string }>(
        `UPDATE landing_page_revision SET document = $1::jsonb, content_hash = $2, updated_by = $3
          WHERE id = $4 AND status = 'DRAFT' AND version = $5 RETURNING version`,
        [JSON.stringify(input.document), contentHashOf(JSON.stringify(input.document)), actor.userId, page.draft, input.version],
      );
      if (result.rows[0] === undefined) throw new BusinessError(ErrorCode.STALE_VERSION, 'Bản nháp đã thay đổi, hãy tải lại');
      await this.audit(tx, actor, AUDIT.DRAFT_UPDATED, id);
      return { version: Number(result.rows[0].version) };
    });
  }

  async cloneDraft(actor: ActorContext, id: string): Promise<{ draftId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ draft_revision_id: string | null; published_revision_id: string | null }>(
        'SELECT draft_revision_id, published_revision_id FROM landing_page WHERE id = $1 FOR UPDATE', [id],
      );
      const page = rows[0];
      if (page === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy landing page');
      if (page.draft_revision_id !== null) return { draftId: page.draft_revision_id };
      if (page.published_revision_id === null) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Chưa có bản đã publish để tạo nháp');
      const old = await tx.query<{ document: unknown; revision_number: number }>('SELECT document, revision_number FROM landing_page_revision WHERE id = $1', [page.published_revision_id]);
      const revisionId = randomUUID();
      const document = LandingPageDocument.parse(old.rows[0]!.document);
      await this.insertDraft(tx, actor, id, revisionId, Number(old.rows[0]!.revision_number) + 1, document);
      await tx.query('SELECT marketing_set_landing_page_draft($1,$2,$3)', [actor.tenantId, id, revisionId]);
      return { draftId: revisionId };
    });
  }

  async publish(actor: ActorContext, id: string, version: number): Promise<{ revisionId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const page = await this.lockPage(tx, id, version);
      if (page.draft === null) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Không có bản nháp để publish');
      const revision = await tx.query<{ document: unknown }>('SELECT document FROM landing_page_revision WHERE id = $1', [page.draft]);
      const document = LandingPageDocument.parse(revision.rows[0]?.document);
      await this.assertMediaReferences(tx, document);
      const promoted = await tx.query<{ id: string }>('SELECT marketing_promote_landing_page_draft($1,$2,$3) AS id', [actor.tenantId, id, actor.userId]);
      await this.audit(tx, actor, AUDIT.PUBLISHED, id);
      return { revisionId: promoted.rows[0]!.id };
    });
  }

  async rollback(actor: ActorContext, id: string): Promise<{ revisionId: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ draft_revision_id: string | null }>('SELECT draft_revision_id FROM landing_page WHERE id = $1 FOR UPDATE', [id]);
      if (rows[0] === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy landing page');
      if (rows[0].draft_revision_id !== null) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Đang có bản nháp chưa publish');
      const old = await tx.query<{ document: unknown; revision_number: string }>(
        "SELECT document, revision_number FROM landing_page_revision WHERE page_id = $1 AND status = 'SUPERSEDED' ORDER BY revision_number DESC LIMIT 1", [id],
      );
      if (old.rows[0] === undefined) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Không có phiên bản cũ để khôi phục');
      const draftId = randomUUID();
      const nextNumber = await tx.query<{ next: string }>('SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM landing_page_revision WHERE page_id = $1', [id]);
      await this.insertDraft(tx, actor, id, draftId, Number(nextNumber.rows[0]!.next), LandingPageDocument.parse(old.rows[0].document));
      await tx.query('SELECT marketing_set_landing_page_draft($1,$2,$3)', [actor.tenantId, id, draftId]);
      const { rows: versionRows } = await tx.query<{ version: string }>('SELECT version FROM landing_page WHERE id = $1', [id]);
      const result = await this.publishInTx(tx, actor, id, Number(versionRows[0]!.version));
      await this.audit(tx, actor, AUDIT.ROLLED_BACK, id);
      return result;
    });
  }

  async revisions(actor: ActorContext, id: string): Promise<LandingPageRevisionView[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<RevisionRow>('SELECT * FROM landing_page_revision WHERE page_id = $1 ORDER BY revision_number DESC', [id]);
      return rows.map((row) => this.revisionView(row));
    });
  }

  async createPreview(actor: ActorContext, id: string): Promise<{ token: string; expiresAt: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const page = await this.getInTx(tx, id);
      const revision = page.draft ?? page.published;
      if (revision === null) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Chưa có nội dung để preview');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await tx.query(
        'INSERT INTO landing_preview_session (tenant_id,page_id,revision_id,token_hash,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [actor.tenantId, id, revision.id, this.tokenHash(token), expiresAt, actor.userId],
      );
      await this.audit(tx, actor, AUDIT.PREVIEW_CREATED, id);
      return { token, expiresAt: expiresAt.toISOString() };
    });
  }

  async publicPublished(tenantId: string): Promise<LandingPageDocument | null> {
    return this.db.withTenantId(tenantId, null, async (tx) => {
      const { rows } = await tx.query<{ document: unknown }>(
        "SELECT r.document FROM landing_page p JOIN landing_page_revision r ON r.id = p.published_revision_id WHERE p.slug = '/'", [],
      );
      return rows[0] === undefined ? null : LandingPageDocument.parse(rows[0].document);
    });
  }

  async publicPreview(token: string): Promise<LandingPageDocument> {
    const rows = await this.db.queryWithoutTenant<{ tenant_id: string; revision_id: string }>('SELECT * FROM resolve_landing_preview_session($1)', [this.tokenHash(token)]);
    const resolved = rows[0];
    if (resolved === undefined) throw new BusinessError(ErrorCode.PREVIEW_NOT_FOUND, 'Preview không tồn tại hoặc đã hết hạn');
    return this.db.withTenantId(resolved.tenant_id, null, async (tx) => {
      const { rows: revision } = await tx.query<{ document: unknown }>('SELECT document FROM landing_page_revision WHERE id = $1', [resolved.revision_id]);
      if (revision[0] === undefined) throw new BusinessError(ErrorCode.PREVIEW_NOT_FOUND, 'Preview không tồn tại');
      return LandingPageDocument.parse(revision[0].document);
    });
  }

  private async publishInTx(tx: PoolClient, actor: ActorContext, id: string, version: number): Promise<{ revisionId: string }> {
    const page = await this.lockPage(tx, id, version);
    if (page.draft === null) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Không có bản nháp để publish');
    const promoted = await tx.query<{ id: string }>('SELECT marketing_promote_landing_page_draft($1,$2,$3) AS id', [actor.tenantId, id, actor.userId]);
    return { revisionId: promoted.rows[0]!.id };
  }

  private async getInTx(tx: PoolClient, id: string): Promise<LandingPageView> {
    const pageRows = await tx.query<{ id: string; slug: string; version: string; draft_revision_id: string | null; published_revision_id: string | null }>(
      'SELECT id,slug,version,draft_revision_id,published_revision_id FROM landing_page WHERE id = $1', [id],
    );
    const page = pageRows.rows[0];
    if (page === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy landing page');
    const revisions = await tx.query<RevisionRow>('SELECT * FROM landing_page_revision WHERE id = ANY($1::uuid[])', [[page.draft_revision_id, page.published_revision_id].filter(Boolean)]);
    const find = (revisionId: string | null): LandingPageRevisionView | null => {
      const row = revisions.rows.find((revision) => revision.id === revisionId);
      return row === undefined ? null : this.revisionView(row);
    };
    return { id: page.id, slug: page.slug, version: Number(page.version), draft: find(page.draft_revision_id), published: find(page.published_revision_id) };
  }

  private revisionView(row: RevisionRow): LandingPageRevisionView {
    return {
      id: row.id as string, revisionNumber: Number(row.revision_number), status: row.status as LandingPageRevisionView['status'],
      document: LandingPageDocument.parse(row.document), version: Number(row.version),
      createdAt: (row.created_at as Date).toISOString(), publishedAt: row.published_at === null ? null : (row.published_at as Date).toISOString(),
    };
  }

  private async lockPage(tx: PoolClient, id: string, expectedVersion?: number): Promise<{ draft: string | null }> {
    const { rows } = await tx.query<{ draft_revision_id: string | null; version: string }>('SELECT draft_revision_id,version FROM landing_page WHERE id = $1 FOR UPDATE', [id]);
    if (rows[0] === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy landing page');
    if (expectedVersion !== undefined && Number(rows[0].version) !== expectedVersion) throw new BusinessError(ErrorCode.STALE_VERSION, 'Landing page đã thay đổi, hãy tải lại');
    return { draft: rows[0].draft_revision_id };
  }

  private async insertDraft(tx: PoolClient, actor: ActorContext, pageId: string, revisionId: string, revisionNumber: number, document: LandingPageDocument): Promise<void> {
    await tx.query(
      `INSERT INTO landing_page_revision (id,tenant_id,page_id,revision_number,document,content_hash,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$7)`,
      [revisionId, actor.tenantId, pageId, revisionNumber, JSON.stringify(document), contentHashOf(JSON.stringify(document)), actor.userId],
    );
  }

  private async assertMediaReferences(tx: PoolClient, document: LandingPageDocument): Promise<void> {
    const ids = document.sections.flatMap((section) => ('mediaId' in section.content && section.content.mediaId !== null ? [section.content.mediaId] : []));
    if (ids.length > 0) {
      const { rows } = await tx.query<{ id: string }>("SELECT id FROM media_asset WHERE id = ANY($1::uuid[]) AND status = 'READY'", [ids]);
      if (rows.length !== new Set(ids).size) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Có media chưa sẵn sàng hoặc không thuộc tenant');
    }
    const products = document.sections.filter((section): section is Extract<typeof section, { type: 'vehicleShowcase' }> => section.type === 'vehicleShowcase').flatMap((section) => section.content.productIds);
    if (products.length > 0) {
      const productRows = await tx.query<{ id: string }>("SELECT id FROM vehicle_product WHERE id = ANY($1::uuid[]) AND lifecycle_status = 'ACTIVE' AND published_revision_id IS NOT NULL", [products]);
      if (productRows.rows.length !== new Set(products).size) throw new BusinessError(ErrorCode.LANDING_PAGE_NOT_PUBLISHABLE, 'Có xe chưa được publish hoặc không thuộc tenant');
    }
  }

  private async audit(tx: PoolClient, actor: ActorContext, action: string, entityId: string): Promise<void> {
    await tx.query('INSERT INTO audit_log (tenant_id,actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4,$5)', [actor.tenantId, actor.userId, action, 'landing_page', entityId]);
  }
  private tokenHash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
  private defaultDocument(): LandingPageDocument {
    return LandingPageDocument.parse({ schemaVersion: 1, sections: [
      { id: randomUUID(), schemaVersion: 1, type: 'hero', enabled: true, content: { title: 'Một hành trình sở hữu, liên tục.' } },
      { id: randomUUID(), schemaVersion: 1, type: 'vehicleShowcase', enabled: true, content: { title: 'Những mẫu xe được chọn', productIds: [] } },
      { id: randomUUID(), schemaVersion: 1, type: 'journey', enabled: true, content: { title: 'Hành trình sở hữu liên tục' } },
      { id: randomUUID(), schemaVersion: 1, type: 'trust', enabled: true, content: { title: 'Minh bạch trong từng chặng đường' } },
      { id: randomUUID(), schemaVersion: 1, type: 'cta', enabled: true, content: { title: 'Bắt đầu hành trình của bạn', cta: { label: 'Đăng ký lái thử', href: '/lien-he' } } },
    ] });
  }
}
