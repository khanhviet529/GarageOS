-- =============================================================================
-- 0016 — Quyền theo CỘT cho các bảng còn sót, và bịt search_path cho mọi hàm
--        SECURITY DEFINER (đợt 2 rà soát bảo mật)
--
-- Đây là lần thứ TƯ dự án sửa cùng một lỗi: `GRANT UPDATE` không kèm danh sách
-- cột thì cấp quyền sửa MỌI cột. Đã sửa cho `vehicle_ownership` (0005),
-- `repair_order` (0007), `quotation_line` (0011) — nhưng bốn bảng dưới đây bị
-- bỏ sót, và test kiến trúc ở `packages/db/test/privileges.spec.ts` chỉ kiểm
-- những bảng được liệt kê tay nên không bắt được.
--
-- Bài học đã ghi vào test: từ nay quét TOÀN BỘ bảng thay vì liệt kê.
-- =============================================================================

-- --- app_user: bảng chứa VAI TRÒ và MẬT KHẨU -------------------------------
--
-- Nguy hiểm nhất trong bốn bảng. Kịch bản: Phase sau có màn "sửa hồ sơ nhân
-- viên" hoặc "đổi mật khẩu", ai đó dựng câu `UPDATE app_user SET ... WHERE id`
-- từ body (lỗi mass-assignment kinh điển) — một cố vấn gửi kèm
-- `roles: ["OWNER"]` là leo quyền lên chủ chuỗi. RLS KHÔNG chặn vì cùng tenant,
-- và ma trận quyền chỉ sống ở tầng service.
REVOKE UPDATE, DELETE ON app_user FROM garageos_app;
GRANT UPDATE (full_name, email, is_active, version) ON app_user TO garageos_app;

COMMENT ON COLUMN app_user.roles IS
  'KHONG cap UPDATE cho garageos_app. Doi vai phai qua ham SECURITY DEFINER co '
  'kiem tra vai nguoi goi, hoac qua migration.';
COMMENT ON COLUMN app_user.password_hash IS
  'KHONG cap UPDATE cho garageos_app. Doi mat khau se qua ham rieng o Phase 6.';

-- --- vehicle: `last_odometer` là đúng cột INV-V-04 bảo vệ -------------------
--
-- `plate_number` là cột INV-V-02 bảo vệ, và `uq_vehicle_plate` là partial index
-- `WHERE deleted_at IS NULL` — nên chỉ cần `UPDATE vehicle SET deleted_at = now()`
-- là GIẢI PHÓNG biển số để tạo hồ sơ trùng: lịch sử xe tách đôi, bảo hành tra
-- không ra. Đúng thứ mà cả màn gợi ý biển gần giống được dựng ra để chống.
--
-- `powertrain` cũng nằm đây: đổi nó sau khi đã báo giá để lại một báo giá vi
-- phạm INV-V-01 mà trigger không kiểm lại (trigger chỉ chạy trên quotation_line).
REVOKE UPDATE, DELETE ON vehicle FROM garageos_app;
GRANT UPDATE (last_odometer, last_service_at, version) ON vehicle TO garageos_app;

-- --- customer: hồ sơ sửa được, nhưng không đổi loại và không xoá cứng -------
REVOKE UPDATE, DELETE ON customer FROM garageos_app;
GRANT UPDATE (display_name, phone, approver_phone, email, address, tax_code,
              credit_limit_amount, payment_term_days, version)
  ON customer TO garageos_app;

-- --- tenant: các cột ngưỡng CHÍNH LÀ tham số phân quyền ---------------------
--
-- `discount_threshold_percent`, `adjustment_threshold_amount`,
-- `invoice_variance_threshold_percent` quyết định thao tác nào cần quản lý
-- duyệt (docs/02 mục 4). Cấp UPDATE toàn cột cho role ứng dụng nghĩa là khi có
-- màn cấu hình ở Phase sau, không có gì ở tầng DB ngăn một vai không đủ thẩm
-- quyền tự nới ngưỡng duyệt giảm giá của chính mình.
REVOKE UPDATE, DELETE ON tenant FROM garageos_app;

-- =============================================================================
-- 🔒 `SET search_path` cho MỌI hàm SECURITY DEFINER
--
-- Hàm SECURITY DEFINER chạy bằng quyền chủ sở hữu — ở đây là role migration,
-- có BYPASSRLS. Nếu `search_path` không cố định, một object cùng tên đứng trước
-- `public` sẽ được dùng thay, và code của kẻ tấn công chạy bằng quyền đó.
--
-- Phải có CẢ `pg_temp`: PostgreSQL tìm schema tạm TRƯỚC mọi schema khác khi
-- `pg_temp` không được liệt kê tường minh. Migration 0002 đã ghi comment
-- "🔒 chống tấn công qua search_path" nhưng chỉ viết `SET search_path = public`
-- — thiếu đúng nửa nguy hiểm.
--
-- ⚠️ Trung thực về mức độ: hiện KHÔNG khai thác độc lập được — `garageos_app`
-- không tạo được schema, và mọi truy vấn đều tham số hoá. Đây là lỗ hổng chuỗi:
-- nó biến một lỗi tương lai hạng trung thành thảm hoạ toàn hệ thống. Bán kính
-- nổ lớn, cách sửa dài một dòng.
-- =============================================================================

ALTER FUNCTION auth_find_user_by_phone(text)        SET search_path = public, pg_temp;
ALTER FUNCTION public_resolve_tracking_token(text)  SET search_path = public, pg_temp;
ALTER FUNCTION log_status_change()                  SET search_path = public, pg_temp;
