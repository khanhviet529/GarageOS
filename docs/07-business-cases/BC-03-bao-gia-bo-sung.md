# BC-03 — Báo giá bổ sung giữa chừng

**Độ khó:** ⭐⭐⭐⭐⭐ · **Liên quan:** [BC-02](BC-02-duyet-tung-phan.md), [BC-10](BC-10-huy-don.md)

## 1. Bối cảnh

Khách duyệt báo giá gồm 3 hạng mục:

1. Thay má phanh trước
2. Thay dầu động cơ + lọc dầu
3. Vệ sinh kim phun

Thợ tháo bánh xe ra để thay má phanh thì phát hiện **đĩa phanh bị vênh và mòn quá
giới hạn**. Lắp má phanh mới lên đĩa vênh sẽ hỏng ngay và nguy hiểm.

Thợ phải dừng lại và báo. Nhưng dừng cái gì?

### Vì sao đây là case khó nhất

Có bốn quyết định thiết kế đan vào nhau:

| Câu hỏi | Đáp án ngây thơ | Vấn đề |
|---|---|---|
| Dừng cả đơn hay dừng một phần? | Dừng cả đơn | Hạng mục thay dầu chẳng liên quan gì, dừng là lãng phí thợ và khoang |
| Báo giá bổ sung là bản mới hay sửa bản cũ? | Sửa bản cũ | Sai — bản cũ đã được duyệt, sửa là phá bằng chứng |
| Nếu khách từ chối bổ sung thì sao? | Huỷ đơn | Sai — hai hạng mục kia khách đã đồng ý và đã trả tiền |
| Xe đã tháo rời, khách từ chối, ai trả tiền lắp lại? | *(không nghĩ tới)* | Đây là tranh chấp có thật, phải có chính sách |

## 2. Tác nhân và kích hoạt

| | |
|---|---|
| **Người phát hiện** | Thợ (đang thi công) |
| **Người lập báo giá** | Cố vấn dịch vụ |
| **Người quyết định** | Khách hàng |
| **Kích hoạt** | Đơn ở `IN_PROGRESS`, thợ báo phát sinh |

## 3. Nguyên tắc thiết kế: tạm dừng có chọn lọc

🔒 **Phát sinh chỉ tạm dừng các hạng mục *phụ thuộc*, không dừng hạng mục độc lập.**

Quan hệ phụ thuộc được thợ khai báo khi báo phát sinh:

```
Phát sinh: "Đĩa phanh trước vênh"
└── Chặn hạng mục: [Thay má phanh trước]        ← thợ chọn
    Không chặn:    [Thay dầu], [Vệ sinh kim phun]
```

Kết quả:

| Hạng mục | Trạng thái `WorkAssignment` |
|---|---|
| Thay má phanh trước | `PAUSED` — chờ quyết định |
| Thay dầu động cơ | `IN_PROGRESS` — vẫn làm bình thường |
| Vệ sinh kim phun | `SCHEDULED` — vẫn theo lịch |

`RepairOrder.status` chuyển `IN_PROGRESS → AWAITING_APPROVAL`, nhưng **các phân
công không bị chặn vẫn chạy**.

💡 Đây là chỗ dễ thiết kế sai nhất: trạng thái của **đơn** và trạng thái của
**từng phân công** là hai chiều độc lập. Đơn "đang chờ duyệt" không có nghĩa mọi
thợ phải ngồi chơi.

## 4. Luồng chính

| # | Bước | Tác nhân | Kết quả |
|---|---|---|---|
| 1 | Thợ bấm **Báo phát sinh** trên job card | Thợ | — |
| 2 | Thợ chọn hạng mục đề xuất từ danh mục + chụp ảnh bằng chứng | Thợ | Tạo `SupplementRequest` |
| 3 | Thợ chọn hạng mục nào bị chặn bởi phát sinh này | Thợ | Đánh dấu `blocks[]` |
| 4 | Hệ thống chuyển các hạng mục bị chặn sang `PAUSED`, đóng `TimeLog` đang mở | Hệ thống | Giờ công tính tới thời điểm dừng |
| 5 | Thông báo cố vấn dịch vụ | Hệ thống | — |
| 6 | Cố vấn lập **`Quotation` seq=2** chỉ gồm hạng mục phát sinh | Cố vấn | `DRAFT` |
| 7 | 🔒 Giá lấy từ `PriceList` **hiện hành** (có thể khác báo giá gốc) | Hệ thống | snapshot vào dòng |
| 8 | Gửi khách kèm ảnh bằng chứng | Cố vấn | `SENT`; đơn → `AWAITING_APPROVAL` |
| 9 | Khách duyệt / từ chối (có thể duyệt từng phần như [BC-02](BC-02-duyet-tung-phan.md)) | Khách | — |
| 10 | Nếu duyệt → giữ chỗ phụ tùng mới, gỡ `PAUSED`, phân công tiếp | Hệ thống | Đơn → `IN_PROGRESS` |

