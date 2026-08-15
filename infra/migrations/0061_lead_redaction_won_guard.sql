-- =============================================================================
-- 0061_lead_redaction_won_guard — job dọn lead không được phụ thuộc một giá trị
-- enum chưa tồn tại
--
-- Nguồn: 0060_lead_redaction.sql
-- =============================================================================

-- `redact_expired_sales_leads` ở 0060 viết `status <> 'WON'`. Ý định đúng —
-- người đã mua xe không bị dọn theo thời hạn của một cái form — nhưng `WON`
-- KHÔNG nằm trong enum `lead_status` của Phase 1:
--
--   lead_status = ('NEW','CONTACTED','QUALIFIED','LOST')
--
-- Postgres không kiểm literal trong thân `plpgsql` lúc `CREATE FUNCTION`, nên
-- migration chạy trót lọt và hàm chỉ nổ vào lần gọi đầu tiên — tức là lần đầu
-- job dọn chạy thật, trên production, vào ban đêm.
--
-- So sánh qua `::text` diễn đạt đúng ý định mà không đòi giá trị phải tồn tại
-- ngay bây giờ: hôm nay không lead nào khớp, và ngày Phase 2 thêm `WON` vào
-- enum thì điều kiện tự có hiệu lực mà không ai phải nhớ quay lại sửa.
CREATE OR REPLACE FUNCTION redact_expired_sales_leads(p_months int DEFAULT 24)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead   record;
  v_dem    int := 0;
BEGIN
  FOR v_lead IN
    SELECT tenant_id, id FROM sales_lead
     WHERE redacted_at IS NULL
       AND status::text <> 'WON'
       AND created_at < now() - make_interval(months => p_months)
  LOOP
    PERFORM redact_sales_lead(v_lead.tenant_id, v_lead.id, NULL, 'RETENTION_EXPIRED');
    v_dem := v_dem + 1;
  END LOOP;
  RETURN v_dem;
END $$;

REVOKE ALL ON FUNCTION redact_expired_sales_leads(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redact_expired_sales_leads(int) TO garageos_app;

COMMENT ON FUNCTION redact_expired_sales_leads(int) IS
  'Job dọn theo thời hạn lưu (mặc định 24 tháng). Bỏ qua lead WON — giá trị này '
  'chưa có trong enum Phase 1, so sánh qua ::text để điều kiện tự có hiệu lực '
  'khi Phase 2 thêm vào. Trả về số lead đã redact.';
