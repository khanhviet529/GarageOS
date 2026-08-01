# BC-01 — Tiếp nhận xe

**Độ khó:** ⭐⭐ · **Liên quan:** [BC-09](BC-09-bao-hanh.md), [08-edge-cases.md](../08-edge-cases.md)

## 1. Bối cảnh

Tiếp nhận là bước đơn giản nhất về logic nhưng **nhiều tình huống biên nhất** về
dữ liệu. Sai ở đây thì mọi thứ phía sau đều sai: sai xe → sai lịch sử → sai bảo
hành → sai hoá đơn.

Mục tiêu vận hành: **≤ 10 phút** kể từ lúc xe vào cổng.

## 2. Luồng chính

| # | Bước | Bắt buộc | Ghi chú |
|---|---|---|---|
| 1 | Nhập/quét biển số | ✅ | Chuẩn hoá trước khi tra: bỏ dấu chấm, gạch, khoảng trắng, viết hoa |
| 2 | Hệ thống tra `Vehicle` theo biển số | — | Ba kết quả: có sẵn / không có / trùng khớp mờ |
| 3 | Xác nhận hoặc tạo `Customer` + `Vehicle` | ✅ | Xem mục 3 |
| 4 | Nhập `odometerIn` | ✅ | 🔒 `INV-V-04` — không lùi |
| 5 | Ghi `customerComplaint` | ✅ | **Nguyên văn lời khách** |
| 6 | Chụp ảnh hiện trạng ≥ 4 góc | ✅ | Bằng chứng pháp lý |
| 7 | Ghi tài sản trên xe | ⚠️ | Túi xách, giấy tờ, đồ dùng |
| 8 | Ghi mức năng lượng | ⚠️ | % pin (BEV/HYBRID) hoặc vạch xăng (ICE) |
| 9 | Hệ thống hiển thị **bảo hành còn hiệu lực** của xe | — | Từ `WarrantyCoverage` |
| 10 | Hệ thống hiển thị **khuyến nghị lần trước bị từ chối** | — | Từ `VehicleRecommendation` |
| 11 | Khách ký nhận điện tử | ✅ | Lưu ảnh chữ ký |
| 12 | Sinh `customerAccessToken`, gửi SMS/Zalo | ✅ | Link tra cứu |

💡 Bước 9 và 10 là **cơ hội bán hàng tự nhiên**: khách quay lại, cố vấn biết ngay
lần trước khách từ chối vệ sinh điều hoà và giờ có thể chào lại.

## 3. Các tình huống nhận diện xe

### 3.1 Xe đã có hồ sơ, đúng chủ

Trường hợp thường. Xác nhận thông tin, tiếp tục.

### 3.2 Xe mới hoàn toàn

Tạo `Customer` + `Vehicle`. `powertrain` là trường **bắt buộc** — không cho để
trống, vì nó chi phối toàn bộ danh mục dịch vụ ([BC-11](BC-11-xe-dien.md)).

### 3.3 Xe đã có hồ sơ nhưng **khác chủ** ⚠️

Xe được bán lại. Đây là tình huống nhạy cảm về quyền riêng tư.

| # | Xử lý |
|---|---|
| 1 | Hiển thị: *"Xe này đã có hồ sơ với chủ khác. Xác nhận đổi chủ?"* |
| 2 | Cố vấn xác nhận, ghi lý do |
| 3 | Tạo bản ghi `VehicleOwnership` mới: chủ cũ `endedAt = now()`, chủ mới `startedAt = now()` |
| 4 | 🔒 Chủ mới **không xem được** đơn sửa chữa của chủ cũ |
| 5 | 🔒 Bảo hành **vẫn còn hiệu lực** (gắn với xe, không gắn với người) |
| 6 | Thợ vẫn xem được lịch sử kỹ thuật (cần để chẩn đoán) nhưng ẩn thông tin chủ cũ |

### `VehicleOwnership`
`id` `tenantId` `vehicleId` `customerId` `startedAt` `endedAt?` `transferReason`

### 3.4 Biển số nhập sai / trùng khớp mờ

Biển số dễ gõ nhầm (`30A-123.45` vs `30A-12345`).

**Xử lý:** chuẩn hoá + tìm gần đúng:

```sql
-- Chuẩn hoá: chỉ giữ chữ và số, viết hoa
CREATE OR REPLACE FUNCTION normalize_plate(p text) RETURNS text AS $$
  SELECT upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'));
$$ LANGUAGE sql IMMUTABLE;

CREATE UNIQUE INDEX uq_vehicle_plate_normalized
  ON vehicle (tenant_id, normalize_plate(plate_number))
  WHERE deleted_at IS NULL;
```

Nếu không khớp chính xác, gợi ý các biển gần giống (khoảng cách Levenshtein ≤ 2)
để cố vấn chọn thay vì tạo trùng.

### 3.5 Xe đổi biển số

Xe cũ đổi biển (chuyển vùng, đổi loại biển). VIN không đổi.

**Xử lý:** nếu có `vin`, tra theo `vin` trước, biển số sau. Cho phép cập nhật
`plateNumber`, lưu lịch sử trong `VehiclePlateHistory`.

⚠️ Nhiều xe cũ ở VN không có `vin` trong hệ thống — phải xử lý được cả trường hợp
thiếu.

### 3.6 Khách doanh nghiệp có nhiều xe

