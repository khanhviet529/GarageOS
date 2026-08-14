-- =============================================================================
-- 0057_landing_sales_lead — Lead và activity timeline
--
-- Nguồn yêu cầu: docs/superpowers/specs/2026-08-12-phase-1-landing-sales-srs.md
--   mục 6.9/6.10, 9 (state machine Phase 1)
-- Bất biến: INV-LS-02/03/06 (RLS, lead không tạo Customer/Vehicle, branch scope)
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE lead_intent AS ENUM ('REQUEST_QUOTE','TEST_DRIVE','GENERAL_CONTACT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_source AS ENUM ('LANDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('NEW','CONTACTED','QUALIFIED','LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_activity_type AS ENUM
    ('CREATED','ASSIGNED','STATUS_CHANGED','NOTE','CONTACT_ATTEMPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- sales_lead (SRS mục 6.9)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sales_lead (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid NOT NULL REFERENCES tenant(id),
  branch_id                     uuid NOT NULL,
  reference                     text NOT NULL,  -- mã công khai, không suy ra UUID (P1-LND-006)
  full_name                     text NOT NULL,
  phone_normalized              text NOT NULL,  -- chuẩn VN; không log đầy đủ
  email                         text,
  product_id                    uuid,
  variant_id                    uuid,
  catalog_revision_id           uuid,
  intent                        lead_intent NOT NULL,
  message                       text,
  status                        lead_status NOT NULL DEFAULT 'NEW',
  assigned_to                   uuid,
  source                        lead_source NOT NULL DEFAULT 'LANDING',
  landing_path                  text,
  catalog_context_snapshot      jsonb,          -- server-derived immutable (FR-LEAD-007)
  experience_context_snapshot   jsonb,
  utm_source                    text,
  utm_medium                    text,
  utm_campaign                  text,
  consent_version               text NOT NULL,
  consented_at                  timestamptz NOT NULL,
  duplicate_of_id               uuid,
  next_action_at                timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  version                       bigint NOT NULL DEFAULT 0,

  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES vehicle_product(tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES vehicle_variant(tenant_id, id),
  FOREIGN KEY (tenant_id, assigned_to) REFERENCES app_user(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, reference),
  CONSTRAINT lead_name_len CHECK (length(full_name) BETWEEN 2 AND 120),
  CONSTRAINT lead_message_len CHECK (message IS NULL OR length(message) <= 2000),
  CONSTRAINT lead_email_len CHECK (email IS NULL OR length(email) <= 254),
  CONSTRAINT lead_utm_len CHECK (
    (utm_source IS NULL OR length(utm_source) <= 100)
    AND (utm_medium IS NULL OR length(utm_medium) <= 100)
    AND (utm_campaign IS NULL OR length(utm_campaign) <= 100)
  )
);

-- Không unique theo phone: một người hỏi nhiều xe/lần khác nhau (SRS 6.9)
CREATE INDEX IF NOT EXISTS idx_lead_branch_status
  ON sales_lead (tenant_id, branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_phone
  ON sales_lead (tenant_id, phone_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_assignee
  ON sales_lead (tenant_id, assigned_to, status, next_action_at);

DROP TRIGGER IF EXISTS trg_touch_sales_lead ON sales_lead;
CREATE TRIGGER trg_touch_sales_lead BEFORE UPDATE ON sales_lead
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- Lead không bao giờ bị xoá (audit/truy vết)
REVOKE DELETE ON sales_lead FROM garageos_app;

-- =============================================================================
-- lead_activity (SRS mục 6.10) — APPEND-ONLY
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_activity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL,
  tenant_id     uuid NOT NULL,
  branch_id     uuid NOT NULL,
  type          lead_activity_type NOT NULL,
  actor_user_id uuid,               -- null chỉ cho sự kiện public/system (CREATED)
  from_status   lead_status,
  to_status     lead_status,
  note          text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, lead_id) REFERENCES sales_lead(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id),
  UNIQUE (tenant_id, id),
  CONSTRAINT lead_activity_note_len CHECK (note IS NULL OR length(note) BETWEEN 1 AND 2000),
  CONSTRAINT lead_activity_status_change CHECK (
    type <> 'STATUS_CHANGED' OR (from_status IS NOT NULL AND to_status IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_lead
  ON lead_activity (tenant_id, lead_id, created_at);

-- 🔒 Append-only ở tầng quyền (INV-LS-02 tinh thần; SRS 6.10 tường minh)
REVOKE UPDATE, DELETE ON lead_activity FROM garageos_app;

-- =============================================================================
-- RLS
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_lead','lead_activity']
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
