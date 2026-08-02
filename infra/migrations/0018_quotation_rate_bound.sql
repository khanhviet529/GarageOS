-- =============================================================================
-- 0018 — Chặn trên cho đơn giá giờ đã snapshot trên báo giá
--
-- Test bất biến lược đồ viết ở đợt 3 (`packages/db/test/schema-invariants.spec.ts`)
-- tự tìm ra cột này ngay lần chạy đầu tiên.
--
-- `price_list.labor_rate_per_hour` đã có CHECK từ 0009 (CAT-001), nhưng bản
-- SNAPSHOT của nó trên `quotation` thì không. Giá trị được chép qua bằng code
-- ứng dụng — mà "được chép từ chỗ đã kiểm" là một lập luận, không phải một ràng
-- buộc: một script import hay một migration dữ liệu ghi thẳng vào `quotation`
-- không đi qua đoạn code đó.
-- =============================================================================

ALTER TABLE quotation
  ADD CONSTRAINT quotation_rate_within_safe_range
  CHECK (labor_rate_per_hour <= 9007199254740991);

ALTER TABLE quotation_line
  ADD CONSTRAINT qline_amounts_within_safe_range
  CHECK (gross_amount <= 9007199254740991
         AND tax_amount <= 9007199254740991
         AND line_total <= 9007199254740991
         AND discount_amount <= 9007199254740991);
