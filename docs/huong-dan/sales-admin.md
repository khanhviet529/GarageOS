# Hướng dẫn sử dụng — Sales Admin

Dành cho **biên tập nội dung, người xuất bản, quản lý bán hàng và tư vấn viên**.

Sales Admin là nơi bạn dựng trang bán xe công khai và xử lý nhu cầu khách để lại.
Nó **tách hẳn** khỏi phần mềm xưởng: đăng nhập riêng, quyền riêng, dữ liệu riêng.

Giao diện tham chiếu: `D:\pencil-welcome.pen`, hàng `SALES ADMIN — *`.

---

## Nguyên tắc xuyên suốt: hiển thị ≠ giao dịch

Sales Admin **tính và hiển thị** giá lăn bánh, khoản trả góp tham khảo, ưu đãi
và khả năng giao xe. Nó **không** thu tiền, không xét duyệt hồ sơ vay, không ký
hợp đồng.

Vì vậy mọi con số suy ra đều hiện kèm nhãn *ước tính* và nguồn dữ liệu. Đừng gỡ
nhãn đó đi bằng cách viết lại nội dung — một con số tiền không nhãn trên chính
domain của đại lý đọc như một lời chào giá.

---

## Bố cục màn hình

Thanh bên trái chia bốn nhóm:

| Nhóm | Gồm | Ai dùng nhiều nhất |
|---|---|---|
| **BÁN HÀNG** | Tổng quan · Leads | Quản lý và tư vấn bán hàng |
| **CATALOG** | Xe · Danh mục · Đánh giá | Biên tập và quản lý bán hàng |
| **WEBSITE** | Trang · Tin tức · Biểu mẫu · Thư viện ảnh · Lịch sử xuất bản | Biên tập và người xuất bản |
| **CẤU HÌNH** | Giao diện · Thông tin doanh nghiệp · Người dùng & quyền | Chủ hệ thống |

Không có mục **Trang chủ** riêng: trình soạn trang chủ mở ra từ danh sách ở màn
**Trang**, giống mọi CMS. Một trang không có hai đường vào ở hai cấp khác nhau.

---

## 1. Vòng đời nội dung: nháp → duyệt → công khai

Mọi thứ bạn sửa đều vào **bản nháp**. Khách không thấy gì cho tới khi có người
bấm **Xuất bản**.

Quan trọng: **quyền sửa và quyền xuất bản là hai quyền khác nhau.**

- Vai **Biên tập nội dung** sửa được mọi thứ, kể cả giá. Bấm Xuất bản thì hệ
  thống tạo **yêu cầu duyệt**.
- Vai **Xuất bản nội dung** đọc bản nháp, so với bản đang chạy, rồi quyết định.

Một người có thể giữ cả hai vai. Nhưng hệ thống phải cho phép tách — vì nội dung
sai trên trang bán hàng là sai trước mặt khách.

Khi xuất bản, **toàn bộ nội dung của trang đi cùng một lượt**. Không có chuyện
ảnh mới đi kèm giá cũ.

> **Ngoại lệ duy nhất:** *Tồn & giao xe* không đi qua bước xuất bản. Sửa là hiện
> ngay. Lý do ở mục 3.6.

---

## 2. Thông tin doanh nghiệp — làm trước tiên

Màn hình: **Thông tin doanh nghiệp**.

Đây là nguồn duy nhất cho tên thương hiệu, logo, hotline, email, địa chỉ chi
nhánh và giờ mở cửa. Chân trang, trang liên hệ, thẻ chia sẻ mạng xã hội và dữ
liệu có cấu trúc cho Google đều **đọc từ đây**. Sửa một chỗ, cả trang đổi theo.

⚠️ **Số điện thoại và email ở màn hình này là kênh liên hệ của doanh nghiệp — ai
cũng đọc được.** Đừng điền số cá nhân của nhân viên. Thông tin tài khoản cá nhân
nằm ở chỗ khác (mục 8), không hiển thị công khai.

