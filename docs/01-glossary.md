# Từ điển thuật ngữ (Ubiquitous Language)

> Mọi tên trong code — entity, bảng DB, endpoint, biến — dùng cột **Tên trong code**.
> Mọi văn bản hướng tới người dùng dùng cột **Tiếng Việt**.
> Không được đặt tên khác ngoài bảng này. Cần thuật ngữ mới thì thêm vào đây trước.

## Tổ chức

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Đơn vị thuê bao | `Tenant` | Một doanh nghiệp dùng hệ thống (một garage hoặc một chuỗi). Ranh giới cô lập dữ liệu tuyệt đối. |
| Chi nhánh | `Branch` | Một xưởng vật lý thuộc `Tenant`. Kho, khoang, thợ đều thuộc chi nhánh. |
| Người dùng | `User` | Tài khoản đăng nhập, thuộc một `Tenant`, có một hoặc nhiều vai. |
| Vai | `Role` | `SERVICE_ADVISOR`, `TECHNICIAN`, `STORE_KEEPER`, `CASHIER`, `BRANCH_MANAGER`, `OWNER` |

## Khách hàng và phương tiện

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Khách hàng | `Customer` | Cá nhân hoặc doanh nghiệp sở hữu xe. |
| Phương tiện / Xe | `Vehicle` | Một chiếc xe cụ thể, định danh bằng biển số và/hoặc VIN. |
| Biển số | `plateNumber` | Định danh nghiệp vụ chính, dùng để tra cứu. |
| Số khung | `vin` | Vehicle Identification Number. Có thể trống với xe cũ. |
| Loại động cơ | `powertrain` | `ICE` (xăng/dầu), `HYBRID`, `BEV` (thuần điện). **Quyết định dịch vụ nào áp dụng được.** |
| Số km | `odometer` | Số công-tơ-mét ghi nhận lúc tiếp nhận. |

## Dịch vụ và phụ tùng

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Hạng mục dịch vụ | `ServiceItem` | Một công việc bán được, ví dụ "Thay dầu động cơ", "Kiểm tra hệ thống pin cao áp". Có định mức giờ công. |
| Định mức giờ công | `standardHours` | Số giờ tiêu chuẩn để hoàn thành hạng mục. Cơ sở tính tiền công và đo năng suất. |
| Phụ tùng | `Part` | Vật tư bán/lắp cho xe. Có mã, đơn vị tính, giá vốn, giá bán. |
| Bảng giá | `PriceList` | Giá công và giá phụ tùng theo `Tenant`, có hiệu lực theo thời gian. |

## Quy trình sửa chữa

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Đơn sửa chữa | `RepairOrder` | **Aggregate root.** Một lần xe vào xưởng, từ tiếp nhận đến bàn giao. |
| Phiếu tiếp nhận | (thuộc `RepairOrder`) | Thông tin lúc xe vào: km, tình trạng, ảnh, mô tả của khách. |
| Báo giá | `Quotation` | Danh sách hạng mục + phụ tùng kèm giá, gửi khách duyệt. Một đơn có thể có nhiều báo giá. |
| Báo giá gốc | `Quotation` seq = 1 | Báo giá đầu tiên. |
| Báo giá bổ sung | `Quotation` seq > 1 | Lập khi phát hiện hỏng thêm trong lúc sửa. Phải được duyệt riêng. |
| Dòng báo giá | `QuotationLine` | Một dòng: hoặc công (`LABOR`) hoặc phụ tùng (`PART`). |
| Duyệt báo giá | `approveQuotation` | Hành động của khách hàng. Không duyệt thì không được sửa. |
| Phân công | `WorkAssignment` | Gán một hạng mục cho một thợ, tại một khoang, trong một khoảng thời gian. |
| Khoang sửa chữa | `Bay` | Vị trí vật lý trong xưởng (có cầu nâng, trạm sạc…). Tài nguyên độc chiếm. |
| Thợ | `Technician` | `User` có vai `TECHNICIAN`, có danh sách chứng chỉ. |
| Chứng chỉ | `Certification` | Năng lực của thợ, ví dụ `HV_ELECTRICAL` (an toàn điện cao áp) — bắt buộc với hạng mục xe điện. |
| Giờ công thực tế | `actualHours` | Thời gian thợ thực sự bỏ ra. So với `standardHours` để đo năng suất. |

## Kho

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Kho | `Warehouse` | Kho phụ tùng thuộc một chi nhánh. |
| Tồn thực tế | `onHand` | Số lượng đang có mặt trong kho. **Suy ra từ sổ kho, không lưu độc lập.** |
| Đã giữ chỗ | `reserved` | Số lượng đã cam kết cho các đơn được duyệt nhưng chưa xuất. |
| Khả dụng | `available` | `onHand - reserved`. Đây là con số dùng để kiểm tra khi giữ chỗ mới. |
| Giữ chỗ | `StockReservation` | Tạo khi báo giá được duyệt. Chưa trừ tồn thực tế. |
| Sổ kho | `StockMovement` | **Bảng chỉ thêm (append-only).** Mọi biến động tồn là một dòng ở đây. |
| Phiếu nhập | `StockMovement` type `RECEIPT` | Nhập phụ tùng vào kho. |
| Phiếu xuất | `StockMovement` type `ISSUE` | Xuất phụ tùng để lắp lên xe. |
| Phiếu trả | `StockMovement` type `RETURN` | Trả phụ tùng chưa dùng về kho (khi huỷ đơn). |
| Điều chỉnh | `StockMovement` type `ADJUSTMENT` | Kết quả kiểm kê. Phải có lý do. |

