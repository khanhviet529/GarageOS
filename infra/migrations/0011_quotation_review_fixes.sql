-- =============================================================================
-- 0011 — Sửa 2 phát hiện tầng dữ liệu từ codex-review nhánh feat/bao-gia
-- =============================================================================

-- --- Q-003 -------------------------------------------------------------------
-- Trigger đóng băng giá sau khi gửi kiểm tra quantity, unit_price, discount,
-- tax_rate và description — nhưng BỎ SÓT `is_warranty`.
--
-- Cờ đó đưa toàn bộ tiền của dòng về 0. Nghĩa là sau khi khách đã nhận báo giá
-- 5 triệu, một lệnh `SET is_warranty = true` làm tổng thành 0 mà không vi phạm
-- ràng buộc nào. Đó là lỗ hổng đúng loại mà INV-Q-05 sinh ra để bịt.
CREATE OR REPLACE FUNCTION dong_bang_gia_da_gui() RETURNS trigger AS $$
DECLARE
  q_status quotation_status;
BEGIN
  SELECT status INTO q_status FROM quotation WHERE id = NEW.quotation_id;

  IF q_status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity         IS DISTINCT FROM OLD.quantity
  OR NEW.unit_price       IS DISTINCT FROM OLD.unit_price
  OR NEW.discount_amount  IS DISTINCT FROM OLD.discount_amount
  OR NEW.tax_rate_percent IS DISTINCT FROM OLD.tax_rate_percent
  OR NEW.description      IS DISTINCT FROM OLD.description
  -- Q-003: cờ bảo hành đưa cả dòng về 0đ, nên nó là một trường TIỀN
  OR NEW.is_warranty      IS DISTINCT FROM OLD.is_warranty
  -- Ba cột dưới do trigger tính; sửa tay là ghi đè kết quả của chính nó
  OR NEW.gross_amount     IS DISTINCT FROM OLD.gross_amount
  OR NEW.tax_amount       IS DISTINCT FROM OLD.tax_amount
  OR NEW.line_total       IS DISTINCT FROM OLD.line_total THEN
    RAISE EXCEPTION
      'INV-Q-05: bao gia da gui khach (trang thai %), khong sua duoc gia hay so luong', q_status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'qline_frozen_after_sent';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --- Q-004 -------------------------------------------------------------------
-- 🔒 INV-Q-02 nói trạng thái dòng phụ tùng KẾ THỪA từ dòng công cha. Bản đầu
-- chỉ cài chiều lan xuống (cha đổi -> con đổi theo), nên vẫn sửa thẳng được
-- trạng thái của dòng con.
--
-- Hậu quả cụ thể: phụ tùng APPROVED trong khi công cha còn PENDING -> kho được
-- phép xuất hàng cho một việc khách chưa đồng ý làm.
--
-- Trigger này khoá chiều còn lại: dòng con luôn phải cùng trạng thái với cha.
CREATE OR REPLACE FUNCTION rang_buoc_trang_thai_dong_con() RETURNS trigger AS $$
DECLARE
  parent_status quotation_line_status;
BEGIN
  IF NEW.parent_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM quotation_line WHERE id = NEW.parent_line_id;

  IF NEW.status IS DISTINCT FROM parent_status THEN
    RAISE EXCEPTION
      'INV-Q-02: dong phu tung phai cung trang thai voi dong cong cha (cha=%, con=%)',
      parent_status, NEW.status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'qline_child_follows_parent';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Chạy SAU trigger lan trạng thái từ cha xuống (tên bắt đầu bằng chữ cái sau),
-- nhưng vì trigger lan là AFTER còn trigger này là BEFORE nên thứ tự tự đúng:
-- lệnh UPDATE do trigger lan sinh ra cũng đi qua đây và lúc đó cha đã có trạng
-- thái mới.
CREATE TRIGGER trg_qline_child_follows_parent
  BEFORE INSERT OR UPDATE OF status ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION rang_buoc_trang_thai_dong_con();
