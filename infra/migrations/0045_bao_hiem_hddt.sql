-- =============================================================================
-- 0045 — Hồ sơ bồi thường bảo hiểm và hoá đơn điện tử (Phase 3.4 / 3.6)
--
-- 💡 Hồ sơ bồi thường có VÒNG ĐỜI RIÊNG, dài hơn đơn sửa chữa (BC-08 mục 3).
--
-- Xe đã bàn giao xong từ lâu mà bảo hiểm mới chuyển tiền sau 30–60 ngày. Đây là
-- lý do `insurance_claim` KHÔNG nằm trong aggregate `RepairOrder`: gắn vào đó
-- thì đơn sửa chữa không bao giờ "đóng" được, và mọi báo cáo thời gian sửa
-- chữa sẽ tính cả những tuần chờ một công ty khác duyệt giấy tờ.
--
-- 🔒 Và bước quan trọng nhất của BC-08 mục 4: BÀN GIAO XE TRƯỚC, BẢO HIỂM TRẢ
--    SAU. Khách trả phần của khách là đủ để lấy xe; phần bảo hiểm nằm lại thành
--    công nợ phải thu. Bắt khách chờ bảo hiểm là giữ xe người ta vì việc của
--    một bên thứ ba.
-- =============================================================================

CREATE TYPE insurance_claim_status AS ENUM (
  'DRAFT',              -- khách khai có bảo hiểm lúc tiếp nhận
  'SUBMITTED',          -- đã gửi hồ sơ cho công ty bảo hiểm
  'SURVEYED',           -- giám định viên đã xem xe
  'APPROVED',
  'PARTIALLY_APPROVED', -- duyệt một phần — phần còn lại khách chịu
  'REJECTED',
  'SETTLED',            -- bảo hiểm đã chuyển tiền
  'CANCELLED'
);

CREATE TABLE insurance_claim (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  repair_order_id uuid NOT NULL,

  insurer_name    text NOT NULL,
  policy_number   text NOT NULL,
  /** Số hồ sơ bồi thường do bảo hiểm cấp — chỉ có sau khi gửi */
  claim_number    text,

  /** 🔒 Mức khấu trừ KHÁCH chịu theo hợp đồng, dù hạng mục thuộc phạm vi */
  deductible_amount bigint NOT NULL DEFAULT 0,
  /** Số tiền bảo hiểm chấp thuận sau giám định */
  approved_amount bigint,

  status          insurance_claim_status NOT NULL DEFAULT 'DRAFT',
  submitted_at    timestamptz,
  surveyed_at     timestamptz,
  approved_at     timestamptz,
  settled_at      timestamptz,
  rejection_reason text,

  created_by_user_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  -- Một đơn sửa chữa, một hồ sơ bồi thường. Hai hồ sơ cho một xe va chạm là hai
  -- lần đòi tiền cho cùng một thiệt hại.
  UNIQUE (tenant_id, repair_order_id),
  FOREIGN KEY (tenant_id, repair_order_id)    REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT claim_amounts_non_negative
    CHECK (deductible_amount >= 0 AND (approved_amount IS NULL OR approved_amount >= 0)),
  CONSTRAINT claim_within_safe_range
    CHECK (deductible_amount BETWEEN 0 AND 9007199254740991
       AND (approved_amount IS NULL OR approved_amount BETWEEN 0 AND 9007199254740991)),
  CONSTRAINT claim_rejected_needs_reason
    CHECK (status <> 'REJECTED' OR length(btrim(rejection_reason)) >= 5),
  -- Đã duyệt thì phải có con số. "Bảo hiểm đồng ý" mà không biết đồng ý bao
  -- nhiêu là thông tin không dùng được vào việc gì.
  CONSTRAINT claim_approved_needs_amount
    CHECK (status NOT IN ('APPROVED', 'PARTIALLY_APPROVED', 'SETTLED')
           OR approved_amount IS NOT NULL),
  CONSTRAINT claim_submitted_needs_time
    CHECK (status = 'DRAFT' OR status = 'CANCELLED' OR submitted_at IS NOT NULL)
);

