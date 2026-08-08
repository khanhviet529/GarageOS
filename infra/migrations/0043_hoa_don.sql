-- =============================================================================
-- 0043 — Hoá đơn (Phase 3.1 / 3.2, BC-07)
--
-- 💡 Nguyên tắc cốt lõi, và là toàn bộ lý do file này khó hơn vẻ ngoài:
--    HOÁ ĐƠN LẬP TỪ CÔNG VIỆC ĐÃ THỰC HIỆN, KHÔNG PHẢI TỪ BÁO GIÁ.
--
-- Giữa báo giá đã duyệt và thực tế luôn có chênh lệch: hạng mục bỏ giữa chừng,
-- phụ tùng dùng 1,2 lần số đã báo, bổ sung được duyệt sau, việc làm lại không
-- tính tiền. Lập hoá đơn từ báo giá thì ba thứ cùng sai một lúc: doanh thu, tồn
-- kho, giá vốn.
--
-- Vì vậy nguồn của mỗi dòng là CHỨNG TỪ, không phải dự định:
--
--   dòng LABOR ← work_assignment đã QC_PASSED
--   dòng PART  ← stock_movement(ISSUE) trừ đi RETURN tương ứng
--
-- 🔒 Nhưng ĐƠN GIÁ vẫn lấy từ báo giá đã duyệt. Khách đồng ý giá nào thì trả
--    giá đó, kể cả khi bảng giá đã tăng trong lúc xe nằm xưởng.
--
-- 🔒 INV-M-03 — sau ISSUED, hoá đơn BẤT BIẾN. Sửa sai bằng hoá đơn điều chỉnh,
--    không bằng UPDATE. Đây là chỗ khác biệt lớn nhất so với mọi bảng khác
--    trong hệ thống: `cancellation_settlement` cho sửa khi còn DRAFT rồi khoá;
--    hoá đơn thì khoá luôn cả những cột nghe như vô hại.
-- =============================================================================

CREATE TYPE invoice_status AS ENUM (
  'DRAFT',           -- đang dựng, sửa được
  'ISSUED',          -- đã phát hành — 🔒 từ đây là bất biến
  'PARTIALLY_PAID',  -- đã thu một phần
  'PAID',
  'ADJUSTED',        -- đã có hoá đơn điều chỉnh thay thế phần sai
  'CANCELLED'        -- huỷ khi còn DRAFT
);

/*
 * Loại dòng hoá đơn — RIÊNG, không dùng lại `line_type` của báo giá.
 *
 * Báo giá chỉ có LABOR và PART vì đó là hai thứ chào cho khách. Hoá đơn còn
 * phải chứa những khoản KHÔNG bao giờ nằm trong báo giá: phí lưu bãi (BC-15),
 * quyết toán khi huỷ đơn (BC-10). Nhét chúng vào `PART` là nói dối về bản chất
 * khoản tiền, và báo cáo cơ cấu doanh thu công/phụ tùng sẽ sai.
 */
CREATE TYPE invoice_line_type AS ENUM ('LABOR', 'PART', 'FEE');

/** Ai được DỰ KIẾN trả dòng này — BC-08 mục 3 */
CREATE TYPE payer_type AS ENUM ('CUSTOMER', 'INSURER', 'WARRANTY');

