-- =============================================================================
-- 0079_bieu_mau_lead — cấu hình biểu mẫu thu nhu cầu, và LỊCH SỬ câu đồng ý
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.10 (`lead_form`, `lead_form_field`)
-- Bất biến: INV-T-01 (cô lập tenant), NFR-PRIV-001 (lưu phiên bản consent)
--
-- 🔒 Phần quan trọng nhất của migration này KHÔNG phải cấu hình biểu mẫu — nó là
--    LỊCH SỬ câu đồng ý.
--
--    `sales_lead.consent_version` đang được ghi bằng một HẰNG SỐ trong mã
--    (`LEAD_CONSENT_VERSION = '2026-08-1'`), và bản thân câu chữ thì nằm trong
--    JSX của `lead-form.tsx`. Nghĩa là: hệ thống lưu "khách đã đồng ý phiên bản
--    2026-08-1" mà KHÔNG lưu ở đâu phiên bản đó nói gì. Sửa câu chữ mà quên đổi
--    hằng số thì mọi lead cũ lẫn mới cùng mang một nhãn cho hai nội dung khác
--    nhau — và đó chính là thứ NĐ 13/2023 đòi chứng minh được.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_form (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  /** Mã ổn định để mã nguồn trỏ tới. Hiện chỉ có `LANDING`. */
  code               text NOT NULL,
  success_title      text NOT NULL DEFAULT 'Đã nhận yêu cầu',
  success_body       text NOT NULL DEFAULT 'Showroom sẽ liên hệ trong giờ làm việc.',
  /** Ô "Lời nhắn" — tuỳ chọn, một số showroom muốn bỏ cho form ngắn lại. */
  show_message_field boolean NOT NULL DEFAULT true,
  /** Ô chọn chi nhánh. Tắt khi chỉ có một showroom. */
  show_branch_field  boolean NOT NULL DEFAULT true,
  created_by         uuid NOT NULL,
  updated_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CONSTRAINT lead_form_code CHECK (code ~ '^[A-Z_]+$'),
  CONSTRAINT lead_form_success_title_not_blank CHECK (btrim(success_title) <> '')
);

/*
 * 🔒 KHÔNG có bảng `lead_form_field` ở migration này, dù SRS liệt kê nó.
 *
 * Trường tự do đòi ba thứ cùng lúc: một cột jsonb trên `sales_lead` để chứa câu
 * trả lời, một bộ kiểm động ở API, và một chỗ hiển thị chúng trong màn Lead.
 * Thiếu bất kỳ thứ nào trong ba thì biên tập viên khai được một ô mà câu trả lời
 * của khách rơi vào hư vô — đúng thứ `PendingEndpoint` cảnh báo.
 *
 * Hai công tắc phẳng ở trên phủ được nhu cầu thật đang thấy (form ngắn lại khi
 * chỉ có một showroom). Trường tự do làm cùng lúc với ba thứ kia, không sớm hơn.
 */

CREATE TABLE IF NOT EXISTS lead_form_consent_version (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant(id),
  form_id        uuid NOT NULL,
  /** Nhãn phiên bản, ghi vào `sales_lead.consent_version`. */
  version        text NOT NULL,
  /** Câu chữ khách nhìn thấy và tick vào. */
  body           text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, form_id, version),
  FOREIGN KEY (tenant_id, form_id) REFERENCES lead_form(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT consent_version_not_blank CHECK (btrim(version) <> ''),
  CONSTRAINT consent_body_not_blank CHECK (btrim(body) <> '')
);

CREATE INDEX IF NOT EXISTS consent_version_hieu_luc
  ON lead_form_consent_version(tenant_id, form_id, effective_from DESC);

/*
 * 🔒 Bảng này CHỈ-THÊM. Không UPDATE, không DELETE cho `garageos_app`.
 *
 * Cùng lý do với `audit_log` và `vehicle_price_log` (INV-S-03): một dòng ở đây
 * là bằng chứng "ngày đó khách đồng ý với câu này". Sửa được nó thì nó không
 * còn là bằng chứng nữa — nó chỉ là ý kiến hiện tại của người sửa. Đổi câu chữ
 * thì thêm một phiên bản mới; lead cũ vẫn trỏ về phiên bản cũ, và câu cũ vẫn
 * đọc lại được.
 */

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lead_form','lead_form_consent_version'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

CREATE TRIGGER trg_touch_lead_form BEFORE UPDATE ON lead_form
  FOR EACH ROW EXECUTE FUNCTION touch_row();

/* Chặn sửa/xoá bằng trigger, không chỉ bằng GRANT — cùng khuôn với 0074. */
CREATE OR REPLACE FUNCTION chan_sua_consent_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'garageos' THEN
    RAISE EXCEPTION 'Phiên bản câu đồng ý là bằng chứng, chỉ được thêm (NFR-PRIV-001)';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_consent_version_chi_them ON lead_form_consent_version;
CREATE TRIGGER trg_consent_version_chi_them BEFORE UPDATE OR DELETE ON lead_form_consent_version
  FOR EACH ROW EXECUTE FUNCTION chan_sua_consent_version();

-- --- Quyền -------------------------------------------------------------------
GRANT SELECT, INSERT ON lead_form TO garageos_app;
GRANT UPDATE (success_title, success_body, show_message_field, show_branch_field, updated_by)
  ON lead_form TO garageos_app;
/* `code` không cấp: mã nguồn trỏ tới nó, đổi được là gãy chỗ tra cứu. */

GRANT SELECT, INSERT ON lead_form_consent_version TO garageos_app;
REVOKE UPDATE, DELETE ON lead_form_consent_version FROM garageos_app;
