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
| 2026-08-02 | [Phase 1.4 — lập báo giá](2026-08-02-phase-1.4-bao-gia.md) | 6 | 6 CONFIRMED — vòng nặng nhất; 3 phát hiện nằm đúng chỗ tôi đã tự ghi là "nghi ngờ nhất" mà không kiểm chứng |
| 2026-08-02 | [Phase 1.5 — tra cứu công khai](2026-08-02-phase-1.5-tra-cuu-cong-khai.md) | 4 | 4 CONFIRMED — nặng nhất là link tra cứu không bao giờ hết hạn, dù tài liệu đã ghi rõ 30 ngày |
| 2026-08-02 | [Phase 1.6 — máy trạng thái](2026-08-02-phase-1.6-may-trang-thai.md) | 2 | 2 CONFIRMED — cả hai thuộc loại "code không làm điều hợp đồng hứa"; một cái lộ ra lỗi mô hình dữ liệu sâu hơn |
| 2026-08-02 | [Rà soát TOÀN dự án — 6 reviewer song song](2026-08-02-ra-soat-toan-du-an.md) | ~50 | Audit toàn trạng thái thay vì review diff. Nặng nhất: `hasRole()` tồn tại mà không nơi nào gọi — thợ làm được mọi việc của cố vấn |
| 2026-08-09 | [Phase 3 — tiền](2026-08-09-phase-3-tien.md) | 3 | 2 CONFIRMED (phạm vi chi nhánh lần thứ **bảy**; hai phiếu kiểm kê đồng thời), 1 REFUTED bằng test xanh |
| 2026-08-09 | [Phase 2.2–2.7 và Phase 4](2026-08-09-phase-2.2-2.7-va-phase-4.md) | 5 | **5 CONFIRMED, 0 bác bỏ** — trong đó một chỗ GHI XUYÊN TENANT do `SECURITY DEFINER` gỡ mất RLS |
| 2026-08-09 | [Phiên cookie HttpOnly](2026-08-09-phien-cookie-httponly.md) | 1 | 1 CONFIRMED — xoay vòng refresh token là check-then-act; hậu quả thật NẶNG HƠN dự đoán: một cú bấm đúp đăng xuất người dùng |
| 2026-08-14 | [Luồng tenant công khai của landing](2026-08-14-luong-tenant-public-landing.md) | 6 → **8** | Rà soát chủ động, không phải review diff. 6 phát hiện từ đọc mã; hai cái cuối — và nặng nhất — chỉ lộ ra khi **chạy** bộ test vừa viết: `GET /repair-orders` trả 200 với 100 bản ghi cho `MARKETING_EDITOR`, và cả ba thao tác ghi của Kanban lead trả 500 từ ngày được viết ra. Cả hai chỗ sai đều là thứ KHÔNG được viết, nên không có dòng nào để đọc ra chúng. Đã sửa cả 8; 505/505 + 84/84 test xanh |
