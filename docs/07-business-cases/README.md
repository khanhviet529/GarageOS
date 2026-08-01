# Phân tích case nghiệp vụ

> Đọc sau: [06-state-machines.md](../06-state-machines.md) · Đọc tiếp: [08-edge-cases.md](../08-edge-cases.md)

## Mục đích

Tài liệu [03-business-process.md](../03-business-process.md) mô tả **dòng chảy
chung**. Thư mục này mổ xẻ **từng tình huống cụ thể** — đặc biệt là những tình
huống mà thiết kế ngây thơ sẽ sai.

Mỗi case theo cùng một khuôn mẫu:

```
1. Bối cảnh            Vì sao case này tồn tại trong thực tế
2. Tác nhân & kích hoạt
3. Luồng chính         Từng bước, kèm trạng thái và dữ liệu
4. Luồng phụ           Các nhánh rẽ và ngoại lệ
5. Quy tắc áp dụng     Liên kết tới bất biến ở tài liệu 05
6. Dữ liệu bị ảnh hưởng
7. Nếu thiết kế sai    Hậu quả cụ thể
8. Test cần có
9. Câu hỏi còn mở
```

## Danh sách case

### Nhóm A — Tiếp nhận và báo giá

| Mã | Tên | Độ khó | Vì sao đáng phân tích |
|---|---|---|---|
| [BC-01](BC-01-tiep-nhan-xe.md) | Tiếp nhận xe | ⭐⭐ | Xe trùng biển, đổi chủ, xe công ty, số km lùi |
| [BC-02](BC-02-duyet-tung-phan.md) | **Duyệt báo giá từng phần** | ⭐⭐⭐⭐ | Quyết định duyệt ở cấp dòng, liên kết công–phụ tùng |
| [BC-03](BC-03-bao-gia-bo-sung.md) | **Báo giá bổ sung giữa chừng** | ⭐⭐⭐⭐⭐ | State machine quay lui, tạm dừng có chọn lọc |

### Nhóm B — Kho và tài nguyên

| Mã | Tên | Độ khó | Vì sao đáng phân tích |
|---|---|---|---|
| [BC-04](BC-04-giu-cho-xuat-kho.md) | **Giữ chỗ và xuất kho** | ⭐⭐⭐⭐⭐ | Tranh chấp đồng thời, tồn không âm |
| [BC-05](BC-05-xep-khoang-tho.md) | **Xếp khoang và thợ** | ⭐⭐⭐⭐ | Xung đột trên hai tài nguyên cùng lúc |
| [BC-06](BC-06-gio-cong.md) | Ghi nhận giờ công | ⭐⭐⭐ | Định mức vs thực tế, tạm dừng, nhập hộ |
| [BC-12](BC-12-kiem-ke-kho.md) | Kiểm kê kho | ⭐⭐⭐ | Chênh lệch, điều chỉnh có duyệt |

### Nhóm C — Tiền

| Mã | Tên | Độ khó | Vì sao đáng phân tích |
|---|---|---|---|
| [BC-07](BC-07-hoa-don.md) | Lập hoá đơn từ thực tế | ⭐⭐⭐ | Đối chiếu báo giá ↔ thực tế |
| [BC-08](BC-08-bao-hiem.md) | **Bảo hiểm chi trả một phần** | ⭐⭐⭐⭐⭐ | Phân bổ tiền theo dòng, phần ngoài phạm vi |
| [BC-13](BC-13-cong-no.md) | Khách doanh nghiệp và công nợ | ⭐⭐⭐ | Hạn mức, thanh toán gộp nhiều đơn |

### Nhóm D — Sau bán hàng

| Mã | Tên | Độ khó | Vì sao đáng phân tích |
|---|---|---|---|
| [BC-09](BC-09-bao-hanh.md) | **Bảo hành** | ⭐⭐⭐⭐⭐ | Hạn kép (tháng/km), chi phí về đâu, ảnh hưởng lãi đơn gốc |
| [BC-14](BC-14-rework.md) | Làm lại do lỗi thợ (rework) | ⭐⭐⭐⭐ | Chi phí nội bộ, không tính khách, đo chất lượng |

### Nhóm E — Ngoại lệ và đặc thù

| Mã | Tên | Độ khó | Vì sao đáng phân tích |
|---|---|---|---|
| [BC-10](BC-10-huy-don.md) | **Huỷ đơn giữa chừng** | ⭐⭐⭐⭐⭐ | Đã xuất kho, đã làm công — quyết toán dở dang |
| [BC-11](BC-11-xe-dien.md) | **Xe điện và hybrid** | ⭐⭐⭐⭐ | Danh mục theo powertrain, chứng chỉ, khoang |
| [BC-15](BC-15-xe-bo-quen.md) | Khách không đến lấy xe | ⭐⭐⭐ | Phí trông giữ, xử lý pháp lý, giải phóng khoang |

---

## Bản đồ độ phức tạp

Bảy case đánh dấu ⭐⭐⭐⭐⭐ hoặc ⭐⭐⭐⭐ là nơi tập trung phần lớn giá trị kỹ thuật của
hệ thống. Nếu chỉ có thời gian đọc vài case, đọc theo thứ tự này:

```
1. BC-04  Giữ chỗ và xuất kho      → concurrency, bất biến ở tầng DB
2. BC-03  Báo giá bổ sung           → workflow quay lui
3. BC-08  Bảo hiểm chi trả một phần → phân bổ tiền chính xác
4. BC-09  Bảo hành                  → dữ liệu có chiều thời gian
5. BC-10  Huỷ đơn giữa chừng        → quyết toán trạng thái dở dang
6. BC-05  Xếp khoang và thợ         → ràng buộc loại trừ hai chiều
7. BC-02  Duyệt từng phần           → mô hình hoá quyết định ở cấp dòng
```
