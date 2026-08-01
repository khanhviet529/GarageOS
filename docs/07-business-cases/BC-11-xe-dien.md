# BC-11 — Xe điện và hybrid

**Độ khó:** ⭐⭐⭐⭐ · **Liên quan:** [BC-05](BC-05-xep-khoang-tho.md), [BC-09](BC-09-bao-hanh.md)

> Đây là **điểm khác biệt chính** của hệ thống so với phần mềm garage hiện có
> trên thị trường — vốn được thiết kế quanh quy trình xe xăng.

## 1. Bối cảnh

Thị trường xe Việt Nam đang chuyển dịch nhanh sang xe điện. Các garage độc lập
bắt đầu nhận sửa xe điện bên cạnh xe xăng, và **một xưởng phải phục vụ cả ba loại
động cơ cùng lúc**.

Vấn đề: quy trình bảo dưỡng của ba loại khác nhau về bản chất, không phải khác về
mức độ.

| | `ICE` (xăng/dầu) | `HYBRID` | `BEV` (thuần điện) |
|---|---|---|---|
| Thay dầu động cơ | ✅ Chu kỳ chính | ✅ Có, chu kỳ dài hơn | ❌ **Không có động cơ đốt trong** |
| Bugi, lọc gió, lọc dầu | ✅ | ✅ | ❌ |
| Kiểm tra pin cao áp | ❌ | ✅ | ✅ **Hạng mục chính** |
| An toàn điện cao áp | ❌ | ✅ Bắt buộc | ✅ Bắt buộc |
| Má phanh | Mòn nhanh | Mòn chậm | **Mòn rất chậm** (phanh tái sinh) |
| Cập nhật phần mềm | Hiếm | Có | ✅ Hạng mục thường xuyên |
| Hệ thống làm mát | Làm mát động cơ | Cả hai | **Làm mát pin** |

### Vì sao thiết kế ngây thơ sẽ sai

Nếu danh mục dịch vụ là một danh sách phẳng, cố vấn sẽ **báo giá "thay dầu động
cơ" cho xe thuần điện**. Lỗi này lộ ngay trước khách và huỷ hoại uy tín.

Ngược lại, hạng mục điện cao áp mà giao cho thợ không có chứng chỉ là **rủi ro
tính mạng** — điện áp hệ thống pin xe điện đủ gây tử vong.

## 2. Giải pháp: `powertrain` là thuộc tính gốc, không phải nhãn

🔒 `Vehicle.powertrain` ∈ `{ICE, HYBRID, BEV}` chi phối **bốn** thứ:

```
Vehicle.powertrain
   │
   ├─► ServiceItem.applicablePowertrains    → hạng mục nào được phép báo giá
   ├─► ServiceItem.requiredCertifications   → thợ nào được phân công
   ├─► Bay.capabilities                     → khoang nào phù hợp
   └─► MaintenanceSchedule                  → chu kỳ nhắc bảo dưỡng
```

### 2.1 Lọc danh mục hạng mục — `INV-V-01`

```sql
SELECT * FROM service_item
 WHERE tenant_id = $1
   AND is_active
   AND $vehiclePowertrain = ANY(applicable_powertrains);
```

Ví dụ danh mục:

| Hạng mục | `applicablePowertrains` | `requiredCertifications` |
|---|---|---|
| Thay dầu động cơ | `{ICE, HYBRID}` | `{}` |
| Thay bugi | `{ICE, HYBRID}` | `{}` |
| Thay má phanh | `{ICE, HYBRID, BEV}` | `{}` |
| **Kiểm tra tình trạng pin cao áp (SoH)** | `{HYBRID, BEV}` | `{HV_ELECTRICAL}` |
| **Thay module pin** | `{HYBRID, BEV}` | `{HV_ELECTRICAL}` |
| **Kiểm tra rò điện / cách điện** | `{HYBRID, BEV}` | `{HV_ELECTRICAL}` |
| Bảo dưỡng hệ thống làm mát pin | `{HYBRID, BEV}` | `{HV_ELECTRICAL}` |
| Cập nhật phần mềm điều khiển | `{HYBRID, BEV}` | `{EV_DIAGNOSTICS}` |
| Kiểm tra cổng sạc | `{BEV}` | `{HV_ELECTRICAL}` |

