-- =============================================================================
-- 0026 — Giá vốn của phiếu điều chỉnh do DATABASE quyết định, dưới khoá
--
-- Phát hiện của `/codex-review` trên 0025. Nó đúng, và đây là bản sửa đặt thấp
-- hơn một tầng so với đề xuất của nó.
--
-- -----------------------------------------------------------------------------
-- Lỗi
--
-- `StockService.adjust()` đọc giá vốn bình quân hiện tại rồi ghi con số đó vào
-- `stock_movement.unit_cost`:
--
--     const hienTai = await this.docTon(...)   -- SELECT thuần, KHÔNG khoá
--     INSERT INTO stock_movement (... unit_cost = hienTai.avgCost ...)
--
-- Trigger `cong_vao_ton_kho()` khoá dòng tồn, nên phần CỘNG TỒN luôn đúng. Cái
-- sai là con số ĐI VÀO nó:
--
--   T1  nhập 10 @ 200.000
--   T2  điều chỉnh +5, đọc bình quân = 100.000   (T1 chưa commit)
--   T1  commit -> bình quân thật thành 150.000
--   T2  trigger chạy với unit_cost = 100.000 -> bình quân bị kéo xuống
--
-- Chính sách của hệ thống là "điều chỉnh được định giá theo bình quân hiện
-- tại", mà nếu con số đúng thì phép bình quân gia quyền KHÔNG làm đổi bình quân
-- (thêm n đơn vị đúng bằng giá bình quân thì bình quân giữ nguyên). Nói cách
-- khác: một phiếu điều chỉnh làm đổi giá vốn là bằng chứng nó đã đọc số cũ.
--
-- -----------------------------------------------------------------------------
-- Vì sao không khoá ở tầng service như review đề xuất
--
-- Cách đó là `SELECT … FOR UPDATE` trong `adjust()`. Ba vấn đề:
--
--  1. `garageos_app` không có quyền ghi `stock_balance` — cố ý, 0025. Khoá ghi
--     từ đó đòi nới quyền, tức là đánh đổi một bất biến để vá một lỗi khác.
--  2. Nó chỉ vá ĐƯỜNG NÀY. Kiểm kê (5.4), chuyển kho, script nhập dữ liệu — mỗi
--     đường mới lại phải nhớ khoá. Đúng loại lỗi mà 0025 đã chọn trigger để
--     tránh.
--  3. Nó để chính sách định giá nằm ở tầng ứng dụng, trong khi dữ liệu để tính
--     nó chỉ database mới đọc được một cách nhất quán.
--
-- Trigger BEFORE INSERT đặt con số ở đúng nơi biết nó, dưới đúng cái khoá đã
-- tuần tự hoá sổ kho. Ứng dụng gửi gì cũng không quan trọng nữa.
-- =============================================================================

CREATE OR REPLACE FUNCTION dinh_gia_dieu_chinh() RETURNS trigger AS $$
DECLARE
  gia_hien_tai bigint;
BEGIN
  IF NEW.type <> 'ADJUSTMENT' THEN
    RETURN NEW;
  END IF;

  -- FOR UPDATE ở ĐÂY, trong BEFORE trigger, là mấu chốt: nó giữ khoá cho tới
  -- hết giao dịch, nên `cong_vao_ton_kho()` (AFTER, cùng giao dịch) đọc lại
  -- đúng dòng đó mà không có ai chen vào giữa.
  SELECT avg_cost INTO gia_hien_tai
    FROM stock_balance
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id
   FOR UPDATE;

  -- Chưa có dòng tồn: điều chỉnh dương đầu tiên cho một mã chưa từng nhập.
  -- Giữ nguyên giá ứng dụng gửi lên — không có bình quân nào để lấy.
  NEW.unit_cost := COALESCE(gia_hien_tai, NEW.unit_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
/*
 * SECURITY DEFINER vì hàm này khoá `stock_balance`, mà `SELECT … FOR UPDATE`
 * đòi quyền ghi — quyền mà `garageos_app` cố ý không có (0025). Cùng lập luận
 * với `cong_vao_ton_kho()`.
 */
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_dinh_gia_dieu_chinh
  BEFORE INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION dinh_gia_dieu_chinh();

-- =============================================================================
-- Ghi chú về phạm vi
--
-- Từ đây, MỌI phiếu điều chỉnh được định giá theo bình quân hiện tại, kể cả khi
-- người ghi cố tình gửi con số khác. Đó là chính sách có chủ ý, không phải hạn
-- chế kỹ thuật.
--
-- Nếu kiểm kê ở 5.4 cần định giá tường minh (ví dụ hàng hỏng ghi theo giá mua
-- gốc chứ không theo bình quân), đường đúng là thêm một LOẠI chuyển động riêng
-- với quy tắc riêng — không phải nới hàm này để nó tin con số ứng dụng gửi lên.
-- Một hàm vừa tin vừa không tin đầu vào là hàm không ai đọc ra được quy tắc.
-- =============================================================================
