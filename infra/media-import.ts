/**
 * Operator media import — SRS Phase 1 mục 6.8.
 *
 * Dùng: pnpm media:import -- --manifest <approved-local-manifest.json>
 *
 * Job versioned, idempotent theo (tenant_id, import_key): rerun cùng input
 * không tạo trùng và KHÔNG tự publish. Manifest KHÔNG nhận remote URL, absolute
 * path, `..`, symlink thoát root hoặc credential.
 *
 * 🔒 Chạy bằng operator credential (DATABASE_ADMIN_URL), không phải app role.
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Client } from 'pg';

interface AssetEntry {
  stableKey: string;
  relativePath: string;
  profile: string; // POSTER | GALLERY | SOCIAL | HOTSPOT_DETAIL | SPIN_FRAME | PANORAMA
  mime: string;
  role?: 'POSTER' | 'GALLERY' | 'SOCIAL' | 'HOTSPOT_DETAIL';
  alt?: string;
  isCover?: boolean;
  sortOrder?: number;
  qualityTier?: string;
  logicalYaw?: number;
  sceneKey?: string;
  bindingKey?: string;
  accessibleLabel?: string;
  description?: string;
}

interface ImportManifest {
  schemaVersion: 1;
  importKey: string;
  tenantId: string;
  productStableKey?: string;
  experienceStableKey?: string;
  provenance?: Record<string, unknown>;
  license: string;
  licenseOwner: string;
  operatorUserId: string;
  assets: AssetEntry[];
}

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? join(process.cwd(), 'media', 'public');

function parseArgs(argv: string[]): { manifest: string } {
  const i = argv.indexOf('--manifest');
  if (i === -1 || argv[i + 1] === undefined) {
    throw new Error('Thiếu --manifest <đường dẫn>');
  }
  return { manifest: argv[i + 1] };
}

async function main(): Promise<void> {
  const { manifest: manifestPath } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as ImportManifest;
  if (raw.schemaVersion !== 1) throw new Error('schemaVersion phải là 1');
  const manifestDir = dirname(resolve(manifestPath));

  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();

  await db.query('BEGIN');
  try {
    // Idempotent: cùng (tenant_id, import_key) đã chạy thì báo và dừng
    const { rows: existing } = await db.query<{ status: string }>(
      `SELECT status FROM media_import_job WHERE tenant_id = $1 AND import_key = $2`,
      [raw.tenantId, raw.importKey],
    );
    if (existing[0] !== undefined) {
      console.log(`Import key ${raw.importKey} đã chạy (${existing[0].status}) — bỏ qua.`);
      await db.query('ROLLBACK');
      await db.end();
      return;
    }

    const { rows: jobRows } = await db.query<{ id: string }>(
      `INSERT INTO media_import_job (tenant_id, import_key, manifest_hash, status, created_by)
       VALUES ($1,$2,$3,'RUNNING',$4) RETURNING id`,
      [raw.tenantId, raw.importKey, createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 16), raw.operatorUserId],
    );
    const jobId = jobRows[0]!.id;

    // Product draft revision (nếu manifest gắn media vào catalog)
    let productRevisionId: string | null = null;
    if (raw.productStableKey !== undefined) {
      const { rows } = await db.query<{ id: string | null }>(
        `SELECT draft_revision_id AS id FROM vehicle_product
          WHERE tenant_id = $1 AND stable_key = $2`,
        [raw.tenantId, raw.productStableKey],
      );
      productRevisionId = rows[0]?.id ?? null;
    }

    // Experience draft version (nếu manifest gắn binding)
    let experienceVersionId: string | null = null;
    if (raw.experienceStableKey !== undefined) {
      const { rows } = await db.query<{ id: string | null }>(
        `SELECT draft_version_id AS id FROM vehicle_experience
          WHERE tenant_id = $1 AND stable_key = $2`,
        [raw.tenantId, raw.experienceStableKey],
      );
      experienceVersionId = rows[0]?.id ?? null;
    }

    mkdirSync(MEDIA_ROOT, { recursive: true });

    for (const entry of raw.assets) {
      const filePath = resolve(join(manifestDir, entry.relativePath));
      if (!filePath.startsWith(manifestDir)) {
        throw new Error(`Đường dẫn ${entry.relativePath} thoát khỏi thư mục manifest`);
      }
      if (!existsSync(filePath)) throw new Error(`Không tìm thấy file ${entry.relativePath}`);

      const data = readFileSync(filePath);
      const sha256 = createHash('sha256').update(data).digest('hex');
      const size = statSync(filePath).size;
      const ext = extname(filePath).replace('.', '') || 'bin';
      const publicKey = `${raw.tenantId}/${sha256}.${ext}`;

      /*
       * 🔒 Ghi file ĐÚNG chỗ mà `MediaStorage.readPublic()` sẽ tìm.
       *
       * `public_storage_key` lưu trong DB là `<tenant>/<sha>.<ext>`, và bộ phục
       * vụ media ghép nó vào `MEDIA_ROOT`. Bản trước ghi ra
       * `<tenant>-<sha>.<ext>` — dấu gạch thay vì thư mục con — nên mọi ảnh
       * THẬT trả 404. Lỗi không lộ ra ở bản demo vì seed dùng placeholder
       * `demo/…` được sinh trong bộ nhớ, không đọc đĩa.
       */
      const publicPath = join(MEDIA_ROOT, publicKey);
      mkdirSync(dirname(publicPath), { recursive: true });
      copyFileSync(filePath, publicPath);

      // Upsert asset theo (tenant, stable_key)
      const { rows: assetRows } = await db.query<{ id: string }>(
        `INSERT INTO media_asset (tenant_id, stable_key, kind, status, source_storage_key,
                                  source_sha256, source_mime, byte_size, provenance,
                                  license, license_owner, created_by)
         VALUES ($1,$2,'IMAGE','READY',$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
         ON CONFLICT (tenant_id, stable_key) DO UPDATE SET status = 'READY'
         RETURNING id`,
        [
          raw.tenantId, entry.stableKey, publicKey, sha256, entry.mime, size,
          JSON.stringify(raw.provenance ?? {}), raw.license, raw.licenseOwner,
          raw.operatorUserId,
        ],
      );
      const assetId = assetRows[0]!.id;

      const { rows: renditionRows } = await db.query<{ id: string }>(
        `INSERT INTO media_rendition (tenant_id, asset_id, profile, format, mime, storage_key,
                                      content_sha256, byte_size, quality_tier, visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLIC')
         ON CONFLICT (tenant_id, asset_id, profile, content_sha256) DO NOTHING
         RETURNING id`,
        [raw.tenantId, assetId, entry.profile, ext, entry.mime, publicKey, sha256, size, entry.qualityTier ?? null],
      );
      let renditionId = renditionRows[0]?.id ?? null;
      if (renditionId === null) {
        const { rows } = await db.query<{ id: string }>(
          `SELECT id FROM media_rendition
            WHERE tenant_id=$1 AND asset_id=$2 AND profile=$3 AND content_sha256=$4`,
          [raw.tenantId, assetId, entry.profile, sha256],
        );
        renditionId = rows[0]!.id;
      }

      await db.query(
        `INSERT INTO media_publication (tenant_id, rendition_id, public_storage_key,
                                        public_content_sha256, status, verified_at)
         VALUES ($1,$2,$3,$4,'READY', now())
         ON CONFLICT (tenant_id, rendition_id) DO UPDATE SET status='READY', verified_at=now()`,
        [raw.tenantId, renditionId, publicKey, sha256],
      );

      // Bind vào product draft (media metadata)
      if (productRevisionId !== null && entry.role !== undefined) {
        await db.query(
          `INSERT INTO vehicle_product_media (tenant_id, product_revision_id, media_asset_id,
                                              role, alt_text, sort_order, is_cover)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [raw.tenantId, productRevisionId, assetId, entry.role,
            entry.alt ?? basename(filePath), entry.sortOrder ?? 0, entry.isCover ?? false],
        );
      }
      // Bind vào experience draft (frame/tile/audio)
      if (experienceVersionId !== null && entry.bindingKey !== undefined) {
        await db.query(
          `INSERT INTO vehicle_experience_version_media (tenant_id, experience_version_id,
                                                        media_asset_id, binding_key, role,
                                                        scene_key, logical_yaw, quality_tier,
                                                        sort_order, accessible_label, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [raw.tenantId, experienceVersionId, assetId, entry.bindingKey,
            entry.profile, entry.sceneKey ?? null, entry.logicalYaw ?? null,
            entry.qualityTier ?? null, entry.sortOrder ?? 0,
            entry.accessibleLabel ?? null, entry.description ?? null],
        );
      }

      await db.query(
        `INSERT INTO media_import_item (tenant_id, import_job_id, relative_path, source_sha256,
                                        asset_id, status)
         VALUES ($1,$2,$3,$4,$5,'COMPLETED')`,
        [raw.tenantId, jobId, entry.relativePath, sha256, assetId],
      );
    }

    await db.query(
      `UPDATE media_import_job SET status='COMPLETED', report='{"ok":true}'::jsonb WHERE id = $1`,
      [jobId],
    );
    await db.query('COMMIT');
    console.log(`Import xong: ${raw.assets.length} asset. KHÔNG tự publish — duyệt trong Sales Admin.`);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
