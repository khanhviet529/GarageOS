-- =============================================================================
-- 0060_lead_redaction — xoá dữ liệu cá nhân của lead mà không phá truy vết
--
-- Nguồn: docs/reviews/2026-08-14-luong-tenant-public-landing.md (LS-006)
-- Chính sách đã chốt 2026-08-14: redaction bằng tombstone, thời hạn lưu 24 tháng
-- Bất biến mới: INV-LS-15
--
-- Test làm bằng chứng: apps/api/test/lead-luu-tru.spec.ts
-- =============================================================================

-- --- Vì sao không mở `DELETE` ------------------------------------------------
--
-- `sales_lead` bị `REVOKE DELETE` từ 0057 vì lead là dữ liệu truy vết: nó nối
-- một khoản chi quảng cáo với một chiếc xe đã bán. Xoá cả dòng làm thủng mọi
-- thống kê chuyển đổi, và làm thủng theo cách không ai phát hiện — con số chỉ
-- đơn giản là nhỏ đi.
--
-- Nhưng bảng chứa họ tên và số điện thoại của người CHƯA phải khách hàng, thu
-- từ một form công khai. Nghị định 13/2023/NĐ-CP cho họ quyền rút đồng ý và
-- yêu cầu xoá. Hai điều này chỉ mâu thuẫn nếu coi "xoá" là "xoá dòng".
--
-- Redaction tách hai thứ đang bị gộp: PHẦN NHẬN DẠNG một con người, và SỰ KIỆN
-- "có một người quan tâm mẫu xe này vào ngày này". Cái thứ nhất bị ghi đè; cái
-- thứ hai ở lại.
--
-- ⚠️ Đây là thiết kế kỹ thuật, không phải tư vấn pháp lý. Cần người có chuyên
-- môn rà trước khi chạy thật với dữ liệu người dùng.

ALTER TABLE sales_lead
  ADD COLUMN IF NOT EXISTS redacted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS redacted_by    uuid,
  ADD COLUMN IF NOT EXISTS redact_reason  text;

COMMENT ON COLUMN sales_lead.redacted_at IS
  'Thời điểm PII của lead bị ghi đè. NULL = chưa redact. Dòng không bao giờ bị xoá.';

-- --- 🔒 INV-LS-15: đã đánh dấu redact thì PII phải thật sự biến mất ----------
--
-- Không có ràng buộc này thì `redacted_at` chỉ là một lời hứa: một lỗi ở tầng
-- ứng dụng khiến hệ thống BÁO CÁO đã xoá dữ liệu trong khi số điện thoại vẫn
-- nằm nguyên trong bảng. Với nghĩa vụ dữ liệu cá nhân, một lời hứa sai còn tệ
-- hơn không hứa.
DO $$ BEGIN
  ALTER TABLE sales_lead ADD CONSTRAINT lead_redacted_has_no_pii CHECK (
    redacted_at IS NULL
    OR (full_name = '(đã xoá theo yêu cầu)' AND phone_normalized = '' AND email IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `lead_name_len` (0057) đòi họ tên 2–120 ký tự; chuỗi tombstone nằm trong
-- khoảng đó nên hai ràng buộc không đánh nhau. Ghi ra để lần sau đổi chuỗi
-- tombstone thì biết phải kiểm lại.

CREATE INDEX IF NOT EXISTS idx_lead_chua_redact
  ON sales_lead (tenant_id, created_at)
  WHERE redacted_at IS NULL;

-- --- Redact một lead ---------------------------------------------------------
--
-- Idempotent: gọi lại trên lead đã redact không đổi `redacted_at` và không ghi
-- đè lý do. Người vận hành bấm hai lần không tạo ra hai sự thật khác nhau.
CREATE OR REPLACE FUNCTION redact_sales_lead(
  p_tenant  uuid,
  p_lead    uuid,
  p_actor   uuid,
  p_reason  text
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_redacted_at timestamptz;
BEGIN
  SELECT redacted_at INTO v_redacted_at
    FROM sales_lead WHERE tenant_id = p_tenant AND id = p_lead
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy lead' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_redacted_at IS NOT NULL THEN
    RETURN v_redacted_at;
  END IF;

  UPDATE sales_lead
     SET full_name        = '(đã xoá theo yêu cầu)',
         phone_normalized = '',
         email            = NULL,
         message          = NULL,
         redacted_at      = now(),
         redacted_by      = p_actor,
         redact_reason    = p_reason
   WHERE tenant_id = p_tenant AND id = p_lead
   RETURNING redacted_at INTO v_redacted_at;

  RETURN v_redacted_at;
END $$;

-- SECURITY DEFINER vì hàm cố tình ghi đè cột mà quy trình thường không được
-- chạm, và vì job dọn định kỳ chạy ngoài mọi ngữ cảnh tenant. Hàm KHÔNG nhận
-- điều kiện lọc tuỳ ý: nó luôn cần cả `tenant_id` và `id`.
REVOKE ALL ON FUNCTION redact_sales_lead(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redact_sales_lead(uuid, uuid, uuid, text) TO garageos_app;

COMMENT ON FUNCTION redact_sales_lead(uuid, uuid, uuid, text) IS
  'Ghi đè PII của một lead, giữ nguyên id/reference/status và toàn bộ '
  'lead_activity. Idempotent. INV-LS-15.';

-- --- Dọn định kỳ theo thời hạn lưu -------------------------------------------
--
-- Chính sách: 24 tháng cho lead KHÔNG chuyển đổi. Chu kỳ mua xe thường 1–2 năm,
-- nên mốc này đủ dài để đội sales chăm lại một lần nữa mà không giữ vô thời hạn.
--
-- 🔒 Lead đã WON không bị dọn theo mốc này: người đó đã trở thành khách hàng,
-- và hồ sơ của họ sống theo vòng đời khách hàng chứ không theo vòng đời lead.
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
       AND status <> 'WON'
       AND created_at < now() - make_interval(months => p_months)
  LOOP
    PERFORM redact_sales_lead(v_lead.tenant_id, v_lead.id, NULL, 'Hết thời hạn lưu trữ');
    v_dem := v_dem + 1;
  END LOOP;
  RETURN v_dem;
END $$;

REVOKE ALL ON FUNCTION redact_expired_sales_leads(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redact_expired_sales_leads(int) TO garageos_app;

COMMENT ON FUNCTION redact_expired_sales_leads(int) IS
  'Job dọn theo thời hạn lưu (mặc định 24 tháng). Bỏ qua lead WON. '
  'Trả về số lead đã redact.';
