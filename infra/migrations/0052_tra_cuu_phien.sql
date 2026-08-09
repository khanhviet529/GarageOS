-- =============================================================================
-- 0052 — Hai hàm tra cứu cho luồng làm mới phiên
--
-- Cùng lý do với `auth_find_user_by_phone` (0002): hai truy vấn này chạy TRƯỚC
-- khi biết người gọi thuộc tenant nào, nên RLS không có gì để lọc theo. Giải
-- pháp vẫn là hàm `SECURITY DEFINER` HẸP, không phải nới RLS.
--
-- 🔒 Hẹp nghĩa là gì, cụ thể:
--
--   · Nhận vào một giá trị người gọi không đoán được: `auth_find_refresh_token`
--     nhận **băm SHA-256** của token, không nhận id. Không có băm thì không tra
--     ra gì, mà băm thì chỉ ai đang giữ token mới tính được.
--   · `auth_find_user_by_id` nhận uuid — không đoán được trong thực tế, và nó
--     chỉ chạy SAU khi một refresh token hợp lệ đã chỉ đúng vào người đó.
--   · Cả hai `STABLE`, không ghi gì. Mọi thao tác ghi (thu hồi, xoay vòng) vẫn
--     đi qua đường thường và vẫn chịu RLS.
--
-- ⚠️ Bài học vừa rút ra ở 0051 áp thẳng vào đây: `SECURITY DEFINER` không chỉ
--    cho thêm quyền, nó GỠ MẤT RLS. Nên mỗi hàm loại này phải trả về đúng một
--    dòng cho đúng một khoá bí mật — không bao giờ là một câu quét bảng.
-- =============================================================================

CREATE OR REPLACE FUNCTION auth_find_refresh_token(p_hash text)
RETURNS TABLE (
  id          uuid,
  tenant_id   uuid,
  user_id     uuid,
  expires_at  timestamptz,
  revoked_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT r.id, r.tenant_id, r.user_id, r.expires_at, r.revoked_at
    FROM refresh_token r
   WHERE r.token_hash = p_hash
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_refresh_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_refresh_token(text) TO garageos_app;

COMMENT ON FUNCTION auth_find_refresh_token(text) IS
  'Tra refresh token theo BĂM sha256. SECURITY DEFINER vì chạy trước khi biết '
  'tenant. Chỉ đọc, chỉ một dòng, chỉ khi người gọi đã giữ token gốc.';

/*
 * Vì sao cần tra người dùng theo id, trong khi refresh token đã nói ai là ai:
 *
 * Một người có thể bị vô hiệu hoá (`is_active = false`) SAU khi đã đăng nhập.
 * Refresh token của họ vẫn còn hạn, và nếu không kiểm lại thì họ tiếp tục gia
 * hạn phiên vô thời hạn — nghỉ việc rồi vẫn vào được hệ thống. Vai và chi
 * nhánh cũng phải đọc lại: đổi quyền cho ai đó mà phiên cũ giữ nguyên vai cũ
 * thì việc đổi quyền chỉ có hiệu lực khi họ tự đăng xuất.
 */
CREATE OR REPLACE FUNCTION auth_find_user_by_id(p_id uuid)
RETURNS TABLE (
  id            uuid,
  tenant_id     uuid,
  password_hash text,
  full_name     text,
  roles         user_role[],
  is_active     boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.tenant_id, u.password_hash, u.full_name, u.roles, u.is_active
    FROM app_user u
   WHERE u.id = p_id
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_user_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_id(uuid) TO garageos_app;

COMMENT ON FUNCTION auth_find_user_by_id(uuid) IS
  'Đọc lại vai/chi nhánh/trạng thái khi làm mới phiên — người bị vô hiệu hoá '
  'sau khi đăng nhập phải mất quyền gia hạn.';

-- =============================================================================
-- Ứng dụng phải THU HỒI được refresh token của chính mình
--
-- 0003 cấp mặc định `SELECT, INSERT` cho bảng mới. Xoay vòng và đăng xuất đều
-- là `UPDATE`, nên thiếu quyền này thì cả hai im lặng không làm gì.
--
-- 🔒 Cấp theo CỘT, không cấp cả bảng: ứng dụng chỉ được đánh dấu thu hồi và
--    nối sang token kế tiếp. Không được sửa `expires_at` để kéo dài một phiên,
--    không được đổi `user_id` để gán phiên sang người khác.
-- =============================================================================

GRANT UPDATE (revoked_at, replaced_by_id) ON refresh_token TO garageos_app;
