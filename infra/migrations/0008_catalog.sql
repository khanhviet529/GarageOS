-- =============================================================================
-- 0008_catalog — Danh mục dịch vụ, phụ tùng và bảng giá (Phase 1.3)
--
-- 🔒 Đây là nơi `powertrain` biến từ một cột thành một RÀNG BUỘC THẬT: hạng mục
--    "thay dầu động cơ" không được phép xuất hiện trong danh sách của xe thuần
--    điện. Xem docs/07-business-cases/BC-11-xe-dien.md mục 2.1.
-- =============================================================================

CREATE TABLE service_item (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(id),
  code                    text NOT NULL,
  name                    text NOT NULL,
  category                text NOT NULL,
  standard_hours          numeric(6,2) NOT NULL,

  -- 🔒 INV-V-01 — loại động cơ nào dùng được hạng mục này.
  --    Mảng chứ không phải một giá trị: "thay má phanh" đúng cho cả ba loại,
  --    "kiểm tra pin cao áp" chỉ đúng cho HYBRID và BEV.
  applicable_powertrains  powertrain[] NOT NULL,

  -- 🔒 INV-W-03 — chứng chỉ thợ bắt buộc. Chưa enforce ở Phase 1 (bảng phân
  --    công thuộc Phase 2), nhưng dữ liệu phải đúng từ bây giờ, nếu không
  --    lúc bật ràng buộc sẽ không có gì để dựa vào.
  required_certifications text[] NOT NULL DEFAULT '{}',

  requires_disassembly    boolean NOT NULL DEFAULT false,
  warranty_months         int NOT NULL DEFAULT 0,

  -- 🔒 EC-D-02: KHÔNG xoá cứng. Hạng mục đã nằm trong báo giá cũ, xoá đi thì
  --    lịch sử mất tham chiếu. Ngừng dùng = tắt cờ.
  is_active               boolean NOT NULL DEFAULT true,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  CONSTRAINT service_positive_hours CHECK (standard_hours > 0),
  CONSTRAINT service_has_powertrain CHECK (array_length(applicable_powertrains, 1) > 0),
  CONSTRAINT service_category_valid
    CHECK (category IN ('MAINTENANCE','REPAIR','DIAGNOSIS','HV_SYSTEM')),
  CONSTRAINT service_warranty_non_negative CHECK (warranty_months >= 0)
);

-- Lọc theo loại động cơ là truy vấn chạy MỖI LẦN lập báo giá -> phải có index.
CREATE INDEX idx_service_powertrain
  ON service_item USING gin (applicable_powertrains);
CREATE INDEX idx_service_active ON service_item (tenant_id) WHERE is_active;

CREATE TABLE part (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  sku                 text NOT NULL,
  oem_number          text,
  name                text NOT NULL,
  unit                text NOT NULL DEFAULT 'cái',
  category            text,

  -- BC-11 mục 4: phụ tùng cao áp phải đánh dấu riêng — nó chi phối quy trình
  -- an toàn, không chỉ là một nhãn để lọc.
  is_high_voltage     boolean NOT NULL DEFAULT false,

  warranty_months     int NOT NULL DEFAULT 0,
  warranty_kilometers int,
  min_stock_level     numeric(12,2) NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, sku),
  UNIQUE (tenant_id, id),
  CONSTRAINT part_warranty_non_negative
    CHECK (warranty_months >= 0 AND (warranty_kilometers IS NULL OR warranty_kilometers >= 0)),
  CONSTRAINT part_min_stock_non_negative CHECK (min_stock_level >= 0)
);

CREATE INDEX idx_part_active ON part (tenant_id) WHERE is_active;
CREATE INDEX idx_part_name_trgm ON part USING gin (name gin_trgm_ops);

-- =============================================================================
-- Bảng giá — 🔒 có hiệu lực theo thời gian, KHÔNG sửa tại chỗ
--
-- Sửa giá tại chỗ là cách chắc chắn nhất để một báo giá in ra hôm qua không
-- giải thích được hôm nay. Muốn đổi giá thì đóng kỳ cũ và mở kỳ mới.
-- =============================================================================

CREATE TABLE price_list (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  -- NULL = áp cho toàn chuỗi; có giá trị = bảng giá riêng của chi nhánh
  branch_id           uuid,
  name                text NOT NULL,
  labor_rate_per_hour bigint NOT NULL,
  effective_from      timestamptz NOT NULL,
  effective_to        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id),
  CONSTRAINT price_positive_rate CHECK (labor_rate_per_hour > 0),
  CONSTRAINT price_valid_period  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

/*
 * 🔒 Hai bảng giá cùng phạm vi KHÔNG được chồng thời gian.
 *
 * Nếu chồng, câu hỏi "giá giờ công hôm nay là bao nhiêu" có hai đáp án và hệ
 * thống sẽ chọn theo thứ tự dòng trả về — tức là ngẫu nhiên. Đây đúng là loại
 * lỗi chỉ lộ ra khi khách thắc mắc hoá đơn.
 *
 * `coalesce(branch_id, uuid nil)` để bảng giá toàn chuỗi cũng có một khoá so
 * sánh — NULL không bằng NULL nên EXCLUDE sẽ bỏ qua chúng.
 */
ALTER TABLE price_list
  ADD CONSTRAINT no_overlapping_price_list
  EXCLUDE USING gist (
    tenant_id WITH =,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    tstzrange(effective_from, coalesce(effective_to, 'infinity')) WITH &&
  );

CREATE TABLE price_list_item (
  price_list_id    uuid NOT NULL,
  tenant_id        uuid NOT NULL,
  part_id          uuid NOT NULL,
  sell_price       bigint NOT NULL,
  tax_rate_percent int NOT NULL DEFAULT 10,

  PRIMARY KEY (price_list_id, part_id),
  FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_list(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)       REFERENCES part(tenant_id, id),
  CONSTRAINT price_item_non_negative CHECK (sell_price >= 0),
  CONSTRAINT price_item_valid_tax    CHECK (tax_rate_percent BETWEEN 0 AND 100)
);

-- =============================================================================
-- RLS — INV-T-01
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_item','part','price_list','price_list_item']
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

CREATE TRIGGER trg_touch_service_item
  BEFORE UPDATE ON service_item FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_part
  BEFORE UPDATE ON part FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Quyền — 🔒 cấp TƯỜNG MINH theo từng cột nơi cần
-- =============================================================================

-- Danh mục là dữ liệu sống: đổi tên, đổi giờ định mức, ngừng dùng.
-- Nhưng `code`/`sku` là ĐỊNH DANH — đổi nó là làm mọi tham chiếu cũ trỏ sai chỗ.
GRANT UPDATE (name, category, standard_hours, applicable_powertrains,
              required_certifications, requires_disassembly, warranty_months,
              is_active, version)
  ON service_item TO garageos_app;

GRANT UPDATE (oem_number, name, unit, category, is_high_voltage, warranty_months,
              warranty_kilometers, min_stock_level, is_active, version)
  ON part TO garageos_app;

-- 🔒 Bảng giá KHÔNG sửa được ngày hiệu lực đã mở, chỉ ĐÓNG kỳ bằng effective_to.
--    Lùi `effective_from` là viết lại giá của những báo giá đã gửi khách.
GRANT UPDATE (effective_to, name) ON price_list TO garageos_app;

-- Dòng giá không sửa, không xoá: đổi giá = mở bảng giá mới.
-- (Chỉ SELECT + INSERT theo mặc định của 0005.)
