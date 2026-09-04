# Hướng thị giác cho landing bán xe

**Mã tài liệu:** DES-LS-002<br>
**Ngày:** 2026-09-03<br>
**Thay cho:** phần thị giác của [Hybrid Digital Showroom](2026-08-12-automotive-landing-experience-design.md)<br>
**Giao diện:** `D:\pencil-welcome.pen`, hàng `LANDING — *`

---

## 1. Nguồn tham chiếu và lấy gì từ mỗi nguồn

Bốn nguồn, mỗi nguồn giải một bài toán khác nhau. Trộn cả bốn theo kiểu "lấy
mỗi thứ một ít" sẽ ra một trang không có tính cách. Phân vai rõ:

| Nguồn | Lấy đúng cái này | **Không** lấy |
|---|---|---|
| **Rivian** | Nền hệ thống: khoảng trắng rộng, chữ tiêu đề lớn, xe là nhân vật chính, nhịp sáng–tối xen kẽ | Bảng màu đất/outdoor — không hợp showroom đô thị Việt Nam |
| **Zoox** | Cảm giác *công nghệ*: nhãn mono viết hoa, lưới thông số chính xác, đường kẻ mảnh | Hiệu ứng HUD, viền phát sáng, hoạt hoạ kiểu sci-fi |
| **Tesla** | Bố cục hero: ảnh tràn màn hình, nav mờ nổi trên ảnh, tiêu đề + hai CTA đặt thấp | Việc giấu hết thông tin phía sau một màn hình trống |
| **Lamborghini / Ferrari** | Chất điện ảnh cho **hai** khối: hero và khối xe nổi bật — nền tối, chữ rất lớn, video tràn viền | Tông tối cho *toàn bộ* trang |

### Quyết định gây tranh cãi nhất: không làm trang tối toàn phần

Ferrari và Lamborghini tối từ đầu đến cuối vì họ bán giấc mơ cho vài nghìn người
mỗi năm. Landing này bán xe phổ thông và **phải hiển thị bảng số**: giá lăn bánh
từng khoản, kỳ hạn trả góp, thông số, chi nhánh còn xe.

Bảng số trên nền tối đọc mệt hơn hẳn, và người mua ô tô ở Việt Nam có tuổi trung
bình cao. Nên: **tối cho cảm xúc, sáng cho con số.**

---

## 2. Cấu trúc: mỗi khối một màn hình

Chốt lại 2026-09-03, sửa sau rà soát chéo. Trang chủ là **sáu màn hình
1440 × 940**, cuộn là lật trang.

```
màn 1  Hero                  TỐI     ảnh xe tràn màn, tiêu đề + 2 CTA đặt thấp
màn 2  Bóc giá lăn bánh      SÁNG    ★ khoảnh khắc chữ ký — §9
màn 3  Sáu mẫu               TỐI     6 ô ảnh tràn viền, nhịp gương, lọc theo động cơ
màn 4  Xe nổi bật            TỐI     video tràn viền — điểm điện ảnh
màn 5  Xưởng dịch vụ         TỐI     ảnh khoang sửa chữa, kể chuyện hậu mãi
màn 6  Chi nhánh & niềm tin  SÁNG    bản đồ + danh sách showroom
       Chân trang            TỐI     gồm luôn CTA cuối, không chiếm trọn màn
```

### Ba thay đổi sau rà soát

**Bóc giá lên màn 2.** Hero hứa *"Giá lăn bánh, không phải giá niêm yết"* rồi bắt
cuộn qua 1.800 px mới thấy bằng chứng. Bằng chứng phải đứng ngay sau lời hứa.

**Bóc giá đổi sang nền SÁNG.** Ràng buộc *tối cho cảm xúc, sáng cho con số* đã
chốt ở §1 nhưng chưa được áp: màn nhiều số nhất trang lại nền tối. Cùng lý do,
khối thông số kỹ thuật ở trang chi tiết xe cũng chuyển sáng.

**CTA cuối gộp vào chân trang.** Đo được: khối này chỉ có 507 px nội dung trong
900 px — màn rỗng nhất trang mà vẫn chiếm trọn một khung nhìn. Gộp vào đầu chân
trang thì không mất gì.

### Chiều cao thật, không phải chiều cao mock

