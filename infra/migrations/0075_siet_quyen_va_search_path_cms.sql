-- =============================================================================
-- 0075_siet_quyen_va_search_path_cms — vá ba lỗ do đợt CMS marketing để lại
--
-- Bất biến: INV-T-01 (cô lập tenant), INV-S-03 (chứng từ chỉ-thêm)
-- Bài kiểm bắt được: packages/db/test/privileges.spec.ts
--
-- 🔒 Cả ba lỗi dưới đây đều KHÔNG lộ ra khi dùng thử. Chúng chỉ hiện khi có bài
--    quét toàn bộ đối chiếu quyền thật trong `information_schema` với quy tắc —
--    và bài quét đó là thứ duy nhất phát hiện được chúng sau ba vòng review.
-- =============================================================================

-- --- 1. Hàm SECURITY DEFINER thiếu `pg_temp` ---------------------------------
/*
 * 🔒 Ba hàm của trình soạn trang landing khai `SET search_path = public` mà
 *    QUÊN `pg_temp`. Migration 0053 đã sửa đúng lỗi này một lần cho cả hệ; đợt
 *    0066 sinh hàm mới và tái tạo lại nó.
 *
 * Vì sao thiếu `pg_temp` là lỗ hổng chứ không phải lệch chuẩn:
 *
 *   Postgres LUÔN tìm `pg_temp` TRƯỚC tiên cho bảng, trừ khi schema đó được
 *   liệt kê tường minh ở một vị trí khác. `SET search_path = public` không nhắc
 *   tới `pg_temp`, nên nó vẫn được tìm trước `public`.
 *
 *   Hàm SECURITY DEFINER chạy bằng quyền của NGƯỜI TẠO. Kẻ gọi chỉ cần
 *   `CREATE TEMP TABLE landing_page (...)` là mọi câu lệnh trong hàm trỏ vào
 *   bảng của họ — với quyền của owner. Ghi `public, pg_temp` đẩy schema tạm
 *   xuống cuối và đóng đường đó.
 *
 * Dùng `ALTER FUNCTION` chứ không định nghĩa lại: thân hàm không có gì sai, và
 * chép lại thân hàm là tạo cơ hội cho hai bản lệch nhau.
 */
ALTER FUNCTION marketing_set_landing_page_draft(uuid, uuid, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION marketing_promote_landing_page_draft(uuid, uuid, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION resolve_landing_preview_session(text)
  SET search_path = public, pg_temp;

-- --- 2. UPDATE phải khai theo CỘT --------------------------------------------
/*
 * 🔒 `GRANT UPDATE ON <bảng>` cho phép sửa MỌI cột, gồm cả `tenant_id`,
 *    `created_by` và `created_at`.
 *
 * Sửa được `tenant_id` nghĩa là chuyển một bản ghi sang doanh nghiệp khác bằng
 * một câu `UPDATE` — RLS không chặn, vì `WITH CHECK` chỉ đòi giá trị mới khớp
 * tenant hiện tại, và ứng dụng có thể đang đặt đúng tenant đó. Cô lập dữ liệu
 * giữa khách hàng là bất biến nặng nhất của hệ (INV-T-01); nó không nên phụ
 * thuộc vào việc không ai viết nhầm một câu lệnh.
 *
 * `updated_at` và `version` KHÔNG cần cấp: `touch_row()` gán chúng trong
 * trigger, mà quyền theo cột chỉ được kiểm trên danh sách `SET` của câu lệnh.
 */
REVOKE UPDATE ON testimonial FROM garageos_app;
GRANT UPDATE (display_name, content, rating, vehicle_id, featured, sort_order,
              status, updated_by)
  ON testimonial TO garageos_app;

REVOKE UPDATE ON vehicle_product_category FROM garageos_app;
GRANT UPDATE (name, slug, description, image_media_id, status, sort_order,
              seo_title, seo_description, updated_by)
  ON vehicle_product_category TO garageos_app;

-- --- 3. DELETE trên vehicle_product_category ---------------------------------
/*
 * Giữ lại, và ghi rõ lý do vào bài kiểm thay vì để nó trôi.
 *
 * Một danh mục không có xe nào trỏ tới là NHÃN PHÂN LOẠI, không phải dữ liệu
 * nghiệp vụ — xoá nó không mất bằng chứng của việc gì cả. Khoá ngoại
 * `vehicle_product_category_fk` là `ON DELETE RESTRICT` (0067), nên danh mục
 * còn xe thì không xoá được: quyền rộng ở tầng GRANT, hẹp lại bằng ràng buộc.
 *
 * Cùng khuôn với `quotation_line` và `invoice_line` đã có trong danh sách.
 */
