-- =============================================================================
-- 0010_quotation — Báo giá (Phase 1.4, BC-02)
--
-- Đây là bảng có nhiều bất biến nhất trong hệ thống, và tất cả đều thuộc loại
-- "sai thì mất tiền hoặc mất khách":
--   INV-Q-02  từ chối công thì phụ tùng đi kèm phải tự từ chối theo
--   INV-Q-03  mỗi đơn chỉ có một báo giá đang chờ khách trả lời
--   INV-Q-04  số thứ tự báo giá liên tục trong đơn
--   INV-Q-05  giá đã gửi khách thì đóng băng
--   INV-Q-06  tổng báo giá luôn bằng tổng các dòng
--   INV-V-01  hạng mục phải hợp với loại động cơ của chính chiếc xe đó
-- =============================================================================

CREATE TYPE quotation_status AS ENUM (
  'DRAFT','SENT','APPROVED','PARTIALLY_APPROVED','REJECTED','EXPIRED','SUPERSEDED'
);
CREATE TYPE quotation_line_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE line_type AS ENUM ('LABOR','PART');

CREATE TABLE quotation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  repair_order_id     uuid NOT NULL,
  seq                 int  NOT NULL,
  status              quotation_status NOT NULL DEFAULT 'DRAFT',

  -- 🔒 INV-Q-05 — snapshot đơn giá giờ công tại thời điểm lập.
  --    Đổi bảng giá ngày mai KHÔNG được làm đổi báo giá đã gửi hôm nay.
  labor_rate_per_hour bigint NOT NULL,

  subtotal_amount     bigint NOT NULL DEFAULT 0,
  discount_amount     bigint NOT NULL DEFAULT 0,
  tax_amount          bigint NOT NULL DEFAULT 0,
  total_amount        bigint NOT NULL DEFAULT 0,

  valid_until         timestamptz,
  sent_at             timestamptz,
  responded_at        timestamptz,
  approval_channel    text,
  approval_evidence   jsonb,
  approved_by_name    text,

  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),

  CONSTRAINT quotation_amounts_non_negative CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0
    AND tax_amount >= 0 AND total_amount >= 0),
  CONSTRAINT quotation_amounts_within_safe_range CHECK (
    total_amount <= 9007199254740991 AND subtotal_amount <= 9007199254740991),
  CONSTRAINT quotation_rate_positive CHECK (labor_rate_per_hour > 0),
  -- Gửi khách mà không có hạn hiệu lực thì báo giá sống mãi — INV-Q-07 vô nghĩa
  CONSTRAINT quotation_sent_needs_validity
    CHECK (status = 'DRAFT' OR valid_until IS NOT NULL),
  CONSTRAINT quotation_channel_valid
    CHECK (approval_channel IS NULL OR approval_channel IN ('LINK_OTP','IN_PERSON','PHONE'))
);

-- 🔒 INV-Q-04 — số thứ tự duy nhất trong đơn
CREATE UNIQUE INDEX uq_quotation_seq ON quotation (tenant_id, repair_order_id, seq);

-- 🔒 INV-Q-03 — chỉ MỘT báo giá đang chờ khách trả lời.
--    Hai báo giá cùng chờ nghĩa là khách duyệt cái này, xưởng làm theo cái kia.
CREATE UNIQUE INDEX one_pending_quotation
  ON quotation (tenant_id, repair_order_id) WHERE status = 'SENT';

CREATE INDEX idx_quotation_ro ON quotation (tenant_id, repair_order_id, seq DESC);

