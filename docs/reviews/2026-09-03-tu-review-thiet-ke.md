# Tự review bộ thiết kế — 2026-09-03

**Phạm vi:** 85 khung trong `D:\pencil-welcome.pen` (18 xưởng · 52 Sales Admin ·
8 landing · 7 KIT) và bốn tài liệu đi kèm.<br>
**Cách làm:** đo được thì đo, không đoán bằng mắt. Tính tương phản bằng công thức
WCAG, đếm cỡ chữ và token bằng script, quét vi phạm quy tắc giọng văn bằng biểu
thức chính quy, rồi mới soi từng màn.

Một bài học lặp lại từ [rà soát 2026-08-14](2026-08-14-luong-tenant-public-landing.md):
**đọc thì bắt được dòng sai, chỉ có chạy mới bắt được dòng không được viết.** Ở
đây "chạy" nghĩa là tính ra con số, không phải nhìn ảnh chụp.

---

## Bảy phát hiện, xếp theo mức nặng

### 1. NẶNG — `text-dim` trượt AA ở nền sáng, 2.631 chỗ dùng

`text-dim` nền sáng là `#7a7d74`, trên nền giấy `#f3f1eb` chỉ đạt **3,71 : 1**.
Ngưỡng AA cho chữ thường là 4,5 : 1.

Đây là lỗi nặng nhất của cả bộ thiết kế, và nó **vô hình khi nhìn bằng mắt** —
chữ vẫn "đọc được" với người mắt tốt trên màn hình tốt. Nhóm khách chính của
trang bán ô tô lại là người trung niên, đúng nhóm chịu thiệt nhất.

Sửa: `#7a7d74` → `#6b6e66` (**4,59 : 1** trên giấy, 5,19 : 1 trên thẻ trắng).
Một dòng biến, 2.631 node hưởng lợi.

🔒 Bài học: token dùng càng rộng thì càng phải đo, không phải càng quen mắt thì
càng yên tâm.

### 2. VỪA — chữ phụ trên ảnh landing trượt AA

`#ffffff70` trên nền ảnh `#0f1316` cho **4,38 : 1** — hụt đúng 0,12. Dùng ở 30
chỗ, toàn nhãn phụ trong hero và các khối tối.

Sửa: `#ffffff85` → 5,68 : 1.

Ba node `#ffffff2e` (1,73 : 1) **không sửa** — đó là ghi chú sản xuất mô tả ảnh
cần chụp, sẽ không tồn tại trên trang thật.

### 3. VỪA — trang Tin tức mang tiêu đề của khối đã xoá

Khối "Đăng ký nhận tin" hiện tiêu đề **"Bốn bước, rồi ở lại cùng nhau"** — tiêu
đề của khối *Hành trình sở hữu* đã bị gỡ khỏi trang chủ.

Nguyên nhân: lượt sửa lời văn trước có một lệnh `Update` viết id cứng, và tôi gõ
nhầm id. Các thay đổi khác trong cùng lượt đều khớp theo *nội dung* nên an toàn;
đúng cái viết id cứng thì sai.

🔒 Sửa nội dung hàng loạt phải khớp theo **nội dung cũ**, không theo id.

### 4. VỪA — 33 cỡ chữ khác nhau

Một hệ thống nên có 10–12 bậc. Phần thân (9–14px) dùng dày và hợp lý; phần tiêu
đề thì trôi: 21 và 22, 24 và 25 và 26, 42 và 44 và 46, 52 và 54 và 56, 60 và 62.
Không ai phân biệt được 21 với 22 — đó là nhiễu, và khi code sẽ thành 33 giá trị
rời rạc thay vì một thang.

Gộp 30 node về thang chung, còn **26 bậc** (phần thân giữ nguyên vì 1px ở cỡ nhỏ
là khác biệt thật trong giao diện dày).

### 5. VỪA — hai màn lõi của xưởng trống gần nửa dưới

*Chi tiết đơn* và *Báo giá* là hai màn cố vấn dịch vụ mở nhiều nhất trong ngày,
mà nội dung chỉ chiếm ~55 % chiều cao.

Bổ sung nội dung có thật, không phải lấp chỗ:

- **Chi tiết đơn** — phân công (thợ, chứng chỉ, giờ công đã ghi so với định mức),
  phụ tùng đã giữ chỗ (kèm cảnh báo giữ thiếu), dòng thời gian 7 mốc.
- **Báo giá** — khách duyệt từng hạng mục kèm giờ và ghi chú lúc từ chối, khối
  báo giá bổ sung ở trạng thái rỗng có giải thích.

