-- =============================================================================
-- 0022 — Chốt hai khoản nợ về tiền còn treo từ Phase 1
--
-- (A) Báo giá phải snapshot BẢNG GIÁ, không chỉ đơn giá giờ.
-- (B) Thuế suất phải có nguồn cấu hình được, để không còn cớ nhận từ client.
--
-- -----------------------------------------------------------------------------
-- (A) Vì sao đây là lỗi thật, không phải dọn dẹp cho đẹp
--
-- `quotation.labor_rate_per_hour` đã snapshot từ 0010. Nhưng giá PHỤ TÙNG thì
-- không: `loadDraft()` gọi lại `resolveActivePriceList(branch)` mỗi lần thêm
-- dòng, tức là hỏi "bảng giá nào đang hiệu lực BÂY GIỜ".
--
-- Kịch bản hỏng, không cần đồng thời, không cần ai làm gì sai:
--
--   09:00  Cố vấn mở báo giá cho đơn #1234, thêm dòng công.
--          -> snapshot labor_rate = 250.000 (bảng giá Quý 3)
--   09:20  Quản lý đóng bảng giá Quý 3, mở bảng giá Quý 4 (phụ tùng +15%).
--   09:30  Cố vấn quay lại tab cũ, thêm dòng phụ tùng.
--          -> giá phụ tùng lấy từ bảng giá Quý 4
--
-- Một báo giá, hai bảng giá. Không có gì trong dữ liệu ghi lại chuyện đó, nên
-- khi khách thắc mắc thì không ai giải thích được — và `docs/10` mục "Bảng giá"
-- nói rõ giá phải "giải thích được hôm nay bằng dữ liệu của hôm qua".
--
-- Đáng ghi lại: comment trong `pricePart()` ĐANG NÓI là nó bám vào "bảng giá đã
-- snapshot trên báo giá". Điều đó chưa bao giờ đúng — chưa từng có cột nào để
-- bám vào. Comment mô tả ý định của người viết chứ không mô tả code, và nó đã
-- sống qua sáu vòng review vì người đọc tin comment.
--
-- Sau migration này thì câu đó thành sự thật, và FK ở dưới giữ cho nó thành
-- sự thật kể cả khi ứng dụng đổi.
-- =============================================================================

ALTER TABLE quotation ADD COLUMN price_list_id uuid;

-- Điền cho dữ liệu cũ: bảng giá hiệu lực TẠI LÚC LẬP báo giá, cùng quy tắc ưu
-- tiên với `resolveActivePriceList` (bảng riêng chi nhánh thắng bảng toàn chuỗi).
--
-- Dùng `q.created_at` chứ không phải `now()`: mục đích của cả migration này là
-- neo giá vào thời điểm lập. Điền bằng bảng giá hôm nay sẽ vừa dựng ràng buộc
-- vừa ghi vào đó một dữ liệu sai — và từ đó về sau không phân biệt được nữa.
UPDATE quotation q
   SET price_list_id = (
     SELECT pl.id
       FROM price_list pl
       JOIN repair_order ro ON ro.id = q.repair_order_id
      WHERE pl.tenant_id = q.tenant_id
        AND pl.effective_from <= q.created_at
        AND (pl.effective_to IS NULL OR pl.effective_to > q.created_at)
        AND (pl.branch_id IS NULL OR pl.branch_id = ro.branch_id)
      ORDER BY (pl.branch_id IS NULL)
      LIMIT 1)
 WHERE price_list_id IS NULL;

-- `kiem_tra_tong_bao_gia` (0020/0021) là CONSTRAINT TRIGGER ... DEFERRABLE, nên
-- câu UPDATE ở trên để lại một sự kiện trigger đang chờ tới cuối giao dịch. Với
-- sự kiện đang treo, Postgres từ chối mọi `ALTER TABLE quotation` ở dưới
-- ("cannot ALTER TABLE because it has pending trigger events").
--
-- Xả ngay tại đây thay vì tắt trigger: nếu dữ liệu hiện có đã lệch tổng thì
-- migration phải đỏ ở dòng này, chứ không phải đi qua rồi để lại một ràng buộc
-- mới dựng trên dữ liệu chưa từng được kiểm.
SET CONSTRAINTS ALL IMMEDIATE;

