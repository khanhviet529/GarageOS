# ADR-0002 — Sổ kho và chứng từ tài chính bất biến

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Ba loại dữ liệu mang tính chứng từ: **sổ kho**, **hoá đơn**, **nhật ký thao tác**.

Nếu cho phép `UPDATE`/`DELETE` trên chúng:
- Không tái dựng được trạng thái quá khứ
- Không giải thích được chênh lệch khi kiểm kê
- Không có bằng chứng khi tranh chấp với khách hoặc bảo hiểm
- Không đạt được yêu cầu tuân thủ về sau

Nhưng dữ liệu **luôn có lúc ghi sai** — cần một cách sửa mà không phá tính bất biến.

## Quyết định

🔒 **Ba bảng chỉ được `INSERT`: `stock_movement`, `invoice` (sau khi `ISSUED`),
`audit_log`.**

Sửa sai bằng **chứng từ đảo**, không bằng ghi đè:

| Sai ở đâu | Sửa bằng |
|---|---|
| Sổ kho | `StockMovement` mới, `type = ADJUSTMENT`, `reason` bắt buộc |
| Hoá đơn | Hoá đơn mới có `adjustmentOfInvoiceId` + `adjustmentReason` |
| Nhật ký | Không sửa được. Đây là chủ đích |

Enforce ở **hai tầng**:

```sql
-- Tầng quyền
REVOKE UPDATE, DELETE ON stock_movement FROM app_user_role;
REVOKE UPDATE, DELETE ON audit_log      FROM app_user_role;

-- Tầng trigger (cho invoice, vì vẫn cần đổi status theo luồng thanh toán)
CREATE TRIGGER trg_invoice_immutable BEFORE UPDATE ON invoice …
```

Tồn kho hiện tại là **giá trị dẫn xuất**, không phải nguồn sự thật:

```
stock_balance.on_hand  =  Σ stock_movement.quantity      ← INV-S-02 kiểm chứng
```

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **Cho sửa trực tiếp** | Đơn giản, ít dòng code | Mất lịch sử; không giải trình được | ❌ Không dùng được cho tiền và kho |
| **Cho sửa + bảng lịch sử riêng** | Vẫn có lịch sử | Hai nguồn sự thật, dễ lệch; vẫn xoá được | ❌ Nửa vời |
| **Event sourcing toàn hệ thống** | Bất biến hoàn toàn, tái dựng được mọi thứ | Độ phức tạp lớn cho mọi module, kể cả module không cần | ❌ Quá đắt so với giá trị |
| **Bất biến chỉ ở sổ kho + hoá đơn + nhật ký** | Đúng chỗ cần; các module khác vẫn đơn giản | Phải nhớ ranh giới | ✅ **Chọn** |

## Hệ quả

### Tích cực

- 🔒 Kiểm kê luôn giải thích được: mọi biến động tồn đều có dòng sổ
- Tái dựng được tồn kho tại **bất kỳ thời điểm nào** trong quá khứ
- Có bằng chứng khi tranh chấp
- `INV-S-02` (đối soát sổ ↔ tổng hợp) trở thành **test bắt lỗi tự động mạnh nhất**
  của hệ thống — nó phát hiện cả những bug chưa nghĩ tới
- Mở đường cho tuân thủ về sau mà không phải viết lại

### Tiêu cực — phải chấp nhận

- ⚠️ **Sửa sai phiền hơn:** không `UPDATE` một dòng là xong, phải hiểu nghiệp vụ
  để ghi chứng từ đảo đúng
- ⚠️ `stock_movement` và `audit_log` **tăng không giới hạn** → cần phân vùng theo
  thời gian ở giai đoạn 2
- ⚠️ Truy vấn tồn kho phải qua bảng tổng hợp; bảng này có thể lệch nếu có đường
  ghi không đi qua hàm chuẩn → bắt buộc phải có job đối soát
- ⚠️ Không xoá được dữ liệu test lỡ tạo trên production
- ⚠️ ⚠️ **Xung đột tiềm tàng với quyền được lãng quên** (nếu áp dụng quy định về
  dữ liệu cá nhân): dữ liệu cá nhân trong `audit_log` không xoá được. Giảm nhẹ:
  chỉ log ID, không log tên/số điện thoại ([EC-S-04](../08-edge-cases.md)).

## Xem lại khi nào

- `stock_movement` vượt ~10 triệu dòng → cần phân vùng
- Có yêu cầu pháp lý buộc xoá dữ liệu cá nhân trong nhật ký