## 5. Luồng phụ — phần khó nhất

### 5.1 Khách từ chối phát sinh, hạng mục gốc **vẫn làm được**

Ví dụ: phát sinh là "nên thay luôn dầu phanh", khách từ chối. Thay má phanh vẫn
tiến hành bình thường.

**Xử lý:** gỡ `PAUSED` → `IN_PROGRESS`, hạng mục gốc tiếp tục. Ghi hạng mục bị từ
chối vào `VehicleRecommendation` để lần sau chào lại.

### 5.2 Khách từ chối phát sinh, hạng mục gốc **không làm được nữa** ⚠️

Đây là trường hợp của ví dụ đầu bài: **không thể lắp má phanh mới lên đĩa vênh**.

| Bước | Xử lý |
|---|---|
| 1 | Cố vấn đánh dấu hạng mục gốc là `CANNOT_PROCEED` kèm lý do kỹ thuật |
| 2 | Hạng mục gốc → `WorkAssignment.CANCELLED` |
| 3 | 🔒 Giữ chỗ phụ tùng của hạng mục gốc → `RELEASED`, `reserved` giảm |
| 4 | Nếu phụ tùng **đã xuất kho** nhưng chưa lắp → tạo `StockMovement(RETURN)` |
| 5 | Nếu phụ tùng **đã lắp một phần** → xem 5.3 |
| 6 | Dòng hoá đơn của hạng mục gốc bị loại; ghi rõ lý do trong bảng đối chiếu |
| 7 | **Công tháo/lắp lại** — xem 5.4 |

### 5.3 Phụ tùng đã lắp nhưng phải tháo ra

Phụ tùng đã lắp lên xe rồi tháo ra thường **không bán lại được như mới**.

| Tình huống | Xử lý |
|---|---|
| Còn nguyên vẹn, chưa dùng | `StockMovement(RETURN)` với giá vốn gốc |
| Đã hư hỏng do lắp/tháo | `StockMovement(ADJUSTMENT)` âm, `reason = 'DAMAGED_ON_FITTING'`, ghi vào **chi phí nội bộ** |
| Đã tiêu hao (dầu, ga) | Không trả được — tính vào chi phí, ⚠️ chính sách: thu khách hay garage chịu? |

⚠️ **Câu hỏi chính sách chưa chốt:** nếu khách từ chối và phụ tùng đã hỏng do
tháo lắp, ai chịu? Giả định tạm: garage chịu nếu thợ chưa hỏi ý khách trước khi
tháo; khách chịu nếu đã có xác nhận bằng văn bản.

### 5.4 Xe đã tháo rời — công tháo/lắp lại

Đây là tranh chấp có thật ở garage: *"Anh tháo máy ra rồi mới báo giá, giờ tôi
không sửa thì anh bắt tôi trả tiền lắp lại à?"*

**Thiết kế:** đưa vấn đề ra **trước khi tháo**, không phải sau.

| Cơ chế | Mô tả |
|---|---|
| `ServiceItem.requiresDisassembly` | Cờ đánh dấu hạng mục cần tháo rời sâu |
| Cảnh báo lúc báo giá | Hạng mục có cờ này hiển thị điều khoản: *"Nếu quý khách từ chối sửa sau khi đã tháo, phí lắp lại là X đ"* |
| Khách xác nhận riêng điều khoản | Lưu trong `approvalEvidence` |
| Khi phát sinh làm huỷ hạng mục | Tự động thêm dòng `REASSEMBLY_FEE` vào hoá đơn nếu khách đã xác nhận điều khoản |

💡 Đây là ví dụ điển hình của việc **thiết kế phần mềm giải quyết vấn đề nghiệp
vụ, không chỉ ghi chép nghiệp vụ**.

### 5.5 Phát sinh chồng phát sinh

Thợ đang chờ duyệt bổ sung seq=2 thì phát hiện thêm vấn đề khác.

🔒 `INV-Q-03` chỉ cho phép **một báo giá `SENT`** tại một thời điểm. Xử lý:

| Phương án | Chọn? |
|---|---|
| Chặn, bắt chờ duyệt xong seq=2 | ❌ Chậm, khách phải duyệt hai lần liên tiếp |
| Thu hồi seq=2 (`SUPERSEDED`), gộp vào seq=3 | ✅ **Chọn** — khách duyệt một lần cho cả hai |

Điều kiện: seq=2 chưa được khách phản hồi. Nếu đã phản hồi thì lập seq=3 riêng.

### 5.6 Phát sinh khi đơn đã ở `QUALITY_CHECK`

QC phát hiện vấn đề *mới* (không phải lỗi thợ). Xử lý như phát sinh bình thường:
đơn quay về `AWAITING_APPROVAL`, lập seq mới.

