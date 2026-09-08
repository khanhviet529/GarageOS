-- =============================================================================
-- 0084_tra_cuu_truoc_tenant_khong_can_superuser
--
-- Bất biến: INV-T-01 (cô lập tenant)
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 🔒 KHÔNG AI ĐĂNG NHẬP ĐƯỢC trên Postgres quản lý — và không có lỗi nào nói vì sao
--
-- Bốn hàm phải chạy TRƯỚC khi biết tenant nào: ba hàm đăng nhập và một hàm tra
-- cứu link công khai. Cả bốn là `SECURITY DEFINER`, và chú thích ở 0002 giải
-- thích lựa chọn đó bằng một câu:
--
--     "SECURITY DEFINER chạy với quyền chủ sở hữu hàm (bỏ qua RLS)"
--
-- ⚠️ Vế trong ngoặc KHÔNG đúng. `SECURITY DEFINER` đổi *danh tính*, không tắt
--    RLS. Chủ hàm chỉ thoát RLS khi nó là SUPERUSER — hoặc khi nó là chủ bảng
--    và bảng không bật `FORCE`. Cả bốn bảng ở đây đều `FORCE`.
--
-- Trên Docker ở máy dev, chủ schema (`garageos`) là superuser, nên câu trên
-- *có vẻ* đúng suốt 83 migration. Trên Neon, Supabase, RDS — nơi không ai là
-- superuser — bốn hàm này trả về 0 dòng, mãi mãi:
--
--     · đăng nhập: 401 "Số điện thoại hoặc mật khẩu không đúng" với mật khẩu đúng
--     · làm mới phiên: đăng xuất ngẫu nhiên
--     · link tra cứu của khách: 404
--
-- Đo được ngày 2026-09-08 trên một cluster dựng đúng điều kiện của Neon (chủ
-- schema có CREATEROLE, không superuser): migration chạy hết 83 file, dữ liệu
-- ghi đúng, `/health` xanh — và login trả 401.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- Cách chữa: đúng khuôn mà 0055 đã dùng cho `site_domain_resolver`
--
-- Giao hàm cho một role HẸP, rồi mở đúng một chính sách đọc cho role đó. Role
-- hẹp không phải chủ bảng nên `FORCE` không liên quan; nó đọc được vì có
-- policy, và chỉ đọc được đúng những cột được cấp.
--
-- 💡 Vì sao không cấp `BYPASSRLS` cho role hẹp: cấp được thuộc tính đó lại cần
--    superuser. Nó sẽ chạy trên máy dev và chết đúng ở nơi cần chạy.
-- =============================================================================

DO $$ BEGIN CREATE ROLE auth_lookup NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE tracking_resolver NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/*
 * ⚠️ KHÔNG gọi `chuan_bi_role()` của 0001 ở đây, dù nó làm đúng việc này.
 *
 * Hàm đó được thêm vào 0001 trong cùng đợt vá, và `CHECKSUM_CU` (infra/
 * migrate.ts) cố ý KHÔNG chạy lại nội dung mới trên database đã có — nên trên
 * mọi database dựng trước đợt này, hàm đó không tồn tại. Gọi nó là biến 0084
 * thành "chỉ chạy được trên database mới tinh".
 *
 * Hai việc cần làm ở đây cũng hẹp hơn: hai role vừa được TẠO ngay trên, nên
 * chúng không thể có đặc quyền — chỉ superuser mới tạo được superuser. Việc
 * còn lại là cho migration `SET ROLE` và kế thừa, để đổi chủ hàm được và để
 * còn bảo trì chúng về sau (xem chú thích ở 0001).
 */
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['auth_lookup', 'tracking_resolver'] LOOP
    EXECUTE format('GRANT %I TO CURRENT_ROLE WITH SET TRUE, INHERIT TRUE', r);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) THEN
      RAISE EXCEPTION
        'Role % đang có SUPERUSER hoặc BYPASSRLS — hàm SECURITY DEFINER giao cho '
        'nó sẽ đọc xuyên mọi tenant. Chạy: ALTER ROLE % NOSUPERUSER NOBYPASSRLS;', r, r;
    END IF;
  END LOOP;
