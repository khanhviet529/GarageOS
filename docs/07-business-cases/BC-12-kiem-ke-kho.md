# BC-12 — Kiểm kê kho

**Độ khó:** ⭐⭐⭐ · **Liên quan:** [BC-04](BC-04-giu-cho-xuat-kho.md)

## 1. Bối cảnh

Định kỳ (tháng/quý) thủ kho đếm thực tế trên kệ và đối chiếu với sổ. Luôn có
chênh lệch vì: mất mát, hư hỏng không ghi nhận, xuất nhầm, đếm sai.

Kiểm kê là nơi **duy nhất** được phép làm thay đổi tồn kho mà không có chứng từ
nghiệp vụ đi kèm — nên cũng là **lỗ hổng kiểm soát nội bộ lớn nhất**.

## 2. Mô hình

### `StockTake` — phiếu kiểm kê

| Thuộc tính | Ghi chú |
|---|---|
| `id` `tenantId` `warehouseId` | |
| `code` | `ST-2026-0007` |
| `status` | `DRAFT` \| `COUNTING` \| `PENDING_APPROVAL` \| `APPROVED` \| `CANCELLED` |
| `scope` | `FULL` (toàn kho) \| `PARTIAL` (theo nhóm/vị trí) |
| `snapshotAt` | 🔒 Thời điểm chốt tồn sổ để đối chiếu |
| `startedByUserId` `approvedByUserId` `approvedAt` | |

### `StockTakeLine`

| Thuộc tính | Ghi chú |
|---|---|
| `stockTakeId` `partId` | |
| `systemQuantity` | 🔒 Tồn sổ **tại `snapshotAt`** — snapshot, không đọc động |
| `countedQuantity` | Số đếm thực tế |
| `variance` | `counted − system` (có dấu) |
| `varianceValue` | `variance × giá vốn` |
| `reason` | Bắt buộc nếu `variance ≠ 0` |
| `countedByUserId` `countedAt` | |

## 3. Luồng chính

| # | Bước | Tác nhân | Trạng thái |
|---|---|---|---|
| 1 | Tạo phiếu kiểm kê, chọn phạm vi | Thủ kho | `DRAFT` |
| 2 | 🔒 **Chốt snapshot tồn sổ** — ghi `systemQuantity` cho mọi dòng | Hệ thống | `COUNTING` |
| 3 | Thủ kho đếm thực tế, nhập `countedQuantity` (quét mã) | Thủ kho | |
| 4 | Hệ thống tính `variance` và `varianceValue` | Hệ thống | |
| 5 | Dòng có chênh lệch → bắt buộc nhập lý do | Thủ kho | |
| 6 | Gửi duyệt | Thủ kho | `PENDING_APPROVAL` |
| 7 | 🔒 Quản lý duyệt nếu tổng giá trị chênh > ngưỡng (`PR-04`) | Quản lý CN | `APPROVED` |
| 8 | Sinh `StockMovement(ADJUSTMENT)` cho từng dòng chênh lệch | Hệ thống | |
| 9 | Cập nhật `stock_balance` | Hệ thống | |

🔒 **Bước 2 quan trọng:** phải chốt snapshot, vì trong lúc đếm (có thể mất cả
ngày) kho vẫn xuất nhập bình thường. Nếu so với tồn sổ *hiện tại* thì mọi giao
dịch phát sinh trong lúc đếm đều biến thành chênh lệch giả.

### Xử lý giao dịch phát sinh trong lúc đếm

| Phương án | Chọn? |
|---|---|
| Khoá kho, cấm xuất nhập | ❌ Xưởng phải dừng — không chấp nhận được |
| Snapshot + tính bù giao dịch phát sinh | ✅ **Chọn** |

```
variance_thực = counted − (systemQuantity + Σ movements[snapshotAt → countedAt])
```

## 4. Ràng buộc quan trọng — không hạ được dưới mức đã giữ chỗ

Đây là tương tác đáng chú ý nhất giữa kiểm kê và giữ chỗ (chi tiết ở
[BC-04](BC-04-giu-cho-xuat-kho.md) mục 5.6).

