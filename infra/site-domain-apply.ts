/**
 * Operator domain manifest — SRS Phase 1 mục 6.1.
 *
 * Dùng: pnpm site-domain:apply -- --manifest <domain-manifest.json>
 *
 * Phase 1 chưa có UI/API self-service quản lý domain. Release operator áp dụng
 * manifest đã review: validate schema, upsert idempotent theo (tenant_id,
 * hostname), primary swap nguyên tử, ghi audit/report và từ chối vô hiệu hoá
 * primary duy nhất. Không chứa secret thô.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

interface DomainManifest {
  schemaVersion: 1;
  tenantId: string;
  hostname: string;
  status: 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'DISABLED';
  isPrimary: boolean;
  verificationProofRef?: string;
}

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

function parseArgs(argv: string[]): { manifest: string } {
  const i = argv.indexOf('--manifest');
  const duongDan = i === -1 ? undefined : argv[i + 1];
  if (duongDan === undefined) throw new Error('Thiếu --manifest <đường dẫn>');
  return { manifest: duongDan };
}

function normalizeHostname(raw: string): string {
  let h = raw.trim().toLowerCase();
  const idx = h.indexOf(':');
  if (idx !== -1) h = h.slice(0, idx);
  while (h.endsWith('.')) h = h.slice(0, -1);
  if (!/^[a-z0-9.-]+$/.test(h)) throw new Error(`Hostname không hợp lệ: ${raw}`);
  return h;
}

async function main(): Promise<void> {
  const { manifest: manifestPath } = parseArgs(process.argv.slice(2));
  const m = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as DomainManifest;
  if (m.schemaVersion !== 1) throw new Error('schemaVersion phải là 1');
  const hostname = normalizeHostname(m.hostname);

  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();

  await db.query('BEGIN');
  try {
    // Khoá tenant — chống hai job đổi primary đồng thời
    await db.query('SELECT 1 FROM tenant WHERE id = $1 FOR UPDATE', [m.tenantId]);

    const { rows } = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM site_domain WHERE tenant_id = $1 AND hostname = $2`,
      [m.tenantId, hostname],
    );
    const existing = rows[0];

    if (existing !== undefined) {
      await db.query(
        `UPDATE site_domain SET status = $1, is_primary = $2, version = version + 1 WHERE id = $3`,
        [m.status, m.isPrimary, existing.id],
      );
    } else {
      await db.query(
        `INSERT INTO site_domain (tenant_id, hostname, status, is_primary)
         VALUES ($1,$2,$3,$4)`,
        [m.tenantId, hostname, m.status, m.isPrimary],
      );
    }

    // Primary swap nguyên tử: nếu domain này làm primary, hạ mọi primary khác
    if (m.isPrimary && m.status === 'ACTIVE') {
      await db.query(
        `UPDATE site_domain SET is_primary = false
          WHERE tenant_id = $1 AND hostname <> $2 AND is_primary`,
        [m.tenantId, hostname],
      );
    }

    // Từ chối vô hiệu hoá primary duy nhất (nếu đang cố DISABLED primary cuối)
    if (m.status === 'DISABLED' && existing !== undefined && existing.status === 'ACTIVE') {
      const { rows: otherPrimary } = await db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM site_domain
          WHERE tenant_id = $1 AND status = 'ACTIVE' AND is_primary AND hostname <> $2`,
        [m.tenantId, hostname],
      );
      if (Number(otherPrimary[0]?.n ?? 0) === 0) {
        throw new Error('Từ chối: không thể vô hiệu hoá primary duy nhất của tenant');
      }
    }

    await db.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, reason)
       SELECT $1, NULL, 'MARKETING_DOMAIN_APPLIED', 'site_domain', id, $2
         FROM site_domain WHERE tenant_id = $1 AND hostname = $3`,
      [m.tenantId, JSON.stringify(m), hostname],
    );
    await db.query('COMMIT');
    console.log(`Domain ${hostname} → status=${m.status}, primary=${m.isPrimary}`);
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
