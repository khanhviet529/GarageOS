-- =============================================================================
-- 0040 — Báo cáo (Phase 6, docs/09-reports.md)
--
-- Bốn nguyên tắc của tài liệu, và cả bốn đều để lại dấu trong file này:
--
--   1. 🔒 Mọi con số phải TRUY NGƯỢC được về chứng từ gốc
--   2. 🔒 Báo cáo KHÔNG BAO GIỜ sửa dữ liệu — chỉ đọc
--   3. Mỗi báo cáo ghi rõ MỐC THỜI GIAN dùng để lọc
--   4. ⚠️ Loại trừ dữ liệu bất thường, và NÓI RÕ đã loại trừ
--
-- Vì sao báo cáo nằm ở database chứ không ở service:
--
--   · Cùng một công thức được nhiều nơi hỏi (màn hình, xuất Excel, sau này là
--     công cụ cho AI agent). Ba bản cài đặt của một công thức thì sớm muộn có
--     một bản lệch, và bản lệch sẽ là bản không ai đối chiếu.
--   · Chúng là VIEW và HÀM chỉ-đọc, nên nguyên tắc 2 được bảo đảm bằng chính
--     hình dạng của chúng, không bằng lời hứa.
--
-- ⚠️ CHƯA CÓ HOÁ ĐƠN. Phase 3 (tiền) bị bỏ qua theo quyết định phạm vi, nên
--    "doanh thu" ở đây lấy từ DÒNG BÁO GIÁ ĐÃ DUYỆT chứ không từ `invoice`.
--    Hai con số này khác nhau ở chỗ: dòng đã duyệt là thứ khách đồng ý trả,
--    hoá đơn là thứ đã phát hành. Mọi view dưới đây nêu rõ điều đó ở tên cột
--    (`doanh_thu_du_kien`) để không ai đọc nhầm thành doanh thu thật.
-- =============================================================================

-- =============================================================================
-- R-F-02 — Lãi/lỗ theo đơn ⭐
--
-- Báo cáo quan trọng nhất với chủ garage, và phức tạp nhất:
--
--   Lãi = Doanh thu − Giá vốn phụ tùng − Chi phí công − Chi phí rework
--                   − Chi phí bảo hành quy về
--
-- 💡 Thành phần cuối là điểm khác biệt so với mọi phần mềm khác: lãi của một
--    đơn có thể GIẢM NHIỀU THÁNG SAU khi phát sinh bảo hành. Đây là "lãi tính
--    đến thời điểm hiện tại", không phải một con số đóng băng — và tên view nói
--    ra điều đó.
--
-- ⚠️ Giá vốn dùng bình quân gia quyền TẠI THỜI ĐIỂM XUẤT, đã snapshot vào
--    `stock_movement.unit_cost`. Không tính lại theo giá hiện tại — làm vậy thì
--    lãi của một đơn cũ đổi mỗi lần kho nhập hàng mới.
-- =============================================================================

CREATE OR REPLACE VIEW lai_lo_theo_don AS
SELECT ro.tenant_id,
       ro.id AS repair_order_id,
       ro.branch_id,
       ro.code,
       v.plate_number,
       v.powertrain,
       ro.status,
       ro.delivered_at,
       ro.created_at AS received_at,

       /*
        * Doanh thu — ⚠️ từ DÒNG BÁO GIÁ ĐÃ DUYỆT, không phải hoá đơn.
        *
        * `line_total` đã gồm thuế; trừ `tax_amount` ra để so được với chi phí,
        * vì thuế không phải doanh thu của garage.
        */
       COALESCE((SELECT sum(ql.line_total - ql.tax_amount)
                   FROM quotation_line ql
                   JOIN quotation q ON q.id = ql.quotation_id
                  WHERE q.repair_order_id = ro.id AND ql.status = 'APPROVED'), 0)
         AS doanh_thu_du_kien,

       -- Giá vốn phụ tùng: xuất trừ đi phần đã trả về kho
       COALESCE((SELECT sum(-sm.quantity * sm.unit_cost)
                   FROM stock_movement sm
                  WHERE sm.ref_type = 'REPAIR_ORDER' AND sm.ref_id = ro.id
                    AND sm.type = 'ISSUE'), 0)
       - COALESCE((SELECT sum(r.quantity * r.unit_cost)
                     FROM stock_movement r
                     JOIN stock_movement g ON g.id = r.ref_id
                    WHERE r.type = 'RETURN' AND r.ref_type = 'RETURN_OF'
                      AND g.ref_type = 'REPAIR_ORDER' AND g.ref_id = ro.id), 0)
         AS gia_von_phu_tung,

       -- Chi phí công: giờ THỰC TẾ × giá vốn giờ công nội bộ của tenant
       COALESCE((SELECT round(sum(gio_thuc_te(wa.id)) * t.internal_labor_cost_per_hour)
                   FROM work_assignment wa
                  WHERE wa.repair_order_id = ro.id), 0)
         AS chi_phi_cong,

       -- Chi phí làm lại mà garage tự chịu (`is_billable = false`)
       COALESCE((SELECT sum(wa.rework_cost_amount)
                   FROM work_assignment wa
                  WHERE wa.repair_order_id = ro.id AND NOT wa.is_billable), 0)
         AS chi_phi_rework,

       -- 💡 Chi phí bảo hành của các đơn bảo hành TRỎ VỀ đơn này
       COALESCE((SELECT sum(wca.net_cost_amount)
                   FROM warranty_cost_attribution wca
                  WHERE wca.original_repair_order_id = ro.id), 0)
         AS chi_phi_bao_hanh,

       -- Đơn này có phải đơn bảo hành không — doanh thu 0đ nhưng chi phí thật
       ro.warranty_claim_of_id IS NOT NULL AS la_don_bao_hanh,
       -- ⚠️ Loại trừ khỏi báo cáo tổng hợp, và NÓI RÕ đã loại trừ
       ro.abandonment_status <> 'NONE' AS la_xe_bo_quen,
       c.is_internal AS la_khach_noi_bo
  FROM repair_order ro
  JOIN vehicle v ON v.id = ro.vehicle_id
  JOIN customer c ON c.id = ro.customer_id
  JOIN tenant t ON t.id = ro.tenant_id
 WHERE ro.status <> 'CANCELLED';