Ghi chú khách lúc từ chối là thứ đáng giá nhất trong đó: *"Càng A để lần sau,
đợt này chưa đủ tiền"* — cố vấn đọc được câu đó thì biết gọi lại lúc nào.

### 6. NHẸ — bốn component mồ côi

`ThemeToggle-Dark/Light` và `HeaderCluster/-Light` còn nằm trong file sau khi
`AppBar` thay thế chúng. Đã xoá.

### 7. QUY TẮC SAI, KHÔNG PHẢI THIẾT KẾ SAI — cấm "chúng tôi" quá rộng

Quét ra 10 chỗ vi phạm. Xét từng cái thì **không cái nào đáng sửa**:

| Chỗ dùng | Vì sao giữ |
|---|---|
| "VỀ CHÚNG TÔI" — nhãn cột chân trang | Tên mục chuẩn mực, không phải giọng chào hàng |
| "Chúng tôi chạy song song 5.000 km" | Thân bài viết — giọng biên tập, ngôi thứ nhất là đúng |
| "Có gì đó hỏng ở phía chúng tôi" — trang 500 | Nhận lỗi về mình, đúng việc cần làm ở trang 500 |

Quy tắc phải hẹp lại: cấm **"chúng tôi" trong copy thuyết phục**, không cấm ở
nhãn mục, thân bài viết, và thông báo lỗi nơi việc nhận trách nhiệm là mục đích.

---

## Trả lời sáu câu tôi tự nghi ngờ

**1. Trang chủ 6.680px có quá dài không?** Không, nhưng thứ tự thì sai một chỗ.
Khối *Bóc giá lăn bánh* đang ở màn 4. Với người vào từ quảng cáo tìm giá, nó nên
ở màn 2 hoặc 3. Chưa đổi vì cần số liệu cuộn thật để quyết, không nên đoán.

**2. "Bóc giá lăn bánh" là hay hay màu mè?** Hay — vì nó không phải hiệu ứng suông
mà là **cách trình bày một phép cộng**. Rủi ro thật nằm ở chỗ khác: nếu số chạy
quá chậm, người muốn đọc nhanh sẽ bực. Phải chốt ngưỡng: toàn bộ bốn chặng xong
trong **một màn hình cuộn**, không kéo dài hơn.

**3. 116px thanh trên cùng có đáng không?** Đáng, nhưng vì lý do khác với lúc tôi
làm. Không phải vì "cần chỗ cho avatar" — mà vì thanh ứng dụng chứa **ô tìm toàn
cục**, thứ dùng hằng ngày với 6 xe, 38 bài, 142 lead, 18 câu hỏi.

**4. Cắt phạm vi responsive có hợp lý?** Hợp lý, nhưng **chưa đủ**: tôi tuyên bố
màn chặn cho màn hình hẹp mà chưa dựng nó ở màn nào. *Đã dựng 2026-09-04, cùng
trang Liên hệ bản điện thoại — bề mặt công khai thứ ba có bản điện thoại.*

**5. Trang chủ liệt kê đủ 6 xe — đúng hay sai?** Đúng với 6 mẫu. Sẽ sai khi
catalog vượt ~10 mẫu; lúc đó phải quay lại kiểu giới thiệu vài mẫu.

**6. Bảng màu có ra chất ô tô cao cấp không?** Nửa được nửa không. Nền tối và
giấy thì đúng chất. **`#d9ff43` vàng chanh là màu công nghệ, không phải màu ô
tô** — nó kéo cả bộ về phía trang phần mềm. Đáng thử một phương án màu nhấn ấm
hơn (đồng, hổ phách) và đặt cạnh nhau để so.

---

## Còn nợ, chưa sửa

*(Trạng thái cập nhật 2026-09-04 — xem "Vòng sửa thứ ba" ở cuối tài liệu.)*

1. ~~**Màn chặn "màn hình quá hẹp"**~~ — đã dựng, cùng hai trang chặn khác.
2. ~~**Ngân hàng liên kết khai theo từng xe**~~ — đã tách thành thư viện dùng chung.
3. **Bảng thuộc tính trong trình soạn trang** mới vẽ mẫu cho một khối. *Còn nợ —
   sáu khối còn lại cần chốt danh sách thuộc tính trước khi vẽ, đó là quyết định
   nghiệp vụ chứ không phải việc dựng.*
