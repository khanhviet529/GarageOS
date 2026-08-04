-- =============================================================================
-- 0027 — Giữ chỗ phụ tùng (Phase 2.2, BC-04)
--
-- Bài toán: kho còn ĐÚNG một bộ má phanh, hai khách cùng duyệt báo giá lúc
-- 9:00 và 9:01. Chỉ kiểm `tồn > 0` rồi cho qua thì cả hai đơn đều nhận, và thợ
-- thứ hai ra kho không có hàng — sau khi hệ thống đã hứa với khách và đã xếp
-- lịch thợ.
--
-- 🔒 INV-S-05 giữ chỗ ≤ khả dụng · INV-S-06 giữ chỗ hết hạn phải được giải phóng
-- =============================================================================

CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- =============================================================================
-- Bảng giữ chỗ
--
-- BC-04 mục 1: `on_hand` là hàng VẬT LÝ trên kệ, `reserved` là hàng đã CAM KẾT
-- cho đơn đã duyệt. Tách hai khái niệm vì trừ thẳng `on_hand` lúc duyệt thì thủ
-- kho nhìn lên kệ thấy hàng còn đó mà hệ thống báo hết — và kiểm kê không bao
-- giờ khớp.
--
-- Chỉ MỘT chuyển đổi làm giảm `on_hand`: ACTIVE -> CONSUMED, và nó đi kèm một
-- dòng `stock_movement(ISSUE)`. Đó là điều giữ cho sổ kho khớp với thực tế.
-- =============================================================================

CREATE TABLE stock_reservation (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  warehouse_id      uuid NOT NULL,
  part_id           uuid NOT NULL,
  repair_order_id   uuid NOT NULL,
  quotation_line_id uuid NOT NULL,
  quantity          numeric(12,2) NOT NULL,
  status            reservation_status NOT NULL DEFAULT 'ACTIVE',
  expires_at        timestamptz NOT NULL,

  -- Trỏ về dòng sổ đã tiêu nó. Có giá trị <=> status = 'CONSUMED'.
  consumed_by_movement_id uuid,

  released_reason   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id)      REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)           REFERENCES part(tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)   REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_line_id) REFERENCES quotation_line(tenant_id, id),
  FOREIGN KEY (tenant_id, consumed_by_movement_id) REFERENCES stock_movement(tenant_id, id),

  CONSTRAINT positive_quantity CHECK (quantity > 0),

  -- 🔒 `consumed_by_movement_id` và trạng thái CONSUMED phải đi cùng nhau, cả
  --    hai chiều. Một bản ghi CONSUMED không trỏ về dòng sổ nào là một lần xuất
  --    kho không giải thích được; ngược lại, một bản ghi ACTIVE mà đã trỏ về
  --    dòng sổ nghĩa là hàng đã ra khỏi kho nhưng vẫn đang chiếm chỗ.
  CONSTRAINT consumed_iff_movement CHECK (
    (status = 'CONSUMED') = (consumed_by_movement_id IS NOT NULL))
);

-- Giữ chỗ đang sống của một (kho, phụ tùng) — câu hỏi nóng nhất của cả bảng
CREATE INDEX idx_reservation_active
  ON stock_reservation (tenant_id, warehouse_id, part_id) WHERE status = 'ACTIVE';

-- Job dọn hết hạn (INV-S-06) quét theo đúng chỉ mục này
CREATE INDEX idx_reservation_expiry
  ON stock_reservation (expires_at) WHERE status = 'ACTIVE';

CREATE INDEX idx_reservation_order
  ON stock_reservation (tenant_id, repair_order_id);

CREATE TRIGGER trg_touch_stock_reservation
  BEFORE UPDATE ON stock_reservation FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- 🔒 `reserved` là DẪN XUẤT của bảng giữ chỗ — cùng kiểu với `on_hand`
--
-- 0025 đã đặt `stock_balance.on_hand` làm bản tổng hợp của `stock_movement`,
-- duy trì bằng trigger, và ứng dụng không ghi thẳng được. Cột `reserved` đi
-- theo đúng khuôn đó: nguồn sự thật là `stock_reservation`, trigger cộng trừ.
--
-- Vì sao KHÔNG để service tự cộng như BC-04 mục 3 phác:
-- huỷ đơn (BC-10), hết hạn giữ chỗ (INV-S-06), bỏ hạng mục sau khi duyệt, trả
-- hàng về kho (BC-04 mục 5.4) — bốn đường khác nhau đều làm nhả chỗ. Mỗi đường
-- tự nhớ trừ `reserved` là bốn cơ hội quên, và quên thì hàng bị treo vĩnh viễn:
-- `available` thấp hơn thực tế, xưởng từ chối đơn cho món vẫn còn trên kệ.
-- Không có báo động nào cho chuyện đó, vì `on_hand` vẫn đúng.
--
-- Với trigger, ĐỔI TRẠNG THÁI là hành động duy nhất cần nhớ.
-- =============================================================================

