-- =============================================================================
-- 0077_bai_viet — bài viết trên landing, có chuyên mục và vòng nháp/duyệt
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.10 (`article`, `article_revision`,
--                `article_category`, `article_tag`)
-- Bất biến: INV-T-01 (cô lập tenant), INV-LS-07 (bản đã publish là bất biến),
--           INV-LS-10 (cấm HTML/CSS/JS tự do trong nội dung)
--
-- 🔒 `article_revision.body_document` dùng LẠI đúng định dạng jsonb có schema
--    của `RichTextDocumentV1` (0068) — cùng bộ khối được phép, cùng bộ kiểm ở
--    `packages/contracts`. Nên `INV-LS-10` áp nguyên vẹn mà không cần viết bộ
--    kiểm thứ hai. Một định dạng nội dung thứ hai là một bề mặt XSS thứ hai, và
--    nó sẽ được kiểm bởi một bộ luật khác — tức là sớm muộn cũng lệch.
-- =============================================================================

CREATE TABLE IF NOT EXISTS article_category (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  name          text NOT NULL,
  slug          text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL,
  updated_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug),
  CONSTRAINT article_category_slug CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT article_category_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT article_category_sort_nonnegative CHECK (display_order >= 0)
);

CREATE TABLE IF NOT EXISTS article (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(id),
  slug                  text NOT NULL,
  category_id           uuid,
  cover_media_id        uuid,
  featured              boolean NOT NULL DEFAULT false,
  draft_revision_id     uuid,
  published_revision_id uuid,
  published_at          timestamptz,
  created_by            uuid NOT NULL,
  updated_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug),
  FOREIGN KEY (tenant_id, category_id) REFERENCES article_category(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, cover_media_id) REFERENCES media_asset(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT article_slug CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  /*
   * `published_at` là mốc CÔNG BỐ LẦN ĐẦU, không phải mốc sửa gần nhất — nó là
   * ngày in trên bài, và một bài sửa lại chính tả không được nhảy lên đầu danh
   * sách. Chỉ có nghĩa khi đã có bản publish.
   */
  CONSTRAINT article_published_at_needs_publication CHECK (
    published_at IS NULL OR published_revision_id IS NOT NULL
  )
);

/*
 * 🔒 ĐÚNG MỘT bài nổi bật mỗi tenant — SRS §4.10.
 *
 * Bài nổi bật là CHỖ tràn viền ở đầu trang Tin tức, một chỗ, không phải một
 * danh sách. Enforce bằng partial unique index chứ không bằng lời nhắc trong
 * giao diện: giao diện chỉ ngăn được người bấm qua giao diện.
 *
 * Hệ quả có chủ ý: đặt bài B nổi bật khi bài A đang nổi bật sẽ LỖI, không âm
 * thầm gỡ A. Ứng dụng phải gỡ A trước — và như thế người dùng biết mình vừa
 * thay cái gì.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_article_one_featured
  ON article(tenant_id) WHERE featured;

CREATE TABLE IF NOT EXISTS article_revision (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  article_id      uuid NOT NULL,
  revision_number int NOT NULL,
  status          revision_status NOT NULL DEFAULT 'DRAFT',
  schema_version  int NOT NULL DEFAULT 1,
  title           text NOT NULL,
  excerpt         text,
  body_document   jsonb NOT NULL,
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

  FOREIGN KEY (tenant_id, article_id) REFERENCES article(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, article_id, revision_number),
  CONSTRAINT article_revision_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT article_revision_body_object CHECK (jsonb_typeof(body_document) = 'object'),
  CONSTRAINT article_revision_published_fields CHECK (
    status NOT IN ('PUBLISHED', 'SUPERSEDED') OR (published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_article_one_draft
  ON article_revision(article_id) WHERE status = 'DRAFT';

ALTER TABLE article DROP CONSTRAINT IF EXISTS article_draft_fk;
ALTER TABLE article ADD CONSTRAINT article_draft_fk
  FOREIGN KEY (tenant_id, draft_revision_id) REFERENCES article_revision(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE article DROP CONSTRAINT IF EXISTS article_published_fk;
ALTER TABLE article ADD CONSTRAINT article_published_fk
  FOREIGN KEY (tenant_id, published_revision_id) REFERENCES article_revision(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;

/*
 * Con trỏ phải trỏ đúng LOẠI bản. Khoá ngoại chỉ bảo đảm "bản này tồn tại và
 * cùng tenant"; nó không ngăn `published_revision_id` trỏ vào một bản nháp.
 * Cùng khuôn với `landing_page` (0066).
 */
CREATE OR REPLACE FUNCTION kiem_con_tro_bai_viet() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.draft_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM article_revision r
     WHERE r.id = NEW.draft_revision_id AND r.article_id = NEW.id AND r.status = 'DRAFT'
  ) THEN RAISE EXCEPTION 'draft_revision_id không phải bản nháp của bài này'; END IF;
  IF NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM article_revision r
     WHERE r.id = NEW.published_revision_id AND r.article_id = NEW.id AND r.status = 'PUBLISHED'
  ) THEN RAISE EXCEPTION 'published_revision_id không phải bản đã publish của bài này'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_article_pointers ON article;
CREATE TRIGGER trg_article_pointers BEFORE INSERT OR UPDATE ON article
  FOR EACH ROW EXECUTE FUNCTION kiem_con_tro_bai_viet();

DROP TRIGGER IF EXISTS trg_article_revision_immutable ON article_revision;
CREATE TRIGGER trg_article_revision_immutable BEFORE UPDATE ON article_revision
  FOR EACH ROW EXECUTE FUNCTION chan_sua_version_bat_bien();