⚠️ Phân biệt với **rework** (lỗi thợ) — xem [BC-14](BC-14-rework.md). Ranh giới:
nếu vấn đề *đã tồn tại trước khi thợ đụng vào* → phát sinh (khách trả tiền); nếu
*do thợ làm hỏng* → rework (garage chịu).

## 6. Quy tắc áp dụng

| Mã | Quy tắc |
|---|---|
| 🔒 `BR-07-5` | Phát sinh không làm dừng hạng mục độc lập |
| 🔒 `INV-Q-03` | Chỉ một báo giá `SENT` cùng lúc |
| 🔒 `INV-Q-04` | `seq` tăng dần, duy nhất theo đơn |
| 🔒 `INV-Q-05` | Báo giá gốc đã duyệt **không bị sửa** — bổ sung là bản ghi mới |
| 🔒 `BR-02-2` | Thợ **đề xuất**, cố vấn mới lập báo giá |
| 🔒 `INV-S-04` | Không xuất kho cho dòng chưa duyệt |

## 7. Dữ liệu bị ảnh hưởng

| Bảng | Thay đổi |
|---|---|
| `supplement_request` | Bản ghi mới: hạng mục đề xuất, ảnh, danh sách hạng mục bị chặn |
| `quotation` | Bản ghi mới seq+1 |
| `quotation_line` | Dòng mới cho hạng mục phát sinh |
| `work_assignment` | Hạng mục bị chặn → `PAUSED`; sau đó `IN_PROGRESS` hoặc `CANCELLED` |
| `time_log` | Đóng đoạn đang mở của hạng mục bị dừng |
| `stock_reservation` | Thêm cho phụ tùng mới; `RELEASED` cho hạng mục bị huỷ |
| `repair_order` | `status` → `AWAITING_APPROVAL` |
| `vehicle_recommendation` | Ghi hạng mục bị từ chối để chào lại |

## 8. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Dừng toàn bộ đơn khi có phát sinh | Thợ và khoang nhàn rỗi vô ích; xe nằm lâu hơn cần thiết |
| Sửa trực tiếp báo giá đã duyệt | Mất bằng chứng khách đã đồng ý gì; tranh chấp không giải quyết được |
| Cho khách từ chối bổ sung mà không xử lý hạng mục gốc bị kẹt | Thợ không biết phải làm gì, xe kẹt vô thời hạn |
| Không có chính sách phí lắp lại | Tranh chấp tiền với khách, garage thường phải chịu |
| Không phân biệt phát sinh vs rework | Tính tiền khách cho lỗi của chính garage → mất khách |
| Không đóng `TimeLog` khi tạm dừng | Giờ công tính cả thời gian chờ khách duyệt → năng suất thợ bị bóp méo |

## 9. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Báo phát sinh chặn 1/3 hạng mục | Chỉ hạng mục đó `PAUSED`; 2 hạng mục kia không đổi 🧪 |
| 2 | `TimeLog` khi tạm dừng | Đoạn đang mở được đóng; `actualHours` không tính thời gian chờ 🧪 |
| 3 | Duyệt bổ sung | Hạng mục `PAUSED` trở lại `IN_PROGRESS`; giữ chỗ mới được tạo |
| 4 | Từ chối bổ sung, gốc vẫn làm được | Hạng mục gốc tiếp tục; hạng mục từ chối vào `VehicleRecommendation` |
| 5 | Từ chối bổ sung, gốc không làm được | Hạng mục gốc `CANCELLED`; giữ chỗ `RELEASED`; `reserved` giảm đúng 🧪 |
| 6 | Phụ tùng đã xuất, đơn huỷ hạng mục | Sinh `StockMovement(RETURN)`; `on_hand` khôi phục 🧪 |
| 7 | Phát sinh chồng phát sinh | seq=2 thành `SUPERSEDED`, seq=3 gồm cả hai |
| 8 | Lập seq=2 khi seq=1 chưa duyệt xong | Bị chặn bởi `INV-Q-03` |
| 9 | Báo giá gốc không đổi sau khi có bổ sung | Tổng và các dòng của seq=1 giữ nguyên 🧪 |

## 10. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Thợ có được tự quyết định hạng mục nào bị chặn không? | ⚠️ Có, nhưng cố vấn xem lại được trước khi gửi khách |
| 2 | Phí lắp lại tính thế nào? | ⚠️ Một `ServiceItem` riêng có giá cố định theo nhóm xe |
| 3 | Có giới hạn số lần bổ sung không? | ⚠️ Không giới hạn cứng, nhưng cảnh báo cố vấn từ lần thứ 3 (dấu hiệu chẩn đoán ban đầu kém) |
| 4 | Phát sinh làm trễ hẹn — có tự dời `promisedAt` không? | ⚠️ Không tự động; cố vấn phải dời tay và thông báo khách, để giữ số liệu đúng hẹn trung thực |