⚠️ **Khung mock cao 940 px, không phải 900 hay 1080.** Trên màn 1920×1080 với
thanh trình duyệt, vùng nhìn thật còn ~940 px. Bản đầu vẽ 1080 px cho màn quản trị
— tức thiết kế trên 140 px không tồn tại, và khối cuối của màn *Phiên bản & giá*
rơi hẳn ra ngoài màn hình thật.

Với landing, nội dung mỗi màn phải vừa trong **780 px** để `100vh` an toàn trên
laptop 1440×900. Nếu không vừa thì dùng `min-height: 100vh` và bỏ ý "cuộn là lật
trang" cho màn đó.

⚠️ **Hai khối đã bị gỡ** (bản đầu có):

- **Dải 4 con số đứng riêng** — chiếm vị trí đắt nhất trang để nói bốn thứ mà
  trang chi tiết xe nói kỹ hơn, bằng bố cục mọi trang SaaS đều dùng.
- **Khối "Bốn bước sở hữu"** — bốn cột đánh số 01–04, nội dung rỗng: *chọn xe →
  lái thử → nhận xe → bảo dưỡng* chính là cách mua ô tô vốn dĩ diễn ra.

⚠️ **Bộ chọn mẫu xe ở chân hero cũng đã bị gỡ.** Lời hứa ở §2b — "ai vào cũng thấy
xe mình quan tâm trong màn hình đầu tiên" — vì thế **không còn đúng**: khách muốn
Santa Fe phải cuộn sang màn 3. Đây là rủi ro §2b nêu ra và lá chắn của nó đã mất.
Cần một cách khác giữ lời hứa đó, hoặc bỏ lời hứa.

### 2a. Trang nào theo mô hình màn hình, trang nào không

Mô hình mỗi-khối-một-màn-hình chỉ áp cho **trang kể chuyện**, không áp cho
**trang công cụ**:

| Trang | Mô hình | Vì sao |
|---|---|---|
| Trang chủ | 6 màn hình | Kể chuyện, dẫn dắt theo thứ tự |
| Chi tiết xe | 6 màn hình + thanh cấu hình dính | Kể chuyện một chiếc xe |
| Danh sách xe | Cuộn thường | Có bộ lọc, sắp xếp, so sánh — người dùng **quét**, không **đọc** |
| Liên hệ | Cuộn thường | Khách vào để lấy số điện thoại, không để xem trình diễn |
| Tin tức | Cuộn thường | Danh sách bài, quét tiêu đề |

Ba trang có bản điện thoại riêng: **Trang chủ**, **Chi tiết xe**, **Liên hệ**.
Liên hệ thêm ngày 2026-09-04 và **không phải bản thu nhỏ**: trên điện thoại
người ta mở trang Liên hệ để *gọi*, nên ba hàng gọi theo bộ phận đứng trước biểu
mẫu, và thanh dính đáy là *Gọi 1900 6789* + *Zalo* thay vì nút gửi form. Danh
sách xe và Tin tức chưa có bản điện thoại — chúng chỉ là lưới, xuống một cột là
đủ, không cần vẽ lại.

🔒 Ép trang công cụ vào khung nhìn cố định là **làm chậm người đang vội**. Một
khách mở trang Liên hệ để tìm hotline mà phải cuộn qua một màn hình hero toàn
màn là một khách bực mình.

Hai loại trang vẫn dùng chung bảng màu, chữ và token — chỉ khác nhịp. Danh sách
xe giữ **nền sáng** đúng theo quy tắc *tối cho cảm xúc, sáng cho con số*: đó là
nơi so giá và thông số.

### 2b. Trang chủ bán đại lý, không bán một chiếc xe

Bản đầu để hero là *VinFast VF 8* chữ 88 px, rồi khối điện ảnh là *VF 9 Plus*
chữ 118 px. Người xem không biết đây là trang của đại lý hay của một chiếc xe.

Nặng hơn: catalog có **hai hãng** — VinFast và Hyundai. Hero khoá cứng vào một
mẫu VinFast làm khách muốn Santa Fe rời trang ngay giây đầu.

Quy tắc chốt:

- **Hero nói điều đại lý cam kết**, không nói tên xe. Hiện tại: *"Giá lăn bánh,
  không phải giá niêm yết."* Xe vẫn là ảnh nền, nhưng là hình, không phải chủ ngữ.
