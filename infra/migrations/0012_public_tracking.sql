-- =============================================================================
-- 0012_public_tracking — Trang tra cứu công khai và duyệt báo giá (Phase 1.5)
--
-- Đây là phần duy nhất của hệ thống mà người dùng KHÔNG đăng nhập. Mọi thứ ở
-- đây phải giả định người gọi là người lạ.
-- =============================================================================

/*
 * 🔒 Trang công khai không có ngữ cảnh tenant.
 *
 * Toàn bộ hệ thống dựa vào `app.tenant_id` để RLS lọc dữ liệu, nhưng khách mở
 * link tra cứu thì chưa có gì để suy ra tenant. Đây đúng là tình huống mà
 * `auth_find_user_by_phone` đã gặp lúc đăng nhập: cần một cửa hẹp, có kiểm
 * soát, chạy TRƯỚC khi ngữ cảnh tenant tồn tại.
 *
 * Hàm này là cửa đó và nó cố tình rất hẹp: nhận token, trả về đúng hai uuid.
 * Không trả bất kỳ dữ liệu nghiệp vụ nào — phần đó đọc sau, bên trong ngữ cảnh
 * tenant đã được đặt, tức là vẫn đi qua RLS như mọi truy vấn khác.
 */
CREATE OR REPLACE FUNCTION public_resolve_tracking_token(p_token text)
RETURNS TABLE (tenant_id uuid, repair_order_id uuid) AS $$
  SELECT ro.tenant_id, ro.id
    FROM repair_order ro
   WHERE ro.customer_access_token = p_token
   LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public_resolve_tracking_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resolve_tracking_token(text) TO garageos_app;

COMMENT ON FUNCTION public_resolve_tracking_token(text) IS
  'Cua hep cho trang tra cuu cong khai: token -> (tenant_id, repair_order_id). '
  'SECURITY DEFINER vi chua co app.tenant_id de RLS lam viec. Khong tra du lieu '
  'nghiep vu — phan do doc trong ngu canh tenant.';

-- =============================================================================
-- Mã xác thực một lần (OTP)
--
-- 🔒 BR-04-5 — duyệt báo giá phải có bằng chứng. OTP là bằng chứng "người cầm
--    số điện thoại của khách đã bấm đồng ý", không mạnh bằng chữ ký nhưng đủ
--    để đối chất, và là mức thực tế nhất qua link.
-- =============================================================================

CREATE TABLE otp_challenge (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  quotation_id    uuid NOT NULL,

  -- 🔒 Lưu BĂM, không lưu mã. Log, backup và người có quyền đọc database đều
  --    không được thấy mã đang có hiệu lực.
  code_hash       text NOT NULL,
  phone           text NOT NULL,

  expires_at      timestamptz NOT NULL,
  attempts        int NOT NULL DEFAULT 0,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_ip      inet,

  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_id)    REFERENCES quotation(tenant_id, id),
  CONSTRAINT otp_attempts_non_negative CHECK (attempts >= 0),
  CONSTRAINT otp_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX idx_otp_quotation ON otp_challenge (tenant_id, quotation_id, created_at DESC);

ALTER TABLE otp_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenge FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON otp_challenge
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Đếm số lần nhập sai và đánh dấu đã dùng — hai thứ duy nhất được sửa.
-- Không cho sửa `code_hash` hay `expires_at`: gia hạn một mã đã phát là làm
-- hỏng chính ý nghĩa của "một lần".
GRANT UPDATE (attempts, consumed_at) ON otp_challenge TO garageos_app;

-- =============================================================================
-- Ghi nhận phản hồi của khách trên báo giá
-- =============================================================================

-- `responded_at` và `approval_*` đã có cột từ 0010 nhưng chưa cấp quyền ghi.
-- (GRANT ở 0010 đã bao gồm chúng — không cần thêm.)

COMMENT ON COLUMN quotation.approval_evidence IS
  'BR-04-5: bang chung duyet. Voi kenh LINK_OTP luu id cua otp_challenge, IP, '
  'user-agent va thoi diem. Khong luu ma OTP.';