CREATE INDEX idx_claim_cho_xu_ly
  ON insurance_claim (tenant_id, status)
  WHERE status NOT IN ('SETTLED', 'REJECTED', 'CANCELLED');

CREATE TRIGGER trg_touch_insurance_claim
  BEFORE UPDATE ON insurance_claim FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_log_status_insurance_claim
  AFTER UPDATE OF status ON insurance_claim
  FOR EACH ROW EXECUTE FUNCTION log_status_change();

/* Dòng hoá đơn thuộc hồ sơ bồi thường nào — BC-08 mục 3 */
ALTER TABLE invoice_line
  ADD COLUMN insurance_claim_id uuid,
  ADD CONSTRAINT invoice_line_claim_fk
    FOREIGN KEY (tenant_id, insurance_claim_id) REFERENCES insurance_claim(tenant_id, id);

GRANT UPDATE (insurance_claim_id) ON invoice_line TO garageos_app;

-- =============================================================================
-- Hoá đơn điện tử — ADR-0005
--
-- 🔒 Điều quan trọng nhất của bảng này nằm ở chỗ nó KHÔNG làm: nó không chặn
--    được gì cả.
--
-- BC-07 mục 6.3: nhà cung cấp hoá đơn điện tử treo thì hoá đơn nội bộ VẪN
-- `ISSUED`. Không để lỗi của bên thứ ba chặn việc bàn giao xe — khách đang đứng
-- ở quầy với chìa khoá trong tay, và họ không quan tâm máy chủ của ai đang hỏng.
--
-- ⚠️ Giai đoạn 1 chỉ có bản giả lập. Tích hợp thật khi có khách hàng cụ thể —
--    mỗi khách dùng một nhà cung cấp khác nhau, và đó chính là lý do có adapter.
-- =============================================================================

CREATE TYPE e_invoice_status AS ENUM ('PENDING', 'ISSUED', 'FAILED', 'CANCELLED');

CREATE TABLE e_invoice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  invoice_id      uuid NOT NULL,

  provider        text NOT NULL,
  /** Số hoá đơn do nhà cung cấp cấp — KHÁC mã nội bộ `invoice.code` */
  provider_invoice_no text,
  /** Mã cơ quan thuế cấp */
  tax_authority_code text,

  status          e_invoice_status NOT NULL DEFAULT 'PENDING',
  request_payload  jsonb,
  response_payload jsonb,
  error_message   text,
  /** Đã thử gửi bao nhiêu lần — để biết khi nào nên dừng tự động retry */
  attempt_count   integer NOT NULL DEFAULT 0,
  issued_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, invoice_id),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice(tenant_id, id),

  CONSTRAINT einvoice_issued_needs_no
    CHECK (status <> 'ISSUED' OR provider_invoice_no IS NOT NULL),
  CONSTRAINT einvoice_failed_needs_message
    CHECK (status <> 'FAILED' OR length(btrim(error_message)) >= 3)
);

CREATE TRIGGER trg_touch_e_invoice
  BEFORE UPDATE ON e_invoice FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['insurance_claim', 'e_invoice'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- `insurer_name`, `policy_number` và `repair_order_id` KHÔNG sửa được: đổi công
-- ty bảo hiểm giữa chừng là một hồ sơ khác, không phải bản cập nhật của hồ sơ này.
GRANT UPDATE (status, claim_number, deductible_amount, approved_amount,
              submitted_at, surveyed_at, approved_at, settled_at,
              rejection_reason, version)
  ON insurance_claim TO garageos_app;
REVOKE DELETE ON insurance_claim FROM garageos_app;

GRANT UPDATE (status, provider_invoice_no, tax_authority_code, response_payload,
              error_message, attempt_count, issued_at, version)
  ON e_invoice TO garageos_app;
REVOKE DELETE ON e_invoice FROM garageos_app;

COMMENT ON TABLE e_invoice IS
  'ADR-0005. Nha cung cap treo thi hoa don noi bo VAN ISSUED — khong de loi ben '
  'thu ba chan viec ban giao xe.';