COMMENT ON VIEW lai_lo_theo_don IS
  'R-F-02. ⚠️ doanh_thu_du_kien lay tu DONG BAO GIA DA DUYET, khong phai hoa don '
  '(Phase 3 chua lam). Lai la "tinh den thoi diem hien tai" — bao hanh phat sinh '
  'nhieu thang sau van lam no giam.';

-- =============================================================================
-- R-O-01 — Thời gian chờ theo bộ phận ⭐
--
-- 💡 Tài liệu gọi đây là báo cáo "không phần mềm garage nào trên thị trường làm
--    tốt", và là thứ chủ garage thực sự cần. Câu hỏi nó trả lời:
--
--      "Xe nằm 3 ngày — bao nhiêu do thợ chậm, bao nhiêu do chờ khách duyệt,
--       bao nhiêu do chờ phụ tùng?"
--
-- Nguồn là `audit_log` — chính vì vậy INV-A-02 (trigger ghi nhật ký trạng thái)
-- không chỉ là chuyện kiểm toán: quên ghi một lần chuyển là mất một khoảng thời
-- gian khỏi báo cáo, và không có gì báo động.
--
-- ⚠️ TRUNG VỊ và P90, KHÔNG dùng trung bình. Một xe bỏ quên sáu tháng kéo trung
--    bình lên vô nghĩa — và đó không phải giả thuyết, đó là chính BC-15.
-- =============================================================================

CREATE OR REPLACE FUNCTION thoi_gian_cho_theo_bo_phan(
  p_tenant uuid,
  p_tu     timestamptz,
  p_den    timestamptz
) RETURNS TABLE (
  trang_thai   text,
  bo_phan      text,
  so_luot      bigint,
  trung_vi_gio numeric,
  p90_gio      numeric,
  tong_gio     numeric
) AS $$
  WITH chuyen AS (
    SELECT a.entity_id AS repair_order_id,
           (a.after_json->>'status') AS status,
           a.created_at,
           LEAD(a.created_at) OVER (PARTITION BY a.entity_id ORDER BY a.created_at) AS next_at
      FROM audit_log a
      JOIN repair_order ro ON ro.id = a.entity_id
     WHERE a.tenant_id = p_tenant
       AND a.entity_type = 'repair_order'
       AND a.action = 'STATUS_CHANGED'
       AND a.created_at >= p_tu AND a.created_at < p_den
       -- ⚠️ Loại trừ xe bỏ quên — BC-15. Không loại thì MỘT chiếc xe nằm sáu
       --    tháng làm hỏng toàn bộ con số của cả xưởng.
       AND ro.abandonment_status = 'NONE'
  )
  SELECT c.status,
         CASE c.status
           WHEN 'AWAITING_APPROVAL' THEN 'Khách hàng'
           WHEN 'AWAITING_PARTS'    THEN 'Kho / mua hàng'
           WHEN 'IN_PROGRESS'       THEN 'Thợ'
           WHEN 'QUALITY_CHECK'     THEN 'Kiểm tra chất lượng'
           WHEN 'AWAITING_PAYMENT'  THEN 'Thu ngân / khách'
           WHEN 'AWAITING_DELIVERY' THEN 'Khách hàng'
           WHEN 'DIAGNOSING'        THEN 'Thợ'
           ELSE 'Khác'
         END AS bo_phan,
         count(*) AS so_luot,
         round(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM (c.next_at - c.created_at)) / 3600.0)::numeric, 2),
         round(percentile_cont(0.9) WITHIN GROUP (
           ORDER BY extract(epoch FROM (c.next_at - c.created_at)) / 3600.0)::numeric, 2),
         round(sum(extract(epoch FROM (c.next_at - c.created_at)) / 3600.0)::numeric, 2)
    FROM chuyen c
   WHERE c.next_at IS NOT NULL
   GROUP BY c.status
   ORDER BY 6 DESC;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- R-O-03 — Năng suất thợ, LUÔN kèm tỉ lệ làm lại