CREATE TABLE quotation_line (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  quotation_id     uuid NOT NULL,
  seq              int  NOT NULL,
  line_type        line_type NOT NULL,

  service_item_id  uuid,
  part_id          uuid,
  -- 🔒 INV-Q-02 — dòng phụ tùng trỏ về dòng công đã dùng nó
  parent_line_id   uuid,

  -- 🔒 Snapshot: tên và giá tại thời điểm lập. Đổi tên hạng mục trong danh mục
  --    KHÔNG được làm đổi chữ trên báo giá đã in đưa khách.
  description      text NOT NULL,
  quantity         numeric(12,2) NOT NULL,
  unit_price       bigint NOT NULL,
  discount_amount  bigint NOT NULL DEFAULT 0,
  tax_rate_percent int    NOT NULL DEFAULT 10,

  -- Ba cột dưới do trigger tính, KHÔNG nhận từ ứng dụng — xem tinh_tien_dong().
  -- Tách gross và tax ra cột riêng thay vì suy ngược từ line_total: phép cộng ở
  -- mức báo giá khi đó chỉ là SUM thuần, không phải một công thức thứ hai chép
  -- lại logic của công thức thứ nhất. Hai công thức thì sớm muộn cũng lệch nhau.
  gross_amount     bigint NOT NULL DEFAULT 0,
  tax_amount       bigint NOT NULL DEFAULT 0,
  line_total       bigint NOT NULL DEFAULT 0,

  status           quotation_line_status NOT NULL DEFAULT 'PENDING',
  approval_source  text,
  reject_reason    text,
  is_warranty      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, quotation_id, seq),
  FOREIGN KEY (tenant_id, quotation_id)    REFERENCES quotation(tenant_id, id),
  FOREIGN KEY (tenant_id, service_item_id) REFERENCES service_item(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)         REFERENCES part(tenant_id, id),
  FOREIGN KEY (tenant_id, parent_line_id)  REFERENCES quotation_line(tenant_id, id),

  CONSTRAINT qline_ref_matches_type CHECK (
    (line_type = 'LABOR' AND service_item_id IS NOT NULL AND part_id IS NULL) OR
    (line_type = 'PART'  AND part_id IS NOT NULL AND service_item_id IS NULL)),
  CONSTRAINT qline_only_part_has_parent
    CHECK (line_type = 'PART' OR parent_line_id IS NULL),
  CONSTRAINT qline_positive_quantity CHECK (quantity > 0),
  CONSTRAINT qline_non_negative_price CHECK (unit_price >= 0),
  CONSTRAINT qline_price_within_safe_range CHECK (unit_price <= 9007199254740991),
  CONSTRAINT qline_valid_tax CHECK (tax_rate_percent BETWEEN 0 AND 100),
  -- 🔒 INV-M-07 — chiết khấu không vượt quá giá trị dòng
  CONSTRAINT qline_discount_within_line
    CHECK (discount_amount >= 0 AND discount_amount <= round(quantity * unit_price)),
  CONSTRAINT qline_reject_needs_reason
    CHECK (status <> 'REJECTED' OR reject_reason IS NOT NULL OR parent_line_id IS NOT NULL)
);

CREATE INDEX idx_qline_quotation ON quotation_line (tenant_id, quotation_id, seq);
CREATE INDEX idx_qline_parent    ON quotation_line (tenant_id, parent_line_id);

-- =============================================================================
-- 🔒 INV-V-01 — TẦNG BẢO VỆ THẬT
--
-- BC-11 mục 2.1 nói enforce ở hai tầng. Tầng một là danh sách hiển thị (đã có ở
-- Phase 1.3). Tầng này là tầng thật: dù request đến từ đâu, một hạng mục không
-- hợp loại động cơ KHÔNG vào được báo giá.
--
-- Đặt ở database chứ không ở service vì đây là quy tắc về DỮ LIỆU, và mọi con
-- đường ghi — API, script, import — đều phải đi qua nó.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_powertrain_dong_bao_gia() RETURNS trigger AS $$
DECLARE
  v_powertrain powertrain;
  v_applicable powertrain[];
  v_name       text;
