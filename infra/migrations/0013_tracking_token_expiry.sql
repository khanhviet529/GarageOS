-- =============================================================================
-- 0013 — Sửa GARAGEOS-003 từ codex-review nhánh feat/tra-cuu-cong-khai
--
-- `docs/02-actors-and-permissions.md` mục 2.1 quy định rõ: liên kết tra cứu
-- HẾT HẠN 30 NGÀY SAU KHI BÀN GIAO XE. Bản đầu bỏ sót hoàn toàn điều kiện đó,
-- nên một link phát cho khách năm ngoái vẫn mở được hồ sơ xe hôm nay — kèm
-- biển số, tên chủ xe và toàn bộ báo giá.
--
-- Đặt điều kiện ngay trong hàm giải token, không đặt ở tầng service: đây là
-- CỬA duy nhất dẫn vào dữ liệu công khai, khoá ở cửa thì không có đường vòng.
-- =============================================================================

CREATE OR REPLACE FUNCTION public_resolve_tracking_token(p_token text)
RETURNS TABLE (tenant_id uuid, repair_order_id uuid) AS $$
  SELECT ro.tenant_id, ro.id
    FROM repair_order ro
   WHERE ro.customer_access_token = p_token
     -- Xe chưa giao thì link còn sống; giao rồi thì còn 30 ngày để khách xem
     -- lại lịch sử và hoá đơn, sau đó đóng.
     AND (ro.delivered_at IS NULL OR ro.delivered_at > now() - interval '30 days')
     -- Đơn đã huỷ thì link đóng ngay: không còn gì để khách theo dõi.
     AND ro.cancelled_at IS NULL
   LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public_resolve_tracking_token(text) IS
  'Cua hep cho trang tra cuu cong khai: token -> (tenant_id, repair_order_id). '
  'SECURITY DEFINER vi chua co app.tenant_id de RLS lam viec. Het han 30 ngay '
  'sau khi ban giao xe — docs/02-actors-and-permissions.md muc 2.1.';
