-- =============================================================================
-- 0005_review_fixes — Sửa 3 phát hiện từ codex-review nhánh feat/khach-hang-va-xe
-- =============================================================================

-- --- GARAGEOS-007 -----------------------------------------------------------
-- `GRANT UPDATE ON vehicle_ownership` cấp quyền sửa MỌI CỘT. Comment ở 0004 ghi
-- "chỉ để đặt ended_at" nhưng PostgreSQL không hiểu comment — ứng dụng hoặc SQL
-- tay vẫn đổi được `customer_id` và `started_at`, tức là VIẾT LẠI LỊCH SỬ chủ xe
-- và làm mất bằng chứng chuyển quyền sở hữu.
--
-- PostgreSQL có quyền theo CỘT. Dùng đúng thứ đó thay vì tin vào comment.
REVOKE UPDATE ON vehicle_ownership FROM garageos_app;
GRANT  UPDATE (ended_at, transfer_reason) ON vehicle_ownership TO garageos_app;

-- --- GARAGEOS-008 -----------------------------------------------------------
-- `ALTER DEFAULT PRIVILEGES` ở 0003 KHÔNG có mệnh đề `FOR ROLE`, nên nó chỉ áp
-- cho role đang chạy lệnh lúc đó. PostgreSQL lưu default privileges theo TỪNG
-- role tạo object. Nếu một migration sau chạy bằng role khác, bảng nó tạo sẽ
-- nhận lại quyền UPDATE/DELETE mặc định — quy tắc bảo vệ sổ kho âm thầm vô hiệu.
--
-- Khai báo tường minh FOR ROLE để không phụ thuộc vào "ai đang chạy".
ALTER DEFAULT PRIVILEGES FOR ROLE garageos IN SCHEMA public
  REVOKE UPDATE, DELETE ON TABLES FROM garageos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE garageos IN SCHEMA public
  GRANT SELECT, INSERT ON TABLES TO garageos_app;

-- 🔒 Nhưng default privileges CHỈ là lớp phòng thủ thứ hai. Lớp thứ nhất là:
--    mỗi migration tạo bảng sổ/chứng từ PHẢI tự REVOKE tường minh.
--    Ràng buộc này được kiểm tra tự động — xem packages/db/test/privileges.spec.ts
COMMENT ON SCHEMA public IS
  'QUY TAC QUYEN: mac dinh chi SELECT + INSERT (khai bao FOR ROLE garageos). '
  'Bang can UPDATE/DELETE phai GRANT tuong minh trong migration tao no. '
  'Bang so va chung tu (stock_movement, audit_log, invoice sau ISSUED) KHONG '
  'BAO GIO duoc cap UPDATE/DELETE, va phai REVOKE tuong minh de khong phu '
  'thuoc vao default privileges. Xem docs/adr/0002-immutable-ledger.md';

-- --- GARAGEOS-009 -----------------------------------------------------------
-- `plate_number = '---'` chuẩn hoá thành chuỗi rỗng: qua được NOT NULL, và mọi
-- biển rác khác cũng thành rỗng nên đụng unique index với nhau — thông báo lỗi
-- sẽ vô nghĩa với người dùng ("biển số đã tồn tại" cho một biển chưa từng nhập).
ALTER TABLE vehicle
  ADD CONSTRAINT vehicle_plate_not_blank
  CHECK (normalize_plate(plate_number) <> '');

-- Biển số Việt Nam ngắn nhất khoảng 7 ký tự sau chuẩn hoá (vd 29A12345 = 8).
-- Đặt ngưỡng dưới rộng rãi để không chặn nhầm biển đặc biệt (NG, QT, LD...).
ALTER TABLE vehicle
  ADD CONSTRAINT vehicle_plate_min_length
  CHECK (length(normalize_plate(plate_number)) >= 5);