BEGIN
  IF NEW.line_type <> 'LABOR' THEN
    RETURN NEW;
  END IF;

  SELECT v.powertrain INTO v_powertrain
    FROM quotation q
    JOIN repair_order ro ON ro.id = q.repair_order_id
    JOIN vehicle v       ON v.id = ro.vehicle_id
   WHERE q.id = NEW.quotation_id;

  SELECT si.applicable_powertrains, si.name INTO v_applicable, v_name
    FROM service_item si WHERE si.id = NEW.service_item_id;

  IF NOT (v_powertrain = ANY(v_applicable)) THEN
    RAISE EXCEPTION
      'INV-V-01: hang muc "%" khong ap dung cho xe loai %', v_name, v_powertrain
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'qline_powertrain_matches_vehicle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qline_powertrain
  BEFORE INSERT OR UPDATE OF service_item_id ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_powertrain_dong_bao_gia();

-- =============================================================================
-- 🔒 INV-M-02 — tiền của MỘT dòng do database tính
--
-- Làm tròn phải xảy ra ở TỪNG DÒNG rồi mới cộng; làm tròn ở tổng sẽ lệch vài
-- đồng so với hoá đơn in ra. Đặt phép tính ở một chỗ duy nhất để web, API và
-- báo cáo không thể ra ba con số khác nhau.
--
-- `packages/domain/src/money.ts` có bản TypeScript của đúng phép tính này, dùng
-- để xem trước trên giao diện. Có test đối chiếu hai bên phải khớp từng đồng.
-- =============================================================================

CREATE OR REPLACE FUNCTION tinh_tien_dong() RETURNS trigger AS $$
DECLARE
  gross bigint;
  net   bigint;
  tax   bigint;
BEGIN
  IF NEW.is_warranty THEN
    -- Dòng bảo hành: khách không trả gì cả. Đặt MỌI thành phần về 0, không chỉ
    -- riêng line_total — nếu chỉ zero hoá tổng thì phần thuế cộng ở mức báo giá
    -- sẽ âm, và ràng buộc quotation_amounts_non_negative sẽ chặn (đúng như nó
    -- phải làm).
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

CREATE TRIGGER trg_qline_total
  BEFORE INSERT OR UPDATE ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION tinh_tien_dong();

-- =============================================================================
-- 🔒 INV-Q-06 — tổng báo giá luôn bằng tổng các dòng
--
-- Không để ứng dụng tự cộng rồi ghi vào: chỉ cần một đường code quên gọi hàm
-- cộng lại là tổng lệch, và không ai phát hiện cho tới lúc đối chiếu hoá đơn.
-- =============================================================================

CREATE OR REPLACE FUNCTION cong_lai_bao_gia() RETURNS trigger AS $$
DECLARE
  q_id uuid;
BEGIN
  q_id := COALESCE(NEW.quotation_id, OLD.quotation_id);

  UPDATE quotation q SET
    subtotal_amount = COALESCE(s.gross, 0),
    discount_amount = COALESCE(s.discount, 0),
    tax_amount      = COALESCE(s.tax, 0),
    total_amount    = COALESCE(s.total, 0)
  FROM (
    SELECT
      sum(l.gross_amount)                                                 AS gross,
      sum(CASE WHEN l.is_warranty THEN 0 ELSE l.discount_amount END)      AS discount,
      sum(l.tax_amount)                                                   AS tax,
      sum(l.line_total)                                                   AS total
      FROM quotation_line l
     WHERE l.quotation_id = q_id
       -- Dòng bị từ chối không nằm trong số tiền khách phải trả
       AND l.status <> 'REJECTED'
  ) s
  WHERE q.id = q_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quotation_totals
  AFTER INSERT OR UPDATE OR DELETE ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION cong_lai_bao_gia();

-- =============================================================================
-- 🔒 INV-Q-05 — giá đã gửi khách thì ĐÓNG BĂNG
--
-- Sau khi báo giá rời DRAFT, số lượng và đơn giá trở thành chỉ đọc. Sửa được
-- nghĩa là con số khách đã đồng ý và con số xưởng thu tiền có thể khác nhau —
-- và bên thiệt luôn là bên không giữ bản in.
--
-- Trạng thái dòng (duyệt / từ chối) thì VẪN đổi được: đó chính là việc khách
-- làm sau khi nhận báo giá.
-- =============================================================================

CREATE OR REPLACE FUNCTION dong_bang_gia_da_gui() RETURNS trigger AS $$
DECLARE
  q_status quotation_status;
