-- =============================================================================
-- 0020 — Tổng báo giá phải KHỚP tổng các dòng, ở mọi lúc
--
-- Test viết cho 0019 lộ ra rằng bản sửa đó chưa đủ:
--
--   UPDATE quotation SET subtotal_amount=0, tax_amount=0, total_amount=0
--
-- vẫn chạy được. Hai lớp bảo vệ vừa thêm đều không chặn:
--   • `REVOKE UPDATE` chỉ áp cho `garageos_app`, không áp cho role migration
--     hay bất kỳ script vận hành nào.
--   • `CHECK (total = subtotal - discount + tax)` chỉ kiểm tính NHẤT QUÁN NỘI
--     BỘ — và 0 = 0 - 0 + 0 hoàn toàn nhất quán.
--
-- Bài học: ràng buộc kiểm "các con số có hợp nhau không" khác hẳn ràng buộc
-- kiểm "các con số có ĐÚNG không". Chỉ cái thứ hai mới là INV-Q-06.
--
-- Trigger dưới đây cộng lại từ chính các dòng và so sánh. Nó đúng ở MỌI trạng
-- thái, kể cả DRAFT, và không cần biết ai đang ghi.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_tong_bao_gia() RETURNS trigger AS $$
DECLARE
  s_gross    bigint;
  s_discount bigint;
  s_tax      bigint;
  s_total    bigint;
BEGIN
  SELECT COALESCE(sum(l.gross_amount), 0),
         COALESCE(sum(CASE WHEN l.is_warranty THEN 0 ELSE l.discount_amount END), 0),
         COALESCE(sum(l.tax_amount), 0),
         COALESCE(sum(l.line_total), 0)
    INTO s_gross, s_discount, s_tax, s_total
    FROM quotation_line l
   WHERE l.quotation_id = NEW.id AND l.status <> 'REJECTED';

  IF NEW.subtotal_amount <> s_gross
  OR NEW.discount_amount <> s_discount
  OR NEW.tax_amount      <> s_tax
  OR NEW.total_amount    <> s_total THEN
    RAISE EXCEPTION
      'INV-Q-06: tong bao gia khong khop tong cac dong (bao giá: %, cac dong: %)',
      NEW.total_amount, s_total
      USING ERRCODE = 'check_violation', CONSTRAINT = 'quotation_totals_match_lines';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

/*
 * AFTER, không phải BEFORE: hàm cộng lại `cong_lai_bao_gia()` chạy AFTER trên
 * `quotation_line`, và nó ghi vào `quotation`. Nếu trigger kiểm tra chạy BEFORE
 * trên `quotation` thì nó sẽ so sánh với trạng thái dòng CHƯA hoàn tất trong
 * cùng lệnh — và báo sai.
 *
 * CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED: hoãn tới cuối giao dịch.
 * Nhờ đó một giao dịch được phép đi qua trạng thái trung gian không khớp (thêm
 * dòng rồi mới cộng lại), miễn là lúc COMMIT thì khớp.
 */
CREATE CONSTRAINT TRIGGER trg_quotation_totals_match
  AFTER INSERT OR UPDATE ON quotation
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_tong_bao_gia();
