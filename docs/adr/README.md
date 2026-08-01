# Architecture Decision Records

## Mục đích

Mỗi ADR ghi lại **một quyết định kiến trúc**: bối cảnh lúc đó, các phương án đã
cân nhắc, lý do chọn, và hệ quả phải chấp nhận.

💡 ADR không phải tài liệu mô tả hệ thống — nó là **nhật ký lý do**. Sáu tháng sau
khi ai đó hỏi *"sao lại làm thế này?"*, câu trả lời nằm ở đây thay vì trong trí
nhớ của người viết code.

## Quy tắc

| # | Quy tắc |
|---|---|
| 1 | Một quyết định một file, đánh số tăng dần, **không bao giờ sửa số** |
| 2 | ADR đã `Chấp nhận` thì **không sửa nội dung** — đổi ý thì viết ADR mới `Thay thế` nó |
| 3 | Phải ghi **phương án đã loại** và lý do loại — đây là phần giá trị nhất |
| 4 | Phải ghi **hệ quả tiêu cực**. ADR chỉ có ưu điểm là ADR viết dối |
| 5 | Ghi rõ **khi nào cần xem lại** quyết định |

## Danh sách

| # | Quyết định | Trạng thái | Ảnh hưởng |
|---|---|---|---|
| [0001](0001-multi-tenant.md) | Multi-tenant bằng `tenant_id` + RLS | ✅ Chấp nhận | Toàn hệ thống |
| [0002](0002-immutable-ledger.md) | Sổ kho và chứng từ bất biến | ✅ Chấp nhận | Kho, hoá đơn, nhật ký |
| [0003](0003-money-as-integer.md) | Tiền là số nguyên đơn vị đồng | ✅ Chấp nhận | Mọi tính toán tiền |
| [0004](0004-powertrain-abstraction.md) | `powertrain` là thuộc tính gốc | ✅ Chấp nhận | Danh mục, phân công, bảo dưỡng |
| [0005](0005-einvoice-adapter.md) | Hoá đơn điện tử qua adapter | ✅ Chấp nhận | Billing |
| [0006](0006-rest-vs-trpc.md) | REST + OpenAPI thay vì tRPC | ✅ Chấp nhận | API, mobile |
| [0007](0007-prisma-plus-raw-sql.md) | Prisma + SQL thô cho phần cần khoá | ✅ Chấp nhận | Tầng dữ liệu |

## Khuôn mẫu

```markdown
# ADR-XXXX — Tiêu đề

**Trạng thái:** Đề xuất | Chấp nhận | Thay thế bởi ADR-YYYY
**Ngày:** YYYY-MM-DD

## Bối cảnh
Vấn đề là gì, ràng buộc nào đang có.

## Quyết định
Chọn cái gì.

## Phương án đã cân nhắc
| Phương án | Ưu | Nhược | Vì sao loại |

## Hệ quả
### Tích cực
### Tiêu cực (phải ghi thật)

## Xem lại khi nào
```
