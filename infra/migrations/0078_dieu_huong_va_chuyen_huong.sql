-- =============================================================================
-- 0078_dieu_huong_va_chuyen_huong — menu đầu trang/chân trang và bảng chuyển hướng
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.10 (`site_navigation`, `site_redirect`)
-- Bất biến: INV-T-01 (cô lập tenant)
--
-- Menu của landing đang là JSX viết cứng trong `site-header.tsx` và
-- `site-footer.tsx`. Thêm một mục là một lần deploy, và một showroom muốn đổi
-- thứ tự hai mục phải nhờ lập trình viên.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE nav_placement AS ENUM ('HEADER','FOOTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/*
 * 🔒 KHÔNG có bảng `site_page` ở migration này, và đó là chủ ý.
 *
 * SRS §4.10 liệt kê `site_page` cùng nhóm với hai bảng dưới đây. Nhưng landing
 * hiện có bốn trang và cả bốn đều là trang CÓ MÃ (`/`, `/xe`, `/tin-tuc`,
 * `/lien-he`) — không trang nào sinh từ dữ liệu. Dựng sẵn một bảng trang mà
 * không có trình render trang tuỳ biến sẽ cho ra đúng thứ mà `PendingEndpoint`
 * cảnh báo: một màn nhập liệu lưu vào chỗ không ai đọc.
 *
 * Điều hướng thì khác — nó trỏ tới những trang ĐÃ CÓ THẬT, nên nó dùng được
 * ngay. Bảng trang thêm cùng lúc với trình render trang, không sớm hơn.
 */

CREATE TABLE IF NOT EXISTS site_navigation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  placement     nav_placement NOT NULL,
  /** Cột chân trang (0,1,2). Menu đầu trang luôn 0 — nó là một hàng. */
  column_index  int NOT NULL DEFAULT 0,
  label         text NOT NULL,
  /** Đường dẫn nội bộ, ví dụ `/xe` hoặc `/lien-he?nhu-cau=lai-thu`. */
  path          text,
  external_url  text,
  display_order int NOT NULL DEFAULT 0,
  visible       boolean NOT NULL DEFAULT true,
  created_by    uuid NOT NULL,
  updated_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  CONSTRAINT nav_label_not_blank CHECK (btrim(label) <> ''),
  CONSTRAINT nav_column_range CHECK (column_index BETWEEN 0 AND 2),
  CONSTRAINT nav_sort_nonnegative CHECK (display_order >= 0),
  /*
   * 🔒 Đúng MỘT đích, và phải có một đích.
   *
   * Không có đích thì mục menu là một chữ không bấm được — người dùng bấm và
   * không có gì xảy ra, đó là loại hỏng không ai báo lỗi. Có cả hai thì render
   * phải chọn, và mỗi chỗ render sẽ chọn khác nhau.
   */
  CONSTRAINT nav_dung_mot_dich CHECK (num_nonnulls(path, external_url) = 1),
  /*
   * Đường dẫn nội bộ phải bắt đầu bằng `/`. Một `path` là `xe` sẽ được trình
   * duyệt hiểu là tương đối, nên cùng một mục menu dẫn tới `/tin-tuc/xe` khi
   * bấm từ trang bài viết.
   */
  CONSTRAINT nav_path_tuyet_doi CHECK (path IS NULL OR path ~ '^/'),
  CONSTRAINT nav_url_ngoai CHECK (external_url IS NULL OR external_url ~ '^https?://')
);

CREATE INDEX IF NOT EXISTS site_navigation_hien
  ON site_navigation(tenant_id, placement, column_index, display_order) WHERE visible;

CREATE TABLE IF NOT EXISTS site_redirect (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  from_path   text NOT NULL,
  to_path     text NOT NULL,
  status_code int NOT NULL DEFAULT 301,
  note        text,
  created_by  uuid NOT NULL,
  updated_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, from_path),
  CONSTRAINT redirect_from_tuyet_doi CHECK (from_path ~ '^/'),
  CONSTRAINT redirect_to_dich CHECK (to_path ~ '^/' OR to_path ~ '^https?://'),
  CONSTRAINT redirect_ma CHECK (status_code IN (301, 302)),
  /*
   * 🔒 Chặn vòng lặp một bước ngay tại ràng buộc.
   *
   * `/a → /a` là một trang không bao giờ tải xong, và trình duyệt báo
   * ERR_TOO_MANY_REDIRECTS chứ không nói tại dòng nào. Vòng dài hơn (a→b→a) thì
   * ràng buộc này không thấy được — nó được canh ở tầng service, và ghi rõ ở đó.
   */
  CONSTRAINT redirect_khong_tu_tro CHECK (from_path <> to_path)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['site_navigation','site_redirect'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
  END LOOP;
END $$;

-- --- Quyền -------------------------------------------------------------------
-- UPDATE theo cột; `updated_at`/`version` do trigger gán nên không cấp (0071).
GRANT SELECT, INSERT, DELETE ON site_navigation TO garageos_app;
GRANT UPDATE (placement, column_index, label, path, external_url, display_order,
              visible, updated_by)
  ON site_navigation TO garageos_app;

GRANT SELECT, INSERT, DELETE ON site_redirect TO garageos_app;
GRANT UPDATE (from_path, to_path, status_code, note, updated_by)
  ON site_redirect TO garageos_app;
