-- =============================================================================
-- 0044 — Thanh toán và công nợ (Phase 3.3 / 3.5, BC-07 · BC-08 · BC-13)
--
-- 🔧 F-01 — `payment` gắn với KHÁCH HÀNG, KHÔNG gắn với hoá đơn.
--
-- Một lần chuyển khoản 50 triệu của khách doanh nghiệp trả cho 12 hoá đơn trong
-- tháng (BC-13 mục 4.2). Mô hình `payment.invoice_id` một-một không diễn đạt
-- được việc đó, và garage sẽ phải tách tay thành 12 bản ghi giả.
--
-- Quan hệ tới hoá đơn suy ra qua `payment_allocation → invoice_line → invoice`.
--
-- 💡 Vì sao phân bổ tới TỪNG DÒNG chứ không tới tổng hoá đơn — BC-08:
--
--   Xe va chạm. Bảo hiểm trả đèn pha và một phần tiền sơn; khách trả mức khấu
--   trừ, dầu động cơ và vệ sinh điều hoà. Nếu chỉ biết "đã thu 6.950.000đ từ
--   hai nguồn" thì KHÔNG quyết toán được với công ty bảo hiểm — họ luôn đòi
--   bảng kê theo hạng mục. Và khi bảo hiểm từ chối một hạng mục sau giám định,
--   không ai tính được khách phải bù bao nhiêu.
--
-- 🔒 Chứng từ tài chính là BẤT BIẾN (CLAUDE.md nguyên tắc 2). Thanh toán ghi
--    nhầm không sửa và không xoá — lập một CHỨNG TỪ ĐẢO với số tiền âm.
-- =============================================================================

CREATE TYPE payment_method AS ENUM ('CASH', 'TRANSFER', 'CARD', 'CREDIT');