BEGIN
  SELECT status INTO q_status FROM quotation WHERE id = NEW.quotation_id;

  IF q_status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity        IS DISTINCT FROM OLD.quantity
  OR NEW.unit_price      IS DISTINCT FROM OLD.unit_price
  OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
  OR NEW.tax_rate_percent IS DISTINCT FROM OLD.tax_rate_percent
  OR NEW.description     IS DISTINCT FROM OLD.description THEN
    RAISE EXCEPTION
      'INV-Q-05: bao gia da gui khach (trang thai %), khong sua duoc gia hay so luong', q_status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'qline_frozen_after_sent';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qline_frozen
  BEFORE UPDATE ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION dong_bang_gia_da_gui();

-- Thêm hoặc bớt dòng sau khi đã gửi cũng là sửa báo giá — phải lập bản mới.
CREATE OR REPLACE FUNCTION chan_them_bot_dong_da_gui() RETURNS trigger AS $$
DECLARE
  q_status quotation_status;
  q_id     uuid;
BEGIN
  q_id := COALESCE(NEW.quotation_id, OLD.quotation_id);
  SELECT status INTO q_status FROM quotation WHERE id = q_id;

  IF q_status <> 'DRAFT' THEN
    RAISE EXCEPTION
      'INV-Q-05: bao gia da gui khach, muon doi thi lap ban moi'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'qline_frozen_after_sent';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qline_no_add_remove
  BEFORE INSERT OR DELETE ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION chan_them_bot_dong_da_gui();

-- =============================================================================
-- 🔒 INV-Q-02 — từ chối công thì phụ tùng đi kèm tự từ chối theo
--
-- Khách từ chối "thay má phanh" nhưng hệ thống vẫn giữ dòng "má phanh trước"
-- ở trạng thái chờ, thì kho sẽ xuất phụ tùng cho một việc không ai làm.
-- =============================================================================

CREATE OR REPLACE FUNCTION lan_trang_thai_xuong_phu_tung() RETURNS trigger AS $$
BEGIN
  IF NEW.line_type = 'LABOR' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE quotation_line
       SET status = NEW.status,
           reject_reason = CASE WHEN NEW.status = 'REJECTED'
                                THEN COALESCE(reject_reason, 'Khach tu choi hang muc cong kem theo')
                                ELSE reject_reason END
     WHERE parent_line_id = NEW.id
       AND status IS DISTINCT FROM NEW.status;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qline_cascade_status
  AFTER UPDATE OF status ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION lan_trang_thai_xuong_phu_tung();

-- =============================================================================
-- RLS + quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotation','quotation_line']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

CREATE TRIGGER trg_touch_quotation
  BEFORE UPDATE ON quotation FOR EACH ROW EXECUTE FUNCTION touch_row();

-- Báo giá: đổi trạng thái, ghi phản hồi của khách, và các cột TỔNG do trigger
-- cộng lại. Không sửa được `seq`, `repair_order_id`, `labor_rate_per_hour` —
-- đó là snapshot.
GRANT UPDATE (status, valid_until, sent_at, responded_at, approval_channel,
              approval_evidence, approved_by_name,
              subtotal_amount, discount_amount, tax_amount, total_amount, version)
  ON quotation TO garageos_app;

-- Dòng báo giá: sửa được khi còn DRAFT (trigger canh), và đổi trạng thái duyệt.
GRANT UPDATE (description, quantity, unit_price, discount_amount, tax_rate_percent,
              gross_amount, tax_amount, line_total,
              status, approval_source, reject_reason, is_warranty)
  ON quotation_line TO garageos_app;
GRANT DELETE ON quotation_line TO garageos_app;

-- 🔒 INV-A-02: đổi trạng thái báo giá cũng phải có nhật ký, như đơn sửa chữa.
CREATE TRIGGER trg_log_status_quotation
  AFTER UPDATE ON quotation
  FOR EACH ROW EXECUTE FUNCTION log_status_change();
