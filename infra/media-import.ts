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
import {
  readFileSync, existsSync, mkdirSync, copyFileSync, statSync, realpathSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve, isAbsolute } from 'node:path';
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
  // Giữ giá trị vào một biến rồi mới kiểm — đọc `argv[i + 1]` hai lần thì lần
  // thứ hai vẫn là `string | undefined` với `noUncheckedIndexedAccess`.
  const duongDan = i === -1 ? undefined : argv[i + 1];
  if (duongDan === undefined) {
    throw new Error('Thiếu --manifest <đường dẫn>');
  }
  return { manifest: duongDan };
}

/**
 * Đường dẫn tuyệt đối của một file trong manifest, đã chặn mọi lối ra ngoài.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Đầu file này hứa: "Manifest KHÔNG nhận remote URL, absolute path, `..`,
 *    symlink thoát root". Bản trước kiểm bằng đúng một dòng:
 *
 *        if (!filePath.startsWith(manifestDir)) throw …
 *
 *    ⚠️ Hai lối ra vẫn mở, và cả hai đều dẫn tới cùng một kết quả: file bị chép
 *       vào thư mục media CÔNG KHAI rồi phục vụ ra Internet.
 *
 *    1. `startsWith` so sánh CHUỖI, không so sánh cây thư mục. Với
 *       `manifestDir = /data/import`, đường dẫn `/data/import-secrets/khoa.pem`
 *       bắt đầu bằng đúng chuỗi đó — nên nó ĐI QUA. Chỉ cần
 *       `relativePath: "../import-secrets/khoa.pem"`.
 *
 *    2. Không có kiểm tra symlink nào cả, dù dòng chú thích nói có.
 *       `existsSync`/`readFileSync` đi theo symlink, nên một liên kết nằm TRONG
 *       thư mục manifest trỏ ra `/etc/shadow` qua guard mà không cần trick gì.
 *
 * 💡 So sánh cây thư mục thì hỏi `relative()`, đừng hỏi `startsWith()`. Và phải
 *    hỏi SAU khi `realpath` — nếu không thì ta đang kiểm cái tên, còn hệ điều
 *    hành thì đọc cái đích.
 *
 * Job này chạy bằng operator credential trên một manifest ĐÃ REVIEW. Đúng vì
 * thế mà guard phải chặt: giá trị của nó nằm ở chỗ người review được phép chỉ
 * đọc manifest mà không phải đọc cả cây thư mục quanh nó.
 */