- Bản đầu chốt **chân hero là bộ chọn mẫu xe** để khách hai hãng đều thấy xe
  mình quan tâm ngay màn đầu. Bộ chọn đó bị gỡ khi dựng lại theo mô hình màn
  hình, để hở rủi ro hai-hãng suốt một vòng. **Vá ngày 2026-09-04** bằng một
  dòng chữ dưới tiêu đề hero, cả máy tính lẫn điện thoại: *"6 mẫu VinFast và
  Hyundai · điện, hybrid, xăng và dầu · giao từ 5 showroom."* Rẻ hơn bộ chọn,
  không cướp chỗ của lời hứa chính, và vẫn trả lời được câu *"ở đây có xe tôi
  cần không?"* trong hai giây đầu.
- **Đúng một khối được nổi bật một xe** (khối §3, đổi theo tháng).

### 2c. Ba bề mặt liệt kê xe, ba việc khác nhau

Catalog chỉ có **sáu mẫu**. Nếu trang chủ liệt kê sáu xe và trang *Xe đang bán*
cũng liệt kê sáu xe, người dùng bấm một cú vào đúng nội dung vừa xem — hai trang
cùng nội dung là hai trang cùng chết.

Và với sáu mẫu thì **giấu bớt sau một cú click là ma sát nhân tạo**, không phải
catalog nghìn sản phẩm. Nên trang chủ hiện đủ cả sáu; việc phân vai chuyển sang
chỗ khác:

| Bề mặt | Việc | Cố tình không có |
|---|---|---|
| Bộ chọn ở chân hero | Khách đã biết muốn xem xe nào — đi thẳng | Ảnh, mô tả |
| Danh sách trang chủ | **Duyệt** — sáu xe, ảnh lớn, giá lăn bánh, lọc theo động cơ | Lọc tầm giá, lọc chi nhánh, sắp xếp, so sánh |
| Trang *Xe đang bán* | **Quyết** — lọc tầm giá, lọc chi nhánh còn xe, sắp xếp, **so sánh cạnh nhau** | Không lặp phần duyệt |

🔒 Nút từ trang chủ sang catalog **không được viết "Xem tất cả"** — khách đã xem
tất cả rồi. Nó phải hứa đúng thứ trang chủ cố tình không có: *"Lọc theo tầm giá,
chi nhánh còn xe — và so sánh cạnh nhau."*

Danh sách trang chủ xếp theo **nhịp gương ABBA** — hàng A là thẻ lớn bên trái +
hai thẻ nhỏ bên phải, hàng B đảo ngược. Sáu xe mà không thành lưới đều.

⚠️ **Chưa được dựng.** Màn sáu mẫu hiện là lưới đều 3×2 — đúng cái quy tắc này
chỉ định phải tránh, ở màn chiếm trọn một khung nhìn.

### 2d. Giọng văn

Copy xe hạng sang gần như không có câu, chỉ có nhãn. Bản đầu viết cả câu có chủ
ngữ vị ngữ, và tệ hơn là có **"chúng tôi"** — hễ có "chúng tôi" là có người đang
bán hàng trong câu. Vòng rà soát 2026-09-03 sửa **39 chỗ** trên bảy trang.

| Bỏ | Dùng | Vì sao |
|---|---|---|
| Đi thử một vòng rồi hãy quyết | **Lái thử trước khi quyết định.** | *hãy* là giọng thuyết phục |
| Lái thử trước. Quyết sau. | **Lái thử trước khi quyết định.** | cụt, hơi suồng sã |
| Cả sáu mẫu đều cho lái thử. | **Sáu mẫu xe, hai thương hiệu** | tiêu đề nên nêu sự thật, không nêu chính sách |
| Mua xe ở đây thì sửa xe ở đây | **Mua xe và bảo dưỡng tại cùng một nơi** | *thì* là văn nói |
| Đến xem xe tận nơi | **Hệ thống showroom và xưởng dịch vụ** | *tận nơi* là văn nói |
| Cuộn để xem từng đồng | **Chi tiết từng khoản phí** | |
| Cầm lái VF 8 một vòng | **Đăng ký lái thử VinFast VF 8** | |
| Bao giờ nhận được xe | **Thời gian giao xe theo chi nhánh** | |
| Ngồi thử trước khi đến | **Khám phá khoang nội thất** | |
| Gửi câu hỏi cho chúng tôi | **Gửi yêu cầu tư vấn** | có *chúng tôi* |
| Nói nhu cầu, chúng tôi gợi ý xe | **Tư vấn chọn xe theo nhu cầu** | có *chúng tôi* |
| Gọi thẳng cho bộ phận cần gặp | **Liên hệ theo bộ phận** | |
| Xe mới, ưu đãi, và mẹo dùng xe | **Bản tin xe mới và ưu đãi** | *mẹo* quá thân mật |