Nếu `counted < reserved`, `CHECK (on_hand − reserved >= 0)` sẽ chặn.

| # | Xử lý bắt buộc |
|---|---|
| 1 | Hệ thống báo: không thể điều chỉnh, đang có N đơn vị được giữ chỗ |
| 2 | Hiển thị danh sách đơn đang giữ chỗ món này, kèm `promisedAt` |
| 3 | Quản lý chọn đơn nào bị ảnh hưởng, giải phóng giữ chỗ |
| 4 | Thông báo khách của đơn bị ảnh hưởng, đơn → `AWAITING_PARTS` |
| 5 | Sau đó mới ghi được điều chỉnh |

💡 Ràng buộc kỹ thuật ở đây **buộc nghiệp vụ phải rõ ràng** — không thể "làm cho
xong" mà phải quyết định ai chịu thiệt.

## 5. Phân loại lý do chênh lệch

| `reason` | Ý nghĩa | Hành động tiếp theo |
|---|---|---|
| `COUNT_ERROR_PREVIOUS` | Lần kiểm kê trước đếm sai | — |
| `DAMAGED` | Hư hỏng trong kho | Ghi chi phí; xem xét điều kiện bảo quản |
| `EXPIRED` | Hết hạn sử dụng | Ghi chi phí; xem xét mức tồn tối thiểu |
| `THEFT_SUSPECTED` | Nghi mất cắp | ⚠️ Báo cáo lên chủ; xem lại kiểm soát |
| `ISSUE_NOT_RECORDED` | Xuất mà quên ghi sổ | ⚠️ Vấn đề quy trình — cần chấn chỉnh |
| `RECEIPT_NOT_RECORDED` | Nhập mà quên ghi sổ | Tương tự |
| `OTHER` | Cần ghi chú | |

💡 Phân loại này là dữ liệu quản trị thật: nếu `ISSUE_NOT_RECORDED` chiếm đa số
thì vấn đề nằm ở quy trình xuất kho, không phải ở thủ kho.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| So với tồn sổ hiện tại thay vì snapshot | Mọi giao dịch trong lúc đếm thành chênh lệch giả |
| Cho điều chỉnh không cần lý do | Che giấu mất mát; mất khả năng quản trị |
| Không có ngưỡng duyệt | Thủ kho tự cân đối sổ, kiểm soát nội bộ bằng 0 |
| Sửa trực tiếp `stock_balance` | Sổ và tổng hợp lệch nhau (`INV-S-02` sẽ đỏ) |
| Lách constraint khi `counted < reserved` | Mất bất biến quan trọng nhất của kho |
| Khoá kho trong lúc kiểm kê | Xưởng dừng hoạt động |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Kiểm kê không chênh lệch | Không sinh `StockMovement` nào 🧪 |
| 2 | Chênh lệch âm | Sinh `ADJUSTMENT` âm; `on_hand` giảm đúng 🧪 |
| 3 | Có xuất kho trong lúc đếm | `variance` tính bù đúng, không thành chênh lệch giả 🧪 |
| 4 | Chênh lệch không có lý do | Không cho gửi duyệt |
| 5 | Chênh lệch giá trị > ngưỡng | Yêu cầu duyệt của quản lý 🧪 |
| 6 | `counted < reserved` | Bị chặn + hiển thị danh sách đơn ảnh hưởng 🧪 |
| 7 | Sau kiểm kê | `INV-S-02` (sổ = tổng hợp) vẫn đúng 🧪 |
| 8 | Kiểm kê một phần | Chỉ ảnh hưởng phụ tùng trong phạm vi |

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Tần suất kiểm kê? | ⚠️ Toàn kho 1 lần/quý; kiểm kê xoay vòng nhóm giá trị cao hàng tháng |
| 2 | Ai được đếm — có cần hai người độc lập không? | ⚠️ Giai đoạn 1: một người + duyệt của quản lý. Giai đoạn 2: đếm mù đôi cho hàng giá trị cao |
| 3 | Chi phí hao hụt hạch toán vào đâu? | ⚠️ Chi phí chi nhánh; giai đoạn 1 chỉ ghi nhận, không hạch toán kế toán |
