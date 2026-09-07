-- =============================================================================
-- 0065_site_profile_hero — Ảnh hero do showroom CHỌN, không phải tự suy ra
--
-- ⚠️ Trước migration này, hero của trang chủ dùng ảnh bìa của xe mới nhất
--    (`products[0].coverUrl`, mà `listProducts` xếp `ORDER BY created_at DESC`).
--
--    Hai hệ quả, cả hai đều sai về mặt sản phẩm:
--
--      · Showroom KHÔNG chọn được ảnh mặt tiền của mình. Đăng một chiếc xe mới
--        là đổi luôn ảnh hero, dù chiếc đó không phải thứ họ muốn khoe.
--      · Ảnh hero và ảnh thẻ xe buộc phải là MỘT — không thể dùng ảnh chụp cho
--        hero còn hình minh hoạ cho thẻ, dù hai chỗ đó có yêu cầu khác hẳn nhau.
--
-- 💡 Ảnh mặt tiền là một quyết định biên tập, không phải hệ quả của thứ tự nhập
--    liệu. Nó thuộc về hồ sơ trang (`site_profile`), nơi đã có sẵn quy trình
--    bản nháp / publish / rollback.
-- =============================================================================

ALTER TABLE site_profile
  ADD COLUMN IF NOT EXISTS hero_media_id uuid;

DO $$ BEGIN
  ALTER TABLE site_profile
    ADD CONSTRAINT site_profile_hero_media_fk
    FOREIGN KEY (tenant_id, hero_media_id) REFERENCES media_asset(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN site_profile.hero_media_id IS
  'Ảnh mặt tiền trang chủ do showroom chọn. NULL thì landing tự rơi về ảnh bìa '
  'của xe nổi bật đầu tiên — một mặc định hợp lý, không phải lỗi.';

-- 🔒 Cột mới nằm trong bảng đã bật RLS, nên nó thừa hưởng policy sẵn có.
--    `privileges.spec.ts` quét theo bảng nên không cần khai thêm gì.
--    Quyền UPDATE của role ứng dụng cấp theo CỘT (0063) — bổ sung cột này để
--    Sales Admin sửa được ảnh hero mà không mở rộng quyền sang cột khác.
DO $$ BEGIN
  GRANT UPDATE (hero_media_id) ON site_profile TO garageos_app;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
