-- =============================================================================
-- 0046 — Nối lại ba chỗ mà ADR-0008 đã hẹn trước
--
-- Khi quyết định bỏ qua Phase 3, ba nơi phải dùng nguồn dữ liệu thay thế. ADR
-- ghi rõ từng nơi và cách nối lại. Đây là lần thực hiện đúng lời hẹn đó — và
-- điểm đáng chú ý là KHÔNG chỗ nào phải viết lại:
--
--   1. `warranty_coverage` — THÊM `invoice_line_id` nullable, KHÔNG chuyển cột
--   2. Báo cáo lãi/lỗ — đổi nguồn doanh thu sang hoá đơn khi đã có hoá đơn
--   3. R-F-01 (doanh thu theo kỳ) — báo cáo mới, trước đây không thể có
--
-- 💡 Việc "không chuyển cột" ở mục 1 là điều ADR nhấn mạnh, và lý do đáng nhắc
--    lại: bảo hành đã sinh cho những xe bàn giao TRƯỚC khi có hoá đơn phải giữ
--    nguyên gốc của nó. Chuyển sang `invoice_line_id` sẽ làm mọi suất bảo hành
--    cũ mất chỗ dựa, và đó là dữ liệu khách hàng đang có quyền lợi trên đó.
-- =============================================================================

ALTER TABLE warranty_coverage
  ADD COLUMN invoice_line_id uuid,
  ADD CONSTRAINT warranty_coverage_invoice_line_fk
    FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES invoice_line(tenant_id, id);

COMMENT ON COLUMN warranty_coverage.invoice_line_id IS
  'Nullable CO CHU Y — bao hanh sinh truoc khi co hoa don (khach no, khach doanh '
  'nghiep tra theo ky) van hop le. Xem ADR-0008.';

GRANT UPDATE (invoice_line_id) ON warranty_coverage TO garageos_app;

/*
 * Nối ngược những suất bảo hành đã sinh: dòng hoá đơn nào cùng dòng báo giá thì
 * là dòng đó. Chạy một lần ở đây, và `WarrantyService` gắn cho các suất mới.
 */
UPDATE warranty_coverage wc
   SET invoice_line_id = l.id
  FROM invoice_line l
 WHERE l.source_quotation_line_id = wc.quotation_line_id
   AND l.tenant_id = wc.tenant_id
   AND wc.invoice_line_id IS NULL;

-- =============================================================================
-- R-F-02 — lãi/lỗ theo đơn, giờ ưu tiên DOANH THU THẬT
--
-- Trước 0046, cột `doanh_thu_du_kien` lấy từ dòng báo giá đã duyệt, và tên cột
-- nói ra điều đó để không ai đọc nhầm. Giờ có hoá đơn:
--
--   · Đơn ĐÃ có hoá đơn phát hành -> doanh thu THẬT, lấy từ `invoice_line`
--   · Đơn CHƯA có                 -> vẫn là dự kiến, từ dòng báo giá
--
-- 🔒 Hai cột riêng, KHÔNG gộp thành một. Gộp lại thì một bảng báo cáo trộn lẫn
--    "khách đã đồng ý trả" với "đã phát hành hoá đơn" mà không cách nào phân
--    biệt — và tổng doanh thu tháng sẽ là một con số không ai đối chiếu được
--    với sổ thuế.
-- =============================================================================

/*
 * DROP rồi CREATE, không dùng `CREATE OR REPLACE`.
 *
 * `CREATE OR REPLACE VIEW` chỉ cho THÊM cột vào CUỐI danh sách; chèn
 * `doanh_thu_thuc` vào giữa thì PostgreSQL từ chối:
 *
 *     cannot change name of view column "gia_von_phu_tung" to "doanh_thu_thuc"
 *
 * Đẩy cột mới xuống cuối để lách được, nhưng thứ tự cột của một view báo cáo là
 * thứ tự người đọc quét mắt: hai cột doanh thu phải nằm cạnh nhau, không phải
 * một ở đầu một ở cuối.
 */
DROP VIEW IF EXISTS lai_lo_theo_don;

