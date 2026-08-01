# BC-14 — Làm lại do lỗi thợ (rework)

**Độ khó:** ⭐⭐⭐⭐ · **Liên quan:** [BC-03](BC-03-bao-gia-bo-sung.md), [BC-09](BC-09-bao-hanh.md), [BC-06](BC-06-gio-cong.md)

## 1. Bối cảnh

QC kiểm tra sau khi thợ báo hoàn thành, phát hiện má phanh lắp lệch, gây kêu.
Phải tháo ra làm lại.

Ba câu hỏi:

1. Khách có phải trả tiền không? → **Không**
2. Giờ công làm lại tính cho ai? → Vẫn ghi nhận cho thợ, nhưng **không tính doanh thu**
3. Làm sao đo được chất lượng thợ nếu không phân biệt rework với việc thường?

## 2. Ranh giới: rework vs phát sinh vs bảo hành

Ba khái niệm dễ lẫn, nhưng **ai trả tiền** khác nhau hoàn toàn:

| | Nguyên nhân | Phát hiện khi | Ai trả | Đơn nào |
|---|---|---|---|---|
| **Phát sinh** ([BC-03](BC-03-bao-gia-bo-sung.md)) | Hỏng hóc **có sẵn**, chưa biết lúc báo giá | Đang sửa | **Khách** | Cùng đơn, báo giá bổ sung |
| **Rework** (case này) | **Lỗi của thợ** khi thực hiện | QC, trước khi bàn giao | **Garage** | Cùng đơn, không tính tiền |
| **Bảo hành** ([BC-09](BC-09-bao-hanh.md)) | Lỗi tái phát **sau khi bàn giao** | Khách quay lại | **Garage** (hoặc NCC) | Đơn mới, trỏ về đơn gốc |

🔒 **Quy tắc phân định:** vấn đề *đã tồn tại trước khi thợ đụng vào* → phát sinh.
*Do thợ làm hỏng hoặc làm sai* → rework.

⚠️ Ranh giới này đôi khi mập mờ trong thực tế. Hệ thống bắt buộc người QC **chọn
phân loại** và ghi lý do — không để mặc định.

## 3. Mô hình

Rework là một `WorkAssignment` **mới**, trỏ về assignment gốc:

```
WorkAssignment #1   Thay má phanh trước
  technicianId: Thợ A
  status: DONE → QC_FAILED
  qcByUserId: Thợ B
  qcNote: "Má phanh lắp lệch, có tiếng kêu khi phanh"
        │
        ▼
WorkAssignment #2   Thay má phanh trước (làm lại)
  reworkOfAssignmentId: #1
  reworkReason: TECHNICIAN_ERROR
  technicianId: Thợ A (hoặc thợ khác)
  isBillable: false        ← 🔒 không tính tiền
```

### Trường bổ sung trên `WorkAssignment`

| Thuộc tính | Ghi chú |
|---|---|
| `reworkOfAssignmentId` | FK? — assignment gốc |
| `reworkReason` | `TECHNICIAN_ERROR` \| `PART_DEFECT` \| `DIAGNOSIS_ERROR` \| `CUSTOMER_CHANGE` |
| `isBillable` | 🔒 `false` khi `reworkReason ∈ {TECHNICIAN_ERROR, DIAGNOSIS_ERROR}` |
| `reworkCostAmount` | Chi phí nội bộ: giá vốn phụ tùng + giờ công × chi phí giờ |

### Bốn loại nguyên nhân rework

| `reworkReason` | Ai chịu | Ghi nhận vào |
|---|---|---|
| `TECHNICIAN_ERROR` | Garage | Chỉ số chất lượng của **thợ** |
| `DIAGNOSIS_ERROR` | Garage | Chỉ số chất lượng của **người chẩn đoán** |
| `PART_DEFECT` | Nhà cung cấp | Chỉ số chất lượng của **phụ tùng/NCC**; đòi lại được |
| `CUSTOMER_CHANGE` | **Khách** | Không phải rework thật — tính tiền như phát sinh |

