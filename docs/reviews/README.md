# Nhật ký review

Mỗi lần chạy `/codex-review` để lại một bản ghi ở đây: Codex tìm được gì, tôi
đồng ý hay bác bỏ, và **cái gì đã phân xử tranh chấp**.

Vì sao giữ lại:

- Quy trình review chỉ có giá trị nếu **để lại dấu vết**. Không có bản ghi thì
  không ai kiểm chứng được là nó thật sự đã chạy.
- Mỗi bản ghi nêu rõ **test nào đỏ trước khi sửa**. Đó là bằng chứng phát hiện
  là thật, không phải hai mô hình gật đầu với nhau.
- Chỗ tôi **bác bỏ** reviewer cũng được ghi kèm lý do. Nếu về sau hoá ra tôi
  sai, sẽ truy được tôi đã lập luận gì lúc đó.

| Ngày | Phạm vi | Phát hiện | Kết quả |
|---|---|---|---|
| 2026-08-01 | Phase 1.1a — tầng dữ liệu khách hàng/xe | 3 | 3 CONFIRMED, đã sửa ở `0005_review_fixes.sql` |
| 2026-08-02 | [Phase 1.1 — API và giao diện](2026-08-02-phase-1.1-api-va-web.md) | 2 | 2 CONFIRMED, mỗi cái có một test đỏ làm bằng chứng |
| 2026-08-02 | [Phase 1.2 — tiếp nhận xe](2026-08-02-phase-1.2-tiep-nhan-xe.md) | 2 | 2 CONFIRMED — thiếu phạm vi chi nhánh lúc đọc, và `GRANT UPDATE` toàn bảng lặp lại lỗi cũ |
| 2026-08-02 | [Phase 1.3 — danh mục dịch vụ](2026-08-02-phase-1.3-danh-muc.md) | 1 | 1 CONFIRMED — `Number()` trên cột `bigint` làm mất chính xác âm thầm |
