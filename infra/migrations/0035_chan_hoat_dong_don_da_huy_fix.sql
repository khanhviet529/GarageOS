-- =============================================================================
-- 0035 — Sửa hàng rào "đơn đã huỷ" của 0034
--
-- Bản ở 0034 dùng MỘT biểu thức CASE trên `TG_TABLE_NAME` để lấy id đơn từ ba
-- bảng khác nhau. Đọc thì gọn, chạy thì hỏng: plpgsql giao cả biểu thức cho bộ
-- thực thi SQL, và mọi nhánh đều được PHÂN GIẢI TÊN CỘT trước khi biết nhánh
-- nào trúng. `time_log` không có `repair_order_id`, nên câu lệnh chết ngay với
--
--     record "new" has no field "repair_order_id"
--
-- Hậu quả nặng hơn nhiều so với một trigger không chạy: MỌI lần bấm giờ và MỌI
-- phiếu xuất kho đều lỗi, kể cả trên đơn hoàn toàn bình thường. Hàng rào dựng
-- lên để chặn một trường hợp hiếm lại chặn luôn đường đi hằng ngày.
--
-- 💡 Probe bắt được ngay vì nó thử cả hai phía: "chặn được cái phải chặn" VÀ
--    "vẫn cho qua cái phải cho qua". Chỉ thử phía cấm thì thấy trigger ném lỗi
--    và tưởng là đúng — đúng vì lý do sai.
--
-- Bản này tách thành các nhánh IF/ELSIF riêng, mỗi nhánh một câu lệnh, nên
-- trường nào cũng chỉ được phân giải trong đúng bảng có nó.
-- =============================================================================

CREATE OR REPLACE FUNCTION chan_hoat_dong_tren_don_da_huy() RETURNS trigger AS $$
DECLARE
  don uuid;
  trang_thai repair_order_status;
BEGIN
  IF TG_TABLE_NAME = 'work_assignment' THEN
    don := NEW.repair_order_id;

  ELSIF TG_TABLE_NAME = 'time_log' THEN
    SELECT wa.repair_order_id INTO don
      FROM work_assignment wa WHERE wa.id = NEW.work_assignment_id;

  ELSIF TG_TABLE_NAME = 'stock_movement' THEN
    -- Chỉ dòng sổ gắn với một đơn sửa chữa. Nhập hàng, chuyển kho, kiểm kê đều
    -- có `ref_type` khác và không liên quan tới đơn nào.
    IF NEW.ref_type = 'REPAIR_ORDER' THEN
      don := NEW.ref_id;
    END IF;
  END IF;

  IF don IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO trang_thai FROM repair_order WHERE id = don;

  IF trang_thai = 'CANCELLED' THEN
    RAISE EXCEPTION
      'ORDER_CANCELLED: đơn đã huỷ, không ghi thêm % được', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;