CREATE TABLE payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  branch_id       uuid NOT NULL,
  /* 🔧 F-01: khách, không phải hoá đơn */
  customer_id     uuid NOT NULL,

  /** Ai trả: khách, công ty bảo hiểm, hay quỹ bảo hành của chính garage */
  payer_type      payer_type NOT NULL DEFAULT 'CUSTOMER',
  /** Tên người/đơn vị trả — bảo hiểm thì đây là tên công ty, để đối chiếu */
  payer_name      text,

  amount          bigint NOT NULL,
  method          payment_method NOT NULL,
  paid_at         timestamptz NOT NULL DEFAULT now(),
  /** Số phiếu thu, mã giao dịch chuyển khoản, số hồ sơ bồi thường */
  reference       text,
  note            text,

  /*
   * 🔒 Khoá chống ghi trùng.
   *
   * Thu ngân bấm "Thu tiền" hai lần vì mạng chậm là chuyện xảy ra hằng ngày, và
   * hậu quả ở đây không phải một bản ghi thừa mà là SỐ TIỀN ĐÃ THU sai gấp đôi.
   * Client sinh khoá; UNIQUE ở database là trọng tài.
   */
  idempotency_key text NOT NULL,

  /** Chứng từ đảo: bản ghi này huỷ hiệu lực của bản ghi kia */
  reversal_of_payment_id uuid,
  reversal_reason text,

  received_by_user_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, branch_id)   REFERENCES branch(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  FOREIGN KEY (tenant_id, reversal_of_payment_id) REFERENCES payment(tenant_id, id),
  FOREIGN KEY (tenant_id, received_by_user_id)    REFERENCES app_user(tenant_id, id),

  /*
   * Số tiền dương với thu bình thường, ÂM với chứng từ đảo — và chỉ khi đó.
   *
   * Không cho ghi một khoản âm "tự do": mọi khoản âm phải trỏ về đúng chứng từ
   * mà nó đảo, nếu không thì âm trở thành một đường rút tiền khỏi sổ.
   */
  CONSTRAINT payment_amount_dung_dau
    CHECK ((reversal_of_payment_id IS NULL AND amount > 0)
        OR (reversal_of_payment_id IS NOT NULL AND amount < 0)),
  CONSTRAINT payment_reversal_needs_reason
    CHECK (reversal_of_payment_id IS NULL OR length(btrim(reversal_reason)) >= 5),
  CONSTRAINT payment_within_safe_range
    CHECK (amount BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX idx_payment_khach ON payment (tenant_id, customer_id, paid_at DESC);

-- =============================================================================
-- Phân bổ tới TỪNG DÒNG hoá đơn
-- =============================================================================

CREATE TABLE payment_allocation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  payment_id      uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  amount          bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  -- Một thanh toán phân bổ tới một dòng nhiều nhất MỘT lần: hai dòng phân bổ
  -- cho cùng cặp là hai con số cùng nói về một việc.
  UNIQUE (payment_id, invoice_line_id),
  FOREIGN KEY (tenant_id, payment_id)      REFERENCES payment(tenant_id, id),
  FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES invoice_line(tenant_id, id),

  CONSTRAINT allocation_khac_khong CHECK (amount <> 0),
  CONSTRAINT allocation_within_safe_range
    CHECK (amount BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX idx_allocation_dong ON payment_allocation (tenant_id, invoice_line_id);

-- =============================================================================
-- 🔒 INV-M-05 (vế 1) — Σ phân bổ của một thanh toán = số tiền thanh toán
--
-- Phải DEFERRABLE: thanh toán được ghi trước, các dòng phân bổ ghi sau, nên
-- ngay sau câu INSERT đầu tiên tổng phân bổ luôn khác số tiền. Kiểm ngay lập
-- tức thì không bao giờ ghi được gì.
--
-- 💡 Đây là đúng chỗ mà một CHECK constraint không dùng được: PostgreSQL không
--    cho hoãn CHECK, chỉ cho hoãn UNIQUE/PK/FK/EXCLUDE và CONSTRAINT TRIGGER.
--    Bài học đã trả giá ở migration 0011 với tổng báo giá.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_phan_bo_khop() RETURNS trigger AS $$
DECLARE
  tt uuid;
  so_tien bigint;
  tong_pb bigint;
BEGIN
  tt := COALESCE(NEW.payment_id, OLD.payment_id);

  SELECT amount INTO so_tien FROM payment WHERE id = tt;
  IF NOT FOUND THEN
    -- Thanh toán đã bị xoá trong cùng giao dịch: không còn gì để đối chiếu
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO tong_pb
    FROM payment_allocation WHERE payment_id = tt;

  IF tong_pb <> so_tien THEN
    RAISE EXCEPTION
      'ALLOCATION_MISMATCH: phân bổ % không khớp số tiền thanh toán %', tong_pb, so_tien
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_05';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE CONSTRAINT TRIGGER trg_phan_bo_khop
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocation
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_phan_bo_khop();

-- =============================================================================
-- 🔒 INV-M-05 (vế 2) — Σ phân bổ cho một DÒNG ≤ giá trị dòng
--
-- 💡 INV-M-04 (không thu quá số phải thu) là HỆ QUẢ của quy tắc này, không cần
--    kiểm riêng: tổng hoá đơn bằng tổng các dòng (INV-M-02), nên nếu không dòng
--    nào bị thu quá thì hoá đơn cũng không thể bị thu quá.
--
--    Kiểm thêm một lần ở mức hoá đơn nghe như "chắc chắn hơn", nhưng thực tế là
--    hai chỗ có thể lệch nhau — và chỗ lệch sẽ là chỗ không ai chạy test.
--
-- Kiểm NGAY (không hoãn): một dòng bị thu quá là sai ngay tại câu lệnh gây ra
-- nó, và báo lỗi tại đó thì người dùng biết chính xác dòng nào.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_khong_thu_qua() RETURNS trigger AS $$
DECLARE
  tong bigint;
  gia_tri bigint;
  mo_ta text;
BEGIN
  SELECT COALESCE(sum(a.amount), 0) INTO tong
    FROM payment_allocation a WHERE a.invoice_line_id = NEW.invoice_line_id;

  SELECT l.line_total, l.description INTO gia_tri, mo_ta
    FROM invoice_line l WHERE l.id = NEW.invoice_line_id;

  IF tong > gia_tri THEN
    RAISE EXCEPTION
      'OVERPAY: dòng "%" trị giá % mà đã phân bổ %', mo_ta, gia_tri, tong
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_04';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_khong_thu_qua
  AFTER INSERT OR UPDATE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_khong_thu_qua();

-- =============================================================================
-- Trạng thái hoá đơn tự đi theo tiền đã thu
--
-- Không để ứng dụng tự đặt: thu tiền và đổi trạng thái là MỘT sự kiện, và tách
-- ra là để lại một khoảng mà tiền đã vào nhưng hoá đơn vẫn ghi "chưa thu".
-- =============================================================================

CREATE OR REPLACE FUNCTION cap_nhat_trang_thai_hoa_don() RETURNS trigger AS $$
DECLARE
  hd uuid;
  tong_hd bigint;
  da_thu bigint;
  tt invoice_status;
BEGIN
  SELECT l.invoice_id INTO hd FROM invoice_line l
   WHERE l.id = COALESCE(NEW.invoice_line_id, OLD.invoice_line_id);
  IF hd IS NULL THEN RETURN NULL; END IF;

  SELECT i.total_amount, i.status INTO tong_hd, tt FROM invoice i WHERE i.id = hd;
  -- Hoá đơn còn nháp thì tiền chưa có ý nghĩa; và ADJUSTED/CANCELLED đã đóng
  IF tt IN ('DRAFT', 'ADJUSTED', 'CANCELLED') THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(a.amount), 0) INTO da_thu
    FROM payment_allocation a
    JOIN invoice_line l ON l.id = a.invoice_line_id
   WHERE l.invoice_id = hd;

  UPDATE invoice
     SET status = CASE
                    WHEN da_thu >= tong_hd THEN 'PAID'::invoice_status
                    WHEN da_thu > 0        THEN 'PARTIALLY_PAID'::invoice_status
                    ELSE 'ISSUED'::invoice_status
                  END
   WHERE id = hd;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_hoa_don_theo_tien
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION cap_nhat_trang_thai_hoa_don();

-- =============================================================================
-- Công nợ — GIÁ TRỊ SUY RA, không phải cột lưu sẵn
--
-- 💡 BC-13 mục 2 nói thẳng: không lưu cột `current_debt`. Suy ra từ hoá đơn và
--    thanh toán thì luôn đúng; cột lưu sẵn lệch ngay khi có MỘT đường ghi quên
--    cập nhật — và đường đó sẽ tồn tại, vì tiền vào hệ thống từ nhiều phía.
-- =============================================================================

CREATE OR REPLACE VIEW cong_no_hoa_don AS
SELECT i.tenant_id,
       i.id AS invoice_id,
       i.code,
       i.customer_id,
       i.branch_id,
       i.issued_at,
       i.due_date,
       i.total_amount,
       COALESCE(t.da_thu, 0) AS da_thu,
       i.total_amount - COALESCE(t.da_thu, 0) AS con_no,
       CASE
         WHEN i.due_date IS NULL THEN NULL
         ELSE GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - i.due_date)) / 86400)::integer)
       END AS so_ngay_qua_han
  FROM invoice i
  LEFT JOIN LATERAL (
    SELECT sum(a.amount) AS da_thu
      FROM payment_allocation a
      JOIN invoice_line l ON l.id = a.invoice_line_id
     WHERE l.invoice_id = i.id
  ) t ON true
 WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID');