Ba quy tắc:

1. Tiêu đề khối **tối đa 6 từ**.
2. Không có chữ *hãy*, không có *chúng tôi*, không có trợ từ văn nói (*thì*,
   *tận nơi*, *một vòng*).
3. Chi tiết địa phương thì giữ, nhưng chọn thứ trung tính. *"Qua mùa nồm, qua
   mùa mưa"* thì được; *"qua đợt ngập Minh Khai"* thì không — không gắn tên
   thương hiệu với một sự cố cụ thể.

---

## 3. Bảng màu

🔒 **Một tên cho một màu.** Trước đây tài liệu gọi `--ink-void`, Pencil gọi
`ink-0`, màn *Giao diện* trong Sales Admin lại hiện `--surface-0` — ba tên cho
cùng một giá trị, và hai giá trị lệch nhau (`#08090a` với `#0a0b0c`). Chốt lại
2026-09-04: **tên trong bảng dưới là tên duy nhất**, dùng y hệt ở biến Pencil,
ở CSS `apps/landing`, và ở nhãn hiện cho người dùng trong màn *Giao diện*.

| Token | Nền tối | Nền sáng | Việc duy nhất của nó |
|---|---|---|---|
| `--ink-0` | `#08090a` | `#f3f1eb` | Nền trang |
| `--ink-1` | `#15181b` | `#ffffff` | Thẻ nổi trên nền trang |
| `--ink-2` | `#1d2125` | `#f7f6f2` | Ô nhập, khối lõm trong thẻ |
| `--ink-3` | `#2a2f34` | `#e6e3da` | Chip, thanh tiến trình |
| `--photo` | `#0e1113` | — | Giếng ảnh/video, chỉ ở landing |
| `--paper-0` | `#f3f1eb` | | Nền khối SÁNG **bên trong** trang tối |
| `--paper-card` | `#ffffff` | | Thẻ trên khối sáng |
| `--paper-ink` | `#161817` | | Chữ chính trên khối sáng |
| `--paper-muted` | `#5d605b` | | Chữ phụ trên khối sáng |
| `--brand` | `#ff705c` | `#b32e20` | Nhấn số, nhãn thương hiệu |
| `--action` | `#c73526` | `#b32e20` | Nền nút chính |
| `--signal-dark` | `#c9a227` | | Nhãn kỹ thuật **trên nền tối** |
| `--signal-light` | `#7a5c00` | | Cùng vai trò, **trên nền sáng** |

Bốn tầng `ink-*` là **một thang bốn bậc, mỗi bậc một việc** — không được thêm
bậc thứ năm vì "cần tối hơn một chút". `--photo-2 #191d20` đã bị gộp vào
`--ink-2` ngày 2026-09-04 vì hai tông lệch nhau bốn đơn vị, không ai phân biệt
nổi.

🔒 `signal-dark` và `signal-light` **chia theo bề mặt, không theo theme**. Một
khối SÁNG nằm trong trang TỐI vẫn phải dùng `signal-light`. Đây là lý do hai
token này cố ý *không* được khai thành cặp theo theme.

🔒 Màu tín hiệu cũ `#d9ff43` (vàng chanh) đã bỏ ngày 2026-09-03: trên nền sáng
chỉ đạt **1,02 : 1**, và nó kéo cả trang về phía "trang công nghệ" thay vì
showroom ô tô. Thay bằng đồng ánh kim `#c9a227`.

Không gradient, không đổ bóng màu, không viền phát sáng. Độ sâu đến từ **ảnh** và
từ khoảng cách, không từ hiệu ứng.

---

## 4. Chữ

Giữ bộ chữ hiện tại — Be Vietnam Pro cho giao diện, JetBrains Mono cho nhãn kỹ
thuật. Cái cần đổi là **thang cỡ**: hiện quá đều, thiếu tương phản.

