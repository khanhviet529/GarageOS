-- =============================================================================
-- 0073_ton_va_giao_xe — Khả năng giao xe theo chi nhánh
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §3, §4.5
-- Bất biến: INV-LS-17 (landing không hiển thị số lượng xe),
--           INV-LS-13 + ngoại lệ CÓ TÊN cho nhóm trạng thái vận hành
--
-- 🔒 Vì sao bảng này KHÔNG đi qua revision — quyết định kiến trúc quan trọng
--    nhất của lát cắt này:
--
--    Sáu nhóm dữ liệu mới (giá, màu, ảnh, ưu đãi, trả góp, SEO) là NỘI DUNG:
--    cần duyệt, cần lịch sử, cần publish. Nhóm thứ bảy — tồn và thời gian giao —
--    là TRẠNG THÁI VẬN HÀNH: nhân viên chi nhánh sửa vài lần mỗi tuần.
--
--    Nhét nó vào revision nghĩa là mỗi lần một showroom đổi *Sắp về* thành
--    *Sẵn xe*, hệ thống buộc phải publish lại cả trang xe — KÉO THEO nội dung
--    marketing đang soạn dở ra công khai. Đó là cách chắc chắn nhất để đẩy nội
--    dung chưa duyệt lên trang.
--
--    Ngoại lệ CÓ TÊN thì kiểm được bằng test; ngoại lệ ngầm thì không.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE vehicle_availability_status AS ENUM ('SAN_XE','SAP_VE','DAT_HANG','TAM_NGUNG');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vehicle_availability (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  product_id          uuid NOT NULL,
  branch_id           uuid NOT NULL,
  status              vehicle_availability_status NOT NULL,

  -- 🔒 KHÔNG CÓ CỘT SỐ LƯỢNG, và đây không phải là sơ suất.
  --    Hệ thống không nắm tồn theo VIN, nên "còn 2 xe" là nói một điều mình
  --    không biết (INV-LS-17). Không lưu số thì không thể vô tình hiện số —
  --    ràng buộc ở tầng lưu trữ, không ở lời hứa trong code.
  --    Nếu sau này cần tồn thật theo VIN thì đó là một mô hình khác và một
  --    quyết định khác, không phải thêm một cột vào đây.
  lead_time_days_min  int,
  lead_time_days_max  int,

  available_variant_ids uuid[] NOT NULL DEFAULT '{}',
  available_color_ids   uuid[] NOT NULL DEFAULT '{}',
  note                text,

  updated_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, branch_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES vehicle_product(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id)  REFERENCES branch(tenant_id, id),

  CONSTRAINT availability_lead_time_pair CHECK (
    (lead_time_days_min IS NULL) = (lead_time_days_max IS NULL)
  ),
  CONSTRAINT availability_lead_time_order CHECK (
    lead_time_days_min IS NULL OR (lead_time_days_min >= 0 AND lead_time_days_max >= lead_time_days_min)
  ),
  -- 🔒 "Sẵn xe" mà vẫn khai thời gian chờ là hai phát biểu mâu thuẫn trên cùng
  --    một dòng; khách đọc được cả hai và tin cái có lợi cho mình.
  CONSTRAINT availability_status_matches_lead_time CHECK (
    (status = 'SAN_XE' AND lead_time_days_min IS NULL)
    OR (status IN ('SAP_VE','DAT_HANG') AND lead_time_days_min IS NOT NULL)
    OR (status = 'TAM_NGUNG')
  )
);

CREATE INDEX IF NOT EXISTS idx_availability_by_product
  ON vehicle_availability (tenant_id, product_id, status);

ALTER TABLE vehicle_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_availability FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vehicle_availability;
CREATE POLICY tenant_isolation ON vehicle_availability
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_touch_vehicle_availability ON vehicle_availability;
CREATE TRIGGER trg_touch_vehicle_availability
  BEFORE UPDATE ON vehicle_availability
  FOR EACH ROW EXECUTE FUNCTION touch_row();

/*
 * 🔒 UPDATE cấp THEO CỘT. `product_id` và `branch_id` không nằm trong danh
 *    sách: chúng là khoá của dòng khai báo. Đổi được `branch_id` nghĩa là nhân
 *    viên một chi nhánh sửa được khai báo của chi nhánh khác bằng một câu
 *    UPDATE — vòng qua đúng bài kiểm phạm vi ở tầng service.
 *
 * KHÔNG cấp DELETE: gỡ hẳn một dòng khai báo là làm mất câu trả lời cho "chi
 * nhánh này có nhận đặt mẫu xe đó không". Trạng thái `TAM_NGUNG` diễn đạt được
 * việc ngừng nhận mà vẫn giữ vết ai khai, khai lúc nào.
 */
GRANT SELECT, INSERT ON vehicle_availability TO garageos_app;
GRANT UPDATE (
  status, lead_time_days_min, lead_time_days_max,
  available_variant_ids, available_color_ids, note,
  updated_by
) ON vehicle_availability TO garageos_app;
