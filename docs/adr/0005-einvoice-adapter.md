# ADR-0005 — Hoá đơn điện tử qua adapter, không tích hợp trực tiếp

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Theo **Nghị định 70/2025/NĐ-CP** (hiệu lực 01/06/2025), hộ kinh doanh và cá nhân
kinh doanh trong lĩnh vực dịch vụ có sử dụng máy tính tiền phải dùng **hoá đơn
điện tử khởi tạo từ máy tính tiền**, dữ liệu chuyển tự động tới cơ quan thuế.

Garage nằm trong diện này → **phần mềm không tích hợp hoá đơn điện tử thì không
bán được**.

Nhưng:
- Có **nhiều nhà cung cấp** (Viettel, VNPT, MISA, Fast, BKAV…), mỗi hãng một API
- Mỗi khách hàng đã ký hợp đồng với một hãng khác nhau, **không đổi được**
- Giai đoạn hiện tại chưa có khách hàng thật → chưa biết phải tích hợp hãng nào
- ⚠️ Chi tiết kỹ thuật API của từng hãng chưa được tác giả xác minh

## Quyết định

**Định nghĩa interface `EInvoiceProvider` trong `packages/contracts`. Nghiệp vụ
chỉ phụ thuộc interface, không bao giờ import SDK của nhà cung cấp.**

```ts
// packages/contracts/src/ports/einvoice.ts
export interface EInvoiceProvider {
  readonly name: string;
  issue(input: EInvoiceIssueInput): Promise<EInvoiceIssueResult>;
  cancel(providerInvoiceNo: string, reason: string): Promise<void>;
  getStatus(providerInvoiceNo: string): Promise<EInvoiceStatus>;
}
```

Giai đoạn 1 chỉ có `MockEInvoiceProvider` (sinh số giả, luôn thành công). Tích hợp
thật khi có khách hàng cụ thể.

🔒 **Quy tắc quan trọng nhất — lỗi nhà cung cấp không chặn nghiệp vụ:**

```
Hoá đơn nội bộ  ISSUED  ──► luôn thành công, cho bàn giao xe
                            │
                            └─► EInvoice  PENDING → ISSUED | FAILED (retry nền)
```

Hoá đơn nội bộ và hoá đơn điện tử là **hai vòng đời tách rời**. Nhà cung cấp treo
thì xưởng vẫn hoạt động bình thường.

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **Tích hợp thẳng một hãng** | Nhanh nhất, ít trừu tượng | Gắn chết vào một hãng; khách dùng hãng khác thì phải sửa nghiệp vụ | ❌ Mất khách ngay từ đầu |
| **Chưa làm gì, để sau** | Không tốn công | Retrofit sau sẽ phải sửa xuyên suốt module billing | ❌ Đắt hơn nhiều |
| **Interface + mock, tích hợp sau** | Nghiệp vụ hoàn chỉnh ngay; thêm hãng chỉ là thêm một class | Chưa chứng minh interface đúng với API thật | ✅ **Chọn** |
| **Dùng dịch vụ trung gian gom nhiều hãng** | Một tích hợp cho mọi hãng | Thêm phụ thuộc, thêm chi phí, chưa rõ có dịch vụ nào đủ tốt | ⚠️ Cân nhắc lại ở giai đoạn 2 |

## Hệ quả

### Tích cực

- Nghiệp vụ billing **hoàn chỉnh và test được** ngay từ giai đoạn 1
- Thêm nhà cung cấp mới = thêm một class, không đụng nghiệp vụ
- 🔒 Lỗi bên thứ ba không làm tê liệt xưởng
- Test không cần gọi API thật
- Mỗi tenant chọn được nhà cung cấp riêng

### Tiêu cực — phải chấp nhận

- ⚠️ **Interface có thể sai.** Nó được thiết kế mà chưa đọc tài liệu API thật của
  hãng nào. Lần tích hợp đầu tiên gần như chắc chắn phải sửa interface.
- ⚠️ Có thêm một tầng trừu tượng cho thứ hiện chỉ có một implementation giả
- ⚠️ ⚠️ **Hệ thống chưa tuân thủ Nghị định 70** — chỉ *sẵn sàng* để tuân thủ. Phải
  ghi rõ điều này, không được tuyên bố đã tuân thủ.
- ⚠️ Trạng thái hoá đơn nội bộ và hoá đơn điện tử có thể lệch nhau trong thời gian
  retry → giao diện phải hiển thị rõ hai trạng thái, không gộp làm một

## Xem lại khi nào

- Có khách hàng thật đầu tiên → **đọc tài liệu API của hãng họ dùng và sửa
  interface theo thực tế**
- Sau 2 lần tích hợp, xem interface có thực sự đủ tổng quát không
- Xuất hiện dịch vụ trung gian đáng tin cậy