💡 Tách `PART_DEFECT` ra riêng rất quan trọng: nó **không phải lỗi thợ**, và nếu
gộp chung sẽ oan cho thợ khi tính chỉ số chất lượng — dẫn tới thợ giấu lỗi.

## 4. Luồng chính

| # | Bước | Tác nhân |
|---|---|---|
| 1 | Thợ báo hoàn thành hạng mục | Thợ A |
| 2 | 🔒 Người QC (≠ thợ A) kiểm tra — `INV-W-04` | Thợ B / Quản lý |
| 3 | QC không đạt: ghi lý do + ảnh + **chọn `reworkReason`** | Người QC |
| 4 | `WorkAssignment #1` → `QC_FAILED` | Hệ thống |
| 5 | Tạo `WorkAssignment #2` với `reworkOfAssignmentId = #1` | Hệ thống |
| 6 | Đơn quay về `IN_PROGRESS` | Hệ thống |
| 7 | Phân công lại — ⚠️ ưu tiên **cùng thợ** (học từ lỗi) hoặc thợ giỏi hơn nếu lỗi nặng | Quản lý |
| 8 | Thợ làm lại, bấm giờ bình thường | Thợ |
| 9 | Phụ tùng cần thêm → xuất kho, ghi vào chi phí nội bộ | Thủ kho |
| 10 | QC lại | Người QC |
| 11 | Đạt → tiếp tục quy trình | |

## 5. Ảnh hưởng tới các con số

### 5.1 Hoá đơn cho khách

🔒 Dòng rework **không xuất hiện** trên hoá đơn với giá tiền. Hai lựa chọn hiển thị:

| Phương án | Chọn? |
|---|---|
| Ẩn hoàn toàn | ❌ Khách thấy xe nằm lâu mà không hiểu vì sao |
| Hiện với giá 0đ và ghi chú "Làm lại — không tính phí" | ✅ **Chọn** — minh bạch, tăng tin tưởng |

⚠️ Trừ khi garage không muốn khách biết có lỗi. Cấu hình `showReworkOnInvoice`,
mặc định `true`.

### 5.2 Giờ công của thợ

Giờ công rework **vẫn được ghi nhận** cho thợ (họ đã làm việc thật), nhưng tách
riêng khi tính:

```
Giờ công tính lương    = Σ giờ các assignment có isBillable = true
Giờ công rework        = Σ giờ các assignment có isBillable = false
Tỉ lệ rework của thợ   = giờ rework / tổng giờ
```

⚠️ **Chính sách trả lương cho giờ rework** là quyết định của garage:

| Chính sách | Ưu | Nhược |
|---|---|---|
| Trả đủ | Thợ không giấu lỗi | Không có động lực làm đúng lần đầu |
| Không trả | Động lực làm đúng | **Thợ giấu lỗi, không báo QC** — nguy hiểm hơn |
| Trả nhưng tính vào chỉ số chất lượng | Cân bằng | ✅ **Đề xuất** |

💡 Phương án "không trả" nghe hợp lý nhưng phản tác dụng trong thực tế: nó tạo
động lực để thợ và người QC thông đồng bỏ qua lỗi.

### 5.3 Lãi/lỗ của đơn

```
Lãi đơn = Doanh thu
        − Giá vốn phụ tùng (kể cả phụ tùng dùng cho rework)
        − Chi phí công (kể cả giờ rework)
```

Rework **giảm lãi của chính đơn đó** — khác với bảo hành (giảm lãi của đơn gốc
trong quá khứ).

### 5.4 Chỉ số chất lượng

| Chỉ số | Công thức | Dùng để |
|---|---|---|
| Tỉ lệ rework theo thợ | `số assignment QC_FAILED / tổng assignment` | Đào tạo, đánh giá |
| Tỉ lệ rework theo hạng mục | Nhóm theo `serviceItemId` | Phát hiện hạng mục khó, cần đào tạo hoặc sửa định mức |
| Tỉ lệ rework theo NCC | Chỉ `reworkReason = PART_DEFECT` | Đàm phán hoặc đổi nhà cung cấp |
| Chi phí rework / doanh thu | `Σ reworkCostAmount / doanh thu` | Chỉ số sức khoẻ xưởng |

