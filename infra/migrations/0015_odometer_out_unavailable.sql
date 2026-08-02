-- =============================================================================
-- 0015 — Tách cờ "không đọc được số km" của lúc NHẬN và lúc GIAO
--
-- Phát hiện ra khi sửa GARAGEOS-REV-001 (codex-review Phase 1.6).
--
-- Bản đầu dùng MỘT cột `odometer_unavailable` cho cả hai thời điểm. Nhưng
-- ràng buộc `ro_odometer_unavailable_is_empty` ở 0006 nói "đã đánh dấu không
-- đọc được thì không được nhập số km" — nó viết cho lúc TIẾP NHẬN. Dùng lại
-- đúng cột đó lúc GIAO XE thì hai ý nghĩa đá nhau: đơn có số km vào hợp lệ mà
-- lúc giao đồng hồ hỏng sẽ không lưu được.
--
-- Một cột không mang được hai sự thật ở hai thời điểm. Tách ra.
-- =============================================================================

ALTER TABLE repair_order
  ADD COLUMN odometer_out_unavailable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN repair_order.odometer_unavailable IS
  'Luc TIEP NHAN khong doc duoc so km (dong ho hong). Xem BC-01 muc 4.';
COMMENT ON COLUMN repair_order.odometer_out_unavailable IS
  'Luc GIAO XE khong doc duoc so km. Tach rieng vi hai thoi diem la hai su that.';

-- Cùng logic với lúc nhận: đánh dấu không đọc được thì không đồng thời khai số.
ALTER TABLE repair_order
  ADD CONSTRAINT ro_odometer_out_unavailable_is_empty
  CHECK (NOT odometer_out_unavailable OR odometer_out IS NULL);

-- Ràng buộc "giao xe phải có số km" giờ nhìn vào ĐÚNG cột của lúc giao.
ALTER TABLE repair_order DROP CONSTRAINT ro_delivered_needs_odometer;
ALTER TABLE repair_order
  ADD CONSTRAINT ro_delivered_needs_odometer
  CHECK (status <> 'DELIVERED' OR odometer_out IS NOT NULL OR odometer_out_unavailable);

GRANT UPDATE (odometer_out_unavailable) ON repair_order TO garageos_app;