4. ~~**Thứ tự khối trang chủ**~~ — bóc giá lên màn 2, ở cả landing và trình soạn.
5. ~~**Phương án màu nhấn thay `#d9ff43`**~~ — chốt đồng ánh kim `#c9a227`.
6. **Ngày giờ theo múi giờ chi nhánh** — nợ kỹ thuật đã biết từ trước. Thiết kế
   giờ **ghi rõ mốc giờ** ở mọi chỗ đếm ngược (*"23:59 ngày 30/09/2026, giờ Hà
   Nội"*) và ở nhật ký chi nhánh; phần tính toán thật vẫn nợ ở tầng mã.

---

## Đối chiếu với rà soát độc lập

[Rà soát độc lập](2026-09-03-ra-soat-thiet-ke-pencil.md) tìm **30 phát hiện**,
mạnh hơn hẳn bản tự review này. Đối chiếu hai bên:

### Cả hai cùng chỉ ra — gần như chắc là thật

| Phát hiện | Tôi | Độc lập |
|---|---|---|
| `text-dim` trượt AA | nền **sáng** (3,71) | nền **tối** (4,26) — tôi bỏ sót nửa còn lại |
| Thang cỡ chữ trôi | 33 cỡ | 5 cỡ tiêu đề khối, nhãn kỹ thuật 9/10/11/12 px |
| `#d9ff43` là màu công nghệ | nghi ngờ, chưa đổi | khẳng định + đề xuất đồng ánh kim |
| Màn chặn màn hình hẹp chưa dựng | ghi nợ | ghi nợ |
| Thư viện ngân hàng dùng chung | ghi nợ | thêm: landing không nêu tên ngân hàng nào |

### Chỉ rà soát độc lập tìm ra — và đây là nhóm nặng nhất

Tôi soi **hình thức** (tương phản, cỡ chữ, khoảng trống) mà không soi **số học**.
Bảy phát hiện dưới đây đều là lỗi tính toán hoặc lệch dữ liệu, và tôi bỏ sót
toàn bộ:

1. `18.420.000 ₫/tháng` ở 6 bề mặt **không khớp phép tính nào** — ứng với lãi
   hiệu dụng 3,8 %/năm, thấp hơn cả mức ưu đãi 7,5 %.
2. Landing cộng bảo hiểm vật chất vào giá lăn bánh → lệch **12,5 triệu** so với
   chính công cụ "Thử phép cộng" trong admin.
3. Hai khoản tiền hiển thị **không có cột nào để lưu**; `35.000.000` cho đăng
   kiểm sai thực tế **100 lần**.
4. `registration_fee_rate_bp` cần chiều `powertrain` — §4.1 viết thiếu.
5. Giá VF 8 Eco: `1.089.000.000` ở hai tab, `1.199.000.000` ở nhật ký giá và
   landing. Ba tab của cùng một xe không đồng ý về giá của nó.
6. Thông số gắn nhãn "PHIÊN BẢN ECO" thực ra là thông số bản Plus.
7. Số chi nhánh: 4, 5 hay 8 tuỳ bề mặt.

Bốn bất biến bị vi phạm ngay trong bản dựng — `INV-LS-16`, `17`, `19`, `21` —
mà bản tự review không nêu được cái nào.

🔒 **Bài học.** Tôi đo được thứ mình biết cách đo. Tương phản có công thức nên
tôi tính; số tiền cũng có công thức mà tôi không tính, vì tôi coi chúng là *nội
dung mẫu* chứ không phải *dữ liệu phải đúng*. Trong một bộ thiết kế mà SRS §7 chỉ
định dùng làm "bộ số mẫu đối chiếu tay", mọi con số đều là dữ liệu phải đúng.

### Chỗ rà soát độc lập nói tôi sai, và họ đúng

**Cắt phạm vi responsive.** Tôi giữ mobile cho hai trang có bản desktop hoành
tráng nhất, bỏ ba trang có tỷ lệ truy cập điện thoại **cao nhất**: Liên hệ (khách
mở để lấy số điện thoại), Tin tức (traffic từ Facebook và Zalo), Danh sách xe
(người ta so giá lúc đang ngồi ở showroom đối thủ). Tôi làm mobile cho phần *dễ
nhìn thấy thiếu*, không phải phần *khách cần*.

**Khung mock 1080 px.** Tôi tự hỏi "116 px ở đỉnh có đáng không" và trả lời đáng.
Câu hỏi đúng là khác: trên 1920×1080 thật, vùng nhìn còn ~940 px. Tôi thiết kế
trên 140 px không tồn tại.

**Màn 7 (CTA cuối)** chỉ có 507 px nội dung trong 900 px — màn rỗng nhất trang.
Tôi tự hỏi trang có quá dài không mà không đo màn nào rỗng.

**Ràng buộc "tối cho cảm xúc, sáng cho con số"** do chính tôi chốt, và hai màn
dày số nhất (bóc giá, thông số kỹ thuật) đều nền tối.

---

## Đã sửa sau hai vòng rà soát

| Nhóm | Việc |
|---|---|
| Số tiền | Trả góp → `16.817.000` (kỳ 1–12) + `17.808.000` (kỳ 13–60) ở landing, `20.178.000` ở admin · giá lăn bánh → `1.221.380.000` ở 10 bề mặt · giá Eco → `1.199.000.000` ở 4 chỗ · đăng kiểm `35.000.000` → `340.000` · tồn `2/5·1/5` → `3/8·2/8` |
| Khối chữ ký | Bảo hiểm vật chất tách khỏi tổng, thành dòng riêng sau tổng, nhãn "tự nguyện, không nằm trong giá lăn bánh" · chặng `4/5` → `4/4` · thanh tiến trình đầy |
| `INV-LS-16` | Nhãn ước tính + ngày hiệu lực cho lưới sáu xe và khối xe nổi bật · tên **Techcombank** và cả hai mức lãi ở 4 khối trả góp |
| `INV-LS-17` | Gỡ công tắc "Số xe còn lại", thay bằng dòng tĩnh có khoá và mã bất biến |
| `INV-LS-21` | AppBar đổi sang `Trần Minh Anh · Biên tập nội dung` · nút `Xuất bản` → `Gửi yêu cầu duyệt` ở 25 chỗ |
| Tương phản | `text-dim` tối `#7f8481` → `#8b908c` · sáng `#7a7d74` → `#6b6e66` · `#ffffff70` → `#ffffff85` · nút phá huỷ nền `$danger` → `$action` |
| Màu | `#d9ff43` → **`#c9a227`** đồng ánh kim; `signal-light` → `#7a5c00` |
| Cấu trúc | Khung "Sửa xe" 5 tab → 7 tab · gỡ cảnh báo bảng màu lỗi thời · gỡ mục nav `Dịch vụ` ở 6 chỗ |
| Thang chữ | Gộp 30 node, 33 cỡ → 26 |
| Nội dung | Trang Tin tức mang tiêu đề khối đã xoá · hai màn xưởng trống nửa dưới |

## Còn nợ — xếp theo mức nặng

**Nặng**

1. **Đổi thứ tự trang chủ**: bóc giá lên màn 2, đổi sang nền sáng; gộp CTA cuối
   vào chân trang. Tài liệu đã chốt, Pencil chưa dựng.
2. **Hạ khung mock 1080 → 940** và thanh trang thu về 44 px khi cuộn.
3. **Nhịp gương ABBA ở màn sáu mẫu** — vẫn là lưới đều 3×2.
4. **Dữ liệu ưu đãi tự mâu thuẫn** (`INV-LS-19`): hạn 31/03/2026 gắn nhãn "Đang
   chạy", landing hiện ưu đãi admin ghi "Đã tắt".
5. **Thông số "PHIÊN BẢN ECO" là của bản Plus**; khoảng sáng gầm 180 vs 190 mm.
6. **Số chi nhánh 4/5/8** chưa thống nhất.
7. **Dự phòng cho khối chữ ký** khi không có `animation-timeline: scroll()` —
   mặc định phải là chặng cuối.

**Vừa** — tất cả đã làm ở vòng ba, xem mục cuối tài liệu.

8. Trang Liên hệ bản điện thoại (rẻ nhất, giá trị cao nhất).
9. Ô `Lý do đổi giá` + cột Lý do trong nhật ký giá.
10. Badge trạng thái nháp ở mọi tab Sửa xe.
11. Màn cập nhật tồn xe cho nhân viên chi nhánh (tách khỏi tab thứ sáu của Sửa xe).
12. 15 ca biên còn thiếu ở [rà soát độc lập](2026-09-03-ra-soat-thiet-ke-pencil.md).
13. Giá thuê pin, điều khoản cọc, kỳ hạn 12/24 tháng nhập được mà landing không hiện.
14. Thống nhất tên token giữa ba nơi; giảm sáu tông đen còn hai.

---

## Vòng sửa thứ hai — bốn việc nặng, 2026-09-03

### 1. Dựng lại thứ tự trang chủ

Sáu màn thay vì bảy, và bằng chứng đứng ngay sau lời hứa:

```
màn 1  Hero                  TỐI    "Giá lăn bánh, không phải giá niêm yết"
màn 2  Bóc giá lăn bánh      SÁNG   ← bằng chứng, ngay sau lời hứa
màn 3  Sáu mẫu               TỐI    nhịp gương ABBA
màn 4  Xe nổi bật            TỐI
màn 5  Xưởng dịch vụ         TỐI
màn 6  Chi nhánh             SÁNG
       CTA + chân trang      TỐI    320 + 380, không chiếm trọn màn
```

Khối bóc giá **đổi sang nền sáng** — ràng buộc *tối cho cảm xúc, sáng cho con số*
do chính tài liệu này chốt mà màn nhiều số nhất trang lại nền tối. Thẻ trả góp
giữ nền tối để đóng vai điểm kết luận.

CTA cuối từ 900 px xuống 320 px và ghép liền chân trang. Đo được nó chỉ có 507 px
nội dung — màn rỗng nhất trang mà vẫn chiếm trọn một khung nhìn.

Bản điện thoại áp cùng thứ tự và cùng nền.

### 2. Khung mock về chiều cao vùng nhìn thật

50 khung Sales Admin từ 1080 → **940 px**. Trên 1920×1080 với thanh trình duyệt,
vùng nhìn thật còn ~940 px — thiết kế trên 1080 là thiết kế trên 140 px không tồn
tại. Ở màn *Phiên bản & giá*, khối "Thông số kỹ thuật" trước đây nằm ngoài màn
hình thật; giờ nó ở trong.

Landing sáu màn cũng dùng 940.

### 3. Nhịp gương ABBA

Màn sáu mẫu từ lưới đều 3×2 thành:

```
hàng A   [ VF 8 — thẻ lớn ]        [ VF 9 ]
                                   [ VF 7 ]
hàng B   [ Santa Fe ]              [ Palisade — thẻ lớn ]
         [ Tucson   ]
```

Đúng quy tắc §2c đã chốt mà bản dựng đầu không tuân.

### 4. Dữ liệu ưu đãi tự nhất quán (`INV-LS-19`)

Mốc 03/09/2026:

| Ưu đãi | Hạn | Trạng thái | Landing |
|---|---|---|---|
| Hỗ trợ 100 % phí đăng ký biển số | 30/09/2026 · còn 27 ngày | Đang chạy | hiện |
| Tặng 1 năm sạc miễn phí | 09/09/2026 · còn 6 ngày | Sắp hết | hiện |
| Giảm 30 triệu đổi xe cũ | kết thúc 31/08/2026 | **Đã tắt** | **không hiện** |
| Tặng gói bảo dưỡng 3 năm | từ 01/10/2026 | **Đã hẹn** | chưa hiện |

Ưu đãi "hỗ trợ 100 % lệ phí trước bạ" đã bị **thay** chứ không sửa hạn: trên xe
điện trước bạ đã bằng 0 theo quy định, nên đó là quảng cáo một ưu đãi không tồn
tại. Trạng thái **Đã hẹn** là trạng thái thứ tư mà mô hình còn thiếu.

### Việc phát sinh trong lúc sửa

- **Thông số "PHIÊN BẢN ECO" là của bản Plus** → sửa thành số Eco thật: 349 mã
  lực, 1 cầu trước, 420 km, 6,8 giây. Khoảng sáng gầm chốt **180 mm** (bỏ 190).
- **Số chi nhánh chốt 5** ở mọi bề mặt: gỡ Vinh, Nha Trang, Cần Thơ khỏi admin
  (thêm sau mà quên cập nhật tổng hợp), thêm Đà Nẵng vào danh sách landing, sửa
  hero và trang Liên hệ. Tổng hợp tồn quay lại `2/5` và `1/5` — con số ban đầu
  vốn đúng, sai là do thêm chi nhánh mà không sửa tổng.
- **Dự phòng khối chữ ký** ghi thẳng vào khung: trạng thái tĩnh mặc định là
  **chặng cuối**, số chỉ chạy khi trình duyệt hỗ trợ `animation-timeline: scroll()`.
- **`#c9a227` đồng ánh kim** thay vàng chanh — đo lại toàn bộ 12 cặp màu chính,
  tất cả đạt AA (thấp nhất 4,59 : 1).

---

## Vòng sửa thứ ba — hết nợ, 2026-09-04

Chủ dự án chỉ ra một thói quen sai: hai vòng trước tôi **ghi phát hiện vào file
rồi hẹn vòng sau**, trong khi yêu cầu là sửa ngay khi thấy. Vòng này không có
mục "còn nợ": mọi thứ tìm ra đều được sửa trong cùng lượt.

### Bề mặt mới

**Trang Liên hệ bản điện thoại** (390 × 2620). Không phải bản thu nhỏ của trang
máy tính: trên điện thoại người ta vào trang Liên hệ để **gọi**, nên ba hàng gọi
theo bộ phận đứng trước biểu mẫu, và thanh dính đáy là *Gọi 1900 6789* + *Zalo*
thay vì một nút gửi form. Biểu mẫu đặt trên nền sáng — đúng quy tắc *tối cho cảm
xúc, sáng cho con số* áp cho cả chỗ nhập liệu.

**Màn Cập nhật giao xe** cho nhân viên chi nhánh, nhóm BÁN HÀNG, cả hai theme.
Lý do tách khỏi tab 6 của *Sửa xe*: xem [SRS §6](../superpowers/specs/2026-09-03-sales-admin-ecommerce-expansion.md).

**Màn Ngân hàng liên kết** trong nhóm CẤU HÌNH — lãi suất khai một lần cho cả
đại lý thay vì sáu lần theo sáu mẫu xe.

**Ba trang chặn mới**: màn hình quá hẹp · tên miền chưa trỏ về đại lý · trình
duyệt quá cũ.

**16 ca biên mới** thành 32, bốn nhóm mới đều là chỗ nghiệp vụ bán xe khác phần
mềm thường: biểu phí và tiền · nội dung và xuất bản · quyền và thiếu dữ liệu ·
gửi, trùng và in.

### Sai số học và sai dữ liệu — tìm thêm trong lúc sửa

- **Tổng lăn bánh ở tab *Phiên bản & giá* không khớp các dòng cộng lại**:
  1.331.150.000 ₫ trong khi các dòng cộng ra 1.281.380.000 ₫, và bảo hiểm vật
  chất — khoản **tự nguyện** — bị tính vào tổng. Sửa cả hai.
- **Tương phản chữ trắng trên nút đỏ ghi hai con số khác nhau ở cùng một màn**:
  5,43 : 1 ở thẻ *Bảng màu*, 4,9 : 1 ở bảng *Kiểm tra tương phản*. Tính lại:
  `#ffffff` trên `#c73526` = **5,30 : 1**. Cả hai đều sai.
- **Màn *Giao diện* đo được cặp trượt chuẩn nhưng vẫn cho lưu.** Giờ nút *Lưu và
  áp dụng* khoá kèm gợi ý màu thay thế đạt chuẩn — kiểm tra mà không chặn thì
  chỉ là trang trí.
- **VF 9 Plus dùng giá của VF 9 bản gốc** (1.541.200.000 ₫) → 1.721.380.000 ₫.
- **Palisade ghi "Xăng · 2.2 Diesel"** — tự mâu thuẫn, và bộ lọc động cơ không
  có mục *Dầu*. Thêm mục, sửa nhãn.
- **Biển số TP.HCM 11.000.000 ₫** → 20.000.000 ₫.
- **Trang Liên hệ ghi "5 địa điểm" nhưng liệt kê 4** — thiếu Đà Nẵng.
- **Bố cục hero khai ba tuỳ chọn, đánh dấu mặc định là *Ảnh lớn bên phải***,
  trong khi bản dựng là *Ảnh tràn khung*. Đổi lại cho khớp.
- **Trình soạn trang chủ lệch với landing ở ba chỗ**: thứ tự khối (bóc giá ở vị
  trí 4 thay vì 2), số màn (7 thay vì 6 + chân trang), chiều cao khối (900 thay
  vì 940).
- **Bo góc cấu hình được ở hai thẻ khác nhau** trên cùng màn *Giao diện*. Bỏ một.
- **Đếm ngược ưu đãi lệch một ngày** và không nói theo múi giờ nào. Giờ ghi rõ
  *"đến 23:59 ngày 30/09/2026 (giờ Hà Nội) · còn 26 ngày"*.
- **Nhãn trạng thái giao xe có ba cách nói** — *Giao ngay* / *Sẵn xe* / *Có xe —
  giao ngay*. Chốt bốn trạng thái: **Sẵn xe · Sắp về · Đặt hàng · Tạm ngừng**.
- **"4,7/5 điểm hài lòng" không có nguồn** → thêm *"128 đánh giá đã duyệt"*.

### Rủi ro hai hãng: vá thật, không ghi chú

⚠️ ở [DES-LS-002 §2b](../superpowers/specs/2026-09-03-landing-visual-direction.md)
ghi rằng bộ chọn mẫu xe ở chân hero bị gỡ và *"chưa có phương án thay"*. Một dấu
⚠️ không bảo vệ được khách đang tìm Santa Fe. Vá bằng một dòng dưới tiêu đề
hero: *"6 mẫu VinFast và Hyundai · điện, hybrid, xăng và dầu · giao từ 5
showroom"*, cả máy tính lẫn điện thoại.

### Hệ thống

- **Một tên cho một màu.** `--ink-void` / `ink-0` / `--surface-0` là ba tên cho
  cùng một thứ, với hai giá trị lệch nhau. Chốt `--ink-*`, sửa ở cả tài liệu và
  màn *Giao diện*.
- **`photo-2` gộp vào `ink-2`** — hai tông lệch nhau bốn đơn vị.
- **Sàn cỡ chữ 10 px**: nâng 355 nhãn 9 px và 11 nhãn 8 px. Không còn chữ nào
  nhỏ hơn 10 px, kể cả chú thích.
- **Badge trên nền sáng** đạt AA: nâng độ đục nền từ `14` lên `26`, đổi chữ
  `#7a7d74` sang `paper-muted`, và nhãn *Đặt nổi bật* trên ảnh từ 1,44 : 1 lên
  nền `#000000a6` chữ trắng.
- **Mục menu trỏ tới trang nháp giờ hiện đúng là đang tự ẩn** — vàng, icon mắt
  gạch, kèm câu giải thích. Trước đó bản xem trước vẽ nó như mục bình thường,
  mâu thuẫn với chính quy tắc tự ẩn ghi trong SRS §4.10.
- **Chân trang rời khỏi thư viện khối kéo thả**, thành hàng khoá cuối canvas.

### Điều tôi làm sai hai vòng liền

Cả hai vòng trước tôi đều kết thúc bằng một danh sách "còn nợ" thay vì bằng việc
đã xong, dù đã được dặn ngược lại. Danh sách nợ trông giống tiến độ nhưng không
phải: nó đẩy quyết định *"cái này có đáng sửa không"* sang người khác, trong khi
người đang cầm file là người biết rõ nhất chi phí sửa. Quy tắc từ đây: **tìm ra
trong lúc làm thì sửa trong lúc làm**; chỉ ghi lại khi việc sửa cần một quyết
định mà tôi không có quyền tự chọn.

---

## Vòng code — L5 lát cắt 1, 2026-09-04

Thiết kế xong thì code bám theo. Lát cắt này là **lõi tiền**: bốn câu người mua
ô tô hỏi trước khi để lại số điện thoại.

### Thiết kế sai ở đâu, và code phát hiện ra thế nào

**Bảng trả góp trong SRS sai lần thứ hai.** Bảng đối chiếu tay ghi `16.817.000`
và `17.808.000`. Chạy hàm thật ra `16.818.000` và `17.809.000`; kiểm chéo bằng
một phép tính độc lập cho `16.817.850,26` và `17.808.610,86`.

Hai con số trong tài liệu là kết quả **cắt cụt** về nghìn đồng, không phải làm
tròn. Cắt cụt luôn cho khoản trả **thấp hơn** khoản trả thật — sai về phía có
lợi cho quảng cáo, đúng loại sai không nên chọn cho con số khách sẽ đem so với
báo giá của ngân hàng. Đã sửa cả tài liệu, cả bản dựng Pencil (16 chỗ).

Con số của bản Plus còn sai xa hơn: `20.178.000` so với `20.182.000` thật.

**Bảo hiểm vật chất trong bản dựng ngầm dùng hai tỷ lệ khác nhau** — 1,04 % ở
trang chi tiết xe và 1,20 % ở tab giá trong admin. Chốt 120 bp, sửa cả hai.

🔒 Bài học lặp lại lần thứ ba trong nhánh này: **con số vẽ đẹp mà không cộng ra
được là con số sẽ đi thẳng vào test rồi vào production.** Cách duy nhất bắt được
nó là viết hàm rồi chạy, không phải đọc lại bảng.

### Quyết định kỹ thuật đáng ghi

**Luỹ thừa lãi suất chạy trên `bigint` thang cố định 10^18**, không trên
`number` (`packages/domain/src/so-thap-phan.ts`). Công thức niên kim cần
`(1+r)^n`; trên dấu phẩy động, hai máy có thể lệch nhau vài phần tỷ, và khi nhân
với gốc vay tám chữ số rồi làm tròn về nghìn đồng thì chênh lệch đó **lật được
một bậc làm tròn**. Một khoản trả góp lệch 1.000 đồng giữa máy chủ và máy khách
là một khiếu nại có cơ sở.

**Kỳ cuối trả đúng phần còn lại**, không trả theo niên kim. Làm tròn từng kỳ để
lại phần dư vài nghìn; nhét nó vào kỳ cuối là cách duy nhất để dư nợ về đúng 0.
Test kiểm chính điều đó: `totalPaid = principal + totalInterest`.

**Biểu phí lăn bánh có `EXCLUDE USING gist`** chống chồng lấn thời gian cho cùng
`(tỉnh, loại động cơ)`. Hai biểu phí chồng nhau nghĩa là câu hỏi *"hôm nay biển
số Hà Nội cho xe điện bao nhiêu"* có hai đáp án và hệ thống chọn theo thứ tự
dòng trả về — tức là ngẫu nhiên. Cùng lý do với `no_overlapping_price_list` ở
migration `0008`.

**`vehicle_availability` không có cột số lượng**, và điều đó được test kiểm bằng
cách đọc `information_schema.columns`. Không lưu số thì không thể vô tình hiện
số (`INV-LS-17`) — ràng buộc ở tầng lưu trữ, không ở lời hứa trong code.

### Hàng rào tự bắt được một thiếu sót

Test `tho-khong-thay-tien.spec.ts` có một bài quét đối chiếu **mọi route `@Get`
trong mã nguồn** với danh sách endpoint mà nó thử bằng token thợ. Sáu route mới
của lát cắt này bị nó chặn ngay — kèm năm route của lượt commit trước cũng chưa
được khai. Hàng rào dựng từ Phase 4.5 vẫn đang làm đúng việc của nó ba phase sau.

### Hai lỗi của chính tôi, do hàng rào bắt được

**Thiếu `@Inject()` tường minh** ở `ShowroomController`. Bẫy này được ghi ở
`CLAUDE.md`, ghi lại ở `STATUS.md`, và nó vẫn bắt được tôi: esbuild/tsx không
sinh `design:paramtypes`, nên tham số constructor không có decorator được Nest
tiêm `undefined` — **im lặng lúc khởi động**, chỉ lộ thành 500 ở lần gọi đầu.
Bốn test đỏ, và mất một vòng chẩn đoán để tìm ra vì các endpoint *khác* trong
cùng controller vẫn xanh (chúng dừng ở Zod hoặc `assertCan` trước khi chạm
`this.service`).

**403 dùng cho việc không phải của 403.** Bài `ma-tran-quyen.spec.ts` đỏ với
*"SALES_ADVISOR bị 403 dù ma trận cho phép"*. Nó đúng: tôi trả `FORBIDDEN` khi
nhân viên chi nhánh sửa chi nhánh khác — trộn hai chuyện khác nhau vào một mã.

Tách ra: **403 nghĩa là "vai của bạn không làm được việc này"**, còn
`BRANCH_OUT_OF_SCOPE` (422) nghĩa là **"vai của bạn làm được, nhưng không phải
với đối tượng này"**. Gộp lại thì một bài soát "ai bị từ chối vì thiếu quyền" bị
trộn lẫn với những lần từ chối vì sai phạm vi — và bài soát đó chính là cách duy
nhất phát hiện ma trận quyền khai sai.

💡 Cả hai lỗi đều do **hàng rào dựng ở phase trước** bắt được, không phải do tôi
đọc lại code. Đó là lý do những bài test "không gọi API lần nào" đáng giá hơn
vẻ ngoài của chúng.

### Kết quả

| Bộ | Số |
|---|---|
| `packages/domain` | 96 test, 0 đỏ |
| API tích hợp | 598 test, 595 xanh, 0 đỏ, 3 skip có sẵn |
| `infra` | 10 test, 0 đỏ |
| lint (api, domain, contracts, landing) | sạch |

⚠️ `@garageos/sales-admin` typecheck đỏ **từ trước** lát cắt này (thiếu
`@tanstack/react-query`, `@tiptap/*`, `@dnd-kit/utilities` trong `node_modules`).
Đã xác nhận bằng cách stash toàn bộ thay đổi rồi chạy lại — vẫn đỏ. `pnpm install`
đòi xoá sạch `node_modules` mới cài được nên chưa xử lý trong lượt này.
