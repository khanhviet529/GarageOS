-- =============================================================================
-- 0038 — Dòng CHƯA ĐẾM thì chênh lệch là NULL, không phải "thiếu sạch"
--
-- 0037 định nghĩa:
--
--     variance = COALESCE(counted_quantity, 0) - (system_quantity + movement_delta)
--
-- `COALESCE(…, 0)` nghe như một thói quen phòng thủ vô hại. Nó không vô hại:
-- một dòng CHƯA AI ĐẾM có `counted_quantity IS NULL`, và công thức trên biến nó
-- thành chênh lệch âm ĐÚNG BẰNG TOÀN BỘ TỒN KHO của mã đó.
--
-- Hậu quả đo được ngay khi vừa mở phiếu, trước khi thủ kho đếm một cái nào:
--
--   · Phiếu tự đánh dấu "vượt ngưỡng, cần quản lý duyệt"
--   · Tổng giá trị chênh lệch bằng giá trị cả kho
--   · Màn hình hiện một bảng đỏ rực trong khi chưa có gì sai
--
-- Và nếu ai đó bấm duyệt lúc đó, hệ thống sẽ sinh điều chỉnh đưa cả kho về 0.
--
-- 💡 "Chưa biết" và "bằng không" là hai thứ khác nhau. NULL diễn đạt được điều
--    đầu tiên; 0 thì không. Đây đúng là chỗ mà một COALESCE viết theo phản xạ
--    xoá mất sự khác biệt duy nhất đang quan trọng.
--
-- Cột sinh không ALTER được biểu thức, nên phải bỏ đi và tạo lại. An toàn ở đây
-- vì `variance` là cột SINH — không có dữ liệu nào của người dùng nằm trong nó.
-- =============================================================================

ALTER TABLE stock_take_line DROP COLUMN variance;

ALTER TABLE stock_take_line
  ADD COLUMN variance numeric(12,3) GENERATED ALWAYS AS
    (counted_quantity - (system_quantity + movement_delta)) STORED;

COMMENT ON COLUMN stock_take_line.variance IS
  'NULL khi chua dem. KHONG dung COALESCE(counted,0): chua biet va bang khong '
  'la hai thu khac nhau — xem migration 0038.';
