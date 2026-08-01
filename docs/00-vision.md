# Vision — Hệ thống quản lý xưởng dịch vụ ô tô

> Trạng thái: bản nháp v0.1 — tác giả tự thiết kế nghiệp vụ.
> Sẽ được điều chỉnh khi có yêu cầu từ khách hàng thật.

## Một câu

Hệ thống quản lý xưởng dịch vụ ô tô đa chi nhánh, hỗ trợ đồng thời xe xăng /
hybrid / xe điện, với quy trình báo giá — duyệt — sửa chữa — thanh toán chặt chẽ.

## Mục tiêu của dự án

Dự án có hai giai đoạn với hai mục tiêu khác nhau, và thứ tự này là cố ý:

| Giai đoạn | Mục tiêu | Thước đo thành công |
|---|---|---|
| **1. Hiện tại** | Repo minh chứng năng lực fullstack | Deploy được, demo trong 60 giây, có test cho các bất biến nghiệp vụ, tài liệu quyết định kiến trúc rõ ràng |
| **2. Sau này** | Nền để nhận dự án triển khai riêng | Sửa theo yêu cầu khách hàng thật, không phải viết lại từ đầu |

Nghiệp vụ trong tài liệu này do tác giả tự thiết kế, chọn theo hai tiêu chí:
**sát thực tế vận hành garage** và **đủ khó để chứng minh năng lực kỹ thuật**.

## Người dùng

| Vai | Làm gì trong hệ thống |
|---|---|
| **Khách hàng** | Tra cứu tiến độ xe theo biển số, duyệt/từ chối báo giá, xem lịch sử sửa chữa |
| **Cố vấn dịch vụ** | Tiếp nhận xe, lập báo giá, theo dõi tiến độ, bàn giao xe |
| **Thợ sửa chữa** | Nhận job card, ghi nhận giờ công, chụp ảnh hiện trạng, báo hoàn thành hạng mục |
| **Thủ kho** | Nhập/xuất phụ tùng, kiểm kê, theo dõi tồn |
| **Thu ngân** | Lập hoá đơn, ghi nhận thanh toán (khách / bảo hiểm) |
| **Quản lý chi nhánh** | Xếp lịch khoang & thợ, xem báo cáo doanh thu, năng suất |
| **Chủ chuỗi** | Xem toàn bộ chi nhánh, cấu hình bảng giá, phân quyền |

## Phạm vi

### Có làm

- Tiếp nhận xe, hồ sơ khách hàng và phương tiện (theo biển số / VIN)
- Báo giá có phiên bản, cổng duyệt của khách, **báo giá bổ sung giữa chừng**
- Kho phụ tùng: giữ chỗ, xuất kho, kiểm kê, tồn không bao giờ âm
- Xếp lịch khoang sửa chữa và thợ (xung đột trên hai tài nguyên cùng lúc)
- Ghi nhận giờ công: định mức vs thực tế
- Hoá đơn, thanh toán nhiều nguồn (khách / bảo hiểm), thanh toán từng phần
- Bảo hành: liên kết ngược về đơn gốc, hạn khác nhau cho phụ tùng và công thợ
- Phân biệt xe xăng / hybrid / điện ở tầng danh mục dịch vụ và năng lực thợ
- Đa chi nhánh, phân quyền theo vai, nhật ký thao tác
- Ứng dụng mobile cho thợ

### Không làm (hàng rào scope)

Ghi rõ để về sau không trôi phạm vi:

- **Kế toán đầy đủ** — không làm sổ cái tổng hợp, bảng cân đối, báo cáo tài chính.
  Chỉ làm đến công nợ và doanh thu ở mức vận hành.
- **Tính lương** — chỉ ghi nhận giờ công làm dữ liệu đầu vào, không tính lương.
- **Mua hàng / đặt hàng nhà cung cấp** — kho chỉ nhận phiếu nhập, không có quy
  trình PO/duyệt mua.
- **Đồng sơn (body & paint)** — quy trình khác hẳn cơ điện, để giai đoạn sau.
- **Cứu hộ, giao nhận xe tận nơi**
- **Đa ngôn ngữ / đa tiền tệ** — chỉ tiếng Việt, chỉ VND.
- **Tích hợp hoá đơn điện tử thật** — chỉ định nghĩa interface adapter và một
  implementation giả lập. Tích hợp thật khi có khách hàng cụ thể (mỗi khách
  dùng một nhà cung cấp khác nhau).

## Điểm khác biệt so với phần mềm garage hiện có

1. **Thiết kế cho cả xe điện từ đầu.** Danh mục dịch vụ, chu kỳ bảo dưỡng và
   yêu cầu chứng chỉ thợ gắn theo loại động cơ (`ICE` / `HYBRID` / `BEV`), không
   hardcode quy trình xe xăng.
2. **Quy trình duyệt báo giá chặt.** Không có báo giá được duyệt thì không được
   sửa; phát sinh giữa chừng bắt buộc lập báo giá bổ sung và duyệt lại.
3. **Sổ kho và hoá đơn bất biến.** Sửa sai bằng chứng từ đảo, không bằng `UPDATE`.

## Không phải mục tiêu

Không cạnh tranh trực diện với các sản phẩm SaaS garage đang bán trên thị trường.
Đây là nền kỹ thuật, không phải sản phẩm thương mại đã hoàn chỉnh.
