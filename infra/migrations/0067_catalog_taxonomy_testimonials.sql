-- Flat marketing taxonomy and admin-curated testimonials. Both are tenant-scoped.
DO $$ BEGIN CREATE TYPE catalog_category_status AS ENUM ('ACTIVE','HIDDEN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE testimonial_status AS ENUM ('DRAFT','PUBLISHED','HIDDEN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vehicle_product_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id),
  name text NOT NULL, slug text NOT NULL, description text, image_media_id uuid, status catalog_category_status NOT NULL DEFAULT 'ACTIVE',
  sort_order int NOT NULL DEFAULT 0, seo_title text, seo_description text, created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,slug), CONSTRAINT category_sort_nonnegative CHECK (sort_order >= 0),
  FOREIGN KEY (tenant_id,image_media_id) REFERENCES media_asset(tenant_id,id)
);
ALTER TABLE vehicle_product ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE vehicle_product DROP CONSTRAINT IF EXISTS vehicle_product_category_fk;
ALTER TABLE vehicle_product ADD CONSTRAINT vehicle_product_category_fk FOREIGN KEY (tenant_id,category_id) REFERENCES vehicle_product_category(tenant_id,id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS testimonial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id), display_name text NOT NULL, content text NOT NULL,
  rating smallint, vehicle_id uuid, featured boolean NOT NULL DEFAULT false, sort_order int NOT NULL DEFAULT 0,
  status testimonial_status NOT NULL DEFAULT 'DRAFT', created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id,vehicle_id) REFERENCES vehicle_product(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT testimonial_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), CONSTRAINT testimonial_sort_nonnegative CHECK (sort_order >= 0)
);
CREATE INDEX IF NOT EXISTS testimonial_published_sort ON testimonial(tenant_id, sort_order, created_at) WHERE status = 'PUBLISHED';

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['vehicle_product_category','testimonial'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',t);
  EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()',t,t);
END LOOP; END $$;
GRANT SELECT, INSERT, UPDATE ON vehicle_product_category, testimonial TO garageos_app;