## 6. Luồng phụ

### 6.1 Rework nhiều lần

Làm lại lần hai vẫn không đạt.

- Chuỗi `reworkOfAssignmentId` tạo thành danh sách liên kết
- ⚠️ Từ lần thứ 2 trở đi: **bắt buộc quản lý chi nhánh vào xem xét**, không để thợ tự làm lại mãi
- Cảnh báo: có thể chẩn đoán sai gốc rễ, không phải lỗi thi công

### 6.2 Rework do phụ tùng lỗi

`reworkReason = PART_DEFECT`:
- Phụ tùng lỗi → `StockMovement(ADJUSTMENT)` âm, `reason = 'DEFECTIVE'`
- Tạo hồ sơ đòi nhà cung cấp (như [BC-09](BC-09-bao-hanh.md) mục 5.4)
- **Không** tính vào chỉ số chất lượng của thợ

### 6.3 Phát hiện lỗi sau khi bàn giao

Không còn là rework mà là **bảo hành** ([BC-09](BC-09-bao-hanh.md)). Ranh giới là
mốc `deliveredAt`.

### 6.4 Khách phát hiện lỗi ngay lúc bàn giao

Đơn chưa `DELIVERED` → vẫn là rework. Quay về `IN_PROGRESS`.

⚠️ Nếu khách đã thanh toán rồi thì hoá đơn đã phát hành — không sửa được
(`INV-M-03`). Rework không làm đổi hoá đơn vì vốn dĩ không tính tiền.

## 7. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Không phân biệt rework với phát sinh | Tính tiền khách cho lỗi của garage → mất khách |
| Không phân biệt `PART_DEFECT` với `TECHNICIAN_ERROR` | Oan thợ; thợ mất động lực báo lỗi |
| Không trả lương giờ rework | Thợ giấu lỗi, thông đồng với QC → lỗi ra tới khách |
| Cho thợ tự QC việc mình làm | QC vô nghĩa (`INV-W-04` đã chặn) |
| Sửa assignment gốc thay vì tạo cái mới | Mất lịch sử, không đo được tỉ lệ rework |
| Không giới hạn số lần rework | Xe kẹt vô hạn, không ai chịu trách nhiệm |

## 8. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | QC không đạt | Tạo assignment mới với `reworkOfAssignmentId` đúng 🧪 |
| 2 | Thợ tự QC việc mình | Bị chặn bởi `INV-W-04` 🧪 |
| 3 | Rework `TECHNICIAN_ERROR` | `isBillable = false`; không có dòng tính tiền trên hoá đơn 🧪 |
| 4 | Rework `CUSTOMER_CHANGE` | `isBillable = true`; xử lý như phát sinh, cần khách duyệt |
| 5 | Giờ công thợ | Tách đúng giờ billable và giờ rework 🧪 |
| 6 | Lãi đơn có rework | Giảm đúng bằng chi phí rework 🧪 |
| 7 | Rework lần 2 | Yêu cầu quản lý duyệt |
| 8 | `PART_DEFECT` | Không tính vào tỉ lệ rework của thợ 🧪 |
| 9 | Hoá đơn hiển thị dòng rework | Có dòng, giá 0đ, ghi chú rõ |

## 9. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Ai quyết định `reworkReason` khi mập mờ? | ⚠️ Người QC chọn, quản lý có quyền đổi, mọi thay đổi ghi `AuditLog` |
| 2 | Có nên cho thợ khiếu nại phân loại rework không? | ⚠️ Giai đoạn 2 — nhưng là tính năng quan trọng cho công bằng nội bộ |
| 3 | Ngưỡng tỉ lệ rework nào là báo động? | ⚠️ Chưa có cơ sở; thu thập dữ liệu 3 tháng rồi đặt ngưỡng |
| 4 | Rework có làm dời `promisedAt` không? | ⚠️ Không tự động — phải thông báo khách bằng tay, giữ số liệu đúng hẹn trung thực |