| Vai | Cỡ (máy tính) | Ghi chú |
|---|---|---|
| Tiêu đề hero | 92 – 112 px, `letter-spacing: -0.04em`, `weight 700` | Ferrari/Lamborghini |
| Tiêu đề khối | 44 – 56 px, `-0.03em` | |
| Tiêu đề phụ | 22 – 26 px | |
| Nội dung | 16 – 17 px, `line-height 1.6` | Rivian đọc rất thoáng |
| Nhãn kỹ thuật | 10 px mono, viết hoa, `letter-spacing: 0.14em` | Zoox |
| Số liệu | 36 – 48 px mono | Bảng thông số, giá |

🔒 **10 px là sàn tuyệt đối**, chỉ dành cho nhãn mono viết hoa có giãn chữ —
loại chữ liếc chứ không đọc. Bản dựng ngày 2026-09-04 đã nâng toàn bộ 355 nhãn
9 px và 11 nhãn 8 px lên đúng sàn này. Không có chữ nào nhỏ hơn 10 px trong hệ
thống, kể cả chú thích pháp lý.

`line-height` chỉ có hai giá trị: **1.6** cho đoạn văn, **1.25** cho tiêu đề.
Trước đây tài liệu ghi 1.65 còn bản dựng dùng 1.6 — lấy 1.6.

Khoảng cách giữa cỡ hero và cỡ nội dung phải **lớn tới mức thấy ngay**. Đó là
toàn bộ mẹo làm trang trông đắt tiền — không phải màu, không phải hiệu ứng.

---

## 5. Điều hướng

Tesla: nav **trong suốt nằm trên ảnh hero**, chỉ hiện nền mờ khi cuộn qua hero.
6 mục + 1 nút chính. Trên điện thoại gom vào menu trượt, riêng nút *Đăng ký lái
thử* vẫn nằm ngoài.

Không mega-menu. Không dropdown nhiều tầng.

---

## 6. Ảnh và video

- Hero dùng **video** nếu showroom có, ảnh tĩnh nếu không. Video: không tiếng,
  tự lặp, **poster tải trước**, và **không tự phát trên mạng di động**.
- Ảnh xe cắt tràn viền (`full-bleed`), không bo góc, không khung.
- Mỗi ảnh có mô tả thay thế — `INV-LS-22` chặn xuất bản nếu thiếu.
- Khối 360° chỉ tải khi người xem chạm vào.

⚠️ Giá trị của toàn bộ hướng này phụ thuộc vào **chất lượng ảnh showroom cung
cấp**. Bố cục lấy ảnh làm nhân vật chính sẽ phản tác dụng nếu ảnh là ảnh chụp
điện thoại trong nhà xưởng. Cần chốt yêu cầu ảnh tối thiểu trước khi lên thật.

---

## 7. Chuyển động

CSS thuần, không thư viện. Ba loại, không có loại thứ tư:

1. Chữ và thẻ hiện dần khi vào khung nhìn — `animation-timeline: view()`.
2. Ảnh hero dịch chậm khi cuộn — `animation-timeline: scroll()`.
3. Nút và thẻ đổi trạng thái khi rê chuột, 150 ms.

🔒 Tôn trọng `prefers-reduced-motion`: tắt cả ba, không chỉ giảm.

Không dùng GSAP hay framer-motion — chúng nặng hơn toàn bộ phần chữ của trang.

---

## 8. Đã dựng ở Pencil

Hàng `LANDING — *` tại `y = 8000`. Bộ trạng thái và ca biên ở hàng `KIT — *`
tại `y = 17000`.

| Khung | Kích thước | Khối |
|---|---|---|
| Trang chủ | 1440 × 6340 | **6 màn hình** 1440×940 + CTA cuối 320 + chân trang 380 — xem §2 |
| Chi tiết xe | 1440 × 5780 | **6 màn hình** + thanh cấu hình dính + chân trang |
| Danh sách xe | 1440 × 2764 | Đầu trang · bộ lọc · lưới 6 xe có ô so sánh · thanh so sánh · CTA tư vấn · chân trang |
| Liên hệ | 1440 × 2660 | Đầu trang · biểu mẫu + kênh liên hệ · bản đồ 5 showroom · câu hỏi thường gặp · chân trang |
| Tin tức | 1440 × 2802 | Đầu trang · bài nổi bật tràn viền · chuyên mục · lưới 6 bài · đăng ký nhận tin · chân trang |
| Trang chủ (điện thoại) | 390 × 4582 | 8 khối gồm khoảnh khắc chữ ký + thanh CTA dính đáy |
| Chi tiết xe (điện thoại) | 390 × 4512 | 8 khối, thông số dạng gập, + thanh CTA dính đáy |
| **Liên hệ (điện thoại)** | 390 × 2620 | Gọi nhanh theo bộ phận · biểu mẫu nền sáng · 5 showroom · FAQ gập · thanh *Gọi / Zalo* dính đáy |
| Lỗi 404 | 1440 × 900 | Ô tìm xe, 4 lối tắt, ảnh riêng — các mã lỗi khác ở `KIT — Trang lỗi` |

