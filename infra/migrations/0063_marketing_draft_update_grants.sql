-- =============================================================================
-- 0063_marketing_draft_update_grants — cấp quyền UPDATE theo CỘT cho bản nháp
--
-- Nguồn: rà soát vùng thay đổi 2026-08-14 (RV-001)
-- Test làm bằng chứng: apps/api/test/marketing-soan-thao.spec.ts (MK-T01..T05)
-- =============================================================================

-- `0056` cấp cho `garageos_app` đúng `INSERT` và `SELECT` trên bốn bảng bản
-- nháp, rồi `REVOKE DELETE` — như thể `UPDATE` đã có sẵn. Nó chưa bao giờ được
-- cấp. Toàn bộ luồng soạn thảo nội dung vì thế trả 500:
--
--   PATCH /marketing/vehicle-products/:id/draft        → permission denied
--   PATCH /marketing/vehicle-experiences/:id/draft     → permission denied
--   PATCH /marketing/site-profile/:draftId             → permission denied
--   PATCH /marketing/branch-public-profiles/:id/draft  → permission denied
--   POST  /marketing/vehicle-products/:id/publish      → permission denied
--
-- 💡 Đây là lần THỨ HAI cùng một lỗi xuất hiện — lần đầu ở `sales_lead`
-- (migration 0062). Khuôn mẫu chung: bảng mới được tạo, `REVOKE` những thứ
-- không muốn, và không ai để ý rằng `GRANT` mặc định không tồn tại. `REVOKE`
-- đọc như một lời khẳng định rằng phần còn lại đã được cấp.
--
-- 🔒 Lớp chặn thật cho tính bất biến KHÔNG phải là việc thiếu quyền một cách
-- tình cờ, mà là trigger `chan_sua_version_bat_bien()`: nó từ chối mọi UPDATE
-- lên row có `status <> 'DRAFT'` khi `current_user <> 'garageos'`. Cấp quyền ở
-- đây không nới lỏng `INV-LS-07`; nó chỉ trả lại đúng khả năng sửa BẢN NHÁP.
-- `MK-T05` canh chính điều đó.

-- Nội dung của bản nháp sản phẩm. Không có `status`, `published_at`,
-- `published_by`, `revision_number` — chuyển trạng thái chỉ qua hàm
-- `marketing_promote_product_draft()`.
GRANT UPDATE (
  name, summary, description, seo_title, seo_description,
  content_hash, updated_by, updated_at, version
) ON vehicle_product_revision TO garageos_app;

-- Tương tự cho trải nghiệm 360°/panorama. `config` là JSONB đã được Zod kiểm ở
-- tầng contracts; nó chỉ tham chiếu binding stable key, không chứa URL.
GRANT UPDATE (
  label, poster_media_id, config,
  content_hash, updated_by, updated_at, version
) ON vehicle_experience_version TO garageos_app;

-- Hồ sơ trang. Không có `version_number` — số hiệu bản do hàm publish cấp.
GRANT UPDATE (
  brand_name, legal_name, default_title_suffix, default_description,
  logo_media_id, default_social_media_id, favicon_media_id, app_icon_media_id,
  phone, address, geo, opening_hours,
  updated_by, updated_at, version
) ON site_profile TO garageos_app;

-- Hồ sơ chi nhánh công khai (NAP). Không có `stable_key`: nó thuộc danh tính
-- chi nhánh, đổi được thì trigger `branch_profile_stable_key_unique` mất ý
-- nghĩa.
GRANT UPDATE (
  public_name, public_phone, public_address, geo, opening_hours,
  updated_by, updated_at, version
) ON branch_public_profile TO garageos_app;

-- `updated_at` và `version` có mặt ở cả bốn vì trigger `touch_row()` là hàm
-- thường, chạy với quyền người gọi: thiếu hai cột này thì mọi UPDATE hợp lệ vẫn
-- bị từ chối ở bước trigger.
