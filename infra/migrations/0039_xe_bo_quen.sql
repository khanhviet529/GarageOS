-- =============================================================================
-- 0039 — Khách không đến lấy xe (Phase 5.5, BC-15)
--
-- Xe sửa xong ba tháng trước. Gọi khách bảy lần, hai lần máy bận, năm lần không
-- ai nghe. Xe vẫn nằm trong sân, chiếm một chỗ đỗ, và đơn vẫn treo ở
-- AWAITING_DELIVERY.
--
-- BC-15 mở đầu bằng một câu đáng chú ý: "không phần mềm nào trên thị trường xử
-- lý tử tế" — thường chỉ để đơn treo vô thời hạn. Hậu quả không chỉ là một chỗ
-- đỗ bị chiếm:
--
--   · Báo cáo "thời gian sửa trung bình" bị kéo lên vô lý bởi một đơn duy nhất
--   · Không có bằng chứng đã nỗ lực liên hệ, nếu sau này phải xử lý pháp lý
--   · Công nợ treo mà không ai nhìn thấy
--
-- 💡 `AWAITING_DELIVERY` không phân biệt được "xe xong chiều nay khách đến lấy"
--    với "xe xong ba tháng trước khách biến mất". Cần một CHIỀU DỮ LIỆU MỚI:
--    thời gian nằm chờ và trạng thái liên hệ — chứ không phải một trạng thái
--    mới trong máy trạng thái.
--
-- ⚠️ Toàn bộ mốc thời gian ở đây là GIẢ ĐỊNH của tài liệu, cấu hình được theo
--    tenant. Thủ tục xử lý xe bị bỏ lại liên quan tới quy định pháp luật về tài
--    sản gửi giữ, và phần mềm này CHỈ ghi nhận và nhắc việc — không tự động
--    thực hiện bất kỳ hành động pháp lý nào. Xem `CAN-BAN-CUNG-CAP.md`.
-- =============================================================================

CREATE TYPE abandonment_status AS ENUM (
  'NONE',               -- bình thường, hoặc chưa quá hạn
  'OVERDUE',            -- quá thời gian miễn phí, bắt đầu tính lưu bãi
  'UNREACHABLE',        -- đã gửi thư bảo đảm, không liên lạc được
  'DECLARED_ABANDONED'  -- ⚠️ đánh dấu để tham vấn pháp lý, KHÔNG phải quyết định pháp lý
);

CREATE TYPE contact_channel AS ENUM ('PHONE', 'SMS', 'ZALO', 'EMAIL', 'REGISTERED_MAIL');

CREATE TYPE contact_outcome AS ENUM (
  'ANSWERED',
  'NO_ANSWER',
  'WRONG_NUMBER',
  'PROMISED_DATE',
  'REFUSED'
);

ALTER TABLE repair_order
  ADD COLUMN abandonment_status abandonment_status NOT NULL DEFAULT 'NONE',
  /*
   * Mốc bắt đầu tính phí — KHÔNG suy ra từ `ready_for_delivery_at` mỗi lần đọc.
   *
   * Chính sách của garage đổi (grace 7 ngày thành 3 ngày) thì những xe đang nằm
   * bãi không được tính lại từ đầu: phí đã báo cho khách là phí đã báo. Cùng lập
   * luận với `quotation.price_list_id` (0022) và hạn bảo hành (0033).
   */
  ADD COLUMN storage_fee_starts_at timestamptz,
  ADD COLUMN last_contact_attempt_at timestamptz,

  /*
   * 🔒 Xe đang tranh chấp — BC-15 mục 6.3.
   *
   * Phần mềm KHÔNG giải quyết tranh chấp sở hữu. Nó làm đúng một việc: chặn bàn
   * giao cho tới khi có người tường minh gỡ cờ. Không có cờ này thì một nhân
   * viên không biết chuyện sẽ giao xe cầm cố cho người mang xe tới.
   */
  ADD COLUMN legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN legal_hold_reason text,

  /*
   * Đã chuyển ra bãi ngoài — BC-15 mục 6.4.
   *
   * ⚠️ Giai đoạn 1 chỉ đánh dấu để khoang không bị tính là đang bận. Mô hình
   *    hoá vị trí đỗ là giai đoạn 2.
   */
  ADD COLUMN moved_to_storage_at timestamptz,

  ADD CONSTRAINT ro_legal_hold_needs_reason
    CHECK (NOT legal_hold OR length(btrim(legal_hold_reason)) >= 5);

-- 🔒 KHÔNG giao xe đang có tranh chấp. Ràng buộc ở tầng thấp nhất có thể: một
--    màn hình quên kiểm tra thì vẫn không giao được.
ALTER TABLE repair_order
  ADD CONSTRAINT ro_khong_giao_khi_legal_hold
    CHECK (status <> 'DELIVERED' OR NOT legal_hold);