-- Báo giá cũ mà không tìm được bảng giá nào của thời điểm đó thì KHÔNG đoán.
-- Thà migration dừng lại và người vận hành xử lý thủ công, còn hơn cột snapshot
-- chứa một giá trị bịa mà về sau không ai biết là bịa.
DO $$
DECLARE mo_coi int;
BEGIN
  SELECT count(*) INTO mo_coi FROM quotation WHERE price_list_id IS NULL;
  IF mo_coi > 0 THEN
    RAISE EXCEPTION
      '0022: % báo giá không tìm được bảng giá hiệu lực tại thời điểm lập. '
      'Kiểm tra price_list.effective_from/effective_to trước khi chạy lại.', mo_coi;
  END IF;
END $$;

ALTER TABLE quotation ALTER COLUMN price_list_id SET NOT NULL;

-- 🔒 FK có tenant_id ở cả hai vế: không mượn được bảng giá của tenant khác.
ALTER TABLE quotation
  ADD CONSTRAINT quotation_price_list_fk
  FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_list(tenant_id, id);

-- 🔒 Snapshot thì không sửa. `GRANT UPDATE` của 0010/0019 liệt kê cột theo tên,
--    nên cột mới KHÔNG tự động được cấp quyền — nhưng viết REVOKE ra đây để
--    người đọc sau này thấy ý định, thay vì phải suy ra từ chỗ vắng mặt.
REVOKE UPDATE (price_list_id) ON quotation FROM garageos_app;

-- =============================================================================
-- (B) Thuế suất: có nguồn cấu hình cấp tenant
--
-- `quotation_line.tax_rate_percent` đang nhận từ body request. Không có bất
-- biến nào bị vi phạm ngay, nhưng nó là đúng cái hình dạng đã sinh ra Q-001:
-- một con số ảnh hưởng tới tiền, đi từ trình duyệt vào thẳng chứng từ.
--
-- Phụ tùng đã có `price_list_item.tax_rate_percent` từ 0008 — nguồn đúng, chỉ
-- là không ai đọc. Dòng công thì chưa có nguồn nào, nên thêm ở cấp tenant.
--
-- Cấp tenant chứ không phải cấp hạng mục dịch vụ: VAT ở Việt Nam là chính sách
-- áp cho cả doanh nghiệp và có đổi theo nghị quyết (10% -> 8% năm 2022, rồi
-- quay lại). Khi nó đổi, xưởng cần sửa MỘT chỗ, không phải sửa từng hạng mục
-- trong danh mục.
-- =============================================================================

ALTER TABLE tenant
  ADD COLUMN default_tax_rate_percent int NOT NULL DEFAULT 10;

ALTER TABLE tenant
  ADD CONSTRAINT tenant_valid_default_tax
  CHECK (default_tax_rate_percent BETWEEN 0 AND 100);

-- 🔒 KHÔNG cấp `GRANT UPDATE` cho cột này, dù thoạt nhìn có vẻ nên cấp.
--
-- 0016 đã thu hồi UPDATE trên toàn bảng `tenant` vì các cột ngưỡng ở đây chính
-- là tham số phân quyền. Hiện chưa có màn cấu hình tenant nào, nên chưa có
-- đường code nào cần ghi cột này. Cấp quyền trước cho một màn hình chưa tồn tại
-- là mở sẵn một lỗ mà không có test nào canh.
--
-- Khi màn cấu hình được làm, cấp quyền ĐI KÈM kiểm tra vai trong cùng một lần
-- thay đổi — đúng như 0016 đã lập luận.

