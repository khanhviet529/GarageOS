# ADR-0008 — Bỏ qua tầng hoá đơn/thanh toán ở bản này, có chủ ý

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-08

## Bối cảnh

`docs/15-roadmap.md` xếp Phase 3 (hoá đơn, thanh toán, công nợ) trước Phase 4–6.
Khi tới lượt, câu hỏi thật là: với thời gian còn lại, làm Phase 3 hay làm Phase
5 (bảo hành, huỷ đơn, kiểm kê, xe bỏ quên)?

Hai thứ đó không ngang nhau về mức độ khó:

| | Phase 3 — hoá đơn | Phase 5 — ngoại lệ nghiệp vụ |
|---|---|---|
| Đã có mẫu để chép | Rất nhiều. Mọi hệ thống bán hàng đều có | Gần như không |
| Chỗ dễ sai | Làm tròn, thuế — đã giải quyết ở [ADR-0003](0003-money-as-integer.md) | Hạn kép bảo hành, quyết toán dở dang, kiểm soát nội bộ kiểm kê |
| Nếu làm sai | Sai số tiền — phát hiện được bằng đối chiếu | Sai âm thầm: bảo hành dài hơn chính sách, mất mát kho được "cân sổ" |

💡 Điều quyết định: **những chỗ khó của hệ thống này không nằm ở hoá đơn.** Một
người đọc mã nguồn để đánh giá năng lực sẽ học được nhiều hơn từ
`bao_hanh_con_hieu_luc()` (một trong hai mốc, không phải cả hai) hay
`stock_take_approver_khac_nguoi_dem` (người đếm không được là người duyệt) so với
từ một bảng `invoice` thứ một nghìn.

## Quyết định

**Không làm Phase 3 ở bản này. Những nơi cần hoá đơn thì dùng nguồn dữ liệu thay
thế, và NÓI RÕ ở tên định danh chứ không chỉ ở comment.**

Ba chỗ bị ảnh hưởng, và cách xử lý ở từng chỗ:

| Chỗ | Đáng lẽ dùng | Đang dùng | Dấu vết để không ai đọc nhầm |
|---|---|---|---|
| Báo cáo lãi/lỗ (R-F-02) | `invoice_line` | Dòng báo giá đã duyệt | Trường tên `doanhThuDuKien`, không phải `doanhThu`; màn hình có dải cảnh báo ⚠️ |
| Bảo hành (BC-09) | `invoice_line` | `quotation_line` | Ghi ở đầu migration 0033 kèm lập luận |
| Quyết toán huỷ đơn (BC-10) | Hoá đơn quyết toán | Bảng `cancellation_settlement` riêng | Comment ở 0034 nói rõ Phase 3 sẽ dựng hoá đơn TỪ bảng này |

🔒 Nguyên tắc chung: **không có chỗ nào giả vờ là hoá đơn.** Không có bảng tên
`invoice` với vài cột, không có `total_amount` lấy tạm từ đâu đó. Thà thiếu hẳn
một tầng còn hơn có một tầng nửa vời mà người đọc tưởng là thật.

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| Làm Phase 3 đầy đủ trước | Đúng thứ tự roadmap | Ăn hết thời gian còn lại; Phase 5–6 không có gì | ❌ Đánh đổi phần khó lấy phần dễ |
| Làm `invoice` tối giản (chỉ tổng tiền) | Các phase sau "có hoá đơn để trỏ vào" | Một bảng nửa vời là thứ tệ nhất: nó trông như thật, và mọi code sau đó xây trên nó phải viết lại | ❌ |
| Bỏ hẳn, dùng nguồn thay thế + nói rõ | Phần khó được làm tử tế; đường nối về sau rõ ràng | Báo cáo doanh thu không phải doanh thu thật | ✅ **Chọn** |
| Bỏ hẳn, không nói gì | Nhanh nhất | Người đọc tưởng `doanhThu` là doanh thu đã phát hành | ❌ Đây là nói dối bằng cách im lặng |

## Hệ quả

### Tích cực

- Bốn case khó nhất của tài liệu (BC-09, BC-10, BC-12, BC-15) được làm đầy đủ
  kèm test, thay vì bị đẩy xuống "sau này".
- `warranty_coverage` gắn vào `quotation_line` hoá ra **đúng hơn** bản trong tài
  liệu: bàn giao xe có thể xảy ra TRƯỚC khi phát hành hoá đơn (khách nợ, khách
  doanh nghiệp trả theo kỳ), nên buộc phải có hoá đơn mới sinh được bảo hành là
  ràng buộc sai với thực tế.

### Tiêu cực (phải ghi thật)

- **Báo cáo doanh thu không phải doanh thu.** Dòng báo giá đã duyệt là thứ khách
  đồng ý trả, không phải thứ đã phát hành hoá đơn và càng không phải thứ đã thu
  được tiền. Ba con số này khác nhau trong đời thật.
- **R-F-01 (doanh thu theo kỳ) và R-F-03 (công nợ theo tuổi nợ) không có.** Hai
  báo cáo này cần `invoice` và `payment`, không thay thế được bằng gì.
- Khi làm Phase 3, phải thêm `invoice_line_id` nullable vào `warranty_coverage`
  để nối ngược — **không chuyển cột**, vì dữ liệu bảo hành đã sinh phải giữ
  nguyên gốc của nó.
- `INV-M-04` (không thu vượt số phải thu) chưa có chỗ nào enforce, vì chưa có
  `payment`.

## Xem lại khi nào

- Khi có người dùng thật cần in hoá đơn — lúc đó Phase 3 không còn là lựa chọn.
- Khi cần báo cáo công nợ: đó là ranh giới cứng, không có đường vòng.
- ⚠️ Nếu ai đó định "tạm thêm một cột `invoice_number` vào `repair_order`" —
  đọc lại mục "phương án đã cân nhắc" hàng thứ hai trước khi làm.