CREATE TABLE invoice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  branch_id       uuid NOT NULL,
  repair_order_id uuid NOT NULL,

  /*
   * 🔧 F-11 — `customer_id` lưu thẳng ở đây, không suy qua đơn sửa chữa.
   *
   * Báo cáo công nợ gom theo khách và quét toàn bộ hoá đơn chưa thu; bắt nó
   * join qua `repair_order` mỗi lần là bắt nó đọc một bảng lớn hơn nhiều mà
   * không cần thông tin gì trong đó.
   */
  customer_id     uuid NOT NULL,
  code            text NOT NULL,
  status          invoice_status NOT NULL DEFAULT 'DRAFT',

  /*
   * 🔒 Bản chụp thông tin khách TẠI THỜI ĐIỂM PHÁT HÀNH.
   *
   * Khách đổi tên công ty hay đổi địa chỉ vào tháng sau thì hoá đơn cũ KHÔNG
   * được đổi theo — nó là chứng từ đã giao cho người khác. Tham chiếu động tới
   * `customer` sẽ viết lại lịch sử mỗi lần ai đó sửa hồ sơ.
   */
  customer_snapshot jsonb,

  subtotal_amount bigint NOT NULL DEFAULT 0,
  discount_amount bigint NOT NULL DEFAULT 0,
  tax_amount      bigint NOT NULL DEFAULT 0,
  total_amount    bigint NOT NULL DEFAULT 0,

  issued_at       timestamptz,
  /** Hạn thanh toán = issued_at + customer.payment_term_days (BC-13) */
  due_date        timestamptz,

  /** Hoá đơn gốc mà hoá đơn này điều chỉnh — BC-07 mục 6.1 */
  adjustment_of_invoice_id uuid,
  adjustment_reason text,

  /*
   * 🔒 BR-09-3 — chênh lệch so với báo giá vượt ngưỡng thì phải giải trình
   * BẰNG VĂN BẢN mới cho phát hành.
   *
   * Ngưỡng đọc từ `tenant.invoice_variance_threshold_percent` — cột có từ
   * migration 0001 và tới trước lát cắt này CHƯA CÓ DÒNG CODE NÀO ĐỌC. Khoản
   * nợ thứ sáu cùng loại với `discount_threshold_percent` (PR-03),
   * `overissue_tolerance_percent` (2.4), `internal_labor_cost_per_hour` (5.1)
   * và `adjustment_threshold_amount` (5.4).
   */
  variance_reason text,

  created_by_user_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, branch_id)       REFERENCES branch(tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)     REFERENCES customer(tenant_id, id),
  FOREIGN KEY (tenant_id, adjustment_of_invoice_id) REFERENCES invoice(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT invoice_issued_needs_time
    CHECK (status = 'DRAFT' OR status = 'CANCELLED' OR issued_at IS NOT NULL),
  CONSTRAINT invoice_issued_needs_snapshot
    CHECK (status = 'DRAFT' OR status = 'CANCELLED' OR customer_snapshot IS NOT NULL),
  CONSTRAINT invoice_adjustment_needs_reason
    CHECK (adjustment_of_invoice_id IS NULL OR length(btrim(adjustment_reason)) >= 10),
  CONSTRAINT invoice_khong_dieu_chinh_chinh_minh
    CHECK (adjustment_of_invoice_id IS NULL OR adjustment_of_invoice_id <> id),
  -- 🔒 INV-M-01: mọi cột tiền trong vùng an toàn của JavaScript
  CONSTRAINT invoice_amounts_within_safe_range
    CHECK (subtotal_amount BETWEEN -9007199254740991 AND 9007199254740991
       AND discount_amount BETWEEN -9007199254740991 AND 9007199254740991
       AND tax_amount      BETWEEN -9007199254740991 AND 9007199254740991
       AND total_amount    BETWEEN -9007199254740991 AND 9007199254740991)
);

/*
 * 🔒 Một đơn sửa chữa có tối đa MỘT hoá đơn gốc đang sống.
 *
 * Hoá đơn điều chỉnh (`adjustment_of_invoice_id IS NOT NULL`) không tính, vì
 * bản chất nó là phần chênh lệch của một hoá đơn đã có. Hoá đơn đã huỷ cũng
 * không tính.
 *
 * Chỉ mục một phần thay vì UNIQUE thường: BC-07 mục 6.4 để ngỏ việc gộp nhiều
 * đơn vào một hoá đơn ở giai đoạn 2, và một UNIQUE cứng sẽ phải gỡ ra lúc đó.
 */
