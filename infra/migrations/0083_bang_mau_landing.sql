-- =============================================================================
-- 0083_bang_mau_landing — bốn màu và một bậc bo góc của trang công khai
--
-- Nguồn yêu cầu: DES-LS-002 §3 (bảng token), màn *Cài đặt → Giao diện*
-- Bất biến: INV-T-01 (cô lập tenant)
--
-- Màn *Giao diện* đã dựng xong từ đợt trước: nó đo tám cặp màu theo WCAG 2.2 AA,
-- gợi ý màu thay thế, và khoá nút Lưu khi còn cặp trượt. Chỉ có điều nút Lưu
-- không nối vào đâu cả — nó là màn cuối cùng trong sales-admin còn ở trạng thái
-- đó. Bảng này là chỗ nút ấy ghi vào.
--
-- 🔒 KHÔNG có nháp/publish ở đây, và đó là chủ ý.
--    `site_profile` có vòng đời hai trạng thái vì nội dung của nó là chữ nghĩa
--    đối ngoại — tên pháp nhân, mô tả SEO — thứ cần người thứ hai đọc lại. Bảng
--    màu thì có bốn giá trị, một khung xem trước ngay cạnh ô nhập, và một cổng
--    AA chặn ở cả ba tầng. Thêm một máy trạng thái vào đây là thêm một trạng
--    thái nữa để lệch, đổi lấy một lượt duyệt mà không ai đòi.
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_theme (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  /*
   * Tên cột theo đúng tên token ngữ nghĩa mà biên tập viên thấy, không theo tên
   * biến CSS (`--ink-0`). Biến CSS là chi tiết của bản dựng hiện tại; "nền
   * chính" là thứ tồn tại lâu hơn nó.
   */
  nen_chinh   text NOT NULL,
  nen_noi     text NOT NULL,
  thuong_hieu text NOT NULL,
  nut_chinh   text NOT NULL,
  bo_goc      int  NOT NULL DEFAULT 4,
  created_by  uuid NOT NULL,
  updated_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  /*
   * 🔒 ĐÚNG MỘT bảng màu cho mỗi tenant.
   *
   * Không có "bảng màu theo trang" hay "theo chiến dịch": hai bảng màu cùng
   * hiệu lực là hai trang bán xe trông như hai công ty, và không cổng AA nào
   * bắt được điều đó vì cả hai đều đạt.
   */
  UNIQUE (tenant_id),

  CONSTRAINT theme_hex_nen_chinh   CHECK (nen_chinh   ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT theme_hex_nen_noi     CHECK (nen_noi     ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT theme_hex_thuong_hieu CHECK (thuong_hieu ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT theme_hex_nut_chinh   CHECK (nut_chinh   ~* '^#[0-9a-f]{6}$'),
  /*
   * Bốn bậc, không phải một khoảng. Một `border-radius: 7px` cạnh một `6px`
   * không đọc được là cố ý hay là gõ nhầm — thang bậc tồn tại để câu hỏi đó
   * không bao giờ được đặt ra.
   */
  CONSTRAINT theme_bo_goc_bac CHECK (bo_goc IN (0, 4, 8, 16))
);

/*
 * ⚠️ Ràng buộc TƯƠNG PHẢN không đặt được ở đây, và cần nói rõ vì sao — nếu
 *    không, dòng `CHECK` thiếu vắng sẽ trông như một chỗ bị bỏ quên.
 *
 *    Ngưỡng AA là một phép tính trên độ chói tương đối: hàm mũ 2.4 trên ba kênh
 *    đã tuyến tính hoá, làm tám lần cho tám cặp. Viết được bằng SQL, nhưng bản
 *    SQL đó sẽ là BẢN THỨ HAI của công thức — đúng thứ mà
 *    `packages/domain/src/tuong-phan.ts` được dựng ra để dẹp.
 *
 * 🔒 Nên tầng chốt của tương phản là `loiBangMau()` ở service, và nó có một bài
 *    kiểm riêng chứng minh máy chủ từ chối bảng màu trượt AA kể cả khi lượt gọi
 *    đi thẳng vào API, không qua màn hình. Còn tầng DB canh những gì DB canh
 *    được: đúng dạng hex, đúng bậc bo góc, đúng một dòng mỗi tenant.
 */

ALTER TABLE site_theme ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_theme FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_theme
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER trg_touch_site_theme
  BEFORE UPDATE ON site_theme FOR EACH ROW EXECUTE FUNCTION touch_row();

-- --- Quyền -------------------------------------------------------------------
-- UPDATE theo cột; `updated_at`/`version` do trigger gán nên không cấp (0071).
--
-- 🔒 Không cấp DELETE. Xoá bảng màu không phải một thao tác có nghĩa — "khôi
--    phục mặc định" là GHI lại bốn giá trị mặc định, và như thế lịch sử ai đổi
--    lúc nào vẫn còn trong `updated_by`/`updated_at`.
GRANT SELECT, INSERT ON site_theme TO garageos_app;
GRANT UPDATE (nen_chinh, nen_noi, thuong_hieu, nut_chinh, bo_goc, updated_by)
  ON site_theme TO garageos_app;
