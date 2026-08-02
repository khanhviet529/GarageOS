-- =============================================================================
-- 0014_state_machine — Máy trạng thái đơn sửa chữa (Phase 1.6)
--
-- `docs/06-state-machines.md` mục 1 nói enforce ở tầng service. Ở đây làm THÊM
-- một lớp ở database, vì lý do đã lặp lại nhiều lần trong dự án này: quy tắc chỉ
-- sống trong code ứng dụng là quy tắc chỉ áp dụng cho những đường đi qua code đó.
-- Script bảo trì, import dữ liệu và một service viết vội đều đi vòng được.
--
-- Bảng chuyển đổi được khai báo bằng DỮ LIỆU, không phải bằng chuỗi IF lồng
-- nhau: thêm một đường chuyển là thêm một dòng, và đọc bảng ra là thấy toàn bộ
-- máy trạng thái.
-- =============================================================================

CREATE TABLE repair_order_transition (
  from_status repair_order_status NOT NULL,
  to_status   repair_order_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

COMMENT ON TABLE repair_order_transition IS
  'Bang chuyen trang thai hop le. 🔒 PHAI khop voi REPAIR_ORDER_TRANSITIONS '
  'trong packages/contracts/src/state-machine.ts — co test doi chieu hai ben.';

INSERT INTO repair_order_transition (from_status, to_status) VALUES
  ('RECEIVED','DIAGNOSING'),          ('RECEIVED','CANCELLED'),
  ('DIAGNOSING','QUOTED'),            ('DIAGNOSING','CANCELLED'),
  ('QUOTED','AWAITING_APPROVAL'),     ('QUOTED','CANCELLED'),
  ('AWAITING_APPROVAL','AWAITING_PARTS'),
  ('AWAITING_APPROVAL','IN_PROGRESS'),
  ('AWAITING_APPROVAL','AWAITING_DELIVERY'),
  ('AWAITING_APPROVAL','QUOTED'),
  ('AWAITING_APPROVAL','CANCELLED'),
  ('AWAITING_PARTS','IN_PROGRESS'),   ('AWAITING_PARTS','CANCELLED'),
  ('IN_PROGRESS','AWAITING_APPROVAL'),
  ('IN_PROGRESS','AWAITING_PARTS'),
  ('IN_PROGRESS','QUALITY_CHECK'),
  ('IN_PROGRESS','CANCELLED'),
  ('QUALITY_CHECK','IN_PROGRESS'),    ('QUALITY_CHECK','AWAITING_PAYMENT'),
  ('AWAITING_PAYMENT','AWAITING_DELIVERY'),
  ('AWAITING_DELIVERY','DELIVERED');
-- DELIVERED và CANCELLED không có dòng nào: trạng thái hấp thụ, không có đường ra.

-- Bảng tra cứu dùng chung cho mọi tenant -> không có RLS, chỉ đọc.
REVOKE ALL ON repair_order_transition FROM garageos_app;
GRANT SELECT ON repair_order_transition TO garageos_app;

CREATE OR REPLACE FUNCTION kiem_tra_chuyen_trang_thai() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM repair_order_transition
     WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION
      'INVALID_TRANSITION: khong chuyen tu % sang % duoc', OLD.status, NEW.status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'ro_invalid_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- BEFORE, chạy trước trigger ghi nhật ký (AFTER) — chuyển sai thì không có gì
-- để ghi cả.
CREATE TRIGGER trg_ro_transition
  BEFORE UPDATE OF status ON repair_order
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_chuyen_trang_thai();

-- =============================================================================
-- Cột phục vụ vòng đời đơn mà 0006 chưa có
-- =============================================================================

ALTER TABLE repair_order ADD COLUMN ready_for_delivery_at timestamptz;

-- 🔒 Giao xe thì BẮT BUỘC có số km ra, hoặc đánh dấu đồng hồ hỏng.
--    Ràng buộc `ro_delivered_needs_odometer` từ 0006 đã lo phần này; ở đây chỉ
--    mở quyền ghi cho cột mới và cột đánh dấu.
GRANT UPDATE (ready_for_delivery_at) ON repair_order TO garageos_app;
