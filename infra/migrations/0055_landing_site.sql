-- =============================================================================
-- 0055_landing_site — Roles marketing/sales, site domain và site profile
--
-- Nguồn yêu cầu: docs/superpowers/specs/2026-08-12-phase-1-landing-sales-srs.md
--   mục 5.1 (roles), 6.1 (site_domain), 6.2 (site_profile), 6.2.1 (branch profile)
-- Bất biến: INV-LS-01/02/04/07/11 (tenant public, RLS, domain, bất biến)
-- =============================================================================

-- --- Vai trò mới (SRS mục 5.1) ----------------------------------------------
-- PostgreSQL 12+: ALTER TYPE ADD VALUE chạy được trong transaction khi giá trị
-- mới chưa được dùng trong cùng transaction (các migration sau mới dùng).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'MARKETING_EDITOR';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'MARKETING_PUBLISHER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SALES_ADVISOR';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SALES_MANAGER';

-- =============================================================================
-- site_domain (SRS mục 6.1)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE site_domain_status AS ENUM ('PENDING','VERIFIED','ACTIVE','DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS site_domain (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(id),
  hostname                text NOT NULL,   -- lowercase ASCII/punycode, không port
  status                  site_domain_status NOT NULL DEFAULT 'PENDING',
  is_primary              boolean NOT NULL DEFAULT false,
  force_https             boolean NOT NULL DEFAULT true,
  verification_token_hash text,
  verified_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id)
);

-- Hostname đang không DISABLED là duy nhất toàn cục (INV-LS-04)
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_domain_hostname_active
  ON site_domain (hostname) WHERE status <> 'DISABLED';

-- Tối đa một primary ACTIVE mỗi tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_domain_one_primary
  ON site_domain (tenant_id) WHERE status = 'ACTIVE' AND is_primary;

-- 🔒 Tenant có domain ACTIVE thì PHẢI có đúng một primary (SRS 6.1).
-- Constraint trigger DEFERRED: primary swap nguyên tử trong một transaction
-- (tắt cũ + bật mới) vẫn hợp lệ tại thời điểm COMMIT.
CREATE OR REPLACE FUNCTION site_domain_primary_guard() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM site_domain sd
     WHERE sd.status = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM site_domain p
          WHERE p.tenant_id = sd.tenant_id
            AND p.status = 'ACTIVE' AND p.is_primary
       )
  ) THEN
    RAISE EXCEPTION 'Tenant có domain ACTIVE phải có đúng một primary domain';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_domain_primary_guard ON site_domain;
CREATE CONSTRAINT TRIGGER trg_site_domain_primary_guard
  AFTER INSERT OR UPDATE ON site_domain
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION site_domain_primary_guard();

DROP TRIGGER IF EXISTS trg_touch_site_domain ON site_domain;
CREATE TRIGGER trg_touch_site_domain BEFORE UPDATE ON site_domain
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- 🔒 Role chuyên biệt cho resolver — lookup xảy ra TRƯỚC khi có tenant
-- (cùng bài toán với auth_lookup ở 0002, xem ghi chú ở đó).
DO $$ BEGIN
  CREATE ROLE site_domain_resolver NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ⚠️ File này ĐÃ ĐƯỢC SỬA sau khi đã chạy — xem `CHECKSUM_CU` trong
--    `infra/migrate.ts`. Câu `ALTER ROLE` trần đòi quyền superuser, thứ không
--    Postgres quản lý nào cấp; `chuan_bi_role()` (0001) ép khi ép
--    được và KIỂM khi không.
SELECT chuan_bi_role('site_domain_resolver');

-- Resolver CHỈ đọc site_domain; app runtime KHÔNG được đọc bảng này trực tiếp.
REVOKE ALL ON site_domain FROM garageos_app;
GRANT SELECT ON site_domain TO site_domain_resolver;

ALTER TABLE site_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_domain FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON site_domain;
CREATE POLICY tenant_isolation ON site_domain
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS site_domain_resolver_read ON site_domain;
CREATE POLICY site_domain_resolver_read ON site_domain
  FOR SELECT TO site_domain_resolver USING (true);

