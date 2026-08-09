-- =============================================================================
-- 0054 — `auth_find_refresh_token` trả thêm `replaced_by_id`
--
-- Cần để phân biệt HAI tình huống mà 0052 gộp làm một:
--
--   A. Token bị thu hồi TỪ LÂU nay được đem ra dùng lại
--      -> dấu hiệu token bị đánh cắp. `docs/13-nfr.md` yêu cầu thu hồi TOÀN BỘ
--         phiên của người đó.
--
--   B. Hai request gia hạn gần như CÙNG LÚC bằng cùng một token
--      -> một cái thắng và vừa thay thế token, cái kia đến sau vài mili giây.
--         Đây là hai tab, một cú bấm đúp, hoặc một lần thử lại của client —
--         KHÔNG phải tấn công.
--
-- Gộp hai thứ này lại có hậu quả đo được: bài kiểm chứng cho thấy sau hai
-- request đồng thời, người dùng còn **0 token sống**. Kẻ thua cuộc đua kích
-- hoạt "thu hồi toàn bộ", và cái bị thu hồi gồm cả token mà kẻ thắng vừa cấp.
-- Một cú bấm đúp đá người dùng ra khỏi hệ thống.
--
-- 🔒 Có `replaced_by_id` + `revoked_at` thì phân biệt được: token vừa bị thay
--    thế trong vài giây gần đây là (B). Còn lại là (A).
--
-- ⚠️ Cửa sổ ân hạn KHÔNG nới lỏng bảo mật: kẻ tấn công dùng token cũ trong cửa
--    sổ đó vẫn nhận 401 và vẫn không có phiên. Nó chỉ ngăn phản ứng hạt nhân
--    khi hai request hợp lệ chạm nhau.
-- =============================================================================

/*
 * DROP trước, không `CREATE OR REPLACE`.
 *
 * PostgreSQL từ chối đổi kiểu trả về của một hàm đang tồn tại — và ở đây ta
 * thêm một cột vào `RETURNS TABLE`, tức là đổi kiểu. Cùng cái bẫy đã gặp với
 * `CREATE OR REPLACE VIEW` ở Phase 3: "OR REPLACE" chỉ thay được THÂN hàm, không
 * thay được HÌNH DẠNG của nó.
 */
DROP FUNCTION IF EXISTS auth_find_refresh_token(text);

CREATE FUNCTION auth_find_refresh_token(p_hash text)
RETURNS TABLE (
  id             uuid,
  tenant_id      uuid,
  user_id        uuid,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  replaced_by_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT r.id, r.tenant_id, r.user_id, r.expires_at, r.revoked_at, r.replaced_by_id
    FROM refresh_token r
   WHERE r.token_hash = p_hash
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_refresh_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_refresh_token(text) TO garageos_app;
