# Hướng dẫn sử dụng — Phần mềm xưởng

Dành cho **cố vấn dịch vụ, quản lý xưởng, quản lý kho, kế toán và thợ**.
Không cần biết kỹ thuật để đọc tài liệu này.

Giao diện tham chiếu: `D:\pencil-welcome.pen`, hàng `XƯỞNG — *`.

---

## Trước khi bắt đầu — ba điều quyết định mọi thứ khác

Ba quy tắc dưới đây không phải tuỳ chọn cấu hình. Chúng nằm trong cơ sở dữ liệu,
nên **không ai bấm nút nào để bỏ qua được** — kể cả chủ xưởng.

1. **Không có báo giá được khách duyệt thì không được sửa xe.** Phát sinh giữa
   chừng phải lập báo giá bổ sung và xin duyệt lại.
2. **Sổ kho và hoá đơn đã phát hành thì không sửa, không xoá.** Ghi sai thì lập
   chứng từ đảo — vết sai và vết sửa đều ở lại.
3. **Tiền luôn tính theo từng dòng rồi mới cộng.** Con số trên màn hình và con số
   trong hoá đơn không bao giờ lệch nhau vì làm tròn.

Nếu một thao tác bị hệ thống từ chối, gần như chắc chắn nó chạm vào một trong ba
điều trên. Đọc kỹ thông báo lỗi trước khi gọi hỗ trợ — thông báo có ghi lý do.

---

## 1. Đăng nhập

1. Mở địa chỉ xưởng của bạn, nhập email và mật khẩu.
2. Chọn chi nhánh đang làm việc (nếu tài khoản thuộc nhiều chi nhánh).

Bạn **chỉ nhìn thấy dữ liệu của chi nhánh đang chọn**. Đây không phải bộ lọc —
đổi chi nhánh là đổi toàn bộ dữ liệu bạn có quyền chạm tới.

Quên mật khẩu thì nhờ quản lý đặt lại; hệ thống khoá tài khoản 15 phút sau 5 lần
sai liên tiếp.

---

## 2. Tiếp nhận xe

Màn hình: **Tiếp nhận xe**.

1. **Tìm khách bằng biển số.** Gõ biển số trước, đừng tạo khách mới ngay — phần
   lớn xe vào xưởng lần hai đã có hồ sơ. Biển số được chuẩn hoá tự động, gõ
   `30A-123.45` hay `30a12345` đều ra cùng một xe.
2. Nếu là xe mới: nhập biển số, hãng, dòng, đời, **loại động cơ** (xăng / hybrid
   / điện) và số VIN nếu có.

   > Chọn đúng loại động cơ. Nó quyết định danh mục dịch vụ hiện ra ở bước báo
   > giá và quyết định thợ nào được phân công. Chọn sai thì báo giá sẽ thiếu
   > hạng mục hoặc thừa hạng mục không áp dụng được.

3. Nhập **số km hiện tại**, ghi **tình trạng bên ngoài** và **tài sản khách để
   lại** (đồ trong xe, số lượng chìa khoá).
4. Ghi **lời khai của khách** bằng đúng từ khách nói. Đừng dịch sang thuật ngữ
   kỹ thuật ở bước này — chẩn đoán là việc của thợ, còn lời khai là bằng chứng
   nếu sau này có tranh cãi về phạm vi công việc.
5. Bấm **Tạo đơn**. Hệ thống sinh **mã đơn** và **link tra cứu** cho khách.

Đưa link (hoặc mã đơn) cho khách ngay lúc này. Khách xem tiến độ được, không cần
gọi điện hỏi.

---

## 3. Lập báo giá

Màn hình: **Chi tiết đơn** → thẻ **Báo giá**.

1. Thêm **dòng công** (dịch vụ) và **dòng phụ tùng**. Ô tìm kiếm chỉ hiện những
   mục áp dụng cho loại động cơ của xe.
2. Giá phụ tùng lấy từ bảng giá đang hiệu lực và **được chụp lại vào báo giá**.
   Bảng giá đổi ngày mai cũng không làm đổi báo giá đã gửi hôm nay.
