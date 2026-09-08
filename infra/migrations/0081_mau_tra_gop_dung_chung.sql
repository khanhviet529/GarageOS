-- =============================================================================
-- 0081_mau_tra_gop_dung_chung — thư viện chương trình trả góp ở cấp TENANT
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.3; màn *Ngân hàng liên kết* trong sales-admin
-- Bất biến: INV-T-01 (cô lập tenant), INV-LS-13 (nội dung revision đã publish là
--           bất biến)
--
-- `financing_program` (0072) gắn vào `product_revision_id`: cùng một chương
-- trình của Techcombank phải nhập lại cho mỗi mẫu xe, và khi lãi suất đổi thì
-- phải sửa ở từng chỗ. Đó là lời than ghi thẳng trong màn vỏ.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔒 Mẫu là NGUỒN ĐỂ CHÉP, không phải nguồn để ĐỌC LÚC HIỂN THỊ.
--
-- Cách làm hiển nhiên hơn — cho `financing_program` trỏ tới mẫu và đọc lãi suất
-- từ mẫu lúc render — sẽ VI PHẠM INV-LS-13: nội dung của một revision đã publish
-- phải bất biến. Sửa lãi suất trong thư viện sẽ đổi con số trên mọi trang xe đã
-- xuất bản, không qua một lần publish nào, không ai duyệt, không có dấu vết.
-- Với một con số mà khách in ra mang tới ngân hàng thì đó là hỏng chứ không phải
-- tiện.
--
-- Nên mẫu được CHÉP vào revision, và `template_id` giữ lại để trả lời được câu
-- "mẫu đã đổi, xe nào đang dùng bản cũ" — lệch nhìn thấy được thay vì lệch âm
-- thầm. Cập nhật vẫn là một thao tác có chủ đích, đi qua nháp và publish.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financing_program_template (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(id),
  bank_name               text NOT NULL,
  bank_logo_media_id      uuid,
  min_down_payment_bp     int NOT NULL,
  promo_rate_bp           int NOT NULL,
  promo_months            int NOT NULL DEFAULT 0,
  standard_rate_bp        int NOT NULL,
  allowed_terms_months    int[] NOT NULL,
  down_payment_options_bp int[] NOT NULL,
  rate_updated_at         date NOT NULL,
  display_order           int NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid NOT NULL,
  updated_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, bank_name),
  /*
   * Cùng bộ ràng buộc với `financing_program` (0072). Chép ràng buộc thay vì để
   * mẫu lỏng hơn bản chép: một mẫu không hợp lệ sẽ đẻ ra bản chép không hợp lệ ở
   * mọi mẫu xe áp nó, và lỗi hiện ra ở chỗ chép chứ không ở chỗ nhập.
   */
  CONSTRAINT tpl_bank_name_not_blank CHECK (btrim(bank_name) <> ''),
  CONSTRAINT tpl_min_down_payment CHECK (min_down_payment_bp BETWEEN 0 AND 10000),
  CONSTRAINT tpl_promo_rate CHECK (promo_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT tpl_standard_rate CHECK (standard_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT tpl_promo_months CHECK (promo_months BETWEEN 0 AND 120),
  CONSTRAINT tpl_terms_not_empty CHECK (cardinality(allowed_terms_months) > 0),
  CONSTRAINT tpl_down_options_not_empty CHECK (cardinality(down_payment_options_bp) > 0),
  CONSTRAINT tpl_sort_nonnegative CHECK (display_order >= 0)
);

/*
 * Bản chép nhớ mình đến từ đâu. `ON DELETE SET NULL`: xoá mẫu khỏi thư viện
 * KHÔNG được gỡ chương trình trả góp khỏi những mẫu xe đang chào nó — con số đã
 * công bố không biến mất vì một thao tác dọn dẹp ở màn khác.
 */
ALTER TABLE financing_program ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE financing_program DROP CONSTRAINT IF EXISTS financing_program_template_fk;
ALTER TABLE financing_program
  ADD CONSTRAINT financing_program_template_fk
  FOREIGN KEY (tenant_id, template_id)
  REFERENCES financing_program_template(tenant_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS financing_program_theo_mau
  ON financing_program(tenant_id, template_id) WHERE template_id IS NOT NULL;

ALTER TABLE financing_program_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE financing_program_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financing_program_template
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER trg_touch_financing_program_template BEFORE UPDATE ON financing_program_template
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- --- Quyền -------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON financing_program_template TO garageos_app;
GRANT UPDATE (bank_name, bank_logo_media_id, min_down_payment_bp, promo_rate_bp,
              promo_months, standard_rate_bp, allowed_terms_months,
              down_payment_options_bp, rate_updated_at, display_order, is_active,
              updated_by)
  ON financing_program_template TO garageos_app;

/* Bản chép cần ghi được `template_id` khi áp mẫu. */
GRANT UPDATE (template_id) ON financing_program TO garageos_app;