export function duongDanTrongManifest(manifestDir: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Đường dẫn tuyệt đối không được chấp nhận: ${relativePath}`);
  }
  const ungVien = resolve(join(manifestDir, relativePath));
  if (!existsSync(ungVien)) throw new Error(`Không tìm thấy file ${relativePath}`);

  // realpath TRƯỚC khi so sánh — cả file lẫn thư mục gốc, vì bản thân
  // manifestDir cũng có thể nằm sau một symlink.
  const goc = realpathSync(manifestDir);
  const that = realpathSync(ungVien);

  const buoc = relative(goc, that);
  if (buoc === '' || buoc.startsWith('..') || isAbsolute(buoc)) {
    throw new Error(
      `Đường dẫn ${relativePath} thoát khỏi thư mục manifest (thật: ${that})`,
    );
  }
  if (!statSync(that).isFile()) {
    throw new Error(`${relativePath} không phải file thường`);
  }
  return that;
}

/**
 * Tra con trỏ bản nháp, và phân biệt ba câu trả lời mà bản trước gộp làm một:
 * không khai báo (bỏ qua hợp lệ) · khai báo nhưng không tìm thấy · tìm thấy
 * nhưng chưa có bản nháp. Hai cái sau đều dừng job.
 */
async function capNhapPhaiCo(
  db: Client,
  stableKey: string | undefined,
  sql: string,
  params: unknown[],
  nhan: string,
): Promise<string | null> {
  if (stableKey === undefined) return null;
  const { rows } = await db.query<{ id: string | null }>(sql, params);
  if (rows[0] === undefined) {
    throw new Error(
      `Không tìm thấy ${nhan} có stable_key "${stableKey}" trong tenant này — kiểm tra lại manifest`,
    );
  }
  if (rows[0].id === null) {
    throw new Error(
      `${nhan} "${stableKey}" không có bản nháp để gắn media. ` +
        'Tạo bản nháp trong Sales Admin trước rồi chạy lại.',
    );
  }
  return rows[0].id;
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

    /*
     * 🔒 Manifest CÓ nhắc tới catalog thì phải gắn được, không thì dừng hẳn.
     *
     * ─────────────────────────────────────────────────────────────────────
     * ⚠️ Bản trước dùng `rows[0]?.id ?? null`, và `null` sau đó lặng lẽ tắt
     *    toàn bộ nhánh gắn media ở dưới. Ba tình huống khác hẳn nhau đều rơi
     *    vào cùng một kết quả "thành công":
     *
     *      · gõ sai `productStableKey`      -> không có hàng   -> null
     *      · xe thuộc tenant khác           -> không có hàng   -> null
     *      · xe đã publish, không còn nháp  -> có hàng, id NULL -> null
     *
     *    Cả ba đều in ra `Import xong: 12 asset. KHÔNG tự publish — duyệt trong
     *    Sales Admin.` rồi thoát 0. Người vận hành mở Sales Admin, không thấy
     *    ảnh đâu, và không có gì trong log nói vì sao.
     *
     *    Tình huống thứ ba từng là trạng thái VĨNH VIỄN của mọi xe đã đăng:
     *    trước `0a64c4e` không route nào dựng lại được bản nháp cho sản phẩm.
     *    Nghĩa là mọi lần nhập ảnh cho một chiếc xe đang bán đều không làm gì.
     *
     * 💡 Một job nhập liệu im lặng bỏ qua phần việc chính của nó thì tệ hơn một
     *    job đổ vỡ: đổ vỡ thì người ta chạy lại, còn im lặng thì người ta tin.
     */
    const productRevisionId = await capNhapPhaiCo(
      db, raw.productStableKey,
      `SELECT draft_revision_id AS id FROM vehicle_product
        WHERE tenant_id = $1 AND stable_key = $2`,
      [raw.tenantId, raw.productStableKey],
      'sản phẩm',
    );

    const experienceVersionId = await capNhapPhaiCo(
      db, raw.experienceStableKey,
      `SELECT draft_version_id AS id FROM vehicle_experience
        WHERE tenant_id = $1 AND stable_key = $2`,
      [raw.tenantId, raw.experienceStableKey],
      'trải nghiệm',
    );

    mkdirSync(MEDIA_ROOT, { recursive: true });

    for (const entry of raw.assets) {
      const filePath = duongDanTrongManifest(manifestDir, entry.relativePath);

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
         -- Cập nhật ĐỦ metadata, không chỉ status (xem chú thích phía trên hàm).
         ON CONFLICT (tenant_id, stable_key) DO UPDATE SET
           status = 'READY',
           source_storage_key = EXCLUDED.source_storage_key,
           source_sha256 = EXCLUDED.source_sha256,
           source_mime = EXCLUDED.source_mime,
           byte_size = EXCLUDED.byte_size,
           provenance = EXCLUDED.provenance,
           license = EXCLUDED.license,
           license_owner = EXCLUDED.license_owner
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
        /*
         * ⚠️ Không có UNIQUE nào trên (product_revision_id, media_asset_id, role),
         *    nên hai job nhập cùng một ảnh vào cùng bản nháp tạo HAI hàng — và
         *    trang xe hiện đúng tấm ảnh đó hai lần. `WHERE NOT EXISTS` giữ cho
         *    lần chạy thứ hai là một phép không-làm-gì, đúng như nghĩa của
         *    "idempotent" mà đầu file hứa.
         */
        await db.query(
          `INSERT INTO vehicle_product_media (tenant_id, product_revision_id, media_asset_id,
                                              role, alt_text, sort_order, is_cover)
           SELECT $1,$2,$3,$4,$5,$6,$7
            WHERE NOT EXISTS (
              SELECT 1 FROM vehicle_product_media
               WHERE product_revision_id = $2 AND media_asset_id = $3 AND role = $4
            )`,
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
           SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
            WHERE NOT EXISTS (
              SELECT 1 FROM vehicle_experience_version_media
               WHERE experience_version_id = $2 AND binding_key = $4
            )`,
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

/*
 * Chỉ chạy khi được gọi THẲNG từ dòng lệnh.
 *
 * `media-import.spec.ts` import `duongDanTrongManifest` từ file này để kiểm
 * hàng rào đường dẫn. Không có điều kiện này thì chỉ riêng việc import đã khởi
 * động cả job nhập liệu — kèm một lời gọi `process.exit(1)` vì thiếu
 * `--manifest`.
 */
const goiTrucTiep =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith(join('infra', 'media-import.ts'));

if (goiTrucTiep) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
