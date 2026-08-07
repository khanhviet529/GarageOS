-- =============================================================================
-- 0041 — Năng suất: mẫu số quá nhỏ thì KHÔNG có con số, không phải con số to
--
-- View `nang_suat_tho` ở 0040 đã phòng chia cho 0:
--
--     CASE WHEN sum(gio_thuc_te) = 0 THEN NULL ELSE dinh_muc / thuc_te END
--
-- Chạy trên dữ liệu seed, nó trả về:
--
--     Phạm Văn Thợ — định mức 1,20h, thực tế 0,00h, NĂNG SUẤT 12000
--
-- Mẫu số không phải 0, nó là 0,0001 giờ — 0,36 giây, dấu vết của một lần bấm
-- "bắt đầu" rồi bấm "kết thúc" ngay. Phép chia hoàn toàn hợp lệ và kết quả hoàn
-- toàn vô nghĩa.
--
-- 💡 Đây là loại lỗi báo cáo nguy hiểm nhất: nó KHÔNG lỗi. Không có ngoại lệ,
--    không có log, không có gì đỏ. Chỉ có một con số đứng trên bảng xếp hạng và
--    một người thợ tự nhiên giỏi gấp mười hai nghìn lần đồng nghiệp. Ai nhìn
--    bảng đó cũng biết là sai — nhưng nếu con số là 3,4 thay vì 12000 thì không
--    ai biết, và nó sẽ được dùng để đánh giá con người.
--
-- Ngưỡng 0,05 giờ (3 phút): dưới mức đó thì không có việc sửa chữa thật nào, chỉ
-- có thao tác nhầm. `NULL` là câu trả lời đúng — "chưa đủ dữ liệu", không phải
-- "năng suất bằng không" và cũng không phải một con số bịa.
-- =============================================================================

CREATE OR REPLACE VIEW nang_suat_tho AS
SELECT wa.tenant_id,
       wa.technician_id,
       u.full_name AS technician_name,
       count(*) FILTER (WHERE wa.status IN ('DONE','QC_PASSED')) AS so_viec_xong,

       round(sum(si.standard_hours) FILTER (WHERE wa.is_billable), 2) AS gio_dinh_muc,
       round(sum(gio_thuc_te(wa.id)) FILTER (WHERE wa.is_billable), 2) AS gio_thuc_te,

       /*
        * 🔒 Mẫu số phải ĐỦ LỚN để phép chia có nghĩa, không chỉ khác 0.
        *
        * Xem đầu migration này: 0,0001 giờ cho ra năng suất 12000. Ngưỡng ba
        * phút loại bỏ những lần bấm nhầm mà không loại bỏ việc thật nào.
        */
       CASE WHEN COALESCE(sum(gio_thuc_te(wa.id)) FILTER (WHERE wa.is_billable), 0) < 0.05
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

       COALESCE(sum(wa.rework_cost_amount) FILTER (WHERE NOT wa.is_billable), 0)
         AS chi_phi_lam_lai
  FROM work_assignment wa
  JOIN app_user u ON u.id = wa.technician_id
  LEFT JOIN quotation_line ql ON ql.id = wa.quotation_line_id
  LEFT JOIN service_item si ON si.id = ql.service_item_id
 WHERE wa.status <> 'CANCELLED'
 GROUP BY wa.tenant_id, wa.technician_id, u.full_name;

COMMENT ON VIEW nang_suat_tho IS
  'R-O-03. Nang suat va ti le lam lai nam CUNG MOT DONG (nang suat cao + rework '
  'cao = lam au). Nang suat NULL khi gio thuc te < 0.05h — xem migration 0041.';
