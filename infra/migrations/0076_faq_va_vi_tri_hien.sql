-- =============================================================================
-- 0076_faq_va_vi_tri_hien — thư viện câu hỏi thường gặp, và nơi chúng hiện ra
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.10 (`faq_item`, `faq_placement`)
-- Bất biến: INV-T-01 (cô lập tenant)
--
-- Trước migration này, khối "Câu hỏi thường gặp" của trang Liên hệ là một mảng
-- HẰNG trong `apps/landing/src/app/lien-he/page.tsx`. Sửa một câu trả lời là
-- một lần deploy — nên trên thực tế không ai sửa, và câu trả lời cứ cũ dần.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE faq_surface AS ENUM ('HOME','CONTACT','VEHICLE','NEWS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/*
 * 🔒 KHÔNG có giá trị `FAQ` trong `faq_surface`, và đó là quyết định chứ không
 *    phải thiếu sót — SRS-LS-EXP-001 §4.10 ghi thẳng.
 *
 * Câu hỏi thường gặp luôn là một KHỐI NHÚNG trong trang khác, không có trang
 * riêng. Nút "Xem tất cả" ở khối FAQ vì thế từng trỏ vào hư vô; ngày 2026-09-04
 * đổi thành "Xem thêm 6 câu" mở tại chỗ.
 *
 * Muốn có trang FAQ riêng thì phải thêm cả ba thứ cùng lúc: một giá trị enum ở
 * đây, một dòng trong bảng trang, và một mục menu. Thêm mỗi enum là dựng lại
 * đúng cái nút dẫn tới URL không tồn tại.
 */

CREATE TABLE IF NOT EXISTS faq_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  question      text NOT NULL,
  answer        text NOT NULL,
  topic         text,
  display_order int NOT NULL DEFAULT 0,
  status        testimonial_status NOT NULL DEFAULT 'DRAFT',
  created_by    uuid NOT NULL,
  updated_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  CONSTRAINT faq_question_not_blank CHECK (btrim(question) <> ''),
  CONSTRAINT faq_answer_not_blank CHECK (btrim(answer) <> ''),
  CONSTRAINT faq_sort_nonnegative CHECK (display_order >= 0)
);

/*
 * Dùng lại `testimonial_status` thay vì đẻ thêm một enum hai giá trị nữa.
 * Cùng vòng đời (nháp → công bố), cùng nhóm nội dung marketing, cùng người
 * bấm nút. Hai enum giống hệt nhau là hai chỗ để lệch.
 */

CREATE TABLE IF NOT EXISTS faq_placement (
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  faq_item_id uuid NOT NULL,
  surface     faq_surface NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,

  PRIMARY KEY (faq_item_id, surface),
  FOREIGN KEY (tenant_id, faq_item_id) REFERENCES faq_item(tenant_id, id) ON DELETE CASCADE
);

/*
 * `ON DELETE CASCADE` ở đây, khác với `ON DELETE SET NULL` của ảnh gắn màu xe
 * (0072). Lý do khác nhau: một dòng `faq_placement` KHÔNG mang nội dung nào —
 * nó chỉ nói "câu hỏi này hiện ở trang kia". Xoá câu hỏi thì câu trả lời cho
 * "hiện ở đâu" không còn nghĩa gì, giữ lại là rác. Ảnh thì ngược lại: tấm ảnh
 * vẫn là tấm ảnh sau khi màu bị xoá.
 */

CREATE INDEX IF NOT EXISTS faq_item_published_sort
  ON faq_item(tenant_id, display_order, created_at) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS faq_placement_surface
  ON faq_placement(tenant_id, surface) WHERE enabled;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['faq_item','faq_placement'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

CREATE TRIGGER trg_touch_faq_item BEFORE UPDATE ON faq_item
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- --- Quyền -------------------------------------------------------------------
/*
 * 🔒 UPDATE khai THEO CỘT. `GRANT UPDATE ON <bảng>` cho phép sửa cả
 *    `tenant_id` — tức là chuyển một bản ghi sang doanh nghiệp khác bằng một
 *    câu UPDATE mà RLS không chặn (INV-T-01). Cùng khuôn với 0071–0075.
 *
 * `updated_at` và `version` KHÔNG có trong danh sách: Postgres kiểm quyền theo
 * cột trên danh sách `SET` CỦA CÂU LỆNH, không trên những gì trigger gán vào
 * `NEW`. Đo được và ghi ở 0071.
 */
GRANT SELECT, INSERT, DELETE ON faq_item TO garageos_app;
GRANT UPDATE (question, answer, topic, display_order, status, updated_by)
  ON faq_item TO garageos_app;

/*
 * DELETE có, và khác với chứng từ: một câu hỏi thường gặp là NỘI DUNG TRANG
 * WEB, không phải bằng chứng của việc gì. Xoá nó không mất dấu vết nghiệp vụ
 * nào — cùng khuôn với `vehicle_product_category` (0075).
 */
GRANT SELECT, INSERT, DELETE ON faq_placement TO garageos_app;
GRANT UPDATE (enabled) ON faq_placement TO garageos_app;
/*
 * `faq_placement` chỉ cấp UPDATE đúng cột `enabled`. `surface` và `faq_item_id`
 * hợp thành khoá — sửa được chúng nghĩa là dời một khai báo sang câu hỏi khác
 * mà vẫn giữ nguyên dòng. Đổi chỗ hiện thì xoá dòng cũ, thêm dòng mới.
 */
