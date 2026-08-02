-- =============================================================================
-- 0021 — Trigger kiểm tổng phải ĐỌC LẠI trạng thái hiện tại, không tin `NEW`
--
-- Bản 0020 so sánh `NEW.total_amount` với tổng các dòng. Sai một cách tinh vi:
--
-- `CONSTRAINT TRIGGER ... DEFERRABLE` chụp lại `NEW` tại thời điểm lệnh UPDATE
-- chạy, rồi mới THỰC THI ở cuối giao dịch. Trong luồng khách duyệt báo giá,
-- mỗi dòng đổi trạng thái sinh một lần cộng lại, tức là nhiều lần UPDATE lên
-- `quotation`. Sự kiện của lần UPDATE đầu tiên mang ảnh chụp `NEW` của lúc đó,
-- và tới cuối giao dịch nó so ảnh chụp cũ với các dòng đã đổi hết — luôn lệch.
--
-- Triệu chứng đúng như vậy: "bao giá: 764500, cac dong: 0".
--
-- Sửa: đọc CẢ HAI vế từ database tại thời điểm kiểm. Chỉ trạng thái cuối cùng
-- của giao dịch mới có ý nghĩa — đó cũng chính là điều INV-Q-06 nói.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_tong_bao_gia() RETURNS trigger AS $$
DECLARE
  q          record;
  s_gross    bigint;
  s_discount bigint;
  s_tax      bigint;
  s_total    bigint;
BEGIN
  SELECT subtotal_amount, discount_amount, tax_amount, total_amount
    INTO q FROM quotation WHERE id = NEW.id;

  -- Báo giá bị xoá trong cùng giao dịch thì không còn gì để kiểm.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(l.gross_amount), 0),
         COALESCE(sum(CASE WHEN l.is_warranty THEN 0 ELSE l.discount_amount END), 0),
         COALESCE(sum(l.tax_amount), 0),
         COALESCE(sum(l.line_total), 0)
    INTO s_gross, s_discount, s_tax, s_total
    FROM quotation_line l
   WHERE l.quotation_id = NEW.id AND l.status <> 'REJECTED';

  IF q.subtotal_amount <> s_gross
  OR q.discount_amount <> s_discount
  OR q.tax_amount      <> s_tax
  OR q.total_amount    <> s_total THEN
    RAISE EXCEPTION
      'INV-Q-06: tong bao gia (%) khong khop tong cac dong (%)', q.total_amount, s_total
      USING ERRCODE = 'check_violation', CONSTRAINT = 'quotation_totals_match_lines';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;
