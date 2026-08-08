-- =============================================================================
-- 0048 — Chặn độ lớn của tiền, và chặn DẤU, là hai việc khác nhau
--
-- 0047 gỡ `unit_price >= 0` ra khỏi CHECK và chuyển sang trigger, vì điều kiện
-- đó phụ thuộc hoá đơn cha. Nhưng còn một chỗ nữa trong 0043 nói cùng điều đó
-- mà không ai để ý — nó nằm lẫn trong ràng buộc "vùng an toàn của JavaScript":
--
--     CHECK (unit_price BETWEEN 0 AND 9007199254740991 AND ...)
--
-- 💡 Một ràng buộc mang hai ý nghĩa là một ràng buộc chỉ sửa được một nửa. Tên
--    của nó nói về ĐỘ LỚN, nên khi gỡ điều kiện về DẤU ở chỗ khác thì không ai
--    nghĩ tới nó. Test hoá đơn điều chỉnh vẫn đỏ sau lần sửa thứ nhất, với đúng
--    một thông báo: `invoice_line_within_safe_range`.
-- =============================================================================
ALTER TABLE invoice_line
  DROP CONSTRAINT invoice_line_within_safe_range,
  ADD CONSTRAINT invoice_line_within_safe_range
    CHECK (unit_price BETWEEN -9007199254740991 AND 9007199254740991
       AND line_total BETWEEN -9007199254740991 AND 9007199254740991);