3. Chiết khấu nhập **theo từng dòng**. Hệ thống kiểm tra hạn mức chiết khấu theo
   chức danh của bạn — vượt hạn mức thì không lưu được, không có đường vòng.
4. Xem lại tổng, bấm **Gửi cho khách**.

### Khách duyệt thế nào

Khách mở link tra cứu trên điện thoại, nhập mã OTP gửi về số của họ, rồi
**duyệt hoặc từ chối từng hạng mục**. Không bắt buộc duyệt cả tờ.

Trạng thái đổi ngay ở màn hình của bạn. Không cần bấm làm mới.

### Sau khi gửi thì không sửa được nữa

Báo giá đã gửi bị đóng băng. Muốn đổi thì:

- Khách **chưa duyệt** → thu hồi rồi gửi lại bản mới.
- Khách **đã duyệt** → lập **báo giá bổ sung** cho phần phát sinh.

Đây là chỗ hay bị hiểu nhầm nhất khi mới dùng. Lý do: nếu sửa được báo giá đã
duyệt thì chữ "khách đã đồng ý" mất hết ý nghĩa.

---

## 4. Giữ chỗ phụ tùng và xuất kho

Khách vừa duyệt xong, hệ thống **giữ chỗ** phụ tùng ngay — chưa trừ tồn, nhưng
đơn khác không lấy được số hàng đó.

| Con số | Nghĩa |
|---|---|
| Tồn thực tế | Số đang nằm trong kho |
| Đã giữ | Đã hứa cho đơn khác, chưa xuất |
| Khả dụng | Số bạn thực sự dùng được = tồn thực tế − đã giữ |

Luôn nhìn cột **khả dụng**, đừng nhìn tồn thực tế.

Nếu kho không đủ, hệ thống giữ phần có sẵn và báo rõ còn thiếu bao nhiêu. Đừng
sửa số trong báo giá cho khớp tồn — đặt hàng hoặc báo khách.

**Xuất kho** khi thợ thực sự lấy hàng, không xuất trước cho tiện. Xuất rồi thì
tồn giảm và không lùi lại được bằng cách xoá — chỉ **trả hàng về kho** bằng một
phiếu ngược lại.

Giữ chỗ quá hạn sẽ tự nhả để hàng không bị treo vô hạn.

---

## 5. Phân công khoang và thợ

Màn hình: **Lịch xưởng**.

Kéo đơn vào ô khoang × khung giờ. Hệ thống chặn ba trường hợp:

- Khoang đã có xe khác trong khung giờ đó.
- Thợ đã nhận việc khác cùng lúc.
- Thợ **thiếu chứng chỉ** cho loại xe này — rõ nhất là xe điện: không có chứng
  chỉ điện cao áp thì không được phân công, bất kể xưởng đang gấp.

Không có nút bỏ qua. Trường hợp thứ ba là an toàn tính mạng, không phải quy trình
hành chính.

---

## 6. Thợ làm việc

Thợ dùng **app trên điện thoại**, không dùng màn hình này.

- Nhận việc → **bấm bắt đầu** → làm → **bấm kết thúc**.
- Tạm dừng phải **chọn lý do** (chờ phụ tùng, chờ khách duyệt, hết ca…). Lý do
  này là dữ liệu, không phải ghi chú — báo cáo hiệu suất đọc chính nó.
- Phát sinh ngoài báo giá: thợ **báo phát sinh** ngay trên app, cố vấn nhận được
  và lập báo giá bổ sung. **Thợ không tự ý làm thêm rồi tính tiền sau.**

🔒 Thợ **không nhìn thấy tiền**: không giá, không tổng đơn, không công nợ. Đây là
thiết kế có chủ ý, không phải thiếu tính năng.

---

## 7. Kiểm tra chất lượng và làm lại

Sau khi thợ báo xong, người kiểm tra **đạt** hoặc **không đạt**.

Không đạt thì phải **phán định nguyên nhân**: do thợ, do phụ tùng, hay do hạng
mục nằm ngoài phạm vi đã duyệt. Chọn đúng — chỉ số chất lượng của thợ tính từ ô
này, và tiền làm lại tính về đâu cũng từ ô này.