-- 🔒 Hàm SECURITY DEFINER hẹp, sở hữu bởi role resolver (không superuser,
-- không BYPASSRLS), fixed search_path, query parameterized. Chỉ trả đúng năm
-- cột cần cho resolution. KHÔNG mở rộng hàm này.
CREATE OR REPLACE FUNCTION resolve_site_domain(p_hostname text)
RETURNS TABLE (
  tenant_id        uuid,
  domain_id        uuid,
  status           site_domain_status,
  is_primary       boolean,
  primary_hostname text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT sd.tenant_id, sd.id, sd.status, sd.is_primary,
         p.hostname AS primary_hostname
    FROM site_domain sd
    LEFT JOIN site_domain p
      ON p.tenant_id = sd.tenant_id
     AND p.status = 'ACTIVE'
     AND p.is_primary
   WHERE sd.hostname = p_hostname
     AND sd.status <> 'DISABLED'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_site_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_site_domain(text) TO garageos_app;

COMMENT ON FUNCTION resolve_site_domain(text) IS
  'SECURITY DEFINER hẹp cho tenant resolution public. KHÔNG nhận điều kiện '
  'lọc tuỳ ý; KHÔNG mở rộng cột trả về — mỗi cột thêm là một đường rò.';

/*
 * 🔒 CHUYỂN QUYỀN SỞ HỮU LÀ VIỆC CUỐI CÙNG làm với hàm này.
 *
 * Sau khi đổi chủ, migration không còn là chủ nữa — mọi `REVOKE`, `GRANT` hay
 * `COMMENT` trên hàm sẽ bị từ chối với `must be owner of function`. Trên Docker
 * ở máy dev không ai thấy điều đó, vì superuser bỏ qua kiểm tra chủ sở hữu.
 *
 * ⚠️ Đổi chủ còn đòi CHỦ MỚI có `CREATE` trên schema chứa hàm — cũng là một
 *    kiểm tra superuser được bỏ qua. Nâng đúng trong giao dịch này rồi thu lại
 *    ngay: `site_domain_resolver` không được giữ quyền tạo object trong schema
 *    chung, nó là chủ của đúng một hàm `SECURITY DEFINER`.
 */
GRANT CREATE ON SCHEMA public TO site_domain_resolver;
ALTER FUNCTION resolve_site_domain(text) OWNER TO site_domain_resolver;
REVOKE CREATE ON SCHEMA public FROM site_domain_resolver;

-- =============================================================================
-- site_profile (SRS mục 6.2) — version rows bất biến sau publish
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE site_profile_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS site_profile (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(id),
  version_number          int NOT NULL DEFAULT 1,
  status                  site_profile_status NOT NULL DEFAULT 'DRAFT',
  brand_name              text NOT NULL,
  legal_name              text,
  default_title_suffix    text NOT NULL,
  default_description     text,
  logo_media_id           uuid,
  default_social_media_id uuid,
  favicon_media_id        uuid,
  app_icon_media_id       uuid,
  phone                   text,
  address                 jsonb,
  geo                     jsonb,
  opening_hours           jsonb,
  published_by            uuid,
  published_at            timestamptz,
  created_by              uuid NOT NULL,
  updated_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, version_number),
  CONSTRAINT site_profile_published_fields CHECK (
    status <> 'PUBLISHED' OR (published_by IS NOT NULL AND published_at IS NOT NULL)
  ),
  CONSTRAINT site_profile_description_len CHECK (
    default_description IS NULL OR length(default_description) BETWEEN 50 AND 300
  )
);

-- Tối đa một DRAFT và một PUBLISHED mỗi tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_profile_one_draft
  ON site_profile (tenant_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_profile_one_published
  ON site_profile (tenant_id) WHERE status = 'PUBLISHED';

-- =============================================================================
-- branch_public_profile (SRS mục 6.2.1) — NAP cho marketing duyệt
-- =============================================================================

CREATE TABLE IF NOT EXISTS branch_public_profile (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  branch_id     uuid NOT NULL,
  version_number int NOT NULL DEFAULT 1,
  status        site_profile_status NOT NULL DEFAULT 'DRAFT',
  stable_key    text NOT NULL,
  public_name   text NOT NULL,
  public_phone  text,
  public_address text,
  geo           jsonb,
  opening_hours jsonb,
  published_by  uuid,
  published_at  timestamptz,
  created_by    uuid NOT NULL,
  updated_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, branch_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_profile_one_draft
  ON branch_public_profile (branch_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_profile_one_published
  ON branch_public_profile (branch_id) WHERE status = 'PUBLISHED';

-- stable_key thuộc danh tính chi nhánh: hai CHI NHÁNH KHÁC NHAU không được
-- dùng chung key; các version của cùng một branch dùng lại key là hợp lệ.
CREATE OR REPLACE FUNCTION branch_profile_stable_key_unique() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM branch_public_profile b
     WHERE b.tenant_id = NEW.tenant_id
       AND b.stable_key = NEW.stable_key
       AND b.branch_id <> NEW.branch_id
       AND b.status <> 'ARCHIVED'
  ) THEN
    RAISE EXCEPTION 'stable_key đã được dùng bởi chi nhánh khác trong tenant';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branch_profile_stable_key ON branch_public_profile;
CREATE TRIGGER trg_branch_profile_stable_key
  BEFORE INSERT OR UPDATE ON branch_public_profile
  FOR EACH ROW EXECUTE FUNCTION branch_profile_stable_key_unique();

-- 🔒 Published/Archived row bất biến — trigger dùng chung cho mọi bảng version.
-- Ứng dụng chạy với role `garageos_app`: không UPDATE payload đã publish/archive.
-- Transition một chiều DRAFT → PUBLISHED → SUPERSEDED|ARCHIVED chỉ qua hàm
-- SECURITY DEFINER (owner `garageos` — `current_user` khác `garageos_app`).
CREATE OR REPLACE FUNCTION chan_sua_version_bat_bien() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND current_user <> 'garageos' THEN
    RAISE EXCEPTION 'Version đã publish/archive là bất biến (INV-LS-07)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_profile_immutable ON site_profile;
CREATE TRIGGER trg_site_profile_immutable BEFORE UPDATE ON site_profile
  FOR EACH ROW EXECUTE FUNCTION chan_sua_version_bat_bien();

DROP TRIGGER IF EXISTS trg_branch_profile_immutable ON branch_public_profile;
CREATE TRIGGER trg_branch_profile_immutable BEFORE UPDATE ON branch_public_profile
  FOR EACH ROW EXECUTE FUNCTION chan_sua_version_bat_bien();

DROP TRIGGER IF EXISTS trg_touch_site_profile ON site_profile;
CREATE TRIGGER trg_touch_site_profile BEFORE UPDATE ON site_profile
  FOR EACH ROW EXECUTE FUNCTION touch_row();

DROP TRIGGER IF EXISTS trg_touch_branch_profile ON branch_public_profile;
CREATE TRIGGER trg_touch_branch_profile BEFORE UPDATE ON branch_public_profile
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- RLS — INV-LS-02: mọi bảng nghiệp vụ mới FORCE RLS theo tenant
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_profile','branch_public_profile']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;