CREATE UNIQUE INDEX one_live_invoice_per_order
  ON invoice (tenant_id, repair_order_id)
  WHERE adjustment_of_invoice_id IS NULL AND status <> 'CANCELLED';

CREATE INDEX idx_invoice_cong_no
  ON invoice (tenant_id, customer_id, due_date)
  WHERE status IN ('ISSUED', 'PARTIALLY_PAID');

CREATE TRIGGER trg_touch_invoice
  BEFORE UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_log_status_invoice
  AFTER UPDATE OF status ON invoice
  FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- =============================================================================
-- Dòng hoá đơn
-- =============================================================================

CREATE TABLE invoice_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  invoice_id      uuid NOT NULL,
  seq             integer NOT NULL,
  line_type       invoice_line_type NOT NULL,

  /** Mô tả CHỤP LẠI — hạng mục đổi tên sau này không làm đổi hoá đơn cũ */
  description     text NOT NULL,
  quantity        numeric(12,3) NOT NULL,
  unit_price      bigint NOT NULL,
  discount_amount bigint NOT NULL DEFAULT 0,
  tax_rate_percent integer NOT NULL DEFAULT 0,

  /* Ba cột dưới do TRIGGER tính, không phải ô nhập — xem `tinh_tien_dong_hd` */
  gross_amount    bigint NOT NULL DEFAULT 0,
  tax_amount      bigint NOT NULL DEFAULT 0,
  line_total      bigint NOT NULL DEFAULT 0,

  /*
   * 💡 `source_quotation_line_id` là thứ làm BẢNG ĐỐI CHIẾU báo giá ↔ thực tế
   * trở nên khả thi — cơ sở của quy tắc giải trình chênh lệch BR-09-3.
   *
   * Không có nó thì bảng đối chiếu phải khớp theo mô tả bằng chuỗi, và một hạng
   * mục đổi tên là một dòng "biến mất khỏi báo giá, xuất hiện trên hoá đơn".
   */
  source_quotation_line_id  uuid,
  source_work_assignment_id uuid,
  source_movement_id        uuid,

  /** 🔒 INV-M-06 — dòng bảo hành giá 0đ, chi phí thật ghi ở chỗ khác */
  is_warranty     boolean NOT NULL DEFAULT false,
  /** Dự kiến ai trả — BC-08. Tiền thật ghi ở `payment_allocation` */
  expected_payer_type payer_type NOT NULL DEFAULT 'CUSTOMER',

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (invoice_id, seq),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice(tenant_id, id),
  FOREIGN KEY (tenant_id, source_quotation_line_id)  REFERENCES quotation_line(tenant_id, id),
  FOREIGN KEY (tenant_id, source_work_assignment_id) REFERENCES work_assignment(tenant_id, id),

  CONSTRAINT invoice_line_quantity_positive CHECK (quantity > 0),
  CONSTRAINT invoice_line_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT invoice_line_tax_range CHECK (tax_rate_percent BETWEEN 0 AND 100),
  -- 🔒 INV-M-07: chiết khấu không vượt giá trị dòng
  CONSTRAINT invoice_line_discount_khong_vuot
    CHECK (discount_amount >= 0 AND discount_amount <= round(quantity * unit_price)),
  -- 🔒 INV-M-06
  CONSTRAINT warranty_line_is_free
    CHECK (NOT is_warranty OR line_total = 0),
  CONSTRAINT invoice_line_within_safe_range
    CHECK (unit_price BETWEEN 0 AND 9007199254740991
       AND line_total BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX idx_invoice_line_hoa_don ON invoice_line (tenant_id, invoice_id);

-- =============================================================================
-- 🔒 INV-M-02 — tiền của TỪNG DÒNG do database tính
--
-- Bản song song của `tinh_tien_dong()` (0011) cho báo giá. Hai hàm gần giống
-- nhau, và câu hỏi "sao không dùng chung một hàm" đáng được trả lời:
--
-- Chúng thao tác trên hai bảng có cột khác nhau, và trigger trong PostgreSQL
-- gắn với bảng cụ thể. Gộp lại phải viết động theo `TG_TABLE_NAME` — đúng thứ
-- vừa làm hỏng migration 0034 (xem 0035). Hai hàm ngắn, mỗi hàm đọc thẳng, tốt
-- hơn một hàm khéo léo mà không ai chắc nó chạy nhánh nào.
--
-- 🔒 Làm tròn Ở TỪNG DÒNG. Làm tròn ở tổng khiến tổng in ra không bằng tổng các
--    dòng cộng lại — khách và kiểm toán đều phát hiện.
-- =============================================================================

CREATE OR REPLACE FUNCTION tinh_tien_dong_hd() RETURNS trigger AS $$
DECLARE
  gross bigint;
  net   bigint;
  tax   bigint;
BEGIN
  IF NEW.is_warranty THEN
    -- Dòng bảo hành: khách không trả gì. Zero hoá MỌI thành phần, không chỉ
    -- `line_total` — cùng lập luận với 0011.
    NEW.gross_amount := 0;
    NEW.tax_amount   := 0;
    NEW.line_total   := 0;
    RETURN NEW;
  END IF;

  gross := round(NEW.quantity * NEW.unit_price);
  net   := gross - NEW.discount_amount;
  tax   := round(net * NEW.tax_rate_percent / 100.0);

  NEW.gross_amount := gross;
  NEW.tax_amount   := tax;
  NEW.line_total   := net + tax;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_line_tinh_tien
  BEFORE INSERT OR UPDATE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION tinh_tien_dong_hd();

-- =============================================================================
-- 🔒 INV-M-02 — tổng hoá đơn bằng tổng các dòng, cộng lại bởi DATABASE
--
-- Ứng dụng không bao giờ ghi bốn cột tổng. Để nó ghi là mở đường cho một hoá
-- đơn mà tổng khác tổng các dòng — và con số đó đã in ra giấy đưa cho khách.
-- =============================================================================

CREATE OR REPLACE FUNCTION cong_lai_hoa_don() RETURNS trigger AS $$
DECLARE
  hd uuid;
BEGIN
  hd := COALESCE(NEW.invoice_id, OLD.invoice_id);

  UPDATE invoice i
     SET subtotal_amount = COALESCE(t.gross, 0),
         discount_amount = COALESCE(t.chiet_khau, 0),
         tax_amount      = COALESCE(t.thue, 0),
         total_amount    = COALESCE(t.tong, 0)
    FROM (SELECT sum(gross_amount) AS gross,
                 sum(discount_amount) AS chiet_khau,
                 sum(tax_amount) AS thue,
                 sum(line_total) AS tong
            FROM invoice_line WHERE invoice_id = hd) t
   WHERE i.id = hd;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_invoice_cong_lai
  AFTER INSERT OR UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION cong_lai_hoa_don();

-- =============================================================================
-- 🔒 INV-M-03 — hoá đơn đã phát hành là BẤT BIẾN
--
-- Đây là bất biến nghiêm ngặt nhất trong cả hệ thống, và nó nghiêm ngặt vì lý
-- do nằm ngoài phần mềm: hoá đơn là chứng từ đã giao cho người khác và đã khai
-- với cơ quan thuế. Sửa nó không phải "cập nhật dữ liệu" mà là làm sai lệch một
-- văn bản.
--
-- Cho phép đúng BỐN thứ đổi sau khi ISSUED, và không gì khác:
--
--   · `status`   — vòng đời thu tiền (PARTIALLY_PAID → PAID) và ADJUSTED
--   · `version`  — khoá lạc quan
--   · `updated_at` — do `touch_row()` đặt
--   · các cột TỔNG — chỉ khi chúng KHÔNG đổi giá trị (trigger cộng lại chạy
--     lại sau mỗi lần đụng dòng; nếu tổng không đổi thì không có gì bị sửa)
--
-- Mọi cột khác đổi giá trị -> chặn.
-- =============================================================================

CREATE OR REPLACE FUNCTION chan_sua_hoa_don_da_phat_hanh() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF NEW.repair_order_id  IS DISTINCT FROM OLD.repair_order_id
     OR NEW.customer_id   IS DISTINCT FROM OLD.customer_id
     OR NEW.branch_id     IS DISTINCT FROM OLD.branch_id
     OR NEW.code          IS DISTINCT FROM OLD.code
     OR NEW.customer_snapshot IS DISTINCT FROM OLD.customer_snapshot
     OR NEW.issued_at     IS DISTINCT FROM OLD.issued_at
     OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.tax_amount    IS DISTINCT FROM OLD.tax_amount
     OR NEW.total_amount  IS DISTINCT FROM OLD.total_amount
     OR NEW.adjustment_of_invoice_id IS DISTINCT FROM OLD.adjustment_of_invoice_id
     OR NEW.variance_reason IS DISTINCT FROM OLD.variance_reason
  THEN
    RAISE EXCEPTION
      'INVOICE_IMMUTABLE: hoá đơn % đã phát hành, sửa sai bằng hoá đơn điều chỉnh',
      OLD.code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_03';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_bat_bien
  BEFORE UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION chan_sua_hoa_don_da_phat_hanh();

/*
 * 🔒 Và DÒNG cũng bất biến — chặn ở chính bảng dòng.
 *
 * Không có trigger này thì bất biến ở trên vô nghĩa: thêm một dòng vào hoá đơn
 * đã phát hành làm trigger cộng lại đổi `total_amount`, và bản thân lần UPDATE
 * đó do trigger nội bộ thực hiện chứ không do ứng dụng — nó sẽ đi lọt.
 */
CREATE OR REPLACE FUNCTION chan_sua_dong_hoa_don_da_phat_hanh() RETURNS trigger AS $$
DECLARE
  ban_ghi record;
  trang_thai invoice_status;
  ma text;
BEGIN
  ban_ghi := COALESCE(NEW, OLD);
  SELECT status, code INTO trang_thai, ma FROM invoice WHERE id = ban_ghi.invoice_id;

  IF trang_thai <> 'DRAFT' THEN
    RAISE EXCEPTION
      'INVOICE_IMMUTABLE: hoá đơn % đã phát hành, không thêm bớt sửa dòng được', ma
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_03';
  END IF;

  RETURN ban_ghi;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_invoice_line_bat_bien
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION chan_sua_dong_hoa_don_da_phat_hanh();

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoice', 'invoice_line'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

/*
 * 🔒 Danh sách cột được UPDATE hẹp đến mức gần như không có gì.
 *
 * `subtotal_amount`/`tax_amount`/`total_amount` KHÔNG có ở đây: chúng do trigger
 * `cong_lai_hoa_don()` (SECURITY DEFINER) ghi. Ứng dụng không được chạm vào con
 * số tổng, kể cả khi hoá đơn còn DRAFT.
 */
GRANT UPDATE (status, customer_snapshot, issued_at, due_date, variance_reason,
              adjustment_reason, version)
  ON invoice TO garageos_app;
REVOKE DELETE ON invoice FROM garageos_app;

-- Dòng hoá đơn: xoá được khi còn DRAFT (dựng lại bảng nháp là thao tác thật),
-- trigger ở trên chặn sau khi phát hành.
GRANT UPDATE (quantity, unit_price, discount_amount, tax_rate_percent,
              description, is_warranty, expected_payer_type)
  ON invoice_line TO garageos_app;
GRANT DELETE ON invoice_line TO garageos_app;

COMMENT ON TABLE invoice IS
  'BC-07. Lap tu CONG VIEC DA THUC HIEN, khong tu bao gia. Sau ISSUED la bat '
  'bien (INV-M-03) — sua sai bang hoa don dieu chinh.';
