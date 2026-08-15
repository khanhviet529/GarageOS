-- =============================================================================
-- 0059_site_domain_hardening — vá hai lỗ hổng của tenant resolution công khai
--
-- Nguồn: docs/reviews/2026-08-14-luong-tenant-public-landing.md (LS-003, LS-004)
-- Bất biến: INV-LS-04, INV-LS-11
--
-- Test làm bằng chứng: apps/api/test/landing-tenant-cong-khai.spec.ts
--   LS-T07 (xoá primary), LS-T08 (https://null), LS-T09 (hostname sai định dạng)
-- =============================================================================

-- --- LS-004: hostname phải đúng định dạng, enforce ở DB ----------------------
--
-- 🔒 Cột này được ghi bởi người dùng nội bộ và được ĐỌC ra thành `Location:`
-- header cùng thẻ canonical của toàn site. `normalizeHostname()` ở tầng ứng
-- dụng chỉ gác host ĐẾN TỪ request; không có gì gác host GHI VÀO bảng.
--
-- Một comment mô tả định dạng không phải là ràng buộc (nguyên tắc 1, CLAUDE.md).
--
-- Định dạng: nhãn ASCII/punycode chữ thường, không port, không dấu chấm cuối,
-- mỗi nhãn 1–63 ký tự, không bắt đầu/kết thúc bằng '-'.
--
-- ⚠️ Cho phép hostname MỘT nhãn (`localhost`, tên nội bộ). Không phải nới lỏng
-- cho tiện: máy phát triển truy cập landing tại `http://localhost:3003`, nên
-- `localhost` phải là một site_domain hợp lệ. Đòi tối thiểu hai nhãn sẽ làm
-- chính migration này đổ trên dữ liệu seed — và cách "sửa" nhanh nhất khi đó
-- là gỡ ràng buộc, tức là mất luôn thứ đang cần.
DO $$ BEGIN
  ALTER TABLE site_domain ADD CONSTRAINT site_domain_hostname_format CHECK (
    hostname = lower(hostname)
    AND length(hostname) BETWEEN 1 AND 253
    AND hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN site_domain.hostname IS
  'Hostname chữ thường ASCII/punycode, không port, không dấu chấm cuối. '
  'Định dạng được enforce bằng CHECK site_domain_hostname_format — giá trị này '
  'chảy thẳng vào Location header và canonical URL.';

-- --- LS-003: xoá primary không được để lại alias ACTIVE mồ côi ---------------
--
-- 🔒 `INV-LS-11` nói tenant có domain ACTIVE thì phải có đúng một primary.
-- Constraint trigger ở 0055 bảo vệ mệnh đề đó khi INSERT và UPDATE, nhưng
-- KHÔNG khi DELETE — nên xoá hàng primary để lại các alias ACTIVE không có
-- đích redirect.
--
-- Hậu quả không dừng ở dữ liệu: `resolve_site_domain()` LEFT JOIN ra NULL,
-- và tầng service dựng chuỗi `https://null` rồi trả nó trong `Location:` và
-- trong `primaryOrigin` của mọi trang. Một site mất toàn bộ canonical mà
-- không có lỗi nào được ghi ra.
DROP TRIGGER IF EXISTS trg_site_domain_primary_guard ON site_domain;
CREATE CONSTRAINT TRIGGER trg_site_domain_primary_guard
  AFTER INSERT OR UPDATE OR DELETE ON site_domain
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION site_domain_primary_guard();

-- Hàm gốc trả `RETURN NULL` và chỉ đọc bảng, không đụng NEW/OLD — nên nó dùng
-- được nguyên vẹn cho DELETE. Ghi lại điều đó để lần sau không ai phải đọc lại
-- thân hàm mới dám thêm một sự kiện nữa.
COMMENT ON FUNCTION site_domain_primary_guard() IS
  'Kiểm mệnh đề "tenant có domain ACTIVE thì có đúng một primary ACTIVE" trên '
  'TOÀN BẢNG tại COMMIT. Không đọc NEW/OLD nên dùng chung cho INSERT/UPDATE/DELETE.';

-- --- LS-003 (lớp hai): resolver không bao giờ trả NULL cho primary_hostname --
--
-- 🔒 Phòng thủ theo chiều sâu. Trigger trên chặn NGUYÊN NHÂN; hàm này đảm bảo
-- rằng kể cả khi một trạng thái mồ côi lọt vào bằng đường khác (khôi phục
-- backup, sửa tay bằng role quản trị, migration tương lai), thứ chảy ra tầng
-- ứng dụng vẫn là một hostname thật chứ không phải NULL.
--
-- Alias không tìm được primary sẽ tự nhận mình là primary: trang phục vụ ngay
-- tại hostname đang gọi, không redirect vòng, canonical trỏ vào chính nó. Sai
-- về mặt cấu hình, nhưng KHÔNG hỏng — và đó là hành vi đúng cho một sự cố dữ
-- liệu lẽ ra không xảy ra.
CREATE OR REPLACE FUNCTION resolve_site_domain(p_hostname text)
RETURNS TABLE (
  tenant_id        uuid,
  domain_id        uuid,
  status           site_domain_status,
  is_primary       boolean,
  primary_hostname text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT sd.tenant_id, sd.id, sd.status, sd.is_primary,
         COALESCE(p.hostname, sd.hostname) AS primary_hostname
    FROM site_domain sd
    LEFT JOIN site_domain p
      ON p.tenant_id = sd.tenant_id
     AND p.status = 'ACTIVE'
     AND p.is_primary
   WHERE sd.hostname = p_hostname
     AND sd.status <> 'DISABLED'
   LIMIT 1;
$$;

ALTER FUNCTION resolve_site_domain(text) OWNER TO site_domain_resolver;
REVOKE ALL ON FUNCTION resolve_site_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_site_domain(text) TO garageos_app;

COMMENT ON FUNCTION resolve_site_domain(text) IS
  'SECURITY DEFINER hẹp cho tenant resolution public. KHÔNG nhận điều kiện '
  'lọc tuỳ ý; KHÔNG mở rộng cột trả về — mỗi cột thêm là một đường rò. '
  'primary_hostname không bao giờ NULL (COALESCE về chính hostname đang hỏi).';
