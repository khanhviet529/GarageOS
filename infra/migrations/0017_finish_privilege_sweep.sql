-- =============================================================================
-- 0017 — Quét NỐT quyền cho các bảng còn lại (đợt 2 rà soát bảo mật)
--
-- 0016 sửa bốn bảng mà reviewer nêu tên. Test quét-toàn-bộ viết kèm 0016 lập
-- tức tìm ra BỐN BẢNG NỮA mà không ai — kể cả reviewer — nghĩ tới:
-- `branch`, `refresh_token`, `user_branch`, `schema_migration`.
--
-- Đó chính là lý do đổi từ danh sách viết tay sang quét toàn bộ: danh sách bảo
-- vệ được đúng những gì người viết đã nghĩ ra.
-- =============================================================================

-- --- branch ----------------------------------------------------------------
-- `code` là ĐỊNH DANH chi nhánh, xuất hiện trong mã đơn và báo cáo đối soát.
-- Xoá chi nhánh thì mọi đơn của nó mất tham chiếu — chi nhánh đóng cửa là
-- `is_active = false`, không phải DELETE.
REVOKE UPDATE, DELETE ON branch FROM garageos_app;
GRANT UPDATE (name, address, phone, timezone, is_active, version)
  ON branch TO garageos_app;

-- --- refresh_token ---------------------------------------------------------
-- Chỉ được ĐÓNG một token (thu hồi / xoay vòng), không được sửa nội dung nó.
-- Sửa `token_hash` hay `expires_at` là gia hạn một credential đã phát —
-- đúng thứ mà cơ chế thu hồi sinh ra để ngăn.
REVOKE UPDATE, DELETE ON refresh_token FROM garageos_app;
GRANT UPDATE (revoked_at, replaced_by_id) ON refresh_token TO garageos_app;

-- --- user_branch -----------------------------------------------------------
-- Bảng gán người dùng vào chi nhánh: chỉ thêm và bớt, không có gì để sửa.
-- Nhưng bớt là thao tác quyền hạn thật (gỡ quyền truy cập một chi nhánh), nên
-- giữ DELETE — nó không phải dữ liệu nghiệp vụ.
REVOKE UPDATE ON user_branch FROM garageos_app;

-- --- schema_migration ------------------------------------------------------
-- 🔒 Sổ ghi migration đã chạy. Ứng dụng KHÔNG có việc gì ở đây; sửa được nó là
-- xoá được dấu vết một migration đã chạy, và lần deploy sau chạy lại migration
-- đó trên dữ liệu đã đổi.
REVOKE ALL ON schema_migration FROM garageos_app;
GRANT SELECT ON schema_migration TO garageos_app;

COMMENT ON TABLE schema_migration IS
  'So ghi migration da chay. garageos_app chi duoc SELECT — sua duoc bang nay '
  'la xoa duoc dau vet mot migration, va lan deploy sau chay lai no.';
