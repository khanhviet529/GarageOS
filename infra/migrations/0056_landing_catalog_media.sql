-- =============================================================================
-- 0056_landing_catalog_media — Catalog marketing bất biến + media asset
--
-- Nguồn yêu cầu: docs/superpowers/specs/2026-08-12-phase-1-landing-sales-srs.md
--   mục 6.3–6.8
-- Bất biến: INV-LS-05/07/13 (publication bất biến, atomic swap)
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE product_lifecycle_status AS ENUM ('ACTIVE','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE revision_status AS ENUM ('DRAFT','PUBLISHED','SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE variant_inclusion_status AS ENUM ('ACTIVE','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE experience_kind AS ENUM ('EXTERIOR_SPIN','INTERIOR_PANORAMA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE experience_lifecycle_status AS ENUM ('ACTIVE','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_kind AS ENUM ('IMAGE','PANORAMA','AUDIO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_asset_status AS ENUM ('IMPORTING','VALIDATING','READY','QUARANTINED','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_rendition_visibility AS ENUM ('PRIVATE_STAGED','PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_publication_status AS ENUM ('PENDING','READY','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_media_role AS ENUM ('POSTER','GALLERY','SOCIAL','HOTSPOT_DETAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_import_job_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- media_asset / media_rendition / media_publication (SRS mục 6.7)
-- =============================================================================

CREATE TABLE IF NOT EXISTS media_asset (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  stable_key          text NOT NULL,
  kind                media_kind NOT NULL,
  status              media_asset_status NOT NULL DEFAULT 'IMPORTING',
  source_storage_key  text NOT NULL,          -- content-addressed, không phải URL tuỳ ý
  source_sha256       text NOT NULL,
  source_mime         text NOT NULL,
  byte_size           bigint NOT NULL,
  width               int,
  height              int,
  duration_ms         int,
  provenance          jsonb NOT NULL DEFAULT '{}',
  license             text NOT NULL,
  license_owner       text NOT NULL,
  license_expires_at  timestamptz,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, stable_key),
  CONSTRAINT media_asset_byte_size CHECK (byte_size >= 0),
  CONSTRAINT media_asset_dims CHECK (
    width IS NULL OR (width > 0 AND height IS NULL) OR (width > 0 AND height > 0)
  )
);

CREATE TABLE IF NOT EXISTS media_rendition (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  asset_id      uuid NOT NULL,
  profile       text NOT NULL,               -- POSTER/GALLERY/SOCIAL/SPIN_FRAME_36/…
  format        text NOT NULL,
  mime          text NOT NULL,
  width         int,
  height        int,
  duration_ms   int,
  storage_key   text NOT NULL,
  content_sha256 text NOT NULL,
  byte_size     bigint NOT NULL,
  quality_tier  text,
  visibility    media_rendition_visibility NOT NULL DEFAULT 'PRIVATE_STAGED',
  created_at    timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_asset(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_id, profile, content_sha256)
);

CREATE TABLE IF NOT EXISTS media_publication (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  rendition_id         uuid NOT NULL,
  public_storage_key   text,
  public_content_sha256 text,
  verified_at          timestamptz,
  status               media_publication_status NOT NULL DEFAULT 'PENDING',
  attempts             int NOT NULL DEFAULT 0,
  last_error           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, rendition_id) REFERENCES media_rendition(tenant_id, id),
  UNIQUE (tenant_id, rendition_id)
);

-- =============================================================================
-- Operator import job (SRS mục 6.8)
-- =============================================================================

CREATE TABLE IF NOT EXISTS media_import_job (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  import_key    text NOT NULL,
  manifest_hash text NOT NULL,
  status        media_import_job_status NOT NULL DEFAULT 'PENDING',
  report        jsonb,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, import_key)
);

CREATE TABLE IF NOT EXISTS media_import_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  import_job_id uuid NOT NULL,
  relative_path text NOT NULL,
  source_sha256 text NOT NULL,
  asset_id      uuid,
  rendition_ids uuid[] NOT NULL DEFAULT '{}',
  status        text NOT NULL,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, import_job_id) REFERENCES media_import_job(tenant_id, id),
  UNIQUE (tenant_id, id)
);