## Tiền

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Hoá đơn | `Invoice` | Chứng từ đòi tiền, lập từ công việc **đã thực hiện** (không phải từ báo giá). |
| Dòng hoá đơn | `InvoiceLine` | Một dòng công hoặc phụ tùng, có thuế suất riêng. |
| Thanh toán | `Payment` | Một lần trả tiền. Một hoá đơn có thể có nhiều lần thanh toán. |
| Bên chi trả | `payerType` | `CUSTOMER`, `INSURER` (bảo hiểm), `WARRANTY` (garage tự chịu do bảo hành). |
| Phân bổ thanh toán | `PaymentAllocation` | Gán số tiền của một `Payment` vào các `InvoiceLine` cụ thể. |
| Số tiền | kiểu `bigint` | **Luôn là số nguyên, đơn vị đồng. Không bao giờ dùng số thực.** |
| Hoá đơn điện tử | `EInvoice` | Bản ghi kết quả phát hành lên nhà cung cấp HĐĐT. |

## Bảo hành

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Chính sách bảo hành | `WarrantyPolicy` | Thời hạn theo tháng và/hoặc theo km. Phụ tùng và công thợ có hạn khác nhau. |
| Đơn bảo hành | `RepairOrder` có `warrantyClaimOf` | Đơn sửa lại do lỗi cũ, trỏ về đơn gốc. Doanh thu bằng 0 nhưng vẫn tiêu tốn chi phí. |

## Bổ sung sau khi phân tích case nghiệp vụ (F-06)

| Tiếng Việt | Tên trong code | Định nghĩa | Nguồn |
|---|---|---|---|
| Lịch hẹn | `Appointment` | Đặt lịch trước khi xe vào. **Không phải** đơn sửa chữa — chuyển đổi thành đơn khi khách đến. | [03](03-business-process.md) |
| Đề xuất phát sinh | `SupplementRequest` | Thợ báo phát hiện hỏng thêm giữa lúc sửa. Kèm ảnh bằng chứng và danh sách hạng mục bị chặn. | [BC-03](07-business-cases/BC-03-bao-gia-bo-sung.md) |
| Khuyến nghị cho xe | `VehicleRecommendation` | Hạng mục khách từng từ chối, lưu lại để chào lại lần sau. | [BC-02](07-business-cases/BC-02-duyet-tung-phan.md) |
| Lịch sử chủ sở hữu | `VehicleOwnership` | Ai sở hữu xe trong khoảng thời gian nào. Dùng để chặn chủ mới xem đơn của chủ cũ. | [BC-01](07-business-cases/BC-01-tiep-nhan-xe.md) |
| Hồ sơ bồi thường | `InsuranceClaim` | Hồ sơ với công ty bảo hiểm. **Vòng đời dài hơn đơn sửa chữa** — có thể quyết toán sau 30–60 ngày. | [BC-08](07-business-cases/BC-08-bao-hiem.md) |
| Quy kết chi phí bảo hành | `WarrantyCostAttribution` | Chi phí của đơn bảo hành được quy về **đơn gốc**, làm giảm lãi của đơn đó. | [BC-09](07-business-cases/BC-09-bao-hanh.md) |
| Bản ghi sức khoẻ pin | `BatteryHealthRecord` | SoH (% dung lượng còn lại), số chu kỳ sạc, chênh lệch điện áp cell — theo thời gian. | [BC-11](07-business-cases/BC-11-xe-dien.md) |
| Phiếu kiểm kê | `StockTake` | Đối chiếu tồn sổ với tồn thực tế. 🔒 Có `snapshotAt` để không tính nhầm giao dịch phát sinh trong lúc đếm. | [BC-12](07-business-cases/BC-12-kiem-ke-kho.md) |
| Nhật ký liên hệ khách | `CustomerContactAttempt` | Ghi mỗi lần gọi/nhắn khách không đến lấy xe. **Bằng chứng pháp lý** nếu phải xử lý xe bị bỏ lại. | [BC-15](07-business-cases/BC-15-xe-bo-quen.md) |
| Làm lại | `rework` | Làm lại do lỗi nội bộ. 🔒 Khác **phát sinh** (khách trả) và **bảo hành** (sau bàn giao). | [BC-14](07-business-cases/BC-14-rework.md) |
| Số duyệt báo giá | `approverPhone` | 🔒 Số nhận OTP duyệt báo giá = `COALESCE(approverPhone, phone)`. | [BC-13](07-business-cases/BC-13-cong-no.md) |

## Khác

| Tiếng Việt | Tên trong code | Định nghĩa |
|---|---|---|
| Nhật ký thao tác | `AuditLog` | Ai, làm gì, lúc nào, giá trị trước/sau. Chỉ thêm, không sửa. |