GRANT UPDATE (abandonment_status, storage_fee_starts_at, last_contact_attempt_at,
              legal_hold, legal_hold_reason, moved_to_storage_at)
  ON repair_order TO garageos_app;

CREATE INDEX idx_ro_xe_nam_bai
  ON repair_order (tenant_id, branch_id, ready_for_delivery_at)
  WHERE status = 'AWAITING_DELIVERY';

-- =============================================================================
-- Nhật ký liên hệ
--
-- 💡 Đây là BẰNG CHỨNG PHÁP LÝ, không phải một bảng ghi chú. Nếu sau này phải
--    xử lý xe theo pháp luật, garage phải chứng minh đã nỗ lực liên hệ — và một
--    ô ghi chú tự do trên đơn không chứng minh được điều gì.
--
-- Vì vậy bảng này CHỈ THÊM: không UPDATE, không DELETE. Sửa được một lần gọi đã
-- ghi thì toàn bộ giá trị làm chứng biến mất.
-- =============================================================================

CREATE TABLE customer_contact_attempt (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  repair_order_id   uuid NOT NULL,

  attempted_at      timestamptz NOT NULL DEFAULT now(),
  attempted_by_user_id uuid NOT NULL,
  channel           contact_channel NOT NULL,
  outcome           contact_outcome NOT NULL,

  /** Khách hẹn ngày nào — chỉ có nghĩa khi outcome = PROMISED_DATE */
  promised_pickup_at timestamptz,
  note              text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)      REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, attempted_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT contact_promised_needs_date
    CHECK (outcome <> 'PROMISED_DATE' OR promised_pickup_at IS NOT NULL),
  -- Thư bảo đảm là bước leo thang có chi phí và có ý nghĩa pháp lý; bắt ghi rõ
  -- gửi đi đâu để về sau còn đối chiếu với địa chỉ đăng ký.
  CONSTRAINT contact_thu_bao_dam_can_ghi_chu
    CHECK (channel <> 'REGISTERED_MAIL' OR length(btrim(note)) >= 10)
);

CREATE INDEX idx_contact_attempt_don
  ON customer_contact_attempt (tenant_id, repair_order_id, attempted_at DESC);

-- =============================================================================
-- Phí lưu bãi — BC-15 mục 5
--
-- 🔒 Phí lưu bãi KHÔNG sửa hoá đơn gốc (INV-M-03). Bảng riêng, và khi Phase 3
--    có hoá đơn thì nó dựng một hoá đơn RIÊNG từ bảng này.
--
-- 🔒 Phí phải được THÔNG BÁO TRƯỚC mới có cơ sở thu. Cột `thong_bao_luc` ghi
--    lần liên hệ đầu tiên có nói tới phí — không có nó thì con số ở đây là một
--    con số garage tự nghĩ ra, và khách có đủ lý do từ chối.
-- =============================================================================

CREATE TABLE storage_fee (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(id),
  repair_order_id  uuid NOT NULL,

  /** Bản chụp chính sách lúc tính — garage đổi giá thì phí đã tính không đổi */
  per_day_amount   bigint NOT NULL,
  grace_days       integer NOT NULL,
  max_amount       bigint NOT NULL,

  tinh_tu          timestamptz NOT NULL,
  tinh_den         timestamptz NOT NULL,
  so_ngay          integer NOT NULL,

  /*
   * 🔒 Tiền là bigint, đơn vị đồng. `amount` do ứng dụng tính rồi ghi vào, và
   * không sửa được sau khi miễn/chốt.
   */
  amount           bigint NOT NULL,

  /** Đã báo cho khách biết có phí này chưa — và lúc nào */
  thong_bao_luc    timestamptz,

  /** Quản lý miễn/giảm — BC-15 mục 6.1 bước 2 */
  waived_amount    bigint NOT NULL DEFAULT 0,
  waived_by_user_id uuid,
  waived_reason    text,

  created_by_user_id uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  -- Một đơn, một khoản phí lưu bãi. Tính lại thì cập nhật, không thêm dòng mới:
  -- hai dòng cho một đơn là hai con số cùng đòi khách trả.
  UNIQUE (tenant_id, repair_order_id),
  FOREIGN KEY (tenant_id, repair_order_id)    REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, waived_by_user_id)  REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT storage_fee_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT storage_fee_within_safe_range
    CHECK (amount BETWEEN 0 AND 9007199254740991
           AND per_day_amount BETWEEN 0 AND 9007199254740991
           AND max_amount BETWEEN 0 AND 9007199254740991),
  -- 🔒 Không miễn nhiều hơn số phải thu. Miễn vượt là một khoản CHI trá hình.
  CONSTRAINT storage_fee_waive_khong_vuot CHECK (waived_amount BETWEEN 0 AND amount),
  CONSTRAINT storage_fee_waive_needs_who
    CHECK (waived_amount = 0
           OR (waived_by_user_id IS NOT NULL AND length(btrim(waived_reason)) >= 5)),
  CONSTRAINT storage_fee_ngay_hop_le CHECK (tinh_den >= tinh_tu AND so_ngay >= 0)
);

