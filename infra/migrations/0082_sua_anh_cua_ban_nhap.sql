-- =============================================================================
-- 0082_sua_anh_cua_ban_nhap — gắn/gỡ ảnh cho bản NHÁP của một mẫu xe
--
-- Bất biến: INV-LS-13 (nội dung revision đã publish là bất biến)
--
-- `vehicle_product_media` tới nay chỉ có SELECT + INSERT cho `garageos_app`, và
-- lượt INSERT duy nhất là bước chép sang bản nháp mới (`marketing.service.ts`).
-- Nghĩa là ảnh của một mẫu xe chỉ đặt được lúc import, không sửa được từ giao
-- diện — đó là lý do tab *Ảnh & 360°* trong màn Sửa xe còn là một ô chữ.
--
-- 🔒 Mở DELETE mà KHÔNG có trigger là mở luôn đường xoá ảnh của bản đã publish.
--    Ba bảng nội dung khác (`vehicle_color`, `vehicle_promotion`,
--    `financing_program`) đã đi qua đúng chỗ này ở 0072 và dùng chung một hàm
--    trigger; ảnh dùng lại đúng hàm đó, không viết bản thứ hai.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_vehicle_product_media_chi_sua_ban_nhap ON vehicle_product_media;
CREATE TRIGGER trg_vehicle_product_media_chi_sua_ban_nhap
  BEFORE INSERT OR UPDATE OR DELETE ON vehicle_product_media
  FOR EACH ROW EXECUTE FUNCTION chan_sua_noi_dung_revision_da_publish();

/*
 * ⚠️ Trigger áp cho cả INSERT, nên bước CHÉP sang bản nháp mới
 *    (`cloneRevision` trong `marketing.service.ts`) vẫn đi qua được: đích của
 *    lượt chép là một revision `DRAFT` vừa tạo. Chỉ lượt ghi vào revision đã
 *    publish mới bị từ chối.
 *
 *    Hàm trigger cũng cho `current_user = 'garageos'` đi qua — migration và
 *    seed cần ghi được dữ liệu ban đầu.
 */

GRANT DELETE ON vehicle_product_media TO garageos_app;
GRANT UPDATE (role, alt_text, sort_order, is_cover, color_id)
  ON vehicle_product_media TO garageos_app;
/*
 * `media_asset_id` và `product_revision_id` KHÔNG cấp: chúng hợp thành "tấm ảnh
 * nào, thuộc bản nào". Sửa được chúng nghĩa là dời một dòng sang bản khác hoặc
 * đổi hẳn tấm ảnh mà vẫn giữ nguyên thứ tự và nhãn — thay ảnh thì xoá dòng cũ,
 * thêm dòng mới.
 */
