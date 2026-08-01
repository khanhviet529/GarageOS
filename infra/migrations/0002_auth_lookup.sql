-- =============================================================================
-- 0002_auth_lookup — Tra cứu người dùng lúc đăng nhập
--
-- VẤN ĐỀ: đăng nhập xảy ra TRƯỚC khi biết tenant nào. Nhưng RLS trên app_user
-- yêu cầu `app.tenant_id` đã được đặt, nên truy vấn thường trả về 0 dòng —
-- không ai đăng nhập được.
--
-- CÁC PHƯƠNG ÁN:
--   a) Nới RLS trên app_user            -> ❌ phá INV-T-01, mất cô lập
--   b) Dùng role admin cho login        -> ❌ superuser bỏ qua RLS toàn bộ
--   c) SECURITY DEFINER hẹp             -> ✅ chọn
--
-- SECURITY DEFINER chạy với quyền chủ sở hữu hàm (bỏ qua RLS), nhưng hàm này
-- CỐ Ý rất hẹp: chỉ nhận số điện thoại, chỉ trả về đúng các cột cần cho xác
-- thực, không nhận điều kiện lọc tuỳ ý. Đây là bề mặt tấn công tối thiểu.
-- =============================================================================

-- 🔒 Số điện thoại duy nhất TOÀN CỤC, không chỉ trong tenant.
--
-- Vì sao: nếu cùng một số tồn tại ở hai tenant, hệ thống không biết đăng nhập
-- vào tenant nào — cần thêm bước chọn tenant, làm phức tạp luồng đăng nhập.
--
-- ⚠️ Đánh đổi: một người không thể làm việc ở hai garage khác chủ bằng cùng số
-- điện thoại. Chấp nhận ở giai đoạn 1; nếu thực tế cần thì bổ sung bước chọn
-- tenant ở giai đoạn 2.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_phone_global
  ON app_user (phone) WHERE is_active;

CREATE OR REPLACE FUNCTION auth_find_user_by_phone(p_phone text)
RETURNS TABLE (
  id            uuid,
  tenant_id     uuid,
  password_hash text,
  full_name     text,
  roles         user_role[],
  is_active     boolean
)
LANGUAGE sql
SECURITY DEFINER          -- 🔒 chạy với quyền chủ sở hữu -> bỏ qua RLS
SET search_path = public  -- 🔒 chống tấn công qua search_path
STABLE
AS $$
  SELECT u.id, u.tenant_id, u.password_hash, u.full_name, u.roles, u.is_active
    FROM app_user u
   WHERE u.phone = p_phone
     AND u.is_active
   LIMIT 1;
$$;

-- Chỉ cấp quyền chạy, không cấp gì thêm
REVOKE ALL ON FUNCTION auth_find_user_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_phone(text) TO garageos_app;

COMMENT ON FUNCTION auth_find_user_by_phone(text) IS
  'SECURITY DEFINER hẹp cho luồng đăng nhập. KHÔNG mở rộng hàm này để nhận '
  'thêm điều kiện lọc — mỗi tham số thêm vào là một đường vòng qua RLS.';