CREATE TRIGGER trg_touch_storage_fee
  BEFORE UPDATE ON storage_fee FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Tính phí lưu bãi — hàm ở database vì báo cáo Phase 6 cũng cần cùng con số
--
-- 🔒 Trần `max_amount` không phải để cho đẹp: BC-15 mục 5 gọi nó là "tránh phí
--    vượt giá trị xe". Một xe nằm hai năm với phí 50.000đ/ngày là 36 triệu —
--    lớn hơn giá trị nhiều chiếc xe cũ, và không ai trả một khoản như vậy.
-- =============================================================================

CREATE OR REPLACE FUNCTION tinh_phi_luu_bai(
  p_tu        timestamptz,
  p_den       timestamptz,
  p_grace     integer,
  p_per_day   bigint,
  p_max       bigint
) RETURNS TABLE (so_ngay integer, amount bigint) AS $$
DECLARE
  ngay integer;
BEGIN
  -- Ngày tính từ mốc sẵn sàng giao, TRỪ số ngày miễn phí. Dùng floor chứ không
  -- round: khách để xe 7 ngày 20 tiếng thì tính 7 ngày, không phải 8. Làm tròn
  -- lên là thu tiền cho thời gian chưa xảy ra.
  ngay := GREATEST(0, floor(EXTRACT(EPOCH FROM (p_den - p_tu)) / 86400)::integer - p_grace);
  RETURN QUERY SELECT ngay, LEAST(ngay::bigint * p_per_day, p_max);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 💡 View "xe đang nằm bãi" — thứ mà BC-15 nói không phần mềm nào có
--
-- Không phải để cho đẹp: nếu không có một danh sách nhìn được, xe bỏ quên là
-- thứ chỉ phát hiện được bằng cách đi bộ ra sân và đếm.
-- =============================================================================

CREATE OR REPLACE VIEW xe_dang_nam_bai AS
SELECT ro.tenant_id,
       ro.id AS repair_order_id,
       ro.branch_id,
       ro.code,
       v.plate_number,
       c.display_name AS customer_name,
       c.phone AS customer_phone,
       ro.ready_for_delivery_at,
       floor(EXTRACT(EPOCH FROM (now() - ro.ready_for_delivery_at)) / 86400)::integer AS so_ngay_cho,
       ro.abandonment_status,
       ro.last_contact_attempt_at,
       ro.legal_hold,
       ro.moved_to_storage_at,
       (SELECT count(*) FROM customer_contact_attempt a
         WHERE a.repair_order_id = ro.id) AS so_lan_lien_he,
       COALESCE((SELECT f.amount - f.waived_amount FROM storage_fee f
                  WHERE f.repair_order_id = ro.id), 0) AS phi_luu_bai
  FROM repair_order ro
  JOIN vehicle v ON v.id = ro.vehicle_id
  JOIN customer c ON c.id = ro.customer_id
 WHERE ro.status = 'AWAITING_DELIVERY'
   AND ro.ready_for_delivery_at IS NOT NULL;

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_contact_attempt', 'storage_fee'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- 🔒 Nhật ký liên hệ CHỈ THÊM — nó là bằng chứng, không phải bản nháp.
--    `ALTER DEFAULT PRIVILEGES` ở 0003 đã cấp SELECT + INSERT; ở đây chỉ cần
--    bảo đảm không có gì hơn thế.
REVOKE UPDATE, DELETE ON customer_contact_attempt FROM garageos_app;

GRANT UPDATE (tinh_den, so_ngay, amount, thong_bao_luc,
              waived_amount, waived_by_user_id, waived_reason, version)
  ON storage_fee TO garageos_app;
REVOKE DELETE ON storage_fee FROM garageos_app;

GRANT SELECT ON xe_dang_nam_bai TO garageos_app;

COMMENT ON VIEW xe_dang_nam_bai IS
  'Xe da san sang giao ma chua co nguoi lay — BC-15. Khong co danh sach nay thi '
  'xe bo quen chi phat hien duoc bang cach di bo ra san va dem.';