-- =============================================================================
-- vehicle_product + revision (SRS mục 6.3/6.4)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_product (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(id),
  stable_key             text NOT NULL,
  slug                   text NOT NULL,
  lifecycle_status       product_lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  draft_revision_id      uuid,
  published_revision_id  uuid,
  first_published_at     timestamptz,
  created_by             uuid NOT NULL,
  updated_by             uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, stable_key),
  UNIQUE (tenant_id, slug),
  CONSTRAINT product_slug_kebab CHECK (slug = lower(slug))
);

CREATE TABLE IF NOT EXISTS vehicle_product_revision (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  product_id      uuid NOT NULL,
  revision_number int NOT NULL,
  status          revision_status NOT NULL DEFAULT 'DRAFT',
  schema_version  int NOT NULL DEFAULT 1,
  name            text NOT NULL,
  make_name       text NOT NULL,
  model_name      text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  seo_title       text,
  seo_description text,
  content_hash    text NOT NULL,
  published_at    timestamptz,
  published_by    uuid,
  created_by      uuid NOT NULL,
  updated_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, product_id) REFERENCES vehicle_product(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, revision_number),
  CONSTRAINT product_revision_name_len CHECK (length(name) BETWEEN 2 AND 160),
  CONSTRAINT product_revision_summary_len CHECK (length(summary) <= 500),
  CONSTRAINT product_revision_description_len CHECK (length(description) <= 20000),
  CONSTRAINT product_revision_published_fields CHECK (
    status NOT IN ('PUBLISHED','SUPERSEDED')
    OR (published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_revision_one_draft
  ON vehicle_product_revision (product_id) WHERE status = 'DRAFT';

-- Con trỏ publication — FK phức hợp thêm sau khi cả hai bảng tồn tại
ALTER TABLE vehicle_product DROP CONSTRAINT IF EXISTS vehicle_product_draft_fk;
ALTER TABLE vehicle_product ADD CONSTRAINT vehicle_product_draft_fk
  FOREIGN KEY (tenant_id, draft_revision_id)
  REFERENCES vehicle_product_revision(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE vehicle_product DROP CONSTRAINT IF EXISTS vehicle_product_published_fk;
ALTER TABLE vehicle_product ADD CONSTRAINT vehicle_product_published_fk
  FOREIGN KEY (tenant_id, published_revision_id)
  REFERENCES vehicle_product_revision(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;

-- =============================================================================
-- vehicle_variant + revision (SRS mục 6.5)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_variant (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(id),
  product_id       uuid NOT NULL,
  stable_key       text NOT NULL,
  lifecycle_status product_lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by       uuid NOT NULL,
  updated_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, product_id) REFERENCES vehicle_product(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, stable_key)
);

CREATE TABLE IF NOT EXISTS vehicle_variant_revision (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  product_revision_id  uuid NOT NULL,
  variant_id           uuid NOT NULL,
  name                 text NOT NULL,
  sku                  text,
  powertrain           powertrain NOT NULL,
  model_year           int NOT NULL,
  display_price_amount bigint,               -- null = "Liên hệ" (P1-LND-003)
  specifications       jsonb NOT NULL DEFAULT '{}',
  inclusion_status     variant_inclusion_status NOT NULL DEFAULT 'ACTIVE',
  is_featured          boolean NOT NULL DEFAULT false,
  sort_order           int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, product_revision_id)
    REFERENCES vehicle_product_revision(tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES vehicle_variant(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_revision_id, variant_id),
  CONSTRAINT variant_model_year CHECK (model_year BETWEEN 1900 AND 2100),
  CONSTRAINT variant_price_positive CHECK (display_price_amount IS NULL OR display_price_amount > 0),
  CONSTRAINT variant_sort_order CHECK (sort_order >= 0)
);

-- SKU unique theo DANH TÍNH variant, không theo revision: clone-to-draft sao chép
-- cùng variant_id sang revision mới nên index theo dòng sẽ báo trùng giả.
CREATE OR REPLACE FUNCTION variant_sku_unique_per_identity() RETURNS trigger AS $$
BEGIN
  IF NEW.sku IS NOT NULL AND EXISTS (
    SELECT 1 FROM vehicle_variant_revision vvr
     WHERE vvr.tenant_id = NEW.tenant_id
       AND vvr.sku = NEW.sku
       AND vvr.variant_id <> NEW.variant_id
       AND vvr.inclusion_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'SKU đã được dùng bởi phiên bản khác trong tenant';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_variant_sku_unique ON vehicle_variant_revision;
CREATE TRIGGER trg_variant_sku_unique
  BEFORE INSERT OR UPDATE ON vehicle_variant_revision
  FOR EACH ROW EXECUTE FUNCTION variant_sku_unique_per_identity();

-- =============================================================================
-- vehicle_experience + version + media bindings (SRS mục 6.6)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_experience (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(id),
  product_id           uuid NOT NULL,
  variant_id           uuid,
  kind                 experience_kind NOT NULL,
  stable_key           text NOT NULL,
  lifecycle_status     experience_lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  draft_version_id     uuid,
  published_version_id uuid,
  created_by           uuid NOT NULL,
  updated_by           uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, product_id) REFERENCES vehicle_product(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, stable_key)
);

CREATE TABLE IF NOT EXISTS vehicle_experience_version (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  experience_id    uuid NOT NULL,
  revision_number  int NOT NULL,
  schema_version   int NOT NULL DEFAULT 1,
  label            text NOT NULL,
  poster_media_id  uuid,
  config           jsonb NOT NULL DEFAULT '{}',
  content_hash     text NOT NULL,
  status           revision_status NOT NULL DEFAULT 'DRAFT',
  published_at     timestamptz,
  published_by     uuid,
  created_by       uuid NOT NULL,
  updated_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, experience_id) REFERENCES vehicle_experience(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, experience_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_experience_version_one_draft
  ON vehicle_experience_version (experience_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX IF NOT EXISTS uq_experience_version_one_published
  ON vehicle_experience_version (experience_id) WHERE status = 'PUBLISHED';

ALTER TABLE vehicle_experience DROP CONSTRAINT IF EXISTS vehicle_experience_draft_fk;
ALTER TABLE vehicle_experience ADD CONSTRAINT vehicle_experience_draft_fk
  FOREIGN KEY (tenant_id, draft_version_id)
  REFERENCES vehicle_experience_version(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE vehicle_experience DROP CONSTRAINT IF EXISTS vehicle_experience_published_fk;
ALTER TABLE vehicle_experience ADD CONSTRAINT vehicle_experience_published_fk
  FOREIGN KEY (tenant_id, published_version_id)
  REFERENCES vehicle_experience_version(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;

-- Binding media cho experience version — JSON config chỉ tham chiếu binding_key
CREATE TABLE IF NOT EXISTS vehicle_experience_version_media (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  experience_version_id uuid NOT NULL,
  media_asset_id        uuid NOT NULL,
  binding_key           text NOT NULL,
  role                  text NOT NULL,
  scene_key             text,
  logical_yaw           numeric(5,2),
  quality_tier          text,
  sort_order            int NOT NULL DEFAULT 0,
  accessible_label      text,
  description           text,
  language              text NOT NULL DEFAULT 'vi',
  transcript_text       text,
  transcript_media_id   uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, experience_version_id)
    REFERENCES vehicle_experience_version(tenant_id, id),
  FOREIGN KEY (tenant_id, media_asset_id) REFERENCES media_asset(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, experience_version_id, binding_key)
);

-- =============================================================================
-- vehicle_product_media (SRS mục 6.7) — media của MỘT product revision
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_product_media (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  product_revision_id uuid NOT NULL,
  media_asset_id      uuid NOT NULL,
  role                product_media_role NOT NULL,
  alt_text            text NOT NULL,
  sort_order          int NOT NULL DEFAULT 0,
  is_cover            boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, product_revision_id)
    REFERENCES vehicle_product_revision(tenant_id, id),
  FOREIGN KEY (tenant_id, media_asset_id) REFERENCES media_asset(tenant_id, id),
  UNIQUE (tenant_id, id),
  CONSTRAINT product_media_alt CHECK (length(alt_text) > 0),
  CONSTRAINT product_media_sort CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_media_one_cover
  ON vehicle_product_media (product_revision_id) WHERE is_cover;

-- Site profile tham chiếu media_asset (bảng tạo ở 0055, FK bổ sung tại đây)
ALTER TABLE site_profile DROP CONSTRAINT IF EXISTS site_profile_logo_fk;
ALTER TABLE site_profile ADD CONSTRAINT site_profile_logo_fk
  FOREIGN KEY (tenant_id, logo_media_id) REFERENCES media_asset(tenant_id, id);
ALTER TABLE site_profile DROP CONSTRAINT IF EXISTS site_profile_social_fk;
ALTER TABLE site_profile ADD CONSTRAINT site_profile_social_fk
  FOREIGN KEY (tenant_id, default_social_media_id) REFERENCES media_asset(tenant_id, id);
ALTER TABLE site_profile DROP CONSTRAINT IF EXISTS site_profile_favicon_fk;
ALTER TABLE site_profile ADD CONSTRAINT site_profile_favicon_fk
  FOREIGN KEY (tenant_id, favicon_media_id) REFERENCES media_asset(tenant_id, id);
ALTER TABLE site_profile DROP CONSTRAINT IF EXISTS site_profile_app_icon_fk;
ALTER TABLE site_profile ADD CONSTRAINT site_profile_app_icon_fk
  FOREIGN KEY (tenant_id, app_icon_media_id) REFERENCES media_asset(tenant_id, id);

-- =============================================================================
-- Publish — SECURITY DEFINER hẹp (SRS mục 6.4: "stored procedure được cấp
-- quyền hẹp"). App role KHÔNG UPDATE tuỳ ý published payload; swap chỉ qua
-- các hàm này, trong transaction đã đặt app.tenant_id.
-- =============================================================================

CREATE OR REPLACE FUNCTION marketing_promote_product_draft(
  p_tenant_id uuid, p_product_id uuid, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft uuid;
  v_old   uuid;
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT draft_revision_id, published_revision_id
    INTO v_draft, v_old
    FROM vehicle_product WHERE id = p_product_id
    FOR UPDATE;

  IF v_draft IS NULL THEN
    RAISE EXCEPTION 'không có draft để publish';
  END IF;

  -- Publish validator tối thiểu (app validate chi tiết trước; đây là chốt cuối)
  IF NOT EXISTS (
    SELECT 1 FROM vehicle_variant_revision vvr
     WHERE vvr.product_revision_id = v_draft
       AND vvr.inclusion_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'cần ít nhất một variant ACTIVE (PRODUCT_NOT_PUBLISHABLE)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vehicle_product_media vpm
     WHERE vpm.product_revision_id = v_draft AND vpm.is_cover
  ) THEN
    RAISE EXCEPTION 'cần ảnh cover hợp lệ (PRODUCT_NOT_PUBLISHABLE)';
  END IF;

  IF v_old IS NOT NULL THEN
    UPDATE vehicle_product_revision SET status = 'SUPERSEDED'
     WHERE id = v_old AND status = 'PUBLISHED';
  END IF;

  UPDATE vehicle_product_revision
     SET status       = 'PUBLISHED',
         published_at = now(),
         published_by = p_actor,
         updated_by   = p_actor
   WHERE id = v_draft AND status = 'DRAFT';

  UPDATE vehicle_product
     SET published_revision_id = v_draft,
         draft_revision_id     = NULL,
         first_published_at    = COALESCE(first_published_at, now())
   WHERE id = p_product_id;

  RETURN v_draft;
END $$;
REVOKE ALL ON FUNCTION marketing_promote_product_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_promote_product_draft(uuid,uuid,uuid) TO garageos_app;

CREATE OR REPLACE FUNCTION marketing_promote_experience_draft(
  p_tenant_id uuid, p_experience_id uuid, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft uuid;
  v_old   uuid;
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT draft_version_id, published_version_id
    INTO v_draft, v_old
    FROM vehicle_experience WHERE id = p_experience_id
    FOR UPDATE;

  IF v_draft IS NULL THEN
    RAISE EXCEPTION 'không có draft để publish';
  END IF;

  IF v_old IS NOT NULL THEN
    UPDATE vehicle_experience_version SET status = 'SUPERSEDED'
     WHERE id = v_old AND status = 'PUBLISHED';
  END IF;

  UPDATE vehicle_experience_version
     SET status       = 'PUBLISHED',
         published_at = now(),
         published_by = p_actor,
         updated_by   = p_actor
   WHERE id = v_draft AND status = 'DRAFT';

  UPDATE vehicle_experience
     SET published_version_id = v_draft,
         draft_version_id     = NULL
   WHERE id = p_experience_id;

  RETURN v_draft;
END $$;
REVOKE ALL ON FUNCTION marketing_promote_experience_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_promote_experience_draft(uuid,uuid,uuid) TO garageos_app;

-- Gắn con trỏ draft sau clone-to-draft — app role không được UPDATE con trỏ
-- tuỳ ý (chỉ lifecycle_status được grant). Hàm kiểm chứng revision thuộc đúng
-- product và đang DRAFT trước khi trỏ.
CREATE OR REPLACE FUNCTION marketing_set_product_draft(
  p_tenant_id uuid, p_product_id uuid, p_revision_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_product_revision
     WHERE id = p_revision_id AND product_id = p_product_id
       AND tenant_id = p_tenant_id AND status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'revision không phải draft của product';
  END IF;

  UPDATE vehicle_product SET draft_revision_id = p_revision_id
   WHERE id = p_product_id;
END $$;
REVOKE ALL ON FUNCTION marketing_set_product_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_set_product_draft(uuid,uuid,uuid) TO garageos_app;

CREATE OR REPLACE FUNCTION marketing_set_experience_draft(
  p_tenant_id uuid, p_experience_id uuid, p_version_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_experience_version
     WHERE id = p_version_id AND experience_id = p_experience_id
       AND tenant_id = p_tenant_id AND status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'version không phải draft của experience';
  END IF;

  UPDATE vehicle_experience SET draft_version_id = p_version_id
   WHERE id = p_experience_id;
END $$;
REVOKE ALL ON FUNCTION marketing_set_experience_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_set_experience_draft(uuid,uuid,uuid) TO garageos_app;

-- Publish site_profile: archive bản PUBLISHED cũ, promote draft và tạo draft kế
-- tiếp trong cùng transaction (SRS mục 6.2).
CREATE OR REPLACE FUNCTION marketing_publish_site_profile(
  p_tenant_id uuid, p_draft_id uuid, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
  v_new  uuid;
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  PERFORM 1 FROM site_profile
   WHERE id = p_draft_id AND tenant_id = p_tenant_id AND status = 'DRAFT'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'không có draft để publish';
  END IF;

  UPDATE site_profile SET status = 'ARCHIVED'
   WHERE tenant_id = p_tenant_id AND status = 'PUBLISHED';

  UPDATE site_profile
     SET status       = 'PUBLISHED',
         published_at = now(),
         published_by = p_actor,
         updated_by   = p_actor
   WHERE id = p_draft_id AND status = 'DRAFT';

  -- Draft kế tiếp cho lần sửa sau — clone payload published (trừ field lifecycle)
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
    FROM site_profile WHERE tenant_id = p_tenant_id;

  INSERT INTO site_profile (
    tenant_id, version_number, status, brand_name, legal_name,
    default_title_suffix, default_description, logo_media_id,
    default_social_media_id, favicon_media_id, app_icon_media_id,
    phone, address, geo, opening_hours, created_by, updated_by
  )
  SELECT tenant_id, v_next, 'DRAFT', brand_name, legal_name,
         default_title_suffix, default_description, logo_media_id,
         default_social_media_id, favicon_media_id, app_icon_media_id,
         phone, address, geo, opening_hours, p_actor, p_actor
    FROM site_profile WHERE id = p_draft_id
  RETURNING id INTO v_new;

  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION marketing_publish_site_profile(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_publish_site_profile(uuid,uuid,uuid) TO garageos_app;

-- Publish branch_public_profile — tương tự, phạm vi theo branch.
CREATE OR REPLACE FUNCTION marketing_publish_branch_profile(
  p_tenant_id uuid, p_draft_id uuid, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch  uuid;
  v_next    int;
  v_new     uuid;
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT branch_id INTO v_branch FROM branch_public_profile
   WHERE id = p_draft_id AND tenant_id = p_tenant_id AND status = 'DRAFT'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'không có draft để publish';
  END IF;

  UPDATE branch_public_profile SET status = 'ARCHIVED'
   WHERE tenant_id = p_tenant_id AND branch_id = v_branch AND status = 'PUBLISHED';

  UPDATE branch_public_profile
     SET status       = 'PUBLISHED',
         published_at = now(),
         published_by = p_actor,
         updated_by   = p_actor
   WHERE id = p_draft_id AND status = 'DRAFT';

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
    FROM branch_public_profile
   WHERE tenant_id = p_tenant_id AND branch_id = v_branch;

  INSERT INTO branch_public_profile (
    tenant_id, branch_id, version_number, status, stable_key, public_name,
    public_phone, public_address, geo, opening_hours, created_by, updated_by
  )
  SELECT tenant_id, branch_id, v_next, 'DRAFT', stable_key, public_name,
         public_phone, public_address, geo, opening_hours, p_actor, p_actor
    FROM branch_public_profile WHERE id = p_draft_id
  RETURNING id INTO v_new;

  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION marketing_publish_branch_profile(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_publish_branch_profile(uuid,uuid,uuid) TO garageos_app;

-- Con trỏ publication phải nhất quán: draft trỏ revision DRAFT của đúng
-- product, published trỏ revision PUBLISHED của đúng product. INSERT mới phải
-- để NULL (gắn sau bằng hàm marketing_set_*_draft).
CREATE OR REPLACE FUNCTION product_pointers_consistent() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.draft_revision_id IS NOT NULL OR NEW.published_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'con trỏ publication phải NULL khi tạo product';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.draft_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM vehicle_product_revision r
     WHERE r.id = NEW.draft_revision_id
       AND r.product_id = NEW.id AND r.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'draft_revision_id không thuộc product hoặc không DRAFT';
  END IF;
  IF NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM vehicle_product_revision r
     WHERE r.id = NEW.published_revision_id
       AND r.product_id = NEW.id AND r.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'published_revision_id không thuộc product hoặc không PUBLISHED';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_pointers ON vehicle_product;
CREATE TRIGGER trg_product_pointers BEFORE INSERT OR UPDATE ON vehicle_product
  FOR EACH ROW EXECUTE FUNCTION product_pointers_consistent();

CREATE OR REPLACE FUNCTION experience_pointers_consistent() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.draft_version_id IS NOT NULL OR NEW.published_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'con trỏ version phải NULL khi tạo experience';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.draft_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM vehicle_experience_version v
     WHERE v.id = NEW.draft_version_id
       AND v.experience_id = NEW.id AND v.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'draft_version_id không thuộc experience hoặc không DRAFT';
  END IF;
  IF NEW.published_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM vehicle_experience_version v
     WHERE v.id = NEW.published_version_id
       AND v.experience_id = NEW.id AND v.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'published_version_id không thuộc experience hoặc không PUBLISHED';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_experience_pointers ON vehicle_experience;
CREATE TRIGGER trg_experience_pointers BEFORE INSERT OR UPDATE ON vehicle_experience
  FOR EACH ROW EXECUTE FUNCTION experience_pointers_consistent();

-- =============================================================================
-- Khóa cột ở tầng quyền — app role không tự sửa con trỏ publication
-- =============================================================================

-- vehicle_product: app chỉ cần UPDATE lifecycle_status (archive); con trỏ và
-- slug/stable_key do service + hàm publish quản lý.
REVOKE UPDATE, DELETE ON vehicle_product FROM garageos_app;
GRANT UPDATE (lifecycle_status) ON vehicle_product TO garageos_app;

-- vehicle_experience: tương tự
REVOKE UPDATE, DELETE ON vehicle_experience FROM garageos_app;
GRANT UPDATE (lifecycle_status) ON vehicle_experience TO garageos_app;

-- Không bao giờ DELETE version/revision (bất biến + audit)
REVOKE DELETE ON vehicle_product_revision FROM garageos_app;
REVOKE DELETE ON vehicle_experience_version FROM garageos_app;
REVOKE DELETE ON site_profile FROM garageos_app;
REVOKE DELETE ON branch_public_profile FROM garageos_app;

-- =============================================================================
-- Trigger bất biến + touch
-- =============================================================================

DROP TRIGGER IF EXISTS trg_product_revision_immutable ON vehicle_product_revision;
CREATE TRIGGER trg_product_revision_immutable BEFORE UPDATE ON vehicle_product_revision
  FOR EACH ROW EXECUTE FUNCTION chan_sua_version_bat_bien();

DROP TRIGGER IF EXISTS trg_experience_version_immutable ON vehicle_experience_version;
CREATE TRIGGER trg_experience_version_immutable BEFORE UPDATE ON vehicle_experience_version
  FOR EACH ROW EXECUTE FUNCTION chan_sua_version_bat_bien();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicle_product','vehicle_product_revision',
    'vehicle_variant','vehicle_variant_revision',
    'vehicle_experience','vehicle_experience_version'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
  END LOOP;
END $$;

-- =============================================================================
-- RLS — INV-LS-02
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'media_asset','media_rendition','media_publication',
    'media_import_job','media_import_item',
    'vehicle_product','vehicle_product_revision',
    'vehicle_variant','vehicle_variant_revision',
    'vehicle_experience','vehicle_experience_version',
    'vehicle_experience_version_media','vehicle_product_media'
  ]
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
