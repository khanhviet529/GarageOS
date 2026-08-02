-- =============================================================================
-- 0009 — Chặn trên cho cột tiền (codex-review CAT-001)
--
-- `bigint` của PostgreSQL chứa tới 2^63, còn số nguyên biểu diễn CHÍNH XÁC
-- được trong JavaScript chỉ tới 2^53-1. Khoảng giữa hai con số đó là vùng dữ
-- liệu ghi vào được nhưng đọc ra SAI — không lỗi, không cảnh báo, chỉ là một
-- con số khác.
--
-- ADR-0003 chốt tiền là `number` trong TypeScript vì mọi số tiền thật của một
-- garage cách 2^53 nhiều bậc độ lớn. Ràng buộc này biến giả định đó thành quy
-- tắc thật: giá trị nằm ngoài vùng an toàn không vào được database ngay từ đầu,
-- kể cả khi nó đến từ script quản trị hay import chứ không qua API.
--
-- 9007199254740991 = Number.MAX_SAFE_INTEGER.
-- =============================================================================

ALTER TABLE price_list
  ADD CONSTRAINT price_list_rate_within_safe_range
  CHECK (labor_rate_per_hour <= 9007199254740991);

ALTER TABLE price_list_item
  ADD CONSTRAINT price_list_item_within_safe_range
  CHECK (sell_price <= 9007199254740991);

ALTER TABLE customer
  ADD CONSTRAINT customer_credit_limit_within_safe_range
  CHECK (credit_limit_amount <= 9007199254740991);

COMMENT ON CONSTRAINT price_list_rate_within_safe_range ON price_list IS
  'CAT-001: gioi han Number.MAX_SAFE_INTEGER. Xem docs/adr/0003-money-as-integer.md';