---

## 8. Hoá đơn, thanh toán, công nợ

Màn hình: **Chi tiết đơn** → **Hoá đơn**.

1. Hoá đơn lập từ **công việc thực tế đã làm**, không phải từ báo giá. Hai con số
   lệch nhau là chuyện bình thường — khách từ chối một hạng mục chẳng hạn.
2. Kiểm tra kỹ rồi bấm **Phát hành**.

   > Phát hành xong thì hoá đơn **bất biến**. Sai thì lập **hoá đơn điều chỉnh**,
   > không sửa đè. Đây là yêu cầu kế toán, không phải giới hạn phần mềm.

3. Ghi nhận thanh toán từng lần. Trả thiếu thì phần còn lại thành **công nợ** và
   hiện ở màn hình Báo cáo.

---

## 9. Bảo hành

Xe quay lại trong hạn bảo hành: mở đơn cũ, tạo **đơn bảo hành** từ đó.

Chi phí của đơn bảo hành quy về **đơn gốc**, để biết thật sự việc sửa lần đầu
tốn bao nhiêu. Đừng mở đơn mới độc lập — làm thế là mất dấu vết.

Bảo hành có **hai hạn**: theo thời gian và theo số km. Hết một trong hai là hết
hạn.

---

## 10. Kho

Màn hình: **Kho**.

| Việc | Cách làm |
|---|---|
| Nhập hàng | Lập phiếu nhập, ghi số lượng và giá vốn |
| Xuất cho đơn | Làm từ màn hình đơn, không làm ở đây |
| Trả hàng về kho | Phiếu trả, tham chiếu phiếu xuất gốc |
| Kiểm kê | Chụp tồn → đếm thực tế → nhập số đếm → **hai người duyệt** rồi mới sinh phiếu bù |

Giá vốn tính **bình quân**, hệ thống tự làm. Không sửa tay.

🔒 Không có nút xoá dòng sổ kho. Mọi sai sót sửa bằng phiếu ngược chiều.

---

## 11. Báo cáo

Doanh thu, công nợ, hiệu suất thợ, vòng quay kho, tỉ lệ làm lại.

Số liệu lấy trực tiếp từ chứng từ, không phải bảng tổng hợp cập nhật định kỳ —
nên **không có độ trễ**, và cũng không có cách nào "sửa báo cáo" mà không sửa
chứng từ gốc.

---

## Những lỗi hay gặp

| Hiện tượng | Nguyên nhân thật |
|---|---|
| "Không sửa được báo giá" | Đã gửi cho khách. Dùng báo giá bổ sung |
| "Không phân công được thợ" | Thiếu chứng chỉ, hoặc trùng lịch |
| "Không xuất được kho" | Nhìn nhầm tồn thực tế thay vì khả dụng |
| "Không thấy đơn của chi nhánh khác" | Đúng như thiết kế. Đổi chi nhánh ở góc trên |
| "Khách bảo không nhận được OTP" | Kiểm tra số điện thoại trong hồ sơ khách |
| "Hoá đơn sai, muốn sửa" | Phát hành rồi. Lập hoá đơn điều chỉnh |

---

## Ai làm được gì

| | Cố vấn | Thợ | QL kho | QL xưởng | Kế toán |
|---|:--:|:--:|:--:|:--:|:--:|
| Tiếp nhận xe | ✓ | | | ✓ | |
| Lập và gửi báo giá | ✓ | | | ✓ | |
| Duyệt chiết khấu vượt hạn mức | | | | ✓ | |
| Phân công thợ | ✓ | | | ✓ | |
| Bấm giờ công | | ✓ | | | |
| Nhập, xuất, kiểm kê kho | | | ✓ | ✓ | |
| Phát hành hoá đơn | | | | ✓ | ✓ |
| Xem tiền và công nợ | ✓ | | | ✓ | ✓ |

Quyền là **danh sách cho phép**: một vai chỉ làm được đúng những việc được ghi
tên. Không có kế thừa ngầm.