Ô **Hiện** ở bảng chi nhánh quyết định chi nhánh đó có lên landing hay không.
Kho và xưởng nội bộ thì tắt.

---

## 3. Thêm và sửa xe

Màn hình: **Xe** → chọn xe → bảy thẻ.

### 3.1 Thông tin chung
Tên, danh mục, mô tả (soạn thảo có định dạng), trạng thái.

Trình soạn thảo cho phép **đậm, nghiêng, danh sách, tiêu đề, bảng, ảnh**. Không
cho dán HTML hay mã nhúng — đó là cửa cho mã độc chạy trên chính domain của bạn.
Cần nhúng video thì dùng khối video ở trình soạn trang.

### 3.2 Phiên bản & giá
Mỗi phiên bản một mức giá riêng. Điền:

- **Giá niêm yết** — bắt buộc. Để trống thì trang hiện "Liên hệ".
- **Giá thuê pin** — chỉ xe điện dùng.
- **Giá lăn bánh** — hệ thống tự tính từ bảng phí theo tỉnh: trước bạ, biển số,
  đăng kiểm, đường bộ, bảo hiểm. Bạn **không nhập tay tổng lăn bánh**; nhập tay
  là tạo ra một con số không ai kiểm được.

### 3.3 Màu sắc
Mỗi màu có mã màu, loại (đơn / kim loại / đặc biệt), **phụ thu**, và áp dụng cho
phiên bản nào.

Bật *Hiện phụ thu ngay cạnh tên màu*. Đừng để khách phát hiện giá đội lên ở bước
sau — đó là cách nhanh nhất để mất một lead đã ấm.

### 3.4 Ảnh & 360°
- **Ảnh bìa** tỉ lệ 16:9 — dùng cho kết quả tìm kiếm và khi chia sẻ link.
- Thư viện phân loại ngoại thất / nội thất / chi tiết / theo màu.
- **Mọi ảnh phải có mô tả (alt).** Hệ thống chặn xuất bản nếu còn ảnh thiếu mô tả
  — vừa để người khiếm thị dùng được trang, vừa để Google hiểu ảnh.
- Xoay 360° ngoại thất: bộ 36 khung, chỉ tải khi khách chạm vào.
- Mỗi màu nên có ít nhất một ảnh, nếu không thì tắt màu đó đi.

### 3.5 Ưu đãi & trả góp
- **Ưu đãi** có ngày bắt đầu và ngày kết thúc. Hết hạn là **tự biến mất** khỏi
  trang, không cần ai tắt tay.
- **Trả góp**: đặt trả trước tối thiểu, lãi suất theo ngân hàng, các kỳ hạn cho
  khách chọn. Khối bên phải cho bạn xem đúng những gì khách sẽ thấy.

Con số trả góp là **ước tính tham khảo**. Hệ thống không thay ngân hàng cam kết
lãi suất và không xét duyệt hồ sơ.

### 3.6 Tồn & giao xe
Khai báo theo **chi nhánh**: trạng thái (*Sẵn xe* / *Sắp về* / *Đặt hàng*), thời
gian giao dự kiến, phiên bản và màu đang có.

🔒 **Không có ô nhập số lượng xe.** Hệ thống không quản tồn vật lý theo VIN, nên
hiện "còn 2 xe" là nói một điều mình không biết.

Đây cũng là lý do thẻ này **không đi qua bước xuất bản**: nhân viên chi nhánh sửa
nó vài lần mỗi tuần. Nếu bắt nó đi qua xuất bản thì mỗi lần đổi *Sắp về* thành
*Sẵn xe* sẽ đẩy luôn cả nội dung marketing đang soạn dở ra công khai.

### 3.7 SEO
Tiêu đề (≤ 60 ký tự), mô tả (≤ 160), đường dẫn, ảnh chia sẻ. Khối *Xem trước
trên Google* cho thấy kết quả trông ra sao.

Đổi đường dẫn của trang đang chạy sẽ làm hỏng link cũ. Nếu buộc phải đổi, thêm
một dòng chuyển hướng ở **Trang**.

---

