-- 0066_landing_page_builder -- constrained, revisioned landing documents.
-- Documents are validated by @garageos/contracts; the database protects tenant
-- pointers and immutable publication independently from the application.

CREATE TABLE IF NOT EXISTS landing_page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  slug text NOT NULL,
  draft_revision_id uuid,
  published_revision_id uuid,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug),
  CONSTRAINT landing_page_slug CHECK (slug = '/' OR slug ~ '^/[a-z0-9-]+$')
);

CREATE TABLE IF NOT EXISTS landing_page_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  page_id uuid NOT NULL,
  revision_number int NOT NULL,
  status revision_status NOT NULL DEFAULT 'DRAFT',
  schema_version int NOT NULL DEFAULT 1,
  document jsonb NOT NULL,
  content_hash text NOT NULL,
  published_at timestamptz,
  published_by uuid,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id, page_id) REFERENCES landing_page(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, page_id, revision_number),
  CONSTRAINT landing_page_revision_published_fields CHECK (
    status NOT IN ('PUBLISHED', 'SUPERSEDED') OR (published_by IS NOT NULL AND published_at IS NOT NULL)
  ),
  CONSTRAINT landing_page_revision_document_object CHECK (jsonb_typeof(document) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_page_one_draft ON landing_page_revision(page_id) WHERE status = 'DRAFT';

ALTER TABLE landing_page DROP CONSTRAINT IF EXISTS landing_page_draft_fk;
ALTER TABLE landing_page ADD CONSTRAINT landing_page_draft_fk
  FOREIGN KEY (tenant_id, draft_revision_id) REFERENCES landing_page_revision(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE landing_page DROP CONSTRAINT IF EXISTS landing_page_published_fk;
ALTER TABLE landing_page ADD CONSTRAINT landing_page_published_fk
  FOREIGN KEY (tenant_id, published_revision_id) REFERENCES landing_page_revision(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION landing_page_pointers_consistent() RETURNS trigger AS $$
BEGIN
  IF NEW.draft_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM landing_page_revision r WHERE r.id = NEW.draft_revision_id AND r.page_id = NEW.id AND r.status = 'DRAFT'
  ) THEN RAISE EXCEPTION 'draft revision is not a draft of this landing page'; END IF;
  IF NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM landing_page_revision r WHERE r.id = NEW.published_revision_id AND r.page_id = NEW.id AND r.status = 'PUBLISHED'
  ) THEN RAISE EXCEPTION 'published revision is not a publication of this landing page'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_landing_page_pointers ON landing_page;
CREATE TRIGGER trg_landing_page_pointers BEFORE INSERT OR UPDATE ON landing_page
  FOR EACH ROW EXECUTE FUNCTION landing_page_pointers_consistent();
DROP TRIGGER IF EXISTS trg_landing_page_revision_immutable ON landing_page_revision;
CREATE TRIGGER trg_landing_page_revision_immutable BEFORE UPDATE ON landing_page_revision
  FOR EACH ROW EXECUTE FUNCTION chan_sua_version_bat_bien();
DROP TRIGGER IF EXISTS trg_touch_landing_page ON landing_page;
CREATE TRIGGER trg_touch_landing_page BEFORE UPDATE ON landing_page FOR EACH ROW EXECUTE FUNCTION touch_row();
DROP TRIGGER IF EXISTS trg_touch_landing_page_revision ON landing_page_revision;
CREATE TRIGGER trg_touch_landing_page_revision BEFORE UPDATE ON landing_page_revision FOR EACH ROW EXECUTE FUNCTION touch_row();

CREATE OR REPLACE FUNCTION marketing_set_landing_page_draft(p_tenant_id uuid, p_page_id uuid, p_revision_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM landing_page_revision WHERE id = p_revision_id AND page_id = p_page_id AND tenant_id = p_tenant_id AND status = 'DRAFT') THEN
    RAISE EXCEPTION 'revision is not a draft of this landing page';
  END IF;
  UPDATE landing_page SET draft_revision_id = p_revision_id WHERE id = p_page_id;
END $$;
REVOKE ALL ON FUNCTION marketing_set_landing_page_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_set_landing_page_draft(uuid,uuid,uuid) TO garageos_app;

CREATE OR REPLACE FUNCTION marketing_promote_landing_page_draft(p_tenant_id uuid, p_page_id uuid, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_draft uuid; v_old uuid;
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT draft_revision_id, published_revision_id INTO v_draft, v_old FROM landing_page WHERE id = p_page_id FOR UPDATE;
  IF v_draft IS NULL THEN RAISE EXCEPTION 'no draft to publish'; END IF;
  IF v_old IS NOT NULL THEN UPDATE landing_page_revision SET status = 'SUPERSEDED' WHERE id = v_old AND status = 'PUBLISHED'; END IF;
  UPDATE landing_page_revision SET status = 'PUBLISHED', published_at = now(), published_by = p_actor, updated_by = p_actor
    WHERE id = v_draft AND status = 'DRAFT';
  UPDATE landing_page SET published_revision_id = v_draft, draft_revision_id = NULL WHERE id = p_page_id;
  RETURN v_draft;
END $$;
REVOKE ALL ON FUNCTION marketing_promote_landing_page_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_promote_landing_page_draft(uuid,uuid,uuid) TO garageos_app;

CREATE TABLE IF NOT EXISTS landing_preview_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  page_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, page_id) REFERENCES landing_page(tenant_id, id),
  FOREIGN KEY (tenant_id, revision_id) REFERENCES landing_page_revision(tenant_id, id),
  UNIQUE (tenant_id, id)
);

DO $$ BEGIN CREATE ROLE landing_preview_resolver NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER ROLE landing_preview_resolver NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
REVOKE ALL ON landing_preview_session FROM garageos_app;
GRANT SELECT ON landing_preview_session TO landing_preview_resolver;
CREATE OR REPLACE FUNCTION resolve_landing_preview_session(p_token_hash text)
RETURNS TABLE (tenant_id uuid, revision_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.tenant_id, s.revision_id FROM landing_preview_session s
   WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now() LIMIT 1;
$$;
ALTER FUNCTION resolve_landing_preview_session(text) OWNER TO landing_preview_resolver;
REVOKE ALL ON FUNCTION resolve_landing_preview_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_landing_preview_session(text) TO garageos_app;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['landing_page', 'landing_page_revision', 'landing_preview_session'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON landing_page, landing_page_revision TO garageos_app;
GRANT UPDATE (document, content_hash, updated_by, updated_at, version) ON landing_page_revision TO garageos_app;
REVOKE UPDATE, DELETE ON landing_page, landing_page_revision, landing_preview_session FROM garageos_app;
GRANT INSERT ON landing_preview_session TO garageos_app;
