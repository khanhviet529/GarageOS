-- =============================================================================
-- 0004_customer_vehicle — Khách hàng và phương tiện (Phase 1.1)
--
-- Hiện thực: docs/10-data-model.md mục 4
-- Case:      docs/07-business-cases/BC-01-tiep-nhan-xe.md
-- Bất biến:  INV-V-02 (biển số duy nhất), INV-T-03 (FK phức hợp)
--
-- ⚠️ NHỚ: từ migration 0003, quyền mặc định CHỈ có SELECT + INSERT.
--    Bảng nào cần UPDATE/DELETE phải GRANT tường minh ở cuối file này.
-- =============================================================================

CREATE TYPE customer_type AS ENUM ('INDIVIDUAL', 'COMPANY');

-- 🔒 Thuộc tính GỐC của xe, không suy từ dòng xe.
--    Danh mục model không bao giờ đầy đủ ở thị trường VN, và xe hoán cải tồn
--    tại. Xem docs/adr/0004-powertrain-abstraction.md
CREATE TYPE powertrain AS ENUM ('ICE', 'HYBRID', 'BEV');

-- =============================================================================
-- Khách hàng
-- =============================================================================

CREATE TABLE customer (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  type          customer_type NOT NULL,
  display_name  text NOT NULL,
  phone         text NOT NULL,

  -- BC-13: khách doanh nghiệp tách người duyệt báo giá khỏi người liên hệ.
  -- 🔒 Số nhận OTP duyệt = COALESCE(approver_phone, phone) — xem docs/04 F-04.
  approver_phone text,

  email         text,
  address       text,
  tax_code      text,

  credit_limit_amount      bigint NOT NULL DEFAULT 0,   -- 🔒 bigint, đơn vị đồng
  payment_term_days        int    NOT NULL DEFAULT 0,
  default_discount_percent int    NOT NULL DEFAULT 0,

  -- EC-M-02: xe nội bộ của garage. Loại khỏi báo cáo doanh thu nhưng GIỮ trong
  -- báo cáo chi phí và năng suất thợ — thợ vẫn làm việc thật.
  is_internal   boolean NOT NULL DEFAULT false,

  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),

  CONSTRAINT customer_company_needs_tax_code
    CHECK (type <> 'COMPANY' OR tax_code IS NOT NULL),
  CONSTRAINT customer_credit_non_negative
    CHECK (credit_limit_amount >= 0 AND payment_term_days >= 0),
  CONSTRAINT customer_discount_range
    CHECK (default_discount_percent BETWEEN 0 AND 100)
);

CREATE INDEX idx_customer_phone ON customer (tenant_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_name  ON customer USING gin (display_name gin_trgm_ops);

-- =============================================================================
-- Phương tiện
-- =============================================================================

CREATE TABLE vehicle (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  customer_id   uuid NOT NULL,

  plate_number  text NOT NULL,
  vin           text,               -- nhiều xe cũ ở VN không có VIN trong hệ thống

  make_name     text,
  model_name    text,
  model_year    int,

  -- 🔒 BẮT BUỘC. Chi phối: hạng mục nào báo giá được (INV-V-01), thợ nào phân
  --    công được (INV-W-03), khoang nào phù hợp (INV-W-07), chu kỳ bảo dưỡng.
  powertrain    powertrain NOT NULL,

  battery_capacity_kwh numeric(6,2),
  color         text,

  last_odometer int NOT NULL DEFAULT 0,
  last_service_at timestamptz,

  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  -- 🔒 INV-T-03: FK phức hợp — không thể trỏ sang khách của tenant khác
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),

  CONSTRAINT vehicle_battery_only_for_electrified
    CHECK (powertrain = 'ICE' OR battery_capacity_kwh IS NULL OR battery_capacity_kwh > 0),
  CONSTRAINT vehicle_ice_has_no_battery
    CHECK (powertrain <> 'ICE' OR battery_capacity_kwh IS NULL),
  CONSTRAINT vehicle_odometer_non_negative CHECK (last_odometer >= 0),
  CONSTRAINT vehicle_year_plausible
    CHECK (model_year IS NULL OR model_year BETWEEN 1900 AND 2100)
);

-- 🔒 INV-V-02: biển số duy nhất trong tenant, SO SÁNH SAU CHUẨN HOÁ.
--    '30A-123.45' và '30A12345' là CÙNG một xe. Không chuẩn hoá thì một xe có
--    nhiều hồ sơ, lịch sử phân mảnh và bảo hành tra không ra (BC-01 mục 3.4).
CREATE UNIQUE INDEX uq_vehicle_plate
  ON vehicle (tenant_id, normalize_plate(plate_number))
  WHERE deleted_at IS NULL;

-- Tìm biển số gần đúng khi nhân viên gõ nhầm
CREATE INDEX idx_vehicle_plate_trgm
  ON vehicle USING gin (normalize_plate(plate_number) gin_trgm_ops);

CREATE INDEX idx_vehicle_customer ON vehicle (tenant_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vehicle_vin      ON vehicle (tenant_id, vin) WHERE vin IS NOT NULL;

-- =============================================================================
-- Lịch sử chủ sở hữu — BC-01 mục 3.3
--
-- Xe bán lại thì chủ mới KHÔNG được xem đơn sửa chữa của chủ cũ (quyền riêng
-- tư), nhưng bảo hành VẪN còn hiệu lực vì nó gắn với XE, không gắn với người.
-- =============================================================================

CREATE TABLE vehicle_ownership (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  vehicle_id    uuid NOT NULL,
  customer_id   uuid NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  transfer_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, vehicle_id)  REFERENCES vehicle(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  CONSTRAINT ownership_period_valid CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- 🔒 Một xe chỉ có MỘT chủ tại một thời điểm
ALTER TABLE vehicle_ownership
  ADD CONSTRAINT no_overlapping_ownership
  EXCLUDE USING gist (
    tenant_id  WITH =,
    vehicle_id WITH =,
    tstzrange(started_at, coalesce(ended_at, 'infinity')) WITH &&
  );

-- =============================================================================
-- RLS — INV-T-01
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer','vehicle','vehicle_ownership']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
  END LOOP;
END $$;

-- =============================================================================
-- Quyền — 🔒 BẮT BUỘC cấp tường minh (migration 0003 đã bỏ quyền mặc định)
--
-- Đây là bảng hồ sơ, không phải bảng sổ, nên được sửa và xoá mềm.
-- vehicle_ownership là LỊCH SỬ: chỉ thêm và đóng kỳ, không xoá.
-- =============================================================================

GRANT UPDATE, DELETE ON customer, vehicle TO garageos_app;
GRANT UPDATE          ON vehicle_ownership TO garageos_app;   -- chỉ để đặt ended_at
