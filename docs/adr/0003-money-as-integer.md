# ADR-0003 — Tiền là số nguyên, đơn vị đồng

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Hệ thống tính tiền ở nhiều nơi: báo giá, hoá đơn, thanh toán, phân bổ bảo hiểm,
giá vốn, lãi/lỗ. Sai số dù nhỏ cũng làm **tổng ≠ tổng các dòng** — khách hàng và
kiểm toán đều phát hiện ngay, và mất niềm tin vào toàn hệ thống.

Đơn vị tiền tệ duy nhất là **VND**, không có đơn vị nhỏ hơn đồng đang lưu hành.

## Quyết định

🔒 **Mọi số tiền là số nguyên, đơn vị đồng, kiểu `bigint`.**

| Tầng | Kiểu |
|---|---|
| Database | `bigint` |
| TypeScript | `number` (an toàn tới 2^53 ≈ 9×10¹⁵ đồng) |
| API trên dây | Số nguyên JSON: `850000` |
| Hiển thị | Định dạng ở tầng giao diện: `850.000 ₫` |

🔒 **Làm tròn thực hiện ở từng dòng, không ở tổng:**

```
lineTotal = round(quantity × unitPrice) − discountAmount + taxAmount
total     = Σ lineTotal            ← cộng số nguyên, không làm tròn lại
```

Kiểm chứng bằng **test kiến trúc** quét `information_schema`:

```sql
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (column_name LIKE '%amount%' OR column_name LIKE '%price%'
        OR column_name LIKE '%total%' OR column_name LIKE '%cost%')
   AND data_type NOT IN ('bigint','integer');   -- phải trả về 0 dòng
```

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **`float`/`double`** | Tự nhiên với lập trình viên | 🔒 Sai số nhị phân: `0.1 + 0.2 ≠ 0.3`; cộng dồn hàng nghìn dòng thì lệch thấy được | ❌ Không bao giờ dùng cho tiền |
| **`numeric(15,2)`** | Chính xác thập phân | Chậm hơn số nguyên; JS không có kiểu decimal gốc → phải dùng thư viện ở mọi tầng; VND không có phần lẻ | ❌ Thêm phức tạp không đổi lại lợi ích |
| **Chuỗi trên dây** | Tránh giới hạn `Number` của JS | 850.000₫ còn cách giới hạn 2^53 rất xa; chuỗi thì phải parse ở mọi nơi | ❌ Giải quyết vấn đề không tồn tại |
| **`bigint` đơn vị đồng** | Chính xác tuyệt đối; nhanh; JS xử lý trực tiếp | Không biểu diễn được phần lẻ (không cần với VND) | ✅ **Chọn** |

## Hệ quả

### Tích cực

- 🔒 Không bao giờ có sai số làm tròn tích luỹ
- Tổng **luôn** bằng tổng các dòng, sai lệch 0đ
- So sánh bằng `=` an toàn (với `float` thì không)
- Test kiến trúc tự động áp dụng cho bảng thêm sau này

### Tiêu cực — phải chấp nhận

- ⚠️ Không hỗ trợ đa tiền tệ. Nếu sau này cần USD (có phần cent), phải đổi sang
  mô hình `(amount, currency, minorUnitScale)` — **đây là migration lớn**
- ⚠️ Tính phần trăm (chiết khấu, thuế) luôn phải làm tròn tường minh; lập trình
  viên phải nhớ `round()` ở đúng chỗ
- ⚠️ Chia tiền (phân bổ bảo hiểm theo tỉ lệ) có thể để dư 1đ — cần quy tắc dồn
  phần dư vào dòng cuối, viết rõ trong code
- ⚠️ Giá vốn bình quân gia quyền về bản chất là số thập phân → phải làm tròn về
  đồng khi lưu, chấp nhận sai số ≤ 1đ mỗi lần nhập kho

## Xem lại khi nào

- Có yêu cầu đa tiền tệ
- Có nghiệp vụ cần độ chính xác dưới 1 đồng (không lường trước được ở ngành này)
