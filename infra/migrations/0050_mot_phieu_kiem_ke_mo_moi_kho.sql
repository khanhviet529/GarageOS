-- =============================================================================
-- 0050 — Mỗi kho chỉ một phiếu kiểm kê đang mở (STOCKTAKE-001)
--
-- 0037 đã viết ra quy tắc này, và `StockTakeService.create()` đã kiểm nó:
--
--   SELECT code FROM stock_take
--    WHERE warehouse_id = $1 AND status IN ('DRAFT','COUNTING','PENDING_APPROVAL')
--   -- ... nếu thấy thì báo lỗi, không thấy thì INSERT
--
-- Giữa hai câu lệnh đó là một khe hở. Hai request song song cùng đọc "không có
-- phiếu nào", cùng ghi — và kho có HAI phiếu mở, hai snapshot khác nhau của
-- cùng một kệ hàng. Cả hai được đếm, cả hai được duyệt, món hàng thiếu bị trừ
-- hai lần. Sổ kho vẫn cân với tồn (INV-S-02 vẫn xanh) vì cả hai bút toán đều
-- có chứng từ — chỉ có con số tồn là sai, và không ai được báo động.
--
-- 🔒 Nguyên tắc số 1 của CLAUDE.md: bất biến enforce ở tầng THẤP NHẤT có thể.
--    Kiểm ở service là kiểm ở tầng không enforce được — không phải vì code sai,
--    mà vì giữa SELECT và INSERT luôn có một khoảng thời gian.
--
-- Index một phần làm được đúng việc đó và không cần khoá gì: hai giao dịch
-- cùng ghi thì cái sau đụng unique và bị từ chối. Đây cũng là lý do bảng
-- `quotation` dùng `one_pending_quotation` thay vì kiểm ở service.
--
-- ⚠️ Không đặt `tenant_id` vào khoá: `warehouse_id` đã là uuid duy nhất toàn
--    cục, thêm cột chỉ làm ràng buộc LỎNG hơn chứ không chặt hơn.
-- =============================================================================

/*
 * Dọn trước khi tạo: nếu dữ liệu hiện có đã vi phạm thì CREATE UNIQUE INDEX sẽ
 * đỏ, và thông báo của PostgreSQL không nói kho nào. Câu này biến nó thành một
 * lỗi đọc được.
 */
DO $$
DECLARE
  vi_pham text;
BEGIN
  SELECT string_agg(w.code || ' (' || n || ' phiếu)', ', ')
    INTO vi_pham
    FROM (SELECT warehouse_id, count(*) AS n
            FROM stock_take
           WHERE status IN ('DRAFT','COUNTING','PENDING_APPROVAL')
           GROUP BY warehouse_id
          HAVING count(*) > 1) t
    JOIN warehouse w ON w.id = t.warehouse_id;

  IF vi_pham IS NOT NULL THEN
    RAISE EXCEPTION
      'Dữ liệu hiện có đã vi phạm: % — đóng bớt phiếu kiểm kê trước khi chạy migration này',
      vi_pham;
  END IF;
END $$;

CREATE UNIQUE INDEX uniq_stock_take_dang_mo
  ON stock_take (warehouse_id)
  WHERE status IN ('DRAFT', 'COUNTING', 'PENDING_APPROVAL');

COMMENT ON INDEX uniq_stock_take_dang_mo IS
  'BC-12: một kho không có hai phiếu kiểm kê mở cùng lúc. Kiểm ở service không '
  'đủ — giữa SELECT và INSERT có khe hở cho hai request song song.';