CREATE OR REPLACE FUNCTION cap_nhat_giu_cho() RETURNS trigger AS $$
DECLARE
  delta numeric(12,2) := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'RESERVATION_MUST_START_ACTIVE: giữ chỗ phải bắt đầu ở ACTIVE'
        USING ERRCODE = 'check_violation';
    END IF;
    delta := NEW.quantity;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NULL;   -- đổi cột khác, không đụng tới phần đang giữ
    END IF;
    IF OLD.status <> 'ACTIVE' THEN
      -- ACTIVE là trạng thái sống DUY NHẤT. Đi ra khỏi nó là một chiều: một
      -- bản ghi RELEASED sống lại thành ACTIVE sẽ chiếm chỗ hai lần.
      RAISE EXCEPTION 'RESERVATION_TERMINAL: giữ chỗ đã ở % , không đổi được nữa', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    delta := -OLD.quantity;
  END IF;

  -- Khoá dòng tồn trước khi cộng — cùng lý do với `cong_vao_ton_kho()`.
  PERFORM 1 FROM stock_balance
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO stock_balance (tenant_id, warehouse_id, part_id)
         VALUES (NEW.tenant_id, NEW.warehouse_id, NEW.part_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 🔒 `available_non_negative` bắn Ở ĐÂY nếu giữ chỗ vượt hàng khả dụng.
  --    Đó là INV-S-05, và nó được bao trọn trong ràng buộc của 0025 — không
  --    cần một ràng buộc thứ hai chép lại cùng một quy tắc.
  UPDATE stock_balance
     SET reserved   = reserved + delta,
         version    = version + 1,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_reservation_updates_balance
  AFTER INSERT OR UPDATE ON stock_reservation
  FOR EACH ROW EXECUTE FUNCTION cap_nhat_giu_cho();

-- =============================================================================
-- 🔒 Khoá và đọc tồn khả dụng — hàm, không phải quyền bảng
--
-- Ứng dụng CẦN khoá dòng tồn trước khi quyết định giữ chỗ bao nhiêu (giữ chỗ
-- một phần, BC-04 mục 5.1). Nhưng `SELECT … FOR UPDATE` đòi quyền ghi bảng, mà
-- 0025 cố ý thu hồi quyền ghi `stock_balance` của `garageos_app`.
--
-- Cấp một HÀM thay vì cấp quyền bảng: ứng dụng lấy được đúng cái khoá nó cần,
-- và vẫn không ghi thẳng được vào bảng tổng hợp. Quyền hẹp đúng bằng nhu cầu.
--
-- ⚠️ Gọi hàm này theo THỨ TỰ `part_id` TĂNG DẦN khi giữ chỗ nhiều phụ tùng
--    trong một giao dịch. Hai đơn cùng cần A và B mà khoá ngược thứ tự nhau là
--    deadlock kinh điển. Thứ tự nhất quán thì không tạo được chu trình chờ.
--    Ràng buộc này KHÔNG enforce được ở DB — nó nằm ở `StockReservationService`,
--    và có test đồng thời canh.
-- =============================================================================

CREATE OR REPLACE FUNCTION khoa_va_doc_kha_dung(
  p_tenant    uuid,
  p_warehouse uuid,
  p_part      uuid
) RETURNS numeric AS $$
DECLARE
  kq numeric(12,2);
BEGIN
  SELECT on_hand - reserved INTO kq
    FROM stock_balance
   WHERE tenant_id = p_tenant AND warehouse_id = p_warehouse AND part_id = p_part
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Chưa từng nhập mã này vào kho. Tạo dòng 0 để lần gọi sau có cái mà khoá,
    -- nếu không thì hai giao dịch cùng giữ chỗ cho một mã mới đều thấy "không
    -- có dòng nào" và không ai chờ ai.
    INSERT INTO stock_balance (tenant_id, warehouse_id, part_id)
         VALUES (p_tenant, p_warehouse, p_part)
    ON CONFLICT DO NOTHING;

    SELECT on_hand - reserved INTO kq
      FROM stock_balance
     WHERE tenant_id = p_tenant AND warehouse_id = p_warehouse AND part_id = p_part
     FOR UPDATE;
  END IF;

  RETURN COALESCE(kq, 0);
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION khoa_va_doc_kha_dung(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION khoa_va_doc_kha_dung(uuid, uuid, uuid) TO garageos_app;

-- =============================================================================
-- RLS và quyền
-- =============================================================================

ALTER TABLE stock_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservation FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_reservation
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 🔒 Giữ chỗ KHÔNG xoá: một lần giữ rồi nhả là dữ liệu cần cho việc giải thích
--    vì sao hàng từng bị treo. Ra khỏi ACTIVE bằng cách đổi trạng thái.
GRANT UPDATE (status, consumed_by_movement_id, released_reason, version)
  ON stock_reservation TO garageos_app;
REVOKE DELETE ON stock_reservation FROM garageos_app;

-- `quantity` không nằm trong danh sách trên, và đó là chủ ý: sửa số lượng của
-- một lần giữ chỗ đang sống sẽ làm `reserved` lệch với tổng các bản ghi — cùng
-- loại lệch mà INV-S-02 chống ở phía `on_hand`. Cần đổi thì nhả rồi giữ lại.
