-- =============================================================================
-- 0047 — Dòng hoá đơn ĐIỀU CHỈNH được phép âm
--
-- 0043 đặt hai ràng buộc nghe hoàn toàn hợp lý:
--
--     CHECK (unit_price >= 0)
--     CHECK (discount_amount >= 0 AND discount_amount <= round(quantity * unit_price))
--
-- Chúng đúng với mọi hoá đơn thường. Nhưng BC-07 mục 6.1 nói hoá đơn điều chỉnh
-- "chỉ ghi phần chênh lệch (CÓ THỂ ÂM)" — và ghi thừa một lít dầu thì phần
-- chênh lệch là −300.000đ.
--
-- 💡 Cái bẫy ở đây không phải quên đọc tài liệu: hai ràng buộc trên được viết
--    khi đang nghĩ về hoá đơn thường, và hoá đơn điều chỉnh nằm ở mục 6 — phần
--    "luồng phụ". Ràng buộc đúng cho luồng chính, sai cho luồng phụ, và chỉ lộ
--    ra khi có test đi qua luồng phụ đó.
--
-- Cách sửa KHÔNG phải nới ràng buộc cho mọi dòng: một hoá đơn thường có dòng
-- giá âm là một khoản tiền trả ngược cho khách mà không ai giải thích được.
-- Điều kiện thật phụ thuộc HOÁ ĐƠN CHA, nên nó phải là trigger — CHECK không
-- nhìn được sang bảng khác.
-- =============================================================================

ALTER TABLE invoice_line
  DROP CONSTRAINT invoice_line_price_non_negative,
  DROP CONSTRAINT invoice_line_discount_khong_vuot;

CREATE OR REPLACE FUNCTION kiem_tra_dong_hoa_don() RETURNS trigger AS $$
DECLARE
  la_dieu_chinh boolean;
BEGIN
  SELECT adjustment_of_invoice_id IS NOT NULL INTO la_dieu_chinh
    FROM invoice WHERE id = NEW.invoice_id;

  IF la_dieu_chinh THEN
    /*
     * Hoá đơn điều chỉnh: đơn giá âm là hợp lệ và là toàn bộ mục đích của nó.
     *
     * 🔒 Nhưng chiết khấu PHẢI bằng 0. "Giảm 300.000 rồi chiết khấu thêm 10%"
     *    là một câu không có nghĩa — phần chênh lệch đã là con số cuối cùng.
     */
    IF NEW.discount_amount <> 0 THEN
      RAISE EXCEPTION
        'ADJUSTMENT_NO_DISCOUNT: dòng điều chỉnh không có chiết khấu — phần chênh lệch đã là số cuối'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Hoá đơn thường: giữ nguyên hai ràng buộc của 0043
  IF NEW.unit_price < 0 THEN
    RAISE EXCEPTION
      'NEGATIVE_PRICE: hoá đơn thường không có dòng giá âm — giảm trừ thì lập hoá đơn điều chỉnh'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 🔒 INV-M-07
  IF NEW.discount_amount < 0 OR NEW.discount_amount > round(NEW.quantity * NEW.unit_price) THEN
    RAISE EXCEPTION
      'DISCOUNT_OVER_LINE: chiết khấu % vượt giá trị dòng %',
      NEW.discount_amount, round(NEW.quantity * NEW.unit_price)
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_07';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

/*
 * Chạy SAU `trg_invoice_line_tinh_tien` (thứ tự trigger cùng loại là theo TÊN),
 * nên `line_total` đã được tính khi hàm này chạy. Đặt tên bắt đầu bằng `trg_z`
 * để bảo đảm điều đó thay vì hy vọng.
 */
CREATE TRIGGER trg_z_invoice_line_kiem_tra
  BEFORE INSERT OR UPDATE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_dong_hoa_don();
