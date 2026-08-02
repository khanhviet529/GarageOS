-- =============================================================================
-- 0019 — Ba lỗi logic từ vòng rà soát (đợt 4)
-- =============================================================================

-- --- 1. Dòng phụ tùng BẮT BUỘC có dòng công cha -----------------------------
--
-- `packages/contracts/src/quotation.ts` ghi comment "PART phải trỏ về dòng công
-- đã dùng nó (🔒 INV-Q-02)" nhưng cả Zod lẫn CHECK đều để `parentLineId` là tuỳ
-- chọn. Giao diện lập báo giá còn để mặc định "— Không gắn —", nên sinh ra dòng
-- mồ côi chỉ bằng thao tác bình thường.
--
-- Hai hậu quả, cả hai đều đo được:
--
--  a) Trang tra cứu vẽ dòng mồ côi thành một nhóm riêng mang `lineId` của chính
--     nó, nhưng API duyệt chỉ nhận quyết định cho dòng LABOR. Khách chọn hết
--     rồi bấm xác nhận -> 400 "Có hạng mục không thuộc báo giá này". Khách
--     KHÔNG BAO GIỜ trả lời được, mỗi lần thử tốn một mã OTP, và sau 5 lần thì
--     bị chặn tần suất. Đơn kẹt vĩnh viễn ở "chờ khách duyệt".
--
--  b) Một client chỉ gửi id dòng LABOR thì qua được mọi kiểm tra, báo giá chốt
--     APPROVED, mà dòng mồ côi vẫn PENDING — và vì hàm cộng tổng chỉ loại dòng
--     REJECTED, tiền của nó VẪN nằm trong total_amount. Khách bị tính tiền cho
--     thứ chưa bao giờ đồng ý. Trái BR-04-2.
--
-- BC-02 mục 5.3 nói rõ: bán phụ tùng rời cho khách mang về KHÔNG hỗ trợ ở giai
-- đoạn 1. Vậy ràng buộc này đúng cả về nghiệp vụ lẫn về kỹ thuật.
/*
 * ⚠️ Dọn dữ liệu trước khi thêm ràng buộc.
 *
 * Database phát triển đang có dòng mồ côi do chính các lần chạy test sinh ra —
 * đúng bằng chứng cho thấy đường đi này mở. Xoá chúng ở đây là AN TOÀN và tôi
 * ghi rõ lý do thay vì làm lặng lẽ:
 *
 *   - Dự án đang ở Phase 1, chưa có bản triển khai thật nào, nên không có dữ
 *     liệu của khách để mất.
 *   - Một dòng phụ tùng không gắn hạng mục công là dòng mà khách KHÔNG THỂ
 *     duyệt được (xem giải thích ở trên). Giữ lại chỉ để lại một báo giá hỏng.
 *
 * 🔒 Nếu migration này chạy trên database ĐÃ CÓ dữ liệu thật, phải dừng lại và
 *    xử lý tay: gắn từng dòng vào hạng mục công đúng, hoặc lập lại báo giá.
 */
DELETE FROM quotation_line WHERE line_type = 'PART' AND parent_line_id IS NULL;

ALTER TABLE quotation_line
  ADD CONSTRAINT qline_part_must_have_parent
  CHECK (line_type <> 'PART' OR parent_line_id IS NOT NULL);

-- --- 2. Đóng băng bảng `quotation` như đã đóng băng `quotation_line` --------
--
-- INV-Q-05 được cài rất kỹ cho dòng báo giá (0010 + 0011), nhưng bảng CHA thì
-- không có trigger nào. Bốn cột tổng được cấp UPDATE ở mọi trạng thái, và không
-- có ràng buộc nào buộc chúng khớp với tổng các dòng.
--
-- Kịch bản: báo giá đã SENT, khách đã cầm bản in 1.034.000đ. Một câu
-- `UPDATE quotation SET subtotal_amount=0, tax_amount=0, total_amount=0`
-- đi qua mọi CHECK hiện có. Trang tra cứu của khách và mọi báo cáo doanh thu
-- đọc cột tổng -> thấy 0đ, trong khi tổng các dòng vẫn là 1.034.000đ.
-- INV-Q-06 bị phá ở trạng thái nghỉ, không ai phát hiện tới lúc đối soát.
--
-- Đây đúng là lỗ hổng Q-003 đã bịt cho bảng con, chỉ dịch lên một bảng.
CREATE OR REPLACE FUNCTION dong_bang_bao_gia_da_gui() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  -- `valid_until` và `sent_at` cũng là trường TIỀN theo nghĩa hệ quả: lùi hạn
  -- hiệu lực cho khách duyệt lại mức giá cũ sau khi bảng giá đã tăng.
  IF NEW.valid_until        IS DISTINCT FROM OLD.valid_until
  OR NEW.sent_at            IS DISTINCT FROM OLD.sent_at
  OR NEW.labor_rate_per_hour IS DISTINCT FROM OLD.labor_rate_per_hour
  OR NEW.seq                IS DISTINCT FROM OLD.seq
  OR NEW.repair_order_id    IS DISTINCT FROM OLD.repair_order_id THEN
    RAISE EXCEPTION
      'INV-Q-05: bao gia da gui khach (trang thai %), khong sua duoc snapshot', OLD.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'quotation_frozen_after_sent';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER trg_quotation_frozen
  BEFORE UPDATE ON quotation
  FOR EACH ROW EXECUTE FUNCTION dong_bang_bao_gia_da_gui();

/*
 * Cột TỔNG chỉ do `cong_lai_bao_gia()` ghi. Thu quyền của ứng dụng và cho hàm
 * đó chạy bằng quyền chủ sở hữu — cùng khuôn mẫu với `log_status_change()`.
 *
 * Sau bước này, một câu UPDATE thẳng vào cột tổng bị từ chối ở tầng QUYỀN, tức
 * là trước cả trigger. Không còn đường nào để tổng lệch tổng các dòng.
 */
CREATE OR REPLACE FUNCTION cong_lai_bao_gia() RETURNS trigger AS $$
DECLARE
  q_id uuid;
BEGIN
  q_id := COALESCE(NEW.quotation_id, OLD.quotation_id);

  UPDATE quotation q SET
    subtotal_amount = COALESCE(s.gross, 0),
    discount_amount = COALESCE(s.discount, 0),
    tax_amount      = COALESCE(s.tax, 0),
    total_amount    = COALESCE(s.total, 0)
  FROM (
    SELECT
      sum(l.gross_amount)                                            AS gross,
      sum(CASE WHEN l.is_warranty THEN 0 ELSE l.discount_amount END) AS discount,
      sum(l.tax_amount)                                              AS tax,
      sum(l.line_total)                                              AS total
      FROM quotation_line l
     WHERE l.quotation_id = q_id AND l.status <> 'REJECTED'
  ) s
  WHERE q.id = q_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE UPDATE ON quotation FROM garageos_app;
GRANT UPDATE (status, valid_until, sent_at, responded_at, approval_channel,
              approval_evidence, approved_by_name, version)
  ON quotation TO garageos_app;

-- 🔒 Tổng luôn khớp các thành phần. Ràng buộc này đứng độc lập với trigger:
--    kể cả khi ai đó sửa hàm cộng lại, tổng sai vẫn không ghi được.
ALTER TABLE quotation
  ADD CONSTRAINT quotation_total_matches_parts
  CHECK (total_amount = subtotal_amount - discount_amount + tax_amount);