CREATE VIEW lai_lo_theo_don AS
SELECT ro.tenant_id,
       ro.id AS repair_order_id,
       ro.branch_id,
       ro.code,
       v.plate_number,
       v.powertrain,
       ro.status,
       ro.delivered_at,
       ro.created_at AS received_at,

       /* Doanh thu DỰ KIẾN — dòng báo giá đã duyệt, trừ thuế */
       COALESCE((SELECT sum(ql.line_total - ql.tax_amount)
                   FROM quotation_line ql
                   JOIN quotation q ON q.id = ql.quotation_id
                  WHERE q.repair_order_id = ro.id AND ql.status = 'APPROVED'), 0)
         AS doanh_thu_du_kien,

       /*
        * Doanh thu THẬT — chỉ tính hoá đơn ĐÃ PHÁT HÀNH.
        *
        * Gồm cả hoá đơn điều chỉnh (phần chênh lệch, có thể âm) vì đó chính là
        * doanh thu đã sửa. Hoá đơn gốc ở trạng thái ADJUSTED vẫn tính: nó đã
        * phát hành và đã khai thuế; hoá đơn điều chỉnh cộng/trừ phần sai lệch
        * lên trên nó.
        */
       COALESCE((SELECT sum(l.line_total - l.tax_amount)
                   FROM invoice_line l
                   JOIN invoice i ON i.id = l.invoice_id
                  WHERE i.repair_order_id = ro.id
                    AND i.status IN ('ISSUED','PARTIALLY_PAID','PAID','ADJUSTED')), 0)
         AS doanh_thu_thuc,

       (SELECT count(*) FROM invoice i
         WHERE i.repair_order_id = ro.id AND i.status <> 'DRAFT') > 0
         AS da_phat_hanh_hoa_don,

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

       COALESCE((SELECT round(sum(gio_thuc_te(wa.id)) * t.internal_labor_cost_per_hour)
                   FROM work_assignment wa
                  WHERE wa.repair_order_id = ro.id), 0)
         AS chi_phi_cong,

       COALESCE((SELECT sum(wa.rework_cost_amount)
                   FROM work_assignment wa
                  WHERE wa.repair_order_id = ro.id AND NOT wa.is_billable), 0)
         AS chi_phi_rework,

       COALESCE((SELECT sum(wca.net_cost_amount)
                   FROM warranty_cost_attribution wca
                  WHERE wca.original_repair_order_id = ro.id), 0)
         AS chi_phi_bao_hanh,

       ro.warranty_claim_of_id IS NOT NULL AS la_don_bao_hanh,
       ro.abandonment_status <> 'NONE' AS la_xe_bo_quen,
       c.is_internal AS la_khach_noi_bo
  FROM repair_order ro
  JOIN vehicle v ON v.id = ro.vehicle_id
  JOIN customer c ON c.id = ro.customer_id
  JOIN tenant t ON t.id = ro.tenant_id
 WHERE ro.status <> 'CANCELLED';

COMMENT ON VIEW lai_lo_theo_don IS
  'R-F-02. HAI cot doanh thu: `doanh_thu_thuc` tu hoa don da phat hanh, '
  '`doanh_thu_du_kien` tu dong bao gia da duyet. Khong gop — mot bang tron lan '
  'hai thu do la mot bang khong doi chieu duoc voi so thue.';

-- =============================================================================
-- R-F-01 — Doanh thu theo kỳ
--
-- Báo cáo này KHÔNG THỂ tồn tại trước khi có hoá đơn, và đó là lý do ADR-0008
-- liệt kê nó vào phần "phải đánh đổi".
--
-- 🔒 Mốc lọc là `issued_at` — thời điểm PHÁT HÀNH, không phải lúc tiếp nhận xe
--    hay lúc thu tiền. Đây là mốc mà cơ quan thuế dùng, nên là mốc duy nhất
--    làm báo cáo doanh thu đối chiếu được.
--
-- ⚠️ Loại trừ khách nội bộ (`is_internal`) — xe của chính garage đi lại trong
--    hệ thống không phải doanh thu.
-- =============================================================================

CREATE OR REPLACE VIEW doanh_thu_theo_ky AS
SELECT i.tenant_id,
       i.branch_id,
       i.issued_at,
       i.id AS invoice_id,
       i.code,
       v.powertrain,
       l.line_type,
       /* 🔒 Tách công và phụ tùng: cơ cấu doanh thu là chỉ số quản trị thật */
       sum(l.line_total - l.tax_amount) AS doanh_thu_truoc_thue,
       sum(l.tax_amount) AS thue,
       sum(l.line_total) AS tong
  FROM invoice i
  JOIN invoice_line l ON l.invoice_id = i.id
  JOIN repair_order ro ON ro.id = i.repair_order_id
  JOIN vehicle v ON v.id = ro.vehicle_id
  JOIN customer c ON c.id = i.customer_id
 WHERE i.status IN ('ISSUED','PARTIALLY_PAID','PAID','ADJUSTED')
   AND NOT c.is_internal
 GROUP BY i.tenant_id, i.branch_id, i.issued_at, i.id, i.code, v.powertrain, l.line_type;

GRANT SELECT ON doanh_thu_theo_ky TO garageos_app;
-- DROP ở trên xoá luôn quyền đã cấp ở 0040 — cấp lại
GRANT SELECT ON lai_lo_theo_don TO garageos_app;

COMMENT ON VIEW doanh_thu_theo_ky IS
  'R-F-01. Moc loc la issued_at — thoi diem PHAT HANH, khong phai luc thu tien. '
  'Do la moc co quan thue dung.';
