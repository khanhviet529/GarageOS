# ADR-0004 — `powertrain` là thuộc tính gốc của xe

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Thị trường xe Việt Nam đang chuyển dịch nhanh sang xe điện. Một garage phải phục
vụ đồng thời xe xăng, hybrid và thuần điện — và quy trình bảo dưỡng của ba loại
**khác nhau về bản chất**, không phải khác về mức độ:

- Xe thuần điện **không có** thay dầu động cơ, bugi, lọc gió, lọc dầu
- Xe điện/hybrid **có** kiểm tra pin cao áp, an toàn điện, làm mát pin, cập nhật
  phần mềm — những hạng mục xe xăng không có
- Má phanh xe điện mòn chậm hơn nhiều do phanh tái sinh → chu kỳ khác

Phần mềm garage hiện có trên thị trường được thiết kế 5–10 năm trước, quanh quy
trình xe xăng. Đây là điểm mù có thể khai thác được.

## Quyết định

**`Vehicle.powertrain ∈ {ICE, HYBRID, BEV}` là thuộc tính bắt buộc, lưu trên
chính bản ghi xe**, và chi phối bốn thứ:

```
Vehicle.powertrain
   ├─► ServiceItem.applicablePowertrains    → hạng mục nào được báo giá  (INV-V-01)
   ├─► ServiceItem.requiredCertifications   → thợ nào được phân công     (INV-W-03)
   ├─► Bay.capabilities                     → khoang nào phù hợp         (INV-W-07)
   └─► MaintenanceSchedule                  → chu kỳ nhắc bảo dưỡng
```

```sql
applicable_powertrains  powertrain[] NOT NULL,   -- vd: {ICE, HYBRID}
CONSTRAINT has_powertrain CHECK (array_length(applicable_powertrains, 1) > 0)
```

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **Danh mục dịch vụ phẳng, không phân loại** | Đơn giản nhất | 🔒 Báo giá "thay dầu động cơ" cho xe thuần điện — lộ ngay trước khách | ❌ Không chấp nhận được |
| **Suy `powertrain` từ `VehicleModel`** | Không phải nhập tay | Danh mục model **không bao giờ đầy đủ** ở thị trường VN; xe độ/hoán cải tồn tại; xe cũ thiếu dữ liệu | ❌ Dữ liệu tham chiếu không đáng tin |
| **Cờ boolean `isElectric`** | Đơn giản | Không biểu diễn được hybrid — loại chiếm tỉ trọng đáng kể và có **cả hai** nhóm hạng mục | ❌ Mất một loại xe |
| **Enum trên `Vehicle` + mảng trên `ServiceItem`** | Chính xác; hybrid xử lý tự nhiên; mở rộng được | Phải nhập tay lúc tạo xe; danh mục phải khai báo đúng | ✅ **Chọn** |

## Hệ quả

### Tích cực

- 🔒 Không thể báo giá hạng mục không tương thích (`INV-V-01` chặn ở service)
- Hybrid xử lý tự nhiên: mảng `{ICE, HYBRID}` và `{HYBRID, BEV}` giao nhau đúng
- Chứng chỉ an toàn điện cao áp gắn được vào đúng hạng mục → **giảm rủi ro tính mạng**
- Chu kỳ bảo dưỡng đúng theo loại xe → không nhắc khách xe điện thay dầu
- 💡 Là **điểm khác biệt bán được** so với phần mềm hiện có trên thị trường
- Thêm loại động cơ mới (ví dụ pin nhiên liệu) chỉ cần thêm giá trị enum

### Tiêu cực — phải chấp nhận

- ⚠️ **Bắt buộc nhập `powertrain` khi tạo xe** → thêm một trường lúc tiếp nhận,
  nhân viên có thể chọn sai. Giảm nhẹ: gợi ý theo hãng/dòng xe phổ biến.
- ⚠️ Danh mục dịch vụ phải khai báo `applicablePowertrains` cho **mọi** hạng mục
  → công sức thiết lập ban đầu lớn hơn
- ⚠️ Khi nhập dữ liệu cũ từ Excel, `powertrain` thường **không có** → phải suy
  đoán hoặc hỏi lại từng xe ([EC-M-01](../08-edge-cases.md))
- ⚠️ Xe hoán cải (xe xăng độ thành điện) là ngoại lệ hiếm nhưng có thật — mô hình
  xử lý được vì `powertrain` lưu trên xe, không suy từ model
- ⚠️ PHEV (hybrid cắm sạc) hiện gộp vào `HYBRID`; nếu quy trình khác đáng kể thì
  phải tách giá trị enum mới — `ALTER TYPE ... ADD VALUE` không đảo ngược được

## Xem lại khi nào

- PHEV cần quy trình riêng khác `HYBRID`
- Xuất hiện loại động cơ mới đáng kể (pin nhiên liệu hydro)
- Có nguồn dữ liệu model xe đủ tin cậy để suy `powertrain` tự động