`Customer.type = COMPANY`, một `Customer` có nhiều `Vehicle`.

- Người mang xe đến có thể là tài xế, không phải người quyết định
- ⚠️ **Ai duyệt báo giá?** Số điện thoại duyệt ghi trên hồ sơ khách, không phải
  số của người mang xe đến
- Thanh toán thường là công nợ ([BC-13](BC-13-cong-no.md))

### 3.7 Xe đang có đơn mở

🔒 `INV-V-03` chặn. Hiển thị đơn đang mở, cố vấn phải đóng đơn cũ trước.

⚠️ Ngoại lệ hợp lệ: xe vừa bàn giao sáng nay, chiều quay lại vì lỗi khác. Xử lý:
cho tạo đơn mới sau khi đơn cũ đã `DELIVERED` — điều kiện của `INV-V-03` chỉ chặn
đơn **chưa** `DELIVERED`/`CANCELLED`.

## 4. Số km — `INV-V-04`

Số km là dữ liệu quan trọng (chu kỳ bảo dưỡng, hạn bảo hành theo km) nhưng hay sai.

| Tình huống | Xử lý |
|---|---|
| `odometerIn` ≥ `vehicle.lastOdometer` | Bình thường |
| `odometerIn` < `lastOdometer` | ⚠️ Cảnh báo, yêu cầu chọn lý do: `ODOMETER_REPLACED` \| `PREVIOUS_ENTRY_WRONG` \| `OTHER` + ghi `AuditLog` |
| Chênh lệch bất thường lớn (> 50.000km trong 3 tháng) | Cảnh báo, cho qua nếu xác nhận |
| Không đọc được (đồng hồ hỏng) | Cho để trống + đánh dấu `odometerUnavailable = true` |

💡 Nếu `odometerUnavailable`, mọi tính toán bảo hành theo km cho lần này phải bỏ
qua, chỉ dùng hạn theo tháng.

## 5. Ảnh hiện trạng — bằng chứng pháp lý

🔒 `BR-01-3` — ảnh `INTAKE` không xoá được sau khi đơn rời `RECEIVED`.

| Yêu cầu | Chi tiết |
|---|---|
| Số lượng tối thiểu | 4 ảnh (trước, sau, hai bên) |
| Ảnh bổ sung | Mỗi vết trầy/móp có sẵn một ảnh cận |
| Metadata | Thời điểm chụp, người chụp, ⚠️ toạ độ GPS nếu có |
| Lưu trữ | Object storage, key bất biến |
| Đối chiếu | Lúc bàn giao hiển thị song song ảnh trước/sau |

⚠️ Đây là tính năng **giảm tranh chấp mạnh nhất** trong toàn hệ thống. Garage
thường phải đền vết trầy không phải do mình gây ra chỉ vì không có bằng chứng.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Không chuẩn hoá biển số | Một xe có 3 hồ sơ; lịch sử phân mảnh; bảo hành tra không ra |
| Cho tạo xe không có `powertrain` | Danh mục dịch vụ không lọc được → báo giá sai |
| Không xử lý đổi chủ | Chủ mới xem được dữ liệu chủ cũ — vi phạm quyền riêng tư |
| Ghi diễn giải thay vì nguyên văn lời khách | Chẩn đoán sai hướng, mất thời gian |
| Không bắt buộc ảnh | Tranh chấp trầy xước — garage thường thua |
| Cho km lùi tự do | Bảo hành theo km vô nghĩa; có thể bị gian lận |
| Không hiển thị bảo hành còn hiệu lực | Khách phải trả tiền cho thứ đáng được bảo hành → mất khách |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Tạo xe với biển `30A-123.45` rồi `30A12345` | Bị chặn — index chuẩn hoá 🧪 |
| 2 | Tạo xe không có `powertrain` | Bị từ chối |
| 3 | Tạo đơn cho xe đang có đơn mở | Bị chặn bởi `INV-V-03` 🧪 |
| 4 | Tạo đơn cho xe vừa `DELIVERED` | Thành công 🧪 |
| 5 | `odometerIn` < `lastOdometer` không có lý do | Bị từ chối |
| 6 | `odometerIn` < `lastOdometer` có lý do | Cho qua + ghi `AuditLog` 🧪 |
| 7 | Đổi chủ xe | `VehicleOwnership` mới; chủ mới không truy cập được đơn cũ 🧪 |
| 8 | Bảo hành sau khi đổi chủ | Vẫn còn hiệu lực 🧪 |
| 9 | Xoá ảnh `INTAKE` sau khi rời `RECEIVED` | Bị chặn |
| 10 | Tiếp nhận xe có bảo hành còn hạn | Hiển thị danh sách coverage còn hiệu lực |

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Xe không chính chủ (người quen mang đi sửa) | ⚠️ Cho phép, ghi `broughtByName` + `broughtByPhone` riêng với chủ xe |
| 2 | Nhận diện biển số tự động từ ảnh (ANPR)? | ⚠️ Giai đoạn 2 — có giá trị nhưng không phải lõi |
| 3 | Chữ ký điện tử có giá trị pháp lý ở VN không? | ⚠️ Chưa xác minh — giai đoạn 1 lưu ảnh chữ ký làm bằng chứng thực tế, không phải chữ ký số |
| 4 | Có cần quản lý xe theo đội (fleet) cho khách doanh nghiệp lớn? | ⚠️ Giai đoạn 2 |