CREATE OR REPLACE VIEW cong_no_khach AS
SELECT c.tenant_id,
       c.id AS customer_id,
       c.display_name,
       c.type,
       c.credit_limit_amount,
       c.payment_term_days,
       COALESCE(sum(n.con_no), 0)::bigint AS tong_con_no,
       COALESCE(sum(n.con_no) FILTER (WHERE n.so_ngay_qua_han > 0), 0)::bigint AS qua_han,
       COALESCE(max(n.so_ngay_qua_han), 0) AS qua_han_lau_nhat,
       count(n.invoice_id) AS so_hoa_don_chua_thu
  FROM customer c
  LEFT JOIN cong_no_hoa_don n ON n.customer_id = c.id
 WHERE c.deleted_at IS NULL
 GROUP BY c.tenant_id, c.id, c.display_name, c.type, c.credit_limit_amount,
          c.payment_term_days;

-- =============================================================================
-- RLS và quyền
--
-- 🔒 `payment` và `payment_allocation` CHỈ THÊM — cùng hạng với `stock_movement`
--    và `audit_log`. Đây là chứng từ tài chính: ghi sai thì lập chứng từ đảo,
--    không sửa và không xoá.
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment', 'payment_allocation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

REVOKE UPDATE, DELETE ON payment FROM garageos_app;
REVOKE UPDATE, DELETE ON payment_allocation FROM garageos_app;

GRANT SELECT ON cong_no_hoa_don, cong_no_khach TO garageos_app;

/*
 * Cho khách doanh nghiệp nợ — BC-13.
 *
 * `billing_contact_name` và `billing_email` chưa có trong `customer`; thêm ở
 * đây vì hoá đơn cần biết gửi cho ai.
 */
ALTER TABLE customer
  ADD COLUMN billing_contact_name text,
  ADD COLUMN billing_email text,
  /** ⚠️ BC-13 mục 7 câu 4: nợ khó đòi — đánh dấu, cần quyền OWNER */
  ADD COLUMN credit_on_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN credit_on_hold_reason text,

  ADD CONSTRAINT customer_hold_needs_reason
    CHECK (NOT credit_on_hold OR length(btrim(credit_on_hold_reason)) >= 5);

GRANT UPDATE (billing_contact_name, billing_email, credit_on_hold,
              credit_on_hold_reason)
  ON customer TO garageos_app;

COMMENT ON VIEW cong_no_khach IS
  'BC-13. Cong no la GIA TRI SUY RA, khong phai cot luu san: cot luu san lech '
  'ngay khi co MOT duong ghi quen cap nhat.';