### Ba chi tiết đáng chú ý trong bản dựng

**Thanh cấu hình dính ở trang chi tiết xe.** Chọn phiên bản và màu ở đâu thì con
số lăn bánh đổi ngay ở đó, luôn nằm trong tầm mắt khi cuộn. Người mua không phải
nhớ mình vừa chọn gì.

**Thanh CTA dính đáy trên điện thoại.** Hiện giá lăn bánh và nút lái thử suốt
hành trình cuộn. Trên máy tính không cần vì hero luôn ở gần.

**Mọi con số suy ra đều có một dòng ước tính ngay dưới** (`INV-LS-16`). Dòng đó
không phải chữ nhỏ pháp lý nhét ở chân trang — nó nằm cạnh con số, cùng khối.

---

## 9. Khoảnh khắc chữ ký — "Bóc giá lăn bánh khi cuộn"

Chốt 2026-09-03. Đây là khối duy nhất trong trang được phép chiếm trọn màn hình
và giữ người xem lại.

### Vì sao là giá, không phải là xe

Ba lựa chọn được cân nhắc: hành trình vào khoang lái kiểu Polestar, màn hình
theo dõi sửa chữa, và bóc giá lăn bánh. Chọn cái thứ ba vì hai lý do đo được:

- **82 % người mua ô tô tra cứu online trước khi đến đại lý, nhưng chỉ 31 % thấy
  thông tin giá là minh bạch.** Đó là một khoảng trống rộng, không phải một sở
  thích thẩm mỹ.
- **91 % nói niềm tin là yếu tố quyết định chọn đại lý**, ngang với giá.

Hành trình kiểu Polestar đẹp hơn nhưng phụ thuộc hoàn toàn vào một bộ ảnh chụp
đúng chuỗi mà showroom chưa chắc có. Bóc giá thì chỉ cần dữ liệu — thứ hệ thống
đã có sẵn.

### Cơ chế

Bốn chặng, số cộng dồn khi cuộn:

```
chặng 1   1.199.000.000    giá niêm yết
chặng 2   1.219.000.000    + trước bạ (xe điện 0 %) + biển số
chặng 3   1.221.380.000    + đăng kiểm, đường bộ, bảo hiểm bắt buộc
chặng 4   1.233.880.000    + bảo hiểm vật chất (tuỳ chọn)
          ↓
          18.420.000 ₫/tháng   tách thành khoản trả góp
```

- Con số ở giữa, mono **92 px** trên máy tính / 38 px trên điện thoại.
- Thanh tiến trình màu `--signal-dark` chạy theo vị trí cuộn.
- Mỗi dòng đã cộng có dấu tick; dòng chưa tới thì mờ.
- Chặng cuối đổi nền sang `--signal-dark` — lần duy nhất trong trang màu này
  làm nền, nên nó đọc như một kết luận.

### Ràng buộc

🔒 Con số chạy bằng **`animation-timeline: scroll()`**, không phải thư viện.
🔒 `prefers-reduced-motion` thì hiện thẳng trạng thái cuối, không nhảy số.
🔒 Nhãn ước tính và ngày hiệu lực biểu phí nằm **trong cùng khối**, không đẩy
xuống chân trang (`INV-LS-16`).

Nguồn số liệu: [pricing transparency 2026](https://resources.rework.com/libraries/automotive-sales-growth/online-pricing-transparency)
· [automotive landing page CRO benchmarks](https://www.webtonic.io/blog/automotive-landing-page-statistics)
· [Polestar UX case study](https://yml.co/labs/polestar-meets-product-design-3-ux-keys-to-marketing-electric-vehicles)
