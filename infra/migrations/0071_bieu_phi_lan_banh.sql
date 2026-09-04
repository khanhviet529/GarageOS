-- =============================================================================
-- 0071_bieu_phi_lan_banh — Biểu phí lăn bánh theo tỉnh/thành VÀ loại động cơ
--
-- Nguồn yêu cầu: docs/superpowers/specs/2026-09-03-sales-admin-ecommerce-expansion.md §4.1
-- Bất biến: INV-LS-16 (số suy ra phải có nguồn), INV-M-01 (tiền là số nguyên)
--
-- 🔒 Giá lăn bánh KHÔNG được lưu. Bảng này giữ *đầu vào* của phép cộng; kết quả
--    luôn tính lại từ biểu phí đang hiệu lực. Lưu một con số suy ra là tự tạo
--    ra hai nguồn sự thật, và bản bị lệch luôn là bản khách đang nhìn.
--
-- 🔒 `powertrain` là MỘT CHIỀU CỦA KHOÁ, không phải một cột giá trị. Cùng Hà
--    Nội: xe xăng 12 %, xe điện 0 %. Bản đầu của đặc tả viết "xe điện là 0 bp,
--    không cần cờ đặc biệt" — câu đó chỉ đúng nếu tỷ lệ không phụ thuộc loại
--    động cơ. Với catalog hai hãng ba loại động cơ thì thiếu chiều này nghĩa là
--    phải sửa schema SAU KHI đã có dữ liệu thật.
-- =============================================================================

CREATE TABLE IF NOT EXISTS onroad_fee_schedule (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(id),
  province_code               text NOT NULL,
  province_name               text NOT NULL,
  powertrain                  powertrain NOT NULL,

  -- Tỷ lệ lưu bằng basis point (1 bp = 0,01 %) để không bao giờ phải chạm float.
  registration_fee_rate_bp    int    NOT NULL,
  plate_fee_amount            bigint NOT NULL,
  inspection_fee_amount       bigint NOT NULL,
  road_maintenance_fee_amount bigint NOT NULL,
  civil_insurance_fee_amount  bigint NOT NULL,

  -- 🔒 Bảo hiểm vật chất là TỰ NGUYỆN: hiển thị như một dòng SAU tổng, mặc định
  --    không cộng vào. Đây là lý do nó nằm ở cột riêng và là tỷ lệ (% giá xe)
  --    chứ không phải một số tuyệt đối.
  material_insurance_rate_bp  int    NOT NULL DEFAULT 0,

  -- Phụ phí đại lý — nếu có thì phải có TÊN RIÊNG, không núp dưới tên "đăng
  -- kiểm". Bản dựng thiết kế đầu ghi 35.000.000 cho "đăng kiểm + phụ phí", sai
  -- thực tế 100 lần (đăng kiểm ô tô con là 240–340 nghìn).
  dealer_fee_amount           bigint NOT NULL DEFAULT 0,
  dealer_fee_label            text,

  effective_from              date NOT NULL,
  effective_to                date,

  created_by                  uuid NOT NULL,
  updated_by                  uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  version                     bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, province_code, powertrain, effective_from),

  CONSTRAINT onroad_rate_range CHECK (registration_fee_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT onroad_material_rate_range CHECK (material_insurance_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT onroad_amounts_nonnegative CHECK (
    plate_fee_amount >= 0 AND inspection_fee_amount >= 0
    AND road_maintenance_fee_amount >= 0 AND civil_insurance_fee_amount >= 0
    AND dealer_fee_amount >= 0
  ),
  CONSTRAINT onroad_dealer_fee_needs_label CHECK (
    dealer_fee_amount = 0 OR (dealer_fee_label IS NOT NULL AND btrim(dealer_fee_label) <> '')
  ),
  CONSTRAINT onroad_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);

/*
 * 🔒 Hai biểu phí chồng nhau cho cùng (tỉnh, loại động cơ) thì câu hỏi "hôm nay
 * biển số Hà Nội cho xe điện bao nhiêu" có HAI đáp án, và hệ thống chọn theo
 * thứ tự dòng trả về — tức là ngẫu nhiên.
 *
 * Cùng lý do với `no_overlapping_price_list` ở 0008: đây là loại lỗi chỉ lộ ra
 * khi khách cầm ảnh chụp màn hình đến showroom hỏi vì sao số khác.
 */
ALTER TABLE onroad_fee_schedule DROP CONSTRAINT IF EXISTS no_overlapping_onroad_fee;
ALTER TABLE onroad_fee_schedule
  ADD CONSTRAINT no_overlapping_onroad_fee
  EXCLUDE USING gist (
    tenant_id WITH =,
    province_code WITH =,
    powertrain WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_onroad_fee_lookup
  ON onroad_fee_schedule (tenant_id, province_code, powertrain, effective_from DESC);

-- --- RLS + trigger + grant ---------------------------------------------------
ALTER TABLE onroad_fee_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE onroad_fee_schedule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON onroad_fee_schedule;
CREATE POLICY tenant_isolation ON onroad_fee_schedule
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_touch_onroad_fee_schedule ON onroad_fee_schedule;
CREATE TRIGGER trg_touch_onroad_fee_schedule
  BEFORE UPDATE ON onroad_fee_schedule
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- 🔒 GRANT tường minh theo đúng bài học đã ghi ở STATUS.md: lỗi "viết REVOKE
--    như thể GRANT đã tồn tại" đã xảy ra ba lần trên nhánh này, mỗi lần là một
--    lỗi 500 im lặng từ lúc bảng ra đời.
GRANT SELECT, INSERT, UPDATE, DELETE ON onroad_fee_schedule TO garageos_app;
