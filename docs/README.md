# Tài liệu thiết kế — Hệ thống quản lý xưởng dịch vụ ô tô

> Tên mã dự án: **GarageOS**
> Trạng thái: đang thiết kế · Phiên bản tài liệu: v0.2

## Cách đọc bộ tài liệu này

Tài liệu được sắp theo thứ tự **tổng quan → chi tiết**. Người mới nên đọc theo
đúng thứ tự số. Người đã quen có thể nhảy thẳng vào phần cần.

```
Tầng 1 — VÌ SAO        00 → 02      Mục tiêu, người dùng, ngôn ngữ chung
Tầng 2 — CÁI GÌ        03 → 06      Quy trình, mô hình, bất biến, trạng thái
Tầng 3 — CỤ THỂ RA SAO 07 → 09      Phân tích từng case nghiệp vụ, tình huống biên
Tầng 4 — LÀM THẾ NÀO   10 → 14      Schema, API, kiến trúc, test, lộ trình
Xuyên suốt             adr/         Nhật ký quyết định kiến trúc
```

## Mục lục

### Tầng 1 — Vì sao (bối cảnh)

| Tài liệu | Nội dung | Trả lời câu hỏi |
|---|---|---|
| [00-vision.md](00-vision.md) | Mục tiêu dự án, phạm vi, hàng rào scope | Làm cái gì, và **không** làm cái gì? |
| [01-glossary.md](01-glossary.md) | Từ điển thuật ngữ Việt ↔ code | Gọi tên sự vật thế nào cho thống nhất? |
| [02-actors-and-permissions.md](02-actors-and-permissions.md) | Vai trò, ma trận phân quyền | Ai được làm gì? |

### Tầng 2 — Cái gì (mô hình nghiệp vụ)

| Tài liệu | Nội dung | Trả lời câu hỏi |
|---|---|---|
| [03-business-process.md](03-business-process.md) | Quy trình end-to-end, luồng chính và các nhánh | Xe đi qua những bước nào? |
| [04-domain-model.md](04-domain-model.md) | Entity, quan hệ, aggregate, sơ đồ ERD | Dữ liệu được tổ chức ra sao? |
| [05-invariants.md](05-invariants.md) | **Các bất biến phải luôn đúng** | Điều gì tuyệt đối không được sai? |
| [06-state-machines.md](06-state-machines.md) | Máy trạng thái của từng aggregate | Trạng thái nào chuyển sang trạng thái nào? |

### Tầng 3 — Cụ thể ra sao (phân tích nghiệp vụ)

| Tài liệu | Nội dung |
|---|---|
| [07-business-cases/](07-business-cases/) | **Phân tích chi tiết từng case nghiệp vụ** — luồng chính, luồng phụ, quy tắc, dữ liệu, rủi ro |
| [08-edge-cases.md](08-edge-cases.md) | Tình huống biên và cách xử lý |
| [09-reports.md](09-reports.md) | Các báo cáo cần có và công thức tính |

### Tầng 4 — Làm thế nào (kỹ thuật)

| Tài liệu | Nội dung |
|---|---|
| [10-data-model.md](10-data-model.md) | Schema chi tiết: bảng, kiểu, ràng buộc, index |
| [11-api-design.md](11-api-design.md) | Nguyên tắc thiết kế API, quy ước lỗi, phân trang |
| [12-architecture.md](12-architecture.md) | Kiến trúc hệ thống, monorepo, phân tầng, multi-tenant |
| [13-nfr.md](13-nfr.md) | Yêu cầu phi chức năng: bảo mật, hiệu năng, quan trắc |
| [14-testing-strategy.md](14-testing-strategy.md) | Chiến lược test — bất biến nào được test bằng cách nào |
| [15-roadmap.md](15-roadmap.md) | Phân kỳ theo lát cắt dọc |
| [16-review.md](16-review.md) | **Review đối chiếu chéo** — mâu thuẫn, lỗ hổng đã tìm ra và cách sửa |

### Xuyên suốt

| Thư mục | Nội dung |
|---|---|
| [adr/](adr/) | Architecture Decision Records — mỗi quyết định lớn một file, ghi lại **bối cảnh, lựa chọn, đánh đổi** |

## Quy ước trong tài liệu

| Ký hiệu | Ý nghĩa |
|---|---|
| 🔒 | Bất biến — điều kiện phải luôn đúng, được enforce ở tầng DB hoặc service |
| ⚠️ | Giả định của tác giả, chưa đối chiếu với garage thật — cần xem lại khi có khách hàng |
| 🧪 | Có test tự động phủ điều này |
| 💡 | Điểm kỹ thuật đáng chú ý |

## Nguyên tắc thiết kế xuyên suốt

Năm nguyên tắc chi phối mọi quyết định trong bộ tài liệu này:

1. **Bất biến được enforce ở tầng thấp nhất có thể.** Ưu tiên ràng buộc DB hơn
   validation ở service, ưu tiên service hơn UI. UI chỉ là lớp thân thiện, không
   phải lớp bảo vệ.
2. **Chứng từ tài chính và kho là bất biến.** Sửa sai bằng chứng từ đảo, không
   bằng `UPDATE`/`DELETE`. Lịch sử phải tái dựng được.
3. **Tiền luôn là số nguyên, đơn vị đồng.** Không bao giờ dùng số thực.
4. **Mọi truy vấn đều bị giới hạn theo `tenant_id`** — enforce ở tầng hạ tầng,
   không dựa vào việc lập trình viên nhớ thêm điều kiện.
5. **Nghiệp vụ nằm ở tầng service thuần**, không phụ thuộc framework — để sau
   này bọc thành công cụ cho AI agent không phải viết lại.

## Trạng thái tài liệu

**Phiên bản v0.2 — hoàn chỉnh bản nháp đầu, đã qua một vòng review đối chiếu chéo.**

| Nhóm | Số file | Trạng thái |
|---|---|---|
| Tầng 1 — Bối cảnh (00–02) | 3 | ✅ Xong, đã sửa sau review |
| Tầng 2 — Mô hình (03–06) | 4 | ✅ Xong, đã sửa sau review |
| Tầng 3 — Case nghiệp vụ (07–09) | 18 | ✅ Xong (15 case + 2 tài liệu + README) |
| Tầng 4 — Kỹ thuật (10–15) | 6 | ✅ Xong |
| Review (16) | 1 | ✅ Vòng 1 xong — 18 phát hiện, 11 đã sửa |
| ADR | 8 | ✅ 7 ADR + README |
| **Tổng** | **40 file** | |

### Chỉ số

| Chỉ số | Giá trị |
|---|---|
| Bất biến được định nghĩa | **41** |
| — enforce ở tầng database | 34 (83%) |
| — enforce ở tầng service | 7 |
| Case nghiệp vụ phân tích chi tiết | **15** |
| Tình huống biên | 27 |
| Quyết định kiến trúc có ADR | 7 |
| Giả định chưa xác minh (⚠️) | ~90 |

### Việc tiếp theo

1. **Phase 0 — walking skeleton** ([15-roadmap.md](15-roadmap.md)) — bắt đầu viết code
2. Vòng review 2 sau khi code xong Phase 1
3. Đối chiếu các giả định ⚠️ với garage thật khi có cơ hội

⚠️ **Lưu ý về tính xác thực:** toàn bộ nghiệp vụ trong bộ tài liệu này do tác giả
tự thiết kế dựa trên hiểu biết chung về ngành và khảo sát sản phẩm cạnh tranh —
**chưa đối chiếu với garage thật**. Mọi chỗ đánh dấu ⚠️ là giả định cần kiểm chứng.
