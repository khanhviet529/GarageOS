# Ảnh dùng cho dữ liệu mẫu

Toàn bộ ảnh trong thư mục này tải từ [Unsplash](https://unsplash.com) theo
[Unsplash License](https://unsplash.com/license) — cho phép dùng miễn phí, kể cả
cho mục đích thương mại, không bắt buộc ghi công. Dự án vẫn ghi công đầy đủ vì
đó là việc nên làm, và vì `media_asset` đã có sẵn hai cột `license` /
`license_owner` để lưu.

| File | Tác giả | Nguồn | License |
|---|---|---|---|
| `xe-silhouette.jpg` | Sunder Muthukumaran | [unsplash.com/photos/K8ZtyTUCuPI](https://unsplash.com/photos/K8ZtyTUCuPI) | Unsplash License |
| `xe-den-pha.jpg` | Graham Pengelly | [unsplash.com/photos/ifC-l1kPLCs](https://unsplash.com/photos/ifC-l1kPLCs) | Unsplash License |

---

## 🔒 Tiêu chí chọn ảnh — đọc trước khi thêm tấm mới

Dữ liệu mẫu dùng **tên xe tự đặt** (`Aurora`, `Meridian`…), không dùng tên
thương hiệu có thật. Vì thế ảnh phải **không nhận ra được mẫu xe**:

- ❌ không có logo hãng đọc được
- ❌ không có biển số đọc được
- ❌ không có chi tiết nhận dạng đặc trưng (lưới tản nhiệt, cụm đèn đặc trưng
  của một hãng)
- ✅ ưu tiên low-key: xe đọc thành **hình khối**, không thành **logo**

⚠️ Đây không phải khó tính quá mức. Đã loại ba tấm vì đúng những lý do trên:

| Đã loại | Lý do |
|---|---|
| Porsche Panamera | chữ `PORSCHE` giữa đuôi xe, biển số đọc rõ |
| Genesis GV60 | ảnh marketing của chính hãng, nhận ra ngay mẫu |
| Đèn pha BMW | cụm "angel eyes" đặc trưng, thêm banner chữ ở nền |

💡 Gần như mọi ảnh xe chụp bình thường đều nhận ra được mẫu. Phong cách low-key
không phải cách lách — nó vốn là ngôn ngữ quảng cáo xe cao cấp, và ở đây nó giải
cùng lúc ba việc: hợp tông tối của landing, hợp tên xe tự đặt, và không phụ
thuộc vào việc tìm đúng mẫu xe.

## Vì sao ảnh nằm TRONG kho mã

Cách khác là để script tự tải lúc seed. Đã cân nhắc và bỏ: `pnpm db:seed` chạy
trong CI, và nó sẽ biến một lượt CI đang xanh thành phụ thuộc vào việc Unsplash
còn sống. Vài trăm KB trong kho đổi lấy một bước seed tất định là đáng.