🔒 Enforce ở **hai tầng**:
- UI chỉ hiển thị hạng mục hợp lệ (trải nghiệm)
- Service kiểm tra lại khi tạo `QuotationLine` (bảo vệ thật)

### 2.2 Chứng chỉ thợ — `INV-W-03`

| Mã chứng chỉ | Tên | Bắt buộc cho |
|---|---|---|
| `HV_ELECTRICAL` | An toàn điện cao áp | Mọi hạng mục chạm hệ thống pin/điện cao áp |
| `EV_DIAGNOSTICS` | Chẩn đoán xe điện | Đọc mã lỗi, cập nhật firmware |
| `AC_REFRIGERANT` | Môi chất lạnh | Hệ thống điều hoà (cả 3 loại) |

⚠️ `HV_ELECTRICAL` có **thời hạn** và phải tái cấp. Hệ thống kiểm tra hiệu lực
tại `plannedStart`, không phải `now()` — chi tiết ở [BC-05](BC-05-xep-khoang-tho.md).

### 2.3 Năng lực khoang — `INV-W-07`

| Năng lực | Ý nghĩa |
|---|---|
| `LIFT` | Có cầu nâng |
| `HV_SAFE_ZONE` | Khu vực an toàn điện cao áp: có rào cách ly, biển cảnh báo, dụng cụ cách điện, thiết bị ngắt khẩn cấp |
| `EV_CHARGER` | Có trạm sạc (cần khi chẩn đoán quá trình sạc) |
| `ALIGNMENT` | Cân chỉnh thước lái |

```
Vehicle.powertrain ∈ {HYBRID, BEV} ∧ ServiceItem.category = 'HV_SYSTEM'
  ⟹ 'HV_SAFE_ZONE' ∈ Bay.capabilities
```

⚠️ Giả định về quy định an toàn — cần đối chiếu với tiêu chuẩn thực tế.

### 2.4 Chu kỳ bảo dưỡng

```
MaintenanceSchedule
├── powertrain: ICE
│   └── Thay dầu:     5.000km hoặc 6 tháng
├── powertrain: HYBRID
│   ├── Thay dầu:    10.000km hoặc 12 tháng
│   └── Kiểm tra pin: 20.000km hoặc 12 tháng
└── powertrain: BEV
    ├── Kiểm tra pin: 20.000km hoặc 12 tháng
    ├── Làm mát pin:  40.000km hoặc 24 tháng
    └── Má phanh:     40.000km  (mòn chậm do phanh tái sinh)
```

## 3. Đặc thù trong quy trình

### 3.1 Tiếp nhận xe điện

| Bước bổ sung | Lý do |
|---|---|
| Ghi **% pin** thay vì vạch xăng | `RepairOrder.energyLevelIn` |
| ⚠️ Cảnh báo nếu pin < 20% | Một số hạng mục chẩn đoán cần pin đủ để chạy |
| Ghi số km + **số chu kỳ sạc** nếu đọc được | Dữ liệu đánh giá độ chai pin |

### 3.2 Chẩn đoán

- Đọc mã lỗi qua cổng OBD/chuyên dụng
- Ghi nhận **SoH (State of Health)** của pin — % dung lượng còn lại so với ban đầu
- ⚠️ SoH là dữ liệu quan trọng cần lưu lịch sử theo thời gian để thấy xu hướng chai pin

Đề xuất entity bổ sung:

### `BatteryHealthRecord`
| Thuộc tính | Ghi chú |
|---|---|
| `id` `tenantId` `vehicleId` `repairOrderId` | |
| `measuredAt` | |
| `odometer` | |
| `stateOfHealthPercent` | numeric(5,2) — vd 92.50 |
| `chargeCycles` | int? |
| `cellVoltageDeltaMv` | int? — chênh lệch giữa cell cao nhất và thấp nhất |
| `notes` | |

💡 Biểu đồ SoH theo thời gian là **tính năng bán được**: khách xe điện rất quan
tâm pin còn bao nhiêu, và garage nào cho xem biểu đồ này sẽ giữ được khách.

### 3.3 Quy trình an toàn bắt buộc trước khi làm hệ thống cao áp

⚠️ Đề xuất checklist bắt buộc (giả định, cần đối chiếu tiêu chuẩn):