CREATE TABLE IF NOT EXISTS article_tag (
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  article_id uuid NOT NULL,
  tag        text NOT NULL,

  PRIMARY KEY (article_id, tag),
  FOREIGN KEY (tenant_id, article_id) REFERENCES article(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT article_tag_not_blank CHECK (btrim(tag) <> '')
);

CREATE INDEX IF NOT EXISTS article_published_list
  ON article(tenant_id, published_at DESC) WHERE published_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS article_tag_lookup ON article_tag(tenant_id, tag);

-- --- Xuất bản: một hàm, một transaction ---------------------------------------
/*
 * 🔒 `SET search_path = public, pg_temp` — KHÔNG chỉ `public`.
 *
 * Postgres luôn tìm `pg_temp` trước cho bảng trừ khi schema đó được liệt kê
 * tường minh ở chỗ khác. Hàm `SECURITY DEFINER` chạy bằng quyền người tạo, nên
 * kẻ gọi chỉ cần `CREATE TEMP TABLE article (...)` là mọi câu lệnh trong hàm
 * trỏ vào bảng của họ — với quyền owner. 0053 đã sửa đúng lỗi này một lần cho
 * cả hệ, 0075 sửa lần thứ hai cho ba hàm của trình soạn trang.
 */
CREATE OR REPLACE FUNCTION marketing_promote_article_draft(
  p_tenant_id uuid, p_article_id uuid, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_draft uuid; v_cu uuid; v_da_dang timestamptz;
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;
  SELECT draft_revision_id, published_revision_id, published_at
    INTO v_draft, v_cu, v_da_dang
    FROM article WHERE id = p_article_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_draft IS NULL THEN RAISE EXCEPTION 'không có bản nháp để publish'; END IF;

  IF v_cu IS NOT NULL THEN
    UPDATE article_revision SET status = 'SUPERSEDED' WHERE id = v_cu AND status = 'PUBLISHED';
  END IF;
  UPDATE article_revision
     SET status = 'PUBLISHED', published_at = now(), published_by = p_actor, updated_by = p_actor
   WHERE id = v_draft AND status = 'DRAFT';

  /*
   * `published_at` của BÀI chỉ đặt một lần, ở lần publish đầu tiên. Bản sửa sau
   * có `published_at` riêng trên revision; ngày in trên bài thì không đổi.
   */
  UPDATE article
     SET published_revision_id = v_draft,
         draft_revision_id = NULL,
         published_at = COALESCE(v_da_dang, now()),
         updated_by = p_actor
   WHERE id = p_article_id;
  RETURN v_draft;
END $$;
REVOKE ALL ON FUNCTION marketing_promote_article_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_promote_article_draft(uuid,uuid,uuid) TO garageos_app;

CREATE OR REPLACE FUNCTION marketing_set_article_draft(
  p_tenant_id uuid, p_article_id uuid, p_revision_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.tenant_id', true)::uuid IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM article_revision
     WHERE id = p_revision_id AND article_id = p_article_id
       AND tenant_id = p_tenant_id AND status = 'DRAFT'
  ) THEN RAISE EXCEPTION 'bản này không phải bản nháp của bài đó'; END IF;
  UPDATE article SET draft_revision_id = p_revision_id WHERE id = p_article_id;
END $$;
REVOKE ALL ON FUNCTION marketing_set_article_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_set_article_draft(uuid,uuid,uuid) TO garageos_app;

-- --- RLS và trigger ----------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['article_category','article','article_revision','article_tag'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['article_category','article','article_revision'] LOOP
    EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
  END LOOP;
END $$;

-- --- Quyền -------------------------------------------------------------------
/*
 * UPDATE khai THEO CỘT ở cả ba bảng — `GRANT UPDATE ON <bảng>` cho phép sửa
 * `tenant_id`, tức chuyển một bản ghi sang doanh nghiệp khác bằng một câu UPDATE
 * (INV-T-01). `updated_at`/`version` KHÔNG cấp: quyền theo cột chỉ được kiểm
 * trên danh sách `SET` của câu lệnh, không trên những gì trigger gán (đo ở 0071).
 */
GRANT SELECT, INSERT, DELETE ON article_category TO garageos_app;
GRANT UPDATE (name, slug, display_order, updated_by) ON article_category TO garageos_app;

GRANT SELECT, INSERT, DELETE ON article TO garageos_app;
GRANT UPDATE (slug, category_id, cover_media_id, featured, draft_revision_id,
              published_revision_id, published_at, updated_by)
  ON article TO garageos_app;

/*
 * 🔒 KHÔNG cấp DELETE trên `article_revision`, và không cấp UPDATE lên `status`.
 *
 * Bản đã publish là bất biến (INV-LS-07) — trigger `chan_sua_version_bat_bien`
 * canh điều đó, nhưng trigger canh NỘI DUNG. Xoá cả dòng thì không còn gì để
 * canh: lịch sử xuất bản của một bài là bằng chứng "ngày đó trang nói gì", và
 * nó phải sống lâu hơn ý muốn của người sửa.
 *
 * Đổi `status` chỉ đi qua `marketing_promote_article_draft` — một hàm, một
 * transaction, cả gỡ bản cũ lẫn đặt bản mới.
 */
GRANT SELECT, INSERT ON article_revision TO garageos_app;
GRANT UPDATE (title, excerpt, body_document, seo_title, seo_description,
              content_hash, updated_by)
  ON article_revision TO garageos_app;

GRANT SELECT, INSERT, DELETE ON article_tag TO garageos_app;
