-- =============================================================================
-- 0062_sales_lead_update_grants — cấp quyền UPDATE theo CỘT cho lead
--
-- Nguồn: docs/reviews/2026-08-14-luong-tenant-public-landing.md (LS-008)
-- Test làm bằng chứng: apps/api/test/lead-thao-tac-ghi.spec.ts (LT-T01..T04)
-- =============================================================================

-- `garageos_app` chỉ có `INSERT` và `SELECT` trên `sales_lead`: 0057 tạo bảng
-- rồi `REVOKE DELETE`, nhưng không bao giờ `GRANT UPDATE`. Hệ quả là MỌI thao
-- tác ghi trên lead — gán tư vấn viên, chuyển trạng thái, ghi hoạt động — đều
-- trả 500 với `permission denied for table sales_lead`.
--
-- 💡 `SELECT … FOR UPDATE` cũng đòi quyền `UPDATE`, nên ngay cả bước KHOÁ dòng
-- cũng hỏng — lỗi xuất hiện trước cả câu lệnh ghi thật.
--
-- Cả Kanban lead chưa bao giờ hoạt động. Nó sống sót vì không bài kiểm nào gọi
-- vào ba endpoint đó: ma trận quyền chỉ phân biệt 403 với không-403, và với
-- nó thì 500 cũng là "quyền đã cho qua".

-- 🔒 Cấp theo CỘT, không cấp cả bảng — cùng khuôn mẫu với 0017.
--
-- Danh sách này cố ý KHÔNG có `full_name`, `phone_normalized`, `email`,
-- `message`: dữ liệu cá nhân chỉ đổi được qua `redact_sales_lead()`. Cũng
-- không có `redacted_at`/`redacted_by`/`redact_reason` — để tầng ứng dụng
-- không thể tự tuyên bố là đã xoá dữ liệu (`INV-LS-15`).
--
-- Cũng không có `reference`, `consent_version`, `consented_at`,
-- `catalog_context_snapshot`: đó là chứng cứ về thời điểm và nội dung khách
-- đồng ý, ghi một lần lúc tạo lead.
GRANT UPDATE (status, assigned_to, next_action_at, duplicate_of_id, updated_at, version)
  ON sales_lead TO garageos_app;

-- `updated_at` và `version` nằm trong danh sách vì trigger `touch_row()` là hàm
-- thường, không phải SECURITY DEFINER: nó chạy với quyền của người gọi, nên
-- thiếu hai cột này thì mọi UPDATE hợp lệ vẫn bị từ chối ở bước trigger.

COMMENT ON COLUMN sales_lead.full_name IS
  'Không nằm trong GRANT UPDATE — chỉ redact_sales_lead() ghi đè được.';
COMMENT ON COLUMN sales_lead.phone_normalized IS
  'Không nằm trong GRANT UPDATE — chỉ redact_sales_lead() ghi đè được.';
