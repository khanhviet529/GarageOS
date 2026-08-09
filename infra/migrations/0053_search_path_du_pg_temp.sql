-- =============================================================================
-- 0053 — Hai hàm của 0052 thiếu `pg_temp` trong search_path
--
-- `schema-invariants.spec.ts` bắt được ngay lượt CI đầu tiên:
--
--   Hàm SECURITY DEFINER thiếu `SET search_path = public, pg_temp`:
--     auth_find_refresh_token, auth_find_user_by_id
--
-- 0052 chép nguyên `SET search_path = public` từ 0002 — bản viết trước khi hàng
-- rào này tồn tại. Chép một khuôn cũ là chép cả những gì khuôn đó chưa biết.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Vì sao `pg_temp` phải có mặt, dù nghe như thừa
--
-- PostgreSQL LUÔN tìm trong schema tạm của phiên TRƯỚC các schema khác, kể cả
-- khi `search_path` không nhắc tới nó — trừ khi ta nêu `pg_temp` tường minh, và
-- khi đó nó đứng đúng chỗ ta đặt.
--
-- Nên với một hàm `SECURITY DEFINER` chạy bằng quyền `garageos` (SUPERUSER):
-- kẻ tấn công có quyền tạo bảng tạm dựng `pg_temp.refresh_token`, gọi hàm, và
-- hàm sẽ đọc **bảng của họ** thay vì bảng thật — với quyền superuser.
--
-- 🔒 Đặt `pg_temp` ở CUỐI đẩy nó xuống sau `public`, nên bảng thật luôn thắng.
--    Một dấu phẩy và bảy ký tự, và nó là ranh giới giữa "hàm đọc dữ liệu thật"
--    với "hàm đọc bất cứ thứ gì người gọi bày ra trước mặt nó".
--
-- 💡 Đây là lần thứ hai trong hai ngày `SECURITY DEFINER` là gốc của vấn đề:
--    0051 vá chỗ nó gỡ mất RLS, giờ tới chỗ nó gỡ mất cả sự an toàn của
--    search_path. Từ khoá này không cho thêm quyền một cách miễn phí — nó tháo
--    từng lớp bảo vệ, và mỗi lớp phải được dựng lại bằng tay.
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
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT r.id, r.tenant_id, r.user_id, r.expires_at, r.revoked_at
    FROM refresh_token r
   WHERE r.token_hash = p_hash
   LIMIT 1;
$$;

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
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT u.id, u.tenant_id, u.password_hash, u.full_name, u.roles, u.is_active
    FROM app_user u
   WHERE u.id = p_id
   LIMIT 1;
$$;
