-- =============================================================================
-- 0006_repair_order — Đơn tiếp nhận (BC-01)
--
-- Đây là bảng trung tâm của toàn hệ thống: báo giá, phân công, kho, hoá đơn,
-- bảo hành đều trỏ về nó. Sai ở đây thì sai dây chuyền.
-- =============================================================================

CREATE TYPE repair_order_status AS ENUM (
  'RECEIVED','DIAGNOSING','QUOTED','AWAITING_APPROVAL',
  'AWAITING_PARTS','IN_PROGRESS','QUALITY_CHECK',
  'AWAITING_PAYMENT','AWAITING_DELIVERY',
  'DELIVERED','CANCELLED'
);

-- =============================================================================
-- Bộ đếm số chứng từ
--
-- Mã đơn phải: duy nhất trong tenant, đọc được bằng miệng qua điện thoại, và
-- KHÔNG tiết lộ sản lượng của garage khác. Vì vậy đếm theo (tenant, ngày) chứ
-- không dùng một sequence toàn cục.
--
-- Dùng lại cho báo giá và hoá đơn ở các phase sau — đó là lý do bảng có cột
-- `scope` thay vì đóng cứng cho đơn sửa chữa.
-- =============================================================================

CREATE TABLE doc_counter (
  tenant_id  uuid   NOT NULL,
  scope      text   NOT NULL,          -- ví dụ 'RO-20260802'
  next_value bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, scope),
  CONSTRAINT doc_counter_positive CHECK (next_value > 0)
);

/*
 * 🔒 Cấp số an toàn khi có nhiều người tiếp nhận cùng lúc.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` là một câu lệnh nguyên tử:
 * PostgreSQL khoá dòng trong lúc cập nhật, nên hai giao dịch song song nhận hai
 * số khác nhau — không cần khoá tường minh, không có cửa sổ đua nhau.
 *
 * Viết thành `SELECT ... FOR UPDATE` rồi `UPDATE` sẽ tạo ra đúng cửa sổ đó nếu
 * ai đó sau này bỏ quên `FOR UPDATE`.
 */
CREATE OR REPLACE FUNCTION next_doc_number(p_tenant uuid, p_scope text)
RETURNS bigint AS $$
  INSERT INTO doc_counter (tenant_id, scope, next_value)
  VALUES (p_tenant, p_scope, 2)
  ON CONFLICT (tenant_id, scope)
  DO UPDATE SET next_value = doc_counter.next_value + 1
  RETURNING next_value - 1;
$$ LANGUAGE sql;

-- =============================================================================
-- Đơn sửa chữa
-- =============================================================================

CREATE TABLE repair_order (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  branch_id          uuid NOT NULL,
  code               text NOT NULL,

  customer_id        uuid NOT NULL,
  vehicle_id         uuid NOT NULL,

  status             repair_order_status NOT NULL DEFAULT 'RECEIVED',

  -- 🔒 NGUYÊN VĂN lời khách, không phải diễn giải của cố vấn (BC-01 mục 6).
  --    Diễn giải sớm làm thợ chẩn đoán sai hướng.
  customer_complaint text NOT NULL,

  odometer_in        int,
  odometer_out       int,
  -- Đồng hồ hỏng thì cho để trống, nhưng phải đánh dấu — mọi tính toán bảo
  -- hành theo km cho lần này sẽ bị bỏ qua (BC-01 mục 4).
  odometer_unavailable     boolean NOT NULL DEFAULT false,
  odometer_override_reason text,

  -- % pin với xe điện/hybrid, vạch xăng quy đổi với xe xăng
  energy_level_in    int,

  received_at        timestamptz NOT NULL DEFAULT now(),
  promised_at        timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  cancel_category    text,

  -- 🔒 ≥128 bit ngẫu nhiên. Đây là thứ duy nhất bảo vệ trang tra cứu công khai
  --    ở Phase 1.5 — đoán được token là đọc được báo giá của khách khác.
  customer_access_token text NOT NULL,

  -- BC-13: người mang xe đến có thể là tài xế, không phải chủ xe
  brought_by_name    text,
  brought_by_phone   text,

  created_by_user_id uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),

  -- 🔒 INV-T-03: FK phức hợp — không trỏ được sang dữ liệu của tenant khác
  FOREIGN KEY (tenant_id, branch_id)   REFERENCES branch(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  FOREIGN KEY (tenant_id, vehicle_id)  REFERENCES vehicle(tenant_id, id),

  CONSTRAINT ro_cancel_needs_reason
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
  CONSTRAINT ro_delivered_needs_odometer
    CHECK (status <> 'DELIVERED' OR odometer_out IS NOT NULL OR odometer_unavailable),
  CONSTRAINT ro_odometer_forward
    CHECK (odometer_out IS NULL OR odometer_in IS NULL OR odometer_out >= odometer_in),
  CONSTRAINT ro_odometer_non_negative
    CHECK ((odometer_in IS NULL OR odometer_in >= 0) AND (odometer_out IS NULL OR odometer_out >= 0)),
  -- Không đọc được số km thì không được đồng thời khai một con số
  CONSTRAINT ro_odometer_unavailable_is_empty
    CHECK (NOT odometer_unavailable OR odometer_in IS NULL),
  CONSTRAINT ro_energy_level_range
    CHECK (energy_level_in IS NULL OR energy_level_in BETWEEN 0 AND 100),
  CONSTRAINT ro_complaint_not_blank
    CHECK (length(btrim(customer_complaint)) >= 3),
  -- 🔒 Chặn token yếu ngay ở tầng dữ liệu. Nếu một ngày ai đó sinh token bằng
  --    Math.random() cho tiện, ràng buộc này bắt được — đọc code thì không.
  CONSTRAINT ro_token_long_enough
    CHECK (length(customer_access_token) >= 32)
);