## 4. Trang chủ và các trang khác

Màn hình: **Trang** (danh sách) → bấm *Trang chủ* để mở **trình soạn trang chủ**.

Landing được dựng theo mô hình **mỗi khối một màn hình**: cuộn là lật trang. Nên
trình soạn không xếp khối thành một dải dọc nữa mà liệt kê **bảy màn hình**, mỗi
dòng có ảnh thu nhỏ và nhãn *1 màn · 900px*. Kéo để đổi thứ tự, con mắt để ẩn
tạm, thùng rác để bỏ.

Thư viện bên trái phân biệt khối **đang dùng** và khối **có sẵn chưa dùng** (dải
logo đối tác, đánh giá khách hàng, câu hỏi thường gặp, bài viết mới nhất).

Cột phải đổi theo khối đang chọn. Ví dụ khối *Bóc giá lăn bánh*: chọn xe dùng để
bóc, tỉnh mặc định, số chặng cuộn, và bốn công tắc — trong đó **Chạy số khi cuộn**
tắt được cho người không chịu được hiệu ứng chuyển động.

Trước khi xuất bản, bấm qua **ba thiết bị** ở đầu canvas. Khối nhiều cột trên máy
tính sẽ xếp dọc trên điện thoại — phần lớn khách vào bằng điện thoại.

Ở màn **Trang** bạn còn quản lý:

- Danh sách trang (Giới thiệu, Liên hệ, Tin tức, Chính sách…).
- **Menu đầu trang** — kéo để đổi thứ tự, tắt mục trỏ tới trang còn ở bản nháp.
- **Chân trang** — ba cột liên kết. Thông tin liên hệ ở chân trang lấy từ Thông
  tin doanh nghiệp, không nhập lại.
- **Chuyển hướng** và trang 404.

Trang *Danh sách xe* và *Chi tiết xe* do hệ thống sinh từ catalog. Bố cục của
chúng nằm ở **Giao diện**, không sửa từng trang một.

---

## 4b. Tin tức

Màn hình: **Tin tức** (danh sách) và **Soạn bài viết**.

Bài viết đi cùng vòng đời nháp → duyệt → công khai như mọi nội dung khác, và có
thêm **hẹn giờ đăng** — bài về sự kiện đặt lịch lên đúng ngày, không cần ai thức
chờ.

- **Chuyên mục** dùng chung với bộ lọc trên trang Tin tức của landing. Đổi tên
  chuyên mục là đổi cả nhãn ngoài trang.
- **Bài nổi bật** chỉ được chọn **một bài**. Bật bài mới thì bài cũ tự tắt — đó
  là khối lớn đầu trang Tin tức, không phải danh sách.
- Trình soạn thảo dùng **cùng bộ khối** với mô tả xe: định dạng chữ, danh sách,
  trích dẫn, ảnh, bảng. Không dán được HTML — cùng lý do ở mục 3.1.
- Checklist bên phải chặn đăng khi thiếu ảnh bìa 16:9, thiếu mô tả thay thế,
  hoặc chưa chọn chuyên mục.

## 5. Giao diện

Màn hình: **Giao diện**.

Màu thương hiệu, cặp phông chữ, mật độ bố cục, bo góc, kiểu nút. Landing đọc
thẳng từ đây — đổi ở đây là đổi toàn bộ trang.

Bảng **Kiểm tra tương phản** tính lại ngay khi bạn đổi màu. Ngưỡng cần đạt là
**4,5 : 1** cho chữ thường. Dưới ngưỡng thì có người thật không đọc được nội
dung của bạn — thường là người lớn tuổi, đúng nhóm khách mua xe.

---

## 6. Biểu mẫu và lead

Màn hình: **Biểu mẫu**.

Cấu hình các trường của form, nội dung hiện sau khi khách bấm gửi, và **lead về
tay ai** (chia theo chi nhánh khách chọn; ngoài giờ thì vào hàng chờ).

Trường **"Đồng ý cho xử lý dữ liệu"** là bắt buộc, không tắt được.