END $$;

-- --- Đăng nhập và làm mới phiên -----------------------------------------------

/*
 * 🔒 Chính sách CHỈ ĐỌC, và chỉ cho đúng role này.
 *
 * `USING (true)` nghe rộng, nhưng phạm vi thật của nó hẹp gấp đôi: role
 * `auth_lookup` là `NOLOGIN` (không ai kết nối bằng nó được), và ba hàm dưới
 * đây là đường duy nhất mượn được danh tính đó. Cột thì cấp theo tên.
 */
DROP POLICY IF EXISTS auth_lookup_read ON app_user;
CREATE POLICY auth_lookup_read ON app_user FOR SELECT TO auth_lookup USING (true);

DROP POLICY IF EXISTS auth_lookup_read ON refresh_token;
CREATE POLICY auth_lookup_read ON refresh_token FOR SELECT TO auth_lookup USING (true);

/*
 * ⚠️ `phone` và `token_hash` có mặt vì mệnh đề WHERE cần chúng, không phải vì
 *    hàm trả chúng ra. Thiếu một cột trong danh sách này thì hàm chết với
 *    "permission denied for table" — chứ không phải trả về rỗng.
 */
GRANT SELECT (id, tenant_id, phone, password_hash, full_name, roles, is_active)
  ON app_user TO auth_lookup;
GRANT SELECT (id, tenant_id, user_id, token_hash, expires_at, revoked_at, replaced_by_id)
  ON refresh_token TO auth_lookup;

/*
 * 🔒 Đổi chủ là việc CUỐI CÙNG: sau nó, migration không còn quyền `REVOKE`,
 *    `GRANT` hay `COMMENT` trên chính những hàm này.
 *
 * ⚠️ Chủ mới phải có `CREATE` trên schema chứa hàm — một kiểm tra nữa mà
 *    PostgreSQL bỏ qua cho superuser. Nâng trong giao dịch này rồi thu lại ngay.
 */
GRANT CREATE ON SCHEMA public TO auth_lookup;
ALTER FUNCTION auth_find_user_by_phone(text) OWNER TO auth_lookup;
ALTER FUNCTION auth_find_user_by_id(uuid)    OWNER TO auth_lookup;
ALTER FUNCTION auth_find_refresh_token(text) OWNER TO auth_lookup;
REVOKE CREATE ON SCHEMA public FROM auth_lookup;

-- --- Link tra cứu công khai của khách ------------------------------------------

DROP POLICY IF EXISTS tracking_resolver_read ON repair_order;
CREATE POLICY tracking_resolver_read ON repair_order FOR SELECT TO tracking_resolver USING (true);

/*
 * Đúng năm cột: hai cột trả về, ba cột trong mệnh đề WHERE. `repair_order` có
 * hơn ba mươi cột — trong đó có tiền — và role này không cần thấy cột nào khác.
 */
GRANT SELECT (id, tenant_id, customer_access_token, delivered_at, cancelled_at)
  ON repair_order TO tracking_resolver;

GRANT CREATE ON SCHEMA public TO tracking_resolver;
ALTER FUNCTION public_resolve_tracking_token(text) OWNER TO tracking_resolver;
REVOKE CREATE ON SCHEMA public FROM tracking_resolver;

/*
 * ⚠️ Những hàm `SECURITY DEFINER` còn lại KHÔNG đổi chủ, và đó là chủ ý.
 *
 * Chúng là trigger và hàm nghiệp vụ chạy BÊN TRONG một giao dịch đã đặt
 * `app.tenant_id` — policy `tenant_id = current_setting(...)` cho chúng đi qua
 * bình thường. Chúng cần `SECURITY DEFINER` vì lý do khác: ghi vào bảng mà role
 * ứng dụng không có quyền ghi (`stock_balance`), chứ không phải để đọc xuyên
 * tenant.
 */