| # | Bước | Xác nhận |
|---|---|---|
| 1 | Ngắt cầu dao/service plug hệ thống cao áp | Thợ tick + chụp ảnh |
| 2 | Chờ xả tụ (theo hướng dẫn hãng, thường 5–10 phút) | Ghi thời điểm |
| 3 | Đo xác nhận không còn điện áp | Chụp ảnh đồng hồ đo |
| 4 | Đặt biển cảnh báo, rào khu vực | Tick |
| 5 | Sau khi làm xong: kiểm tra cách điện trước khi đóng điện | Bắt buộc, ghi kết quả đo |

🔒 `WorkAssignment` cho hạng mục `HV_SYSTEM` **không chuyển sang `DONE`** nếu
checklist chưa đủ.

### 3.4 Bàn giao

- Ghi lại % pin lúc giao (khách hay thắc mắc "sao pin tụt")
- Với hạng mục cao áp: bắt buộc có kết quả đo cách điện đạt

## 4. Phụ tùng đặc thù

| Vấn đề | Xử lý |
|---|---|
| Phụ tùng cao áp có mã an toàn riêng | `Part.isHighVoltage` — cảnh báo khi xuất kho |
| Pin/module pin giá trị rất cao | ⚠️ Cân nhắc ngưỡng duyệt riêng cho phụ tùng > X đồng |
| Pin cũ là **chất thải nguy hại** | ⚠️ Cần theo dõi việc thu hồi — giai đoạn 2 |
| Phụ tùng điện thường phải đặt hãng | Thời gian chờ dài → `AWAITING_PARTS` kéo dài |

## 5. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Danh mục dịch vụ phẳng, không lọc theo `powertrain` | Báo giá thay dầu cho xe điện — mất uy tín trước khách |
| `powertrain` suy từ model xe thay vì lưu trên xe | Xe độ/hoán cải sai; danh mục model không bao giờ đầy đủ |
| Không có chứng chỉ bắt buộc | **Rủi ro tính mạng thợ** |
| Chỉ kiểm tra có chứng chỉ, không kiểm tra hạn | Chứng chỉ hết hạn vẫn được phân công |
| Chu kỳ bảo dưỡng dùng chung | Nhắc khách xe điện thay dầu → lộ ngay hệ thống làm ẩu |
| Không lưu lịch sử SoH | Mất một tính năng có giá trị thật và mất dữ liệu chẩn đoán |
| Không có checklist an toàn | Rủi ro tai nạn và rủi ro pháp lý cho garage |

## 6. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Thêm "Thay dầu động cơ" vào báo giá xe `BEV` | Bị chặn bởi `INV-V-01` 🧪 |
| 2 | Danh mục hạng mục cho xe `BEV` | Không chứa hạng mục `{ICE}`-only 🧪 |
| 3 | Danh mục cho xe `HYBRID` | Chứa **cả** hạng mục động cơ **và** hạng mục pin 🧪 |
| 4 | Phân công hạng mục pin cho thợ không có `HV_ELECTRICAL` | Bị chặn 🧪 |
| 5 | Thợ có `HV_ELECTRICAL` hết hạn trước `plannedStart` | Bị chặn 🧪 |
| 6 | Hạng mục `HV_SYSTEM` vào khoang không có `HV_SAFE_ZONE` | Bị chặn |
| 7 | Chốt `DONE` hạng mục cao áp khi checklist chưa đủ | Bị chặn |
| 8 | Nhắc bảo dưỡng | Xe `BEV` không nhận nhắc thay dầu 🧪 |
| 9 | Ghi nhiều bản ghi SoH theo thời gian | Truy vấn ra được xu hướng giảm |

## 7. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Xe hybrid cắm sạc (PHEV) có cần loại riêng không? | ⚠️ Giai đoạn 1 gộp vào `HYBRID`; tách nếu quy trình khác đáng kể |
| 2 | Tiêu chuẩn chứng chỉ an toàn điện cao áp ở VN là gì? | ⚠️ Chưa xác minh — hệ thống chỉ mô hình hoá cơ chế, tên chứng chỉ do tenant tự định nghĩa |
| 3 | Có cần theo dõi thu hồi pin cũ (chất thải nguy hại) không? | ⚠️ Giai đoạn 2 |
| 4 | Đọc SoH tự động từ máy chẩn đoán? | ⚠️ Giai đoạn 1 nhập tay; tích hợp thiết bị là dự án riêng |
| 5 | Xe điện của hãng khác nhau có giao thức chẩn đoán khác nhau | ⚠️ Ngoài phạm vi phần mềm quản lý |
