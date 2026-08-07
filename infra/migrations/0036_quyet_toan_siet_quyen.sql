-- =============================================================================
-- 0036 — Siết quyền và chặn trên cho bảng quyết toán (vá 0034)
--
-- Hai hàng rào có sẵn của dự án bắt được hai thiếu sót của 0034, và cả hai đều
-- là loại không bao giờ lộ ra khi chạy thử bằng tay:
--
-- 1. `privileges.spec.ts` — "KHÔNG bảng nào được cấp DELETE ngoài dòng báo giá".
--    0034 cấp DELETE trên `cancellation_settlement_line` với lập luận "sửa bảng
--    nháp thì xoá cả rồi lập lại". Nghe hợp lý, nhưng dịch vụ KHÔNG có đường nào
--    gọi tới nó — tức là một quyền không ai dùng, đứng sẵn đó cho một lỗi SQL
--    injection hay một script bảo trì. Bảng quyết toán muốn lập lại thì đưa về
--    DRAFT rồi ghi đè, không cần xoá.
--
-- 2. `schema-invariants.spec.ts` — "cột tiền có chặn trên trong vùng an toàn của
--    JavaScript". `bigint` chứa tới 2^63; JavaScript đọc chính xác tới 2^53−1.
--    Khoảng giữa GHI ĐƯỢC nhưng ĐỌC RA SAI, im lặng. Một bảng quyết toán ghi
--    9.007.199.254.740.993đ sẽ hiện trên màn hình thành một số khác — và không
--    có gì báo lỗi ở bất kỳ đâu.
--
-- 💡 Cả hai thiếu sót đều nằm trong migration đã qua tự đọc lại một lượt. Hàng
--    rào quét toàn schema bắt được chính xác vì nó không cần ai nhớ.
-- =============================================================================

REVOKE DELETE ON cancellation_settlement_line FROM garageos_app;

ALTER TABLE cancellation_settlement_line
  ADD CONSTRAINT settlement_line_unit_price_within_safe_range
    CHECK (unit_price BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT settlement_line_amount_within_safe_range
    CHECK (amount BETWEEN 0 AND 9007199254740991);