--
-- ⚠️ Ba chỉ số phải xem CÙNG NHAU. Năng suất cao + rework cao = làm ẩu, không
--    phải giỏi. Vì vậy chúng nằm trong MỘT view, trên cùng một dòng — tách ra
--    thành hai màn hình là mở đường cho việc chỉ nhìn một nửa.
--
-- 💡 View `chi_so_chat_luong_tho` (0031) đã có phần chất lượng; view này thêm
--    năng suất vào cùng một chỗ để không ai phải ghép tay.
-- =============================================================================

CREATE OR REPLACE VIEW nang_suat_tho AS
SELECT wa.tenant_id,
       wa.technician_id,
       u.full_name AS technician_name,
       count(*) FILTER (WHERE wa.status IN ('DONE','QC_PASSED')) AS so_viec_xong,

       round(sum(si.standard_hours) FILTER (WHERE wa.is_billable), 2) AS gio_dinh_muc,
       round(sum(gio_thuc_te(wa.id)) FILTER (WHERE wa.is_billable), 2) AS gio_thuc_te,

       /*
        * Năng suất = định mức / thực tế. Lớn hơn 1 là làm nhanh hơn định mức.
        *
        * 🔒 Chia cho 0 trả NULL chứ không trả 0: một thợ chưa bấm giờ lần nào
        * KHÔNG phải "năng suất bằng không". NULL nói đúng điều đang biết.
        */
       CASE WHEN COALESCE(sum(gio_thuc_te(wa.id)) FILTER (WHERE wa.is_billable), 0) = 0
            THEN NULL
            ELSE round((sum(si.standard_hours) FILTER (WHERE wa.is_billable))
                       / sum(gio_thuc_te(wa.id)) FILTER (WHERE wa.is_billable), 3)
       END AS nang_suat,

       count(*) FILTER (WHERE wa.status = 'QC_FAILED') AS so_lan_qc_truot,
       count(*) FILTER (WHERE wa.rework_of_id IS NOT NULL) AS so_viec_lam_lai,
       CASE WHEN count(*) = 0 THEN NULL
            ELSE round(count(*) FILTER (WHERE wa.status = 'QC_FAILED')::numeric
                       / count(*), 3)
       END AS ti_le_rework,

       -- Chi phí làm lại mà GARAGE chịu vì lỗi của thợ này
       COALESCE(sum(wa.rework_cost_amount) FILTER (WHERE NOT wa.is_billable), 0)
         AS chi_phi_lam_lai
  FROM work_assignment wa
  JOIN app_user u ON u.id = wa.technician_id
  LEFT JOIN quotation_line ql ON ql.id = wa.quotation_line_id
  LEFT JOIN service_item si ON si.id = ql.service_item_id
 WHERE wa.status <> 'CANCELLED'
 GROUP BY wa.tenant_id, wa.technician_id, u.full_name;

COMMENT ON VIEW nang_suat_tho IS
  'R-O-03. Nang suat va ti le lam lai nam CUNG MOT DONG, co y: nang suat cao + '
  'rework cao = lam au, khong phai gioi.';

-- =============================================================================
-- R-S-01 / R-S-02 — Tồn kho, cảnh báo và vòng quay
--
-- 💡 Phụ tùng có số ngày tồn > 365 là VỐN CHẾT. Báo cáo này để garage quyết
--    định thanh lý, không chỉ để biết.
-- =============================================================================

