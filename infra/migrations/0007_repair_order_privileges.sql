-- =============================================================================
-- 0007 — Sửa 2 phát hiện từ codex-review nhánh feat/tiep-nhan-xe
-- =============================================================================

-- --- GARAGEOS-002 -----------------------------------------------------------
-- `GRANT UPDATE ON repair_order` cấp quyền sửa MỌI CỘT. Comment ở 0006 ghi là
-- "đổi trạng thái, ghi số km ra, huỷ" nhưng PostgreSQL không đọc comment: một
-- bug hoặc một câu SQL tay vẫn đổi được `vehicle_id`, `customer_id`, hay
-- `customer_access_token` — tức là gán đơn sang xe khác, hoặc phát lại chìa
-- khoá trang tra cứu công khai mà không để lại dấu vết nào.
--
-- Hiện trạng lúc tiếp nhận (`odometer_in`, `customer_complaint`, `received_at`)
-- là BẢN GHI NHẬN, không phải dữ liệu sống. Sửa được nghĩa là viết lại được
-- những gì khách đã khai.
REVOKE UPDATE ON repair_order FROM garageos_app;
GRANT UPDATE (
  status,
  odometer_out,
  odometer_unavailable,
  promised_at,
  delivered_at,
  cancelled_at,
  cancel_reason,
  cancel_category,
  version
) ON repair_order TO garageos_app;

-- --- 🔒 INV-A-02 ------------------------------------------------------------
-- "Mọi thay đổi trạng thái đều có bản ghi nhật ký, trong CÙNG transaction."
--
-- docs/05-invariants.md ghi rõ: enforce bằng TRIGGER, không dựa vào việc ứng
-- dụng nhớ ghi log. Lý do là quy tắc kiểu "nhớ ghi log" luôn đúng ở đoạn code
-- đầu tiên và sai ở đoạn thứ năm.
--
-- Đặt trigger NGAY BÂY GIỜ, trước khi có bất kỳ đoạn code nào đổi trạng thái,
-- để khoảng trống đó không bao giờ tồn tại.
CREATE OR REPLACE FUNCTION log_status_change() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type,
                           entity_id, before_json, after_json)
    VALUES (
      NEW.tenant_id,
      -- Migration và script bảo trì chạy ngoài ứng dụng thì không có user;
      -- ghi NULL vẫn hơn là chặn hẳn thao tác.
      nullif(current_setting('app.user_id', true), '')::uuid,
      'STATUS_CHANGED',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER vì `audit_log` cố tình KHÔNG cho ứng dụng sửa/xoá; hàm chạy
-- bằng quyền chủ sở hữu để ghi được nhật ký mà không phải nới quyền cho app.
COMMENT ON FUNCTION log_status_change() IS
  'INV-A-02: ghi audit_log moi lan doi status. SECURITY DEFINER de khong phai '
  'noi quyen cua garageos_app tren audit_log.';

CREATE TRIGGER trg_log_status_repair_order
  AFTER UPDATE ON repair_order
  FOR EACH ROW EXECUTE FUNCTION log_status_change();