### Xử lý lead

Màn hình **Leads**: danh sách hoặc bảng Kanban theo trạng thái. Mở một lead để
xem nguồn, xe quan tâm, chi nhánh và toàn bộ lịch sử liên hệ.

- **Gán** cho tư vấn viên (quản lý làm).
- **Ghi hoạt động** sau mỗi lần gọi hoặc gặp. Ghi ngay, đừng để cuối ngày.
- Chuyển trạng thái theo tiến triển thật, không theo mong muốn.

### Dữ liệu cá nhân của khách

Lead chứa tên và số điện thoại của người thật. Vì vậy:

- Lead không chuyển đổi bị **xoá phần nhận dạng sau 24 tháng**, tự động.
- Khách yêu cầu xoá sớm: bấm **Xoá dữ liệu cá nhân** ở màn chi tiết lead. Dòng
  vẫn ở lại để giữ số liệu chuyển đổi, nhưng tên, số điện thoại và email biến
  mất thật — không phải chỉ ẩn đi.
- Chỉ **quản lý bán hàng** và **chủ hệ thống** làm được việc này.

---

## 7. Lịch sử xuất bản

Xem ai xuất bản gì, lúc nào. So sánh hai bản và **quay lại bản cũ** nếu bản mới
có vấn đề.

Riêng thay đổi giá còn có **nhật ký giá** ở thẻ *Ưu đãi & trả góp*: giá cũ, giá
mới, ai sửa, lúc nào. Nhật ký này chỉ ghi thêm, không sửa được — vì giá công bố
là thứ khách chụp màn hình rồi mang đến showroom.

---

## 8. Tài khoản của bạn

Bấm vào tên mình ở góc dưới thanh bên: đổi tên hiển thị, số điện thoại nội bộ,
ảnh đại diện, mật khẩu, và bật xác thực hai bước.

Thông tin này **không lên landing**. Nó dùng để đồng nghiệp nhận ra bạn trong
nhật ký thao tác và để hệ thống gửi thông báo lead cho đúng người.

Vai **Chủ hệ thống** và **Xuất bản nội dung** bắt buộc bật xác thực hai bước.

---

## Những lỗi hay gặp

| Hiện tượng | Nguyên nhân thật |
|---|---|
| Sửa xong mà trang ngoài không đổi | Chưa xuất bản, hoặc yêu cầu duyệt chưa ai duyệt |
| Bấm Xuất bản không ăn | Bạn chỉ có quyền sửa. Hệ thống đã gửi yêu cầu duyệt |
| Không xuất bản được | Còn ảnh thiếu mô tả, hoặc thiếu trường bắt buộc |
| Ưu đãi vẫn hiện dù hết hạn | Kiểm tra lại giờ kết thúc — hệ thống dùng giờ máy chủ |
| Màu xe không hiện ô chọn | Màu đó chưa có ảnh nào |
| Trang hiện "Liên hệ" thay vì giá | Phiên bản chưa nhập giá niêm yết |
| Lead không về tay ai | Khách không chọn chi nhánh, hoặc gửi ngoài giờ làm |

---

## Ai làm được gì

| | Chủ hệ thống | Biên tập | Xuất bản | QL bán hàng | Tư vấn |
|---|:--:|:--:|:--:|:--:|:--:|
| Sửa nội dung, giá, ưu đãi | ✓ | ✓ | | | |
| Xuất bản ra công khai | ✓ | | ✓ | | |
| Đổi thông tin doanh nghiệp | ✓ | | | | |
| Xem lead | ✓ | | | ✓ | ✓ |
| Gán lead | ✓ | | | ✓ | |
| Xoá dữ liệu cá nhân của lead | ✓ | | | ✓ | |
| Xem đơn sửa chữa của xưởng | | | | | |

Cột cuối trống hoàn toàn là có chủ ý: **không vai nào của Sales Admin xem được
đơn sửa chữa, hoá đơn hay công nợ của xưởng.** Hai hệ thống dùng chung nền tảng
nhưng không dùng chung quyền.