CREATE OR REPLACE VIEW ton_kho_canh_bao AS
SELECT b.tenant_id,
       b.warehouse_id,
       w.name AS warehouse_name,
       p.id AS part_id,
       p.sku,
       p.name AS part_name,
       p.category,
       b.on_hand,
       b.reserved,
       b.on_hand - b.reserved AS available,
       p.min_stock_level,
       b.avg_cost,
       round(b.on_hand * b.avg_cost) AS gia_tri_ton,
       (b.on_hand - b.reserved) < p.min_stock_level AS duoi_muc_toi_thieu,

       /*
        * Giá vốn hàng xuất 365 ngày qua — tử số của vòng quay.
        *
        * Dùng 365 ngày trượt chứ không "từ đầu năm": một mã hàng nhập tháng 12
        * sẽ có vòng quay bằng 0 suốt tháng 1 nếu tính từ đầu năm, và bị xếp
        * nhầm vào nhóm vốn chết.
        */
       COALESCE((SELECT sum(-sm.quantity * sm.unit_cost)
                   FROM stock_movement sm
                  WHERE sm.warehouse_id = b.warehouse_id AND sm.part_id = b.part_id
                    AND sm.type = 'ISSUE'
                    AND sm.created_at > now() - interval '365 days'), 0)
         AS gia_von_xuat_365n
  FROM stock_balance b
  JOIN part p ON p.id = b.part_id
  JOIN warehouse w ON w.id = b.warehouse_id
 WHERE p.is_active;

COMMENT ON VIEW ton_kho_canh_bao IS
  'R-S-01/R-S-02. Vong quay dung 365 ngay TRUOT, khong phai tu dau nam: mot ma '
  'hang nhap thang 12 se bi xep nham vao nhom von chet suot thang 1.';

-- =============================================================================
-- R-S-03 — Chênh lệch kiểm kê theo lý do
--
-- 💡 Nếu `ISSUE_NOT_RECORDED` chiếm đa số thì vấn đề nằm ở QUY TRÌNH xuất kho,
--    không phải ở thủ kho. Đây chính là lý do bảng lý do ở 0037 là enum chứ
--    không phải ô ghi chú tự do.
-- =============================================================================

CREATE OR REPLACE VIEW chenh_lech_kiem_ke AS
SELECT l.tenant_id,
       s.warehouse_id,
       s.code AS stock_take_code,
       s.approved_at,
       l.reason,
       count(*) AS so_dong,
       round(sum(abs(l.variance * l.unit_cost))) AS gia_tri_tuyet_doi,
       round(sum(l.variance * l.unit_cost)) AS gia_tri_rong
  FROM stock_take_line l
  JOIN stock_take s ON s.id = l.stock_take_id
 WHERE s.status = 'APPROVED' AND l.variance IS DISTINCT FROM 0 AND l.variance IS NOT NULL
 GROUP BY l.tenant_id, s.warehouse_id, s.code, s.approved_at, l.reason;

-- =============================================================================
-- R-O-02 — Tỉ lệ đúng hẹn
--
-- ⚠️ Chỉ có ý nghĩa nếu `promised_at` không bị sửa tuỳ tiện — nên view trả kèm
--    SỐ LẦN DỜI HẸN. Tỉ lệ đúng hẹn 95% mà mỗi đơn dời hẹn ba lần thì con số đó
--    vô giá trị, và người đọc phải nhìn thấy cả hai cùng lúc.
-- =============================================================================

CREATE OR REPLACE VIEW dung_hen_theo_don AS
SELECT ro.tenant_id,
       ro.branch_id,
       ro.id AS repair_order_id,
       ro.code,
       ro.promised_at,
       ro.delivered_at,
       ro.delivered_at <= ro.promised_at AS dung_hen,
       COALESCE((SELECT count(*) FROM audit_log a
                  WHERE a.entity_type = 'repair_order' AND a.entity_id = ro.id
                    AND a.before_json ? 'promised_at'), 0) AS so_lan_doi_hen
  FROM repair_order ro
 WHERE ro.status = 'DELIVERED'
   AND ro.promised_at IS NOT NULL
   AND ro.delivered_at IS NOT NULL
   AND ro.abandonment_status = 'NONE';

-- =============================================================================
-- Quyền
--
-- 🔒 Chỉ SELECT. Đây là toàn bộ nội dung của nguyên tắc "báo cáo không bao giờ
--    sửa dữ liệu" — và cách duy nhất để nó không phụ thuộc vào việc ai đó nhớ.
-- =============================================================================

GRANT SELECT ON lai_lo_theo_don, nang_suat_tho, ton_kho_canh_bao,
                chenh_lech_kiem_ke, dung_hen_theo_don TO garageos_app;

REVOKE ALL ON FUNCTION thoi_gian_cho_theo_bo_phan(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION thoi_gian_cho_theo_bo_phan(uuid, timestamptz, timestamptz)
  TO garageos_app;

-- Index cho truy vấn nhật ký theo thực thể — R-O-01 quét toàn bộ audit_log
CREATE INDEX IF NOT EXISTS idx_audit_status_change
  ON audit_log (tenant_id, entity_type, entity_id, created_at)
  WHERE action = 'STATUS_CHANGED';