-- 🔒 INV-V-03: một xe chỉ có MỘT đơn đang mở.
--    Ngoại lệ hợp lệ đã tính đến: xe vừa bàn giao sáng nay, chiều quay lại vì
--    lỗi khác — đơn cũ đã DELIVERED nên không nằm trong index (BC-01 mục 3.7).
CREATE UNIQUE INDEX one_open_order_per_vehicle
  ON repair_order (tenant_id, vehicle_id)
  WHERE status NOT IN ('DELIVERED','CANCELLED');

-- Token là chìa khoá của trang công khai: phải duy nhất TOÀN CỤC, không phải
-- theo tenant — trang tra cứu không biết tenant trước khi tra.
CREATE UNIQUE INDEX uq_ro_token ON repair_order (customer_access_token);

CREATE INDEX idx_ro_branch_status ON repair_order (tenant_id, branch_id, status);
CREATE INDEX idx_ro_received      ON repair_order (tenant_id, received_at DESC);
CREATE INDEX idx_ro_vehicle       ON repair_order (tenant_id, vehicle_id, received_at DESC);

-- =============================================================================
-- Ảnh hiện trạng — bằng chứng pháp lý (BC-01 mục 5)
--
-- ⚠️ Đây là tính năng giảm tranh chấp mạnh nhất của hệ thống. Garage thường
--    phải đền vết trầy không do mình gây ra chỉ vì không có bằng chứng.
-- =============================================================================

CREATE TABLE repair_order_photo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  repair_order_id  uuid NOT NULL,
  phase            text NOT NULL,
  storage_key      text NOT NULL,
  caption          text,
  taken_by_user_id uuid NOT NULL,
  taken_at         timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  CONSTRAINT photo_phase_valid
    CHECK (phase IN ('INTAKE','DIAGNOSIS','IN_PROGRESS','AFTER','DELIVERY'))
);

CREATE INDEX idx_ro_photo ON repair_order_photo (tenant_id, repair_order_id, phase);

-- =============================================================================
-- Tài sản trên xe (BC-01 bước 7)
-- =============================================================================

CREATE TABLE repair_order_asset (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  repair_order_id  uuid NOT NULL,
  description      text NOT NULL,
  photo_key        text,
  returned_at      timestamptz,
  returned_to_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  CONSTRAINT asset_description_not_blank CHECK (length(btrim(description)) >= 2),
  -- Đã trả thì phải biết trả cho ai — thiếu tên là mất luôn bằng chứng
  CONSTRAINT asset_returned_needs_name
    CHECK (returned_at IS NULL OR returned_to_name IS NOT NULL)
);

CREATE INDEX idx_ro_asset ON repair_order_asset (tenant_id, repair_order_id);

-- =============================================================================
-- RLS — INV-T-01
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['repair_order','repair_order_photo','repair_order_asset','doc_counter']
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

-- Chỉ bảng có cột updated_at mới gắn được trigger cập nhật thời gian
CREATE TRIGGER trg_touch_repair_order
  BEFORE UPDATE ON repair_order
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Quyền — 🔒 cấp TƯỜNG MINH (0003/0005 đã bỏ quyền mặc định)
-- =============================================================================

-- Đơn sửa chữa là hồ sơ sống: đổi trạng thái, ghi số km ra, huỷ. Nhưng KHÔNG
-- xoá — một đơn đã tồn tại là bằng chứng xe đã vào xưởng.
GRANT UPDATE ON repair_order TO garageos_app;

-- Bộ đếm: cần UPDATE để cấp số tiếp theo.
GRANT UPDATE ON doc_counter TO garageos_app;

-- 🔒 BR-01-3 — ảnh INTAKE là bằng chứng pháp lý, KHÔNG xoá được.
--    Không cấp DELETE, và cũng không cấp UPDATE: sửa `storage_key` của một ảnh
--    chính là tráo ảnh, tinh vi hơn xoá và khó phát hiện hơn nhiều.
--    (Chỉ cấp SELECT + INSERT theo mặc định của 0005.)

-- Tài sản trên xe: phải cập nhật được lúc trả đồ cho khách, nhưng không xoá.
GRANT UPDATE (returned_at, returned_to_name) ON repair_order_asset TO garageos_app;
