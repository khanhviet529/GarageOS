# Rà soát thiết kế Pencil — landing, Sales Admin, xưởng

**Ngày:** 2026-09-03
**Đối tượng:** `D:\pencil-welcome.pen` — 86 khung, 9 component
**Đối chiếu:** [DES-LS-002](../superpowers/specs/2026-09-03-landing-visual-direction.md)
· [SRS-LS-EXP-001](../superpowers/specs/2026-09-03-sales-admin-ecommerce-expansion.md)
· [05-invariants](../05-invariants.md) · [huong-dan/sales-admin](../huong-dan/sales-admin.md)
**Phương pháp:** đọc cấu trúc bằng `Get` trên toàn tài liệu; tính tỉ lệ tương phản
WCAG 2.1 thật cho mọi node `text` (tự resolve biến theo theme của từng khung,
composite alpha theo chuỗi cha); đối chiếu từng con số hiển thị với mô hình dữ
liệu ở §4 của SRS.

⚠️ Ghi chú shot ảnh (`ẢNH 1 · VF 8 CHÍNH DIỆN…`) bị loại khỏi kết quả tương phản —
chúng là chú thích cho người tạo ảnh, không phải chữ của sản phẩm.

---

## Tóm tắt

Bộ khung chắc về cấu trúc và ca biên. Chỗ vỡ nằm ở **tính toàn vẹn của những con
số tiền** và ở **tầng token màu**. Cụ thể: khoản trả góp không khớp bất kỳ phép
tính nào từ tham số đứng cạnh nó; giá lăn bánh trên landing lệch 12,5 triệu so
với chính công cụ "Thử phép cộng" trong admin; hai khoản phí hiển thị không có
cột nào để lưu; và một token chữ mờ trượt chuẩn AA ở khoảng 130 vị trí trên cả
ba bề mặt.

Bốn bất biến bị vi phạm ngay trong bản dựng: `INV-LS-16`, `INV-LS-17`,
`INV-LS-19`, `INV-LS-21`.

Ba nhóm **không tìm thấy lỗi nghiêm trọng**: ma trận quyền (khớp đủ hướng dẫn,
`INV-LS-14` và `INV-LS-21`, dùng `check`/`minus` nên không phụ thuộc màu); bộ
trạng thái ô nhập và thông báo; quy tắc cắt chữ trong bảng rộng.

---

## NẶNG

### 1. Khoản trả góp không phải kết quả của phép tính nào

**Khung:** LANDING — Trang chủ (Màn 4) · LANDING — Chi tiết xe (Màn 2) · hai bản
điện thoại · SALES ADMIN — Sửa xe · Ưu đãi & trả góp (khối "Khách sẽ thấy")

**Vấn đề:** con số `18.420.000 ₫/tháng` xuất hiện ở 6 chỗ, gắn với ba bài toán
khác nhau, và không khớp bài nào:

| Nơi | Gốc vay hiển thị | Kỳ hạn | Lãi năm đầu | Trả góp đúng | Đang hiện |
|---|---|---|---|---|---|
| Admin (VF 8 Plus, trả trước 20 %) | 1.007.200.000 | 60 | 7,5 % | **20.178.000** | 18.420.000 |
| Chi tiết xe (Eco, trả trước 30 %) | 839.300.000 | 60 | 7,5 % | **16.817.000** | 18.420.000 |
| Trang chủ Màn 4 (Eco, trả trước 30 %) | 839.300.000 | 60 | 7,5 % | **16.817.000** | 18.420.000 |

Công thức niên kim `P·r·(1+r)ⁿ/((1+r)ⁿ−1)` với `r = 0,075/12`. Trong admin, các
số phụ đều đúng và tự nhất quán (251.800.000 = 20 % của 1.259.000.000; vay =
1.007.200.000) — chỉ con số cuối là rời rạc. `18.420.000 × 60 = 1.105.200.000`,
tức tổng lãi 98 triệu trên gốc 1.007 triệu qua 5 năm ≈ 3,8 %/năm hiệu dụng, thấp
hơn cả mức ưu đãi 7,5 %.

**Hậu quả:** khách so con số này với báo giá ngân hàng và thấy lệch 1,7–3,4
triệu/tháng — đúng loại sai số làm mất niềm tin mà khối chữ ký được dựng để xây.
Nặng hơn: SRS §7 mục 2 chỉ định "test trước, có bộ số mẫu đối chiếu tay", và bộ
khung này là bộ số mẫu duy nhất. Ai lấy 18.420.000 làm ca test sẽ kết luận hàm
`INV-LS-18` viết đúng là sai.

**Đề xuất:** tính lại cả 6 chỗ. Trang chủ và chi tiết xe (Eco, 30 %, 60 tháng,
7,5 %) → `16.817.000`. Admin (Plus, 20 %, 60 tháng, 7,5 %) → `20.178.000`. Ghi
công thức và ba bộ số vào chú thích khung để lần sau đối chiếu được.

---

### 2. Một con số/tháng cho cấu trúc lãi hai giai đoạn

**Khung:** LANDING — Chi tiết xe (Màn 2) · Trang chủ (Màn 4)

**Vấn đề:** admin khai `Lãi suất năm đầu 7,5 %` và `Lãi suất sau ưu đãi 10,5 %`
(khớp `financing_program.promo_rate_bp` / `standard_rate_bp`). Landing hiện **một**
con số kèm chữ "sau đó thả nổi", và không nêu 10,5 % ở đâu.

**Hậu quả:** khách đọc "18.420.000 ₫/tháng" hiểu là tháng nào cũng trả bấy nhiêu.
Thực tế 12 kỳ đầu thấp hơn, 48 kỳ sau cao hơn đáng kể. `INV-LS-18` bắt làm tròn
**từng kỳ** chính vì các kỳ không bằng nhau — hiển thị một con số duy nhất làm
mất luôn ý nghĩa của bất biến đó.

**Đề xuất:** hiện hai con số cạnh nhau — `12 tháng đầu: … ₫` và `từ tháng 13: … ₫`
— hoặc một con số kèm nhãn `bình quân 60 kỳ` và dòng phụ nêu cả hai lãi suất.
Đây cũng là chỗ hàm thuần phải trả về mảng kỳ, không phải một số.

---

### 3. Giá lăn bánh cộng một khoản tự nguyện, lệch 12,5 triệu so với công cụ kiểm của chính hệ thống

**Khung:** LANDING — Trang chủ (Màn 4) · Chi tiết xe (Màn 2) · Danh sách xe ·
đối chiếu SALES ADMIN — Biểu phí lăn bánh (khối "Thử phép cộng")

**Vấn đề:**

```
Admin · Thử phép cộng · Hà Nội · VF 8 Eco
  1.199.000.000 + 0 + 20.000.000 + 2.380.000  =  1.221.380.000 ₫   ← "Lăn bánh"

Landing · cùng xe, cùng tỉnh
  … + 12.500.000 (bảo hiểm vật chất — tuỳ chọn)  =  1.233.880.000 ₫  ← "lăn bánh"
```

Màn tự giới thiệu là "nguồn của mọi con số lăn bánh trên landing" ra một kết quả,
trang công khai ra kết quả khác. Ở Việt Nam "giá lăn bánh" gồm giá xe + trước bạ
+ biển số + đăng kiểm + đường bộ + BHTNDS; bảo hiểm vật chất là tự nguyện và
không nằm trong đó.

Tệ hơn, trong khối chữ ký: tổng 104 px **đã cộng** 12,5 triệu, nhưng dòng "+ Bảo
hiểm vật chất — tuỳ chọn" hiển thị **không có dấu tick và bị làm mờ** (3,33 : 1).
Khách cộng tay bốn dòng có tick được 1.221.380.000, lệch 12,5 triệu so với con số
khổng lồ phía trên. Bảng thuộc tính trong trình soạn nói rõ ý định này: "Cộng bảo
hiểm vật chất — *là khoản tuỳ chọn, mặc định để mờ*" — mờ mà vẫn cộng.

**Hậu quả:** đại lý hiện giá cao hơn cách hiểu phổ thông 12,5 triệu, và khối được
dựng để chứng minh minh bạch lại là khối tự mâu thuẫn trong một khung nhìn. Người
vận hành dùng "Thử phép cộng" để kiểm trước khi lưu sẽ không bao giờ phát hiện.

**Đề xuất:** chặng cuối của khối chữ ký là `1.221.380.000` — giá lăn bánh. Bảo
hiểm vật chất tách ra một dòng **sau** tổng, dạng "cộng thêm nếu mua bảo hiểm vật
chất: +12.500.000", mặc định **tắt** khỏi tổng. Đổi mặc định của công tắc trong
trình soạn. Dòng nào đã cộng thì phải sáng và có tick — không có trạng thái thứ ba.

---

### 4. Hai khoản tiền hiển thị không có cột nào để lưu

**Khung:** SALES ADMIN — Biểu phí lăn bánh · Sửa xe · Phiên bản & giá · toàn bộ
bảng giá trên landing

**Vấn đề:** bảng phí ở admin có đúng 6 cột, khớp `onroad_fee_schedule` (§4.1):
trước bạ xăng, trước bạ điện, biển số, đăng kiểm, đường bộ, BHTNDS. Nhưng hai
khoản sau xuất hiện trên bề mặt mà không có ô nhập ở bất kỳ màn nào:

- **Bảo hiểm vật chất** — landing `12.500.000`, admin tab giá `15.110.000 (ước tính)`
- **"Đăng kiểm + phụ phí"** — admin tab giá `35.000.000`

Vòng rà soát của SRS tìm được bảy lỗ hổng "landing hiển thị mà không có nơi sửa";
đây là lỗ hổng thứ tám và thứ chín, và là hai lỗ hổng duy nhất **liên quan đến
tiền**.

Riêng con số 35.000.000 cho đăng kiểm sai thực tế **100 lần** (phí đăng kiểm ô tô
con là 240–340 nghìn; landing ghi đúng `340.000`). Chính nó tạo ra khoảng cách
giữa chênh lệch lăn bánh của Eco (+34,88 tr) và của Plus (+72,15 tr) trong cùng
một tỉnh, cùng một mức trước bạ 0 %.

**Hậu quả:** hai con số sẽ bị hardcode trong code, rồi sai âm thầm khi biểu phí
đổi. Bảo hiểm vật chất còn là số **suy ra theo % giá xe**, nên nó cần công thức
chứ không phải một ô số tuyệt đối như các phí khác.

**Đề xuất:** hoặc bổ sung vào `onroad_fee_schedule` hai trường
`material_insurance_rate_bp` và `misc_fee_amount` (kèm cột vào migration `0071`
và vào test quét quyền cột), hoặc bỏ hẳn hai khoản khỏi mọi bề mặt. Không có lựa
chọn thứ ba. Nếu giữ, phải sửa 35.000.000 → 340.000 và tách "phụ phí" thành khoản
có tên riêng.

---

### 5. `registration_fee_rate_bp` là một cột, giao diện cần hai

**Khung:** SALES ADMIN — Biểu phí lăn bánh

**Vấn đề:** bảng có hai cột `TRƯỚC BẠ XĂNG` và `TRƯỚC BẠ ĐIỆN` cho mỗi tỉnh (Hà
Nội 12 % / 0 %; các tỉnh khác 10 % / 0 %). §4.1 chỉ có một
`registration_fee_rate_bp`, và §4.1 còn khẳng định "phí trước bạ xe điện hiện là
0 — biểu diễn được bằng `0 bp`, không cần cờ đặc biệt".

Khẳng định đó chỉ đúng nếu tỷ lệ **không** phụ thuộc powertrain. Nó có phụ thuộc:
cùng một tỉnh, xe xăng 10–12 %, xe điện 0 %. Một cột không biểu diễn được cả hai.

**Hậu quả:** migration `0071` viết theo §4.1 sẽ thiếu chiều, phát hiện ra lúc dựng
UI thì đã có dữ liệu. Với catalog hai hãng ba loại động cơ, đây là cột lõi.

**Đề xuất:** `UNIQUE (tenant_id, province_code, powertrain, effective_from)` và
`registration_fee_rate_bp` theo từng powertrain — dùng lại enum `ICE|HYBRID|BEV`
đã có. Sửa cả câu "không cần cờ đặc biệt" trong SRS §4.1.

---

### 6. `INV-LS-16` — bảy con số suy ra không có nhãn ước tính

**Khung:** LANDING — Trang chủ, Màn 2 (sáu thẻ xe) và Màn 3 (Xe nổi bật)

**Vấn đề:** sáu thẻ ở Màn 2 hiện `lăn bánh · 1.233.880.000 ₫` và Màn 3 hiện
`LĂN BÁNH · 1.541.200.000 ₫`. Trong cả hai màn **không có một dòng nhãn ước tính,
không có tên biểu phí, không có ngày hiệu lực**. DES-LS-002 §8 chốt "mọi con số
suy ra đều có một dòng ước tính ngay dưới — nằm cạnh con số, cùng khối".

Màn 3 còn hiện `GIAO XE · Hải Phòng · 7 ngày` — cũng là số suy ra từ
`vehicle_availability`, cũng không nguồn.

Danh sách xe có nhãn nhưng **thiếu ngày hiệu lực**: "…theo biểu phí Hà Nội, đã gồm
biển số và bảo hiểm bắt buộc" — `INV-LS-16` đòi "tên bảng phí hoặc tên ngân hàng,
**kèm ngày hiệu lực**".

**Hậu quả:** `INV-LS-16` phát biểu "thiếu nguồn thì không render". Nếu enforce ở
service như đã ghi (🔒 service), Màn 2 và Màn 3 sẽ **không render được** — hai
trong bảy màn của trang chủ trống. Nếu không enforce, bảy con số tiền trên chính
domain của đại lý đọc như lời chào giá.

**Đề xuất:** thêm một dòng mono 11 px dưới lưới Màn 2 (một dòng cho cả sáu thẻ là
đủ, không cần sáu dòng) và một dòng trong khối thông số Màn 3. Bổ sung ngày hiệu
lực vào chú thích trang Danh sách xe.

---

### 7. `INV-LS-16` — không nêu tên ngân hàng ở bất kỳ đâu trên landing

**Khung:** LANDING — Chi tiết xe (Màn 2) · Trang chủ (Màn 4) · hai bản điện thoại

**Vấn đề:** admin khai đủ ba ngân hàng liên kết (Techcombank 7,5 % · VPBank 7,9 %
· VIB 8,2 %) và `financing_program.bank_name` tồn tại. Landing viết "Ngân hàng
quyết định điều kiện vay khi xét hồ sơ" — **không ngân hàng nào được nêu tên**.
Trang chủ Màn 4 còn không nêu cả lãi suất.

`INV-LS-16` liệt kê nguồn hợp lệ là "tên bảng phí **hoặc tên ngân hàng**, kèm ngày
hiệu lực". Với khoản trả góp, nguồn hợp lệ duy nhất là tên ngân hàng.

**Hậu quả:** vi phạm bất biến ở mọi bề mặt hiển thị trả góp. Và con số 7,5 % không
gắn với ai thì không kiểm được — khách không biết hỏi ngân hàng nào.

**Đề xuất:** nhãn dạng "Ước tính theo lãi suất Techcombank 7,5 %/năm 12 tháng đầu,
10,5 %/năm sau đó · cập nhật 28/08/2026". Nếu ba ngân hàng cho ba mức, hiện mức
thấp nhất kèm tên và một liên kết "so ba ngân hàng".

---

### 8. `INV-LS-19` — bản dựng minh hoạ đúng cái bất biến cấm

**Khung:** SALES ADMIN — Sửa xe · Ưu đãi & trả góp ↔ LANDING — Chi tiết xe (Màn 2)

**Vấn đề:** ba sai lệch cùng lúc.

| Ưu đãi | Admin | Landing |
|---|---|---|
| Hỗ trợ 100 % lệ phí trước bạ | `đến 31/03/2026` · **Đang chạy** | hiện · `Áp dụng đến 09/09/2026` · `còn 6 ngày` |
| Tặng 1 năm sạc miễn phí | `còn 6 ngày` · Sắp hết | hiện · không có hạn |
| Giảm 30 triệu đổi xe cũ | `đã kết thúc` · **Đã tắt** | **vẫn hiện** |

1. Admin gắn nhãn "Đang chạy" cho một ưu đãi hết hạn từ 31/03/2026 — quá 5 tháng.
2. Landing hiển thị một ưu đãi mà admin ghi là đã tắt.
3. Cặp `09/09 + còn 6 ngày` bị hoán từ ưu đãi sạc sang ưu đãi trước bạ.

**Hậu quả:** `INV-LS-19` tồn tại vì "một ưu đãi đã hết hạn còn hiển thị là một cam
kết sai với khách đang đứng ở showroom cầm điện thoại". Bản dựng là ảnh chụp của
đúng tình huống đó, và nó sẽ được dùng làm ảnh tham chiếu khi code.

**Đề xuất:** sửa dữ liệu mẫu cho tự nhất quán và đặt hạn trong tương lai so với
03/09/2026. Bổ sung trạng thái **"Đã hẹn"** (`starts_at` còn ở tương lai) — hiện
thiếu, và biên tập viên hẹn ưu đãi tháng sau sẽ tưởng hệ thống hỏng.

---

### 9. `INV-LS-16` — ưu đãi trị giá 0 ₫ vẫn đứng đầu danh sách

**Khung:** LANDING — Chi tiết xe (Màn 2) · admin Ưu đãi & trả góp

**Vấn đề:** admin tự tính đúng: "Hỗ trợ 100 % lệ phí trước bạ — `≈ 0 ₫ (xe điện
đã miễn)`". Landing vẫn hiện ưu đãi này ở vị trí đầu, không nói giá trị.

**Hậu quả:** quảng cáo hỗ trợ một khoản phí đã bằng 0 theo quy định. SRS §8 đã
treo "ràng buộc pháp lý của con số trả góp cần người hiểu luật quảng cáo đọc lại";
mục này còn rõ hơn — nó là một ưu đãi không tồn tại.

**Đề xuất:** khi `value_amount` tính ra 0, admin hiện cảnh báo chặn publish ưu đãi
đó cho powertrain tương ứng: "Khoản này đã được miễn theo quy định — hiển thị có
thể bị coi là quảng cáo gây nhầm lẫn". Không cần bảng mới, chỉ cần một kiểm tra ở
bước publish cạnh `INV-LS-22`.

---

### 10. `INV-LS-17` bị hạ từ ràng buộc schema xuống công tắc giao diện

**Khung:** SALES ADMIN — Sửa xe · Tồn & giao xe, khối "Hiển thị trên landing"

**Vấn đề:** khối có ba dòng công tắc, dòng thứ ba là **"Số xe còn lại — Ẩn — dễ
gây hiểu nhầm là tồn kho thật"**.

`INV-LS-17` enforce ở tầng thấp nhất: "`vehicle_availability` **không có cột số
lượng**". Một công tắc ngụ ý nó **bật được**, tức là có dữ liệu số lượng ở đâu đó.
Nguyên tắc 1 của CLAUDE.md: "UI không bao giờ tính là enforce". Đây là đặt một
công tắc UI cho thứ mà schema cấm tồn tại.

**Hậu quả:** người đọc thiết kế để code sẽ đi tìm cột số lượng, không thấy, rồi
thêm. Bất biến chết theo cách khó truy nhất — bằng một thiện chí giải thích.

**Đề xuất:** xoá dòng công tắc. Thay bằng một dòng chữ tĩnh trong khối, không có
điều khiển: "Không hiển thị số xe — hệ thống không nắm tồn theo VIN (`INV-LS-17`)".
Giữ hai công tắc còn lại.

---

### 11. Giá niêm yết VF 8 Eco: hai con số trong cùng một bộ tab

**Khung:** SALES ADMIN — Sửa xe · Sửa xe · Phiên bản & giá · Ưu đãi & trả góp

**Vấn đề:**

| Nơi | VF 8 Eco |
|---|---|
| Tab Thông tin chung | `1.089.000.000 ₫` |
| Tab Phiên bản & giá | `1.089.000.000 ₫` |
| Tab Ưu đãi & trả góp — nhật ký giá `19/08` | `1.219.000.000 → 1.199.000.000` |
| Landing (mọi bề mặt) | `1.199.000.000 ₫` |

Nhật ký giá là bảng `INSERT`-only theo `INV-LS-20`, tức là nguồn không thể sửa —
nó nói giá hiện tại là 1.199.000.000. Hai tab kia nói 1.089.000.000.

**Hậu quả:** ba tab của cùng một xe không đồng ý về giá của nó. Ai dùng bộ khung
để viết fixture sẽ chọn ngẫu nhiên một trong hai. Và đây là con số khách chụp màn
hình mang đến showroom — chính lý do `INV-LS-20` tồn tại.

**Đề xuất:** `1.199.000.000` ở cả hai tab (khớp nhật ký và landing). Kiểm luôn
Plus: tab giá `1.259.000.000` khớp nhật ký `03/09` ✓.

---

### 12. Thông số "PHIÊN BẢN ECO" trên landing là thông số của bản Plus

**Khung:** LANDING — Chi tiết xe (Màn 3) ↔ SALES ADMIN — Sửa xe

**Vấn đề:** khối thông số landing gắn nhãn `THÔNG SỐ · PHIÊN BẢN ECO` rồi liệt kê
`402 mã lực`, `2 cầu AWD`, `471 km`. Mô tả trong admin viết: "VF 8 dùng hai mô-tơ
điện dẫn động bốn bánh, cho công suất tổng 402 mã lực. **Bản Plus** đi được 471
km" — cả hai con số thuộc Plus. Bản Eco của VF 8 là một mô-tơ, dẫn động cầu trước.

Kèm một lệch nữa: `Khoảng sáng gầm` — admin `180 mm`, landing `190 mm`.

**Hậu quả:** khách đọc trang Eco, thấy AWD và 402 mã lực, đăng ký lái thử Eco rồi
phát hiện ở showroom. Đó là lead mất và là khiếu nại có cơ sở.

**Đề xuất:** hoặc điền thông số Eco thật, hoặc đổi nhãn khối thành `PHIÊN BẢN PLUS`
cho khớp. Thanh cấu hình dính đang chọn `Eco`, nên lựa chọn đúng là điền số Eco.
Chốt `180` hay `190 mm` cho khoảng sáng gầm.

---

### 13. Số chi nhánh: 4, 5 hay 8

**Khung:** LANDING — Trang chủ (Màn 1, Màn 6) · Liên hệ · Chi tiết xe (Màn 5) ·
SALES ADMIN — Sửa xe · Tồn & giao xe

**Vấn đề:**

| Bề mặt | Nói | Liệt kê |
|---|---|---|
| Trang chủ, hero | `5 SHOWROOM · HÀ NỘI · HẢI PHÒNG · TP.HCM` | — (thiếu Đà Nẵng trong danh sách tỉnh) |
| Trang chủ, Màn 6 | `5 showroom & xưởng` | **4** thẻ |
| Liên hệ | `5 ĐỊA ĐIỂM`, bản đồ `GHIM 5 ĐỊA ĐIỂM` | **4** thẻ |
| Chi tiết xe, Màn 5 | — | **5** (thêm Đà Nẵng) |
| Admin, Tồn & giao xe | — | **8** (thêm Vinh, Nha Trang, Cần Thơ) |

**Hậu quả:** trang Liên hệ là trang khách vào để lấy địa chỉ và số điện thoại. Nó
tự nói có 5 địa điểm rồi hiện 4 — khách đếm được. Nếu đại lý thật có 8 chi nhánh
thì trang này thiếu một nửa, và khách ở Vinh, Nha Trang, Cần Thơ không biết có
showroom gần mình.

**Đề xuất:** chốt một con số cho bản dựng (đề xuất 5) và dùng nhất quán ở cả năm
chỗ, kể cả bảng tồn xe trong admin. Con số ở Màn 6 phải đến từ `site_metric`, danh
sách thẻ từ `branch` — nếu hai nguồn khác nhau thì phải đếm được, không nhập tay.

---

### 14. Hai con số tổng hợp tồn xe đều sai

**Khung:** SALES ADMIN — Sửa xe · Tồn & giao xe, khối "Tổng hợp"

**Vấn đề:** bảng có 8 dòng chi nhánh: Sẵn xe = Long Biên, Hải Phòng, Nha Trang
(3); Sắp về = Cầu Giấy, Thủ Đức, Cần Thơ (3); Đặt hàng = Đà Nẵng, Vinh (2).
Khối tổng hợp ghi `Chi nhánh có xe sẵn: 2 / 5` và `Chi nhánh phải đặt hàng: 1 / 5`.
Đúng phải là `3 / 8` và `2 / 8`.

**Hậu quả:** con số suy ra sai ngay trong bản mẫu. Người viết truy vấn gộp sẽ
không có mốc đúng để đối chiếu, và test viết theo bản vẽ sẽ khoá lỗi lại.

**Đề xuất:** `3 / 8` và `2 / 8`. Đồng thời chốt **quy tắc gộp** — landing hiện một
badge duy nhất cho cả xe (`Sẵn xe` trên thẻ ở Danh sách xe) trong khi
`vehicle_availability` là bảng theo `(product_id, branch_id)`. SRS §4.5 không định
nghĩa cách gộp nhiều chi nhánh thành một trạng thái. Đề xuất: lấy trạng thái tốt
nhất trong các chi nhánh, và badge phải nói phạm vi ("Sẵn xe tại 3 chi nhánh"),
nếu không nó là một phát biểu không kiểm được.

---

### 15. Hệ token màu không có tầng theo nền, nên khối sáng của landing phải hardcode

**Khung:** toàn bộ LANDING — các khối `$paper-0` · biến tài liệu

**Vấn đề:** landing không có "theme sáng" và "theme tối" — nó có **khối** tối và
**khối** sáng trong cùng một trang. Nhưng `text`, `text-muted`, `text-dim`, `ok`,
`warn`, `danger`, `line`, `brand` đều là biến **theo theme**. Trong một khối sáng
nằm giữa trang tối, chúng resolve sai.

DES-LS-002 §3 đã xử lý đúng cho một màu duy nhất (`--signal-on-dark` /
`--signal-on-light`) và cảnh báo cái bẫy. Bảy màu còn lại không được xử lý. Kết quả
đo được trong bản dựng:

- Dấu `*` bắt buộc ở form trang Liên hệ dùng `$danger` → `#ff8f84` trên thẻ trắng
  = **2,21 : 1** (4 chỗ). Chữ đánh dấu trường bắt buộc gần như vô hình.
- Badge trạng thái trong khối sáng phải hardcode để tránh bẫy: `#177a4e`,
  `#8a5f12`, `#7a7d74`, `#c9c5b9`, `#3d4600`, `#141800` — vi phạm ràng buộc "mọi
  màu viết cứng đều là lỗi".

**Hậu quả:** ràng buộc 3 (landing đọc màu từ `site_theme_setting`) không thoả được
bằng bộ token hiện tại. Dù chọn cách nào cũng sai một quy tắc.

**Đề xuất:** đổi trục token của landing từ *theme* sang *ngữ cảnh nền*. Mỗi màu
trạng thái có hai biến: `--ok-on-dark` / `--ok-on-light`, tương tự cho `warn`,
`danger`, `text`, `text-muted`, `line`. Khối khai ngữ cảnh của nó một lần
(`data-surface="light"`), các biến bên trong đọc theo. Sales Admin giữ trục theme
như hiện tại — nó thật sự có hai theme.

---

### 16. `site_theme_setting` cấu hình 4 màu, landing dùng hơn 20

**Khung:** SALES ADMIN — Giao diện landing

**Vấn đề:** màn Giao diện cho cấu hình đúng 4 màu: `--surface-0`, `--surface-1`,
`--brand`, `--action`. Bản dựng landing dùng ít nhất 20 màu ngữ nghĩa: `paper-0`,
`paper-1`, `paper-ink`, `paper-muted`, `paper-line`, `text`, `text-muted`,
`text-dim`, `line`, `line-strong`, `ok`, `warn`, `danger`, `signal-dark`,
`signal-light`, `photo`, `photo-2`, `ink-1`, `ink-2`, `ink-3`.

Thêm ba lệch nhỏ nhưng có hậu quả: tên token ở màn Giao diện (`--surface-0`) không
khớp DES-LS-002 §3 (`--ink-void`) cũng không khớp file thiết kế (`ink-0`); và giá
trị nền lệch — `#0a0b0c` (admin) vs `#08090a` (tài liệu và file), `#f6f5f3` (tài
liệu) vs `#f3f1eb` (file). Bản dựng landing còn dùng **sáu** tông nền tối khác
nhau (`#0f1316`, `#08090a`, `#0b0e10`, `#0e1113`, `#0e1214`, `#191d20`), không
tông nào là `#0a0b0c`.

**Hậu quả:** "mọi màu viết cứng đều là lỗi" trở thành lỗi ở 16 màu. Khi code, sẽ
xuất hiện một lớp map tuỳ tiện giữa 4 màu cấu hình và 20 màu sử dụng, và không ai
trả lời được "đại lý đổi màu thương hiệu thì khối nào đổi theo".

**Đề xuất:** chốt rằng 4 màu là **cấu hình được**, phần còn lại là **suy ra bằng
thang cố định** từ 4 màu đó — rồi nói câu này ra trong SRS §4.8 và hiện thang suy
ra ngay trên màn Giao diện để đại lý thấy trước khi lưu. Thống nhất một bộ tên
token cho cả ba nơi. Giảm sáu tông đen về hai (`surface-0`, `surface-1`) hoặc khai
báo tông thứ ba có tên.

---

### 17. `text-dim` trượt AA ở khoảng 130 vị trí trên cả ba bề mặt

**Khung:** mọi khung theme tối — XƯỞNG (9), SALES ADMIN (26), KIT (8), LANDING (form)

**Vấn đề:** `text-dim` ở theme tối là `#7f8481`. Trên `$ink-2` `#1d2125` cho
**4,26 : 1**, dưới ngưỡng 4,5 : 1 cho chữ thường. Nó được dùng cho tiêu đề cột
bảng, placeholder ô tìm, nhãn `Metric`, chú thích, mô tả trạng thái rỗng — tức là
mọi chữ phụ của hệ thống.

Đếm theo cụm: xưởng ~60, Sales Admin ~50, KIT ~20. Bản sáng **không** trượt
(`#6b6e66` trên `#f7f6f2` = 4,74 : 1) — chỉ theme tối bị bỏ qua khi kiểm.

Điều đáng chú ý: màn Giao diện landing đã tự khai "Chữ nhạt trên nền thẻ —
`3,9 : 1`" trong bảng kiểm tra tương phản. Thiết kế biết có một cặp trượt, mà cặp
đó vẫn được dùng khắp hệ thống.

**Hậu quả:** không phải lỗi chặn việc, nhưng là lỗi phổ biến nhất của bộ thiết kế
và nằm ở chữ mà người vận hành đọc suốt ngày. Sửa một dòng biến là hết.

**Đề xuất:** `text-dim` (dark) `#7f8481` → **`#8b908c`** (đạt 4,52 : 1 trên
`#1d2125`). Kiểm lại trên `#15181b` và `#111214` vì `text-dim` cũng xuất hiện
trên hai nền đó.

---

### 18. Nút phá huỷ: chữ trắng trên `$danger` = 2,21 : 1

**Khung:** KIT — Ô nhập & xác thực · KIT — Thông báo & hộp thoại

**Vấn đề:** ba nút — `Xoá vĩnh viễn` (2 chỗ) và `Xoá dữ liệu cá nhân` — dùng
`$danger` `#ff8f84` làm **nền** với chữ trắng: **2,21 : 1**. `danger` được thiết
kế làm màu **chữ** trên nền tối (nên nó sáng), rồi bị dùng làm màu nền.

**Hậu quả:** ba nút không đọc được lại đúng là ba nút không lùi lại được — trong
đó `Xoá dữ liệu cá nhân` là hành động `INV-LS-15`, ghi đè vĩnh viễn.

**Đề xuất:** nền `$action` `#c73526` (chữ trắng = 5,29 : 1) hoặc `#b3271a`, giữ
`$danger` cho chữ và viền. Cùng lúc sửa `#cf5346` ở KIT — Rỗng, tải & phân trang
(nút `Gán`, `Đổi trạng thái`, 11 px, 4,21 : 1).

---

### 19. Màn kiểm tra tương phản tự nói hai con số, và không chặn khi trượt

**Khung:** SALES ADMIN — Giao diện landing

**Vấn đề:** ba lỗi trong một màn.

1. Khối "Bảng màu" ghi "Chữ trắng trên nút chính đạt **5,43 : 1**". Khối "Kiểm tra
   tương phản" ghi "Chữ trắng trên nút đỏ **4,9 : 1**". Cùng một cặp
   (`#ffffff` trên `#c73526`), hai con số, trong cùng một màn. Giá trị đúng là
   **5,29 : 1** — cả hai đều sai.
2. Bảng hiện `Chữ nhạt trên nền thẻ — 3,9 : 1`, tức một cặp **trượt**, nhưng không
   có trạng thái lỗi rõ, và nút `Lưu và áp dụng` trông bình thường.
3. Chú thích hai khối nói ngược nhau về hậu quả: "Cặp nào trượt sẽ chặn lưu" vs
   "bảng này tính lại ngay, không đợi xuất bản".

**Hậu quả:** đây là màn có nhiệm vụ nói sự thật về khả năng đọc của trang công
khai. Nếu nó sai số và không chặn thật, đại lây có thể xuất bản một trang trượt AA
— và `INV-LS-22` cho thấy dự án coi WCAG 2.2 AA là ràng buộc, không phải khuyến nghị.

**Đề xuất:** tính lại cả bốn cặp trong bảng. Cặp trượt hiện màu `danger` kèm icon,
nút `Lưu và áp dụng` bị vô hiệu với lý do ngay cạnh. Bỏ con số ở khối "Bảng màu" —
một màn chỉ nên có một nơi nói về tương phản.

---

### 20. Menu và chân trang trỏ tới trang chưa xuất bản

**Khung:** SALES ADMIN — Trang & điều hướng ↔ mọi trang LANDING

**Vấn đề:** SRS §4.10 chốt 🔒 "Menu trỏ tới trang chưa publish **phải tự ẩn**,
không chờ người sửa nhớ tắt: link gãy trên trang bán hàng đắt hơn một mục menu
thiếu". Bản dựng làm ngược:

- Khối "Xem trước đầu trang" hiện mục `Khuyến mãi` như một mục bình thường, dù
  dòng bên cạnh ghi `/khuyen-mai-thang-9 — trang còn ở bản nháp`.
- Chân trang khai `Cột 3 — Hỗ trợ: Liên hệ · Chính sách bảo mật · Điều khoản`, và
  `Điều khoản sử dụng` có trạng thái `Bản nháp`, cập nhật `chưa viết`. Chân trang
  landing (8 khung) hiện link đó ở mọi trang.
- Chuyển hướng `/uu-dai → /khuyen-mai-thang-9` cũng trỏ vào trang nháp.

**Hậu quả:** biên tập viên xem preview thấy menu 6 mục, trang thật ra 5 — và
không hiểu vì sao. Ràng buộc tự-ẩn không được thể hiện ở bề mặt duy nhất mô tả nó.

**Đề xuất:** trong preview, mục trỏ trang nháp hiện gạch ngang + nhãn "sẽ tự ẩn
trên trang thật". Áp cho cả `placement = FOOTER`. Chuyển hướng trỏ đích nháp hiện
cảnh báo cùng kiểu.

---

### 21. Mục `Dịch vụ` trên landing không tồn tại ở đâu

**Khung:** mọi trang LANDING (nav) ↔ SALES ADMIN — Trang & điều hướng

**Vấn đề:** nav landing ở cả 8 khung là `Xe đang bán · Khuyến mãi · Dịch vụ ·
Tin tức · Liên hệ` + nút. Menu trong admin là `Trang chủ · Xe đang bán · Khuyến
mãi · Tin tức · Giới thiệu · Liên hệ`. `Dịch vụ` không có trong menu, không có
trong danh sách 9 trang, không có khung thiết kế.

**Hậu quả:** một mục nav chết trên **mọi** trang của trang bán hàng. Và hai bề mặt
mô tả cùng một menu bằng hai danh sách khác nhau, nên không biết cái nào là đích.

**Đề xuất:** chọn một. Nếu giữ `Dịch vụ` thì thêm trang (`kind = 'TEXT'` hoặc
`'BUILDER'`) và thêm vào menu admin; nếu bỏ thì sửa nav ở 8 khung. Khuyến nghị bỏ —
nội dung hậu mãi đã có Màn 5 trang chủ, và nav 5 mục gọn hơn.

---

### 22. Màn Sửa xe có hai bộ tab khác nhau

**Khung:** SALES ADMIN — Sửa xe (5 tab) ↔ Sửa xe · Phiên bản & giá (7 tab)

**Vấn đề:** khung "Sửa xe" hiện `Thông tin chung · Phiên bản & giá · Màu sắc ·
Ảnh & 360° · SEO`. Các khung tab khác hiện đủ 7, thêm `Ưu đãi & trả góp` và
`Tồn & giao xe`. SRS §6 chốt bảy tab.

Khung "Sửa xe" còn sót hai dấu vết của bản trước: cảnh báo `⚠ Chưa có bảng màu
trong cơ sở dữ liệu — cần bổ sung nếu bán theo màu` (SRS §4.4 đã chốt
`vehicle_color`, và đã có hai khung "Sửa xe · Màu sắc"), và giá Eco
`1.089.000.000` (mục 11).

**Hậu quả:** biên tập viên vào tab đầu tiên — tab mặc định — không thấy đường vào
Ưu đãi và Tồn xe. Người code đọc cảnh báo màu sắc sẽ tưởng schema chưa có bảng.

**Đề xuất:** 7 tab ở mọi khung. Xoá cảnh báo bảng màu. Vì đây là khung mặc định,
nó là khung dễ bị lấy làm nguồn nhất.

---

### 23. Màn đổi giá mất chỉ báo nháp, và không có nơi nhập lý do

**Khung:** SALES ADMIN — Sửa xe · Phiên bản & giá

**Vấn đề:** hai thiếu sót ở đúng màn nguy hiểm nhất.

1. Khung "Sửa xe" có badge `Bản nháp` và dòng `Bản nháp v3 · sửa lần cuối 12 phút
   trước`. Khung "Phiên bản & giá" chỉ có `2 phiên bản · giá cập nhật 12 phút
   trước` — **không badge trạng thái**. Người đang sửa giá không biết mình đang ở
   nháp hay ở bản đang chạy.
2. `vehicle_price_log` có cột `reason` (SRS §4.6). Không có ô nhập nào, và bảng
   nhật ký ở tab Ưu đãi & trả góp chỉ có 5 cột (`THỜI ĐIỂM · ĐỐI TƯỢNG · TỪ ·
   THÀNH · NGƯỜI SỬA`) — không có cột Lý do.

**Hậu quả:** `reason` sẽ luôn `NULL`. `INV-LS-20` trả lời được "hôm 12/8 trang hiện
bao nhiêu" nhưng không trả lời được "vì sao" — và với giá bán, câu thứ hai là câu
người ta hỏi khi có tranh chấp.

**Đề xuất:** badge trạng thái ở mọi tab (nó thuộc thanh trang, không thuộc tab).
Ô `Lý do đổi giá` bắt buộc trong hộp thoại xác nhận khi giá thay đổi, và thêm cột
Lý do vào bảng nhật ký. Cân nhắc hộp thoại "giá đổi từ X sang Y, ảnh hưởng N
trang" giống khối "Ảnh hưởng khi lưu" đã có ở màn Biểu phí lăn bánh — đổi giá một
mẫu xe cũng đáng một bước xác nhận như đổi biểu phí.

---

### 24. `INV-LS-21` chỉ có mặt ở một trong hai nơi xuất bản được, và nói ngược vai

**Khung:** SALES ADMIN — Soạn trang chủ ↔ Sửa xe / Phiên bản & giá ↔ Người dùng & quyền

**Vấn đề:**

1. Trình soạn trang chủ có băng báo đúng tinh thần bất biến: "Bạn có quyền sửa,
   chưa có quyền xuất bản. Bấm Xuất bản sẽ gửi yêu cầu duyệt cho Trần Văn Duyệt."
   Màn Sửa xe và Phiên bản & giá — cũng có nút `Xuất bản`, cùng người dùng — không
   có băng báo nào.
2. AppBar ở **mọi** khung Sales Admin là `Trần Văn Duyệt · Marketing Publisher`.
   Bảng tài khoản cho biết `duyet.tv@otovietanh.vn` giữ vai **Xuất bản nội dung**.
   Vậy băng báo đang nói với người *có* quyền xuất bản rằng họ *không* có quyền, và
   bảo họ gửi duyệt cho **chính mình**.
3. `Marketing Publisher` là chuỗi tiếng Anh duy nhất trong giao diện người dùng,
   hiện trên mọi màn admin, và không khớp tên vai nào trong ma trận (`Chủ hệ thống`,
   `Biên tập nội dung`, `Xuất bản nội dung`, `Quản lý bán hàng`, `Tư vấn bán hàng`).
   CLAUDE.md: tiếng Việt cho người dùng.

**Hậu quả:** bất biến chỉ được minh hoạ ở một chỗ, và minh hoạ sai. Người code
không suy được trạng thái nào ứng với vai nào.

**Đề xuất:** đổi người dùng trong AppBar thành `Trần Minh Anh · Biên tập nội dung`
(khớp khối "Chờ duyệt: Trần Minh Anh · 2 giờ trước") ở các khung minh hoạ luồng
duyệt. Nút `Xuất bản` với vai Biên tập đổi nhãn thành `Gửi yêu cầu duyệt` ở **mọi**
màn xuất bản được, kể cả Sửa xe. Bỏ chuỗi tiếng Anh.

---

### 25. Ba khối dữ liệu hiển thị mà mô hình không có bảng

**Khung:** SALES ADMIN — Sửa xe · Tồn & giao xe · Ưu đãi & trả góp · Trang & điều hướng

**Vấn đề:**

| Giao diện hiện | Bảng cần | Có trong SRS §4? |
|---|---|---|
| "Cập nhật gần nhất" — 3 dòng lịch sử sửa tồn xe | lịch sử `vehicle_availability` | Không — chỉ có `updated_by`, `updated_at` (một giá trị) |
| Đặt cọc giữ xe: `20.000.000 ₫` · `14 ngày` · `Hoàn 100 % nếu huỷ trước 7 ngày` | điều khoản cọc | Không có bảng nào |
| Nhật ký bật/tắt ưu đãi (2 dòng trong nhật ký giá) | audit cho `vehicle_promotion` | Không — `vehicle_price_log` chỉ có `old_amount`/`new_amount` |
| `Đánh giá` (mục sidebar CATALOG) · khối "Đánh giá khách hàng" trong thư viện | bảng review | Không thấy trong §4 |
| "14 lượt truy cập 404 trong 7 ngày" | thống kê truy cập | Không có |

**Hậu quả:** năm khối sẽ không code được theo migration đã hoạch định ở §7, phát
hiện ra ở bước 8 ("Sales Admin UI bảy tab, bám giao diện Pencil") — sau khi 7
migration đã chạy.

**Đề xuất:** với mỗi khối, chọn một trong ba: thêm bảng vào §4 và vào thứ tự
migration; dùng `audit_log` chung đã có (phù hợp cho lịch sử tồn xe và bật/tắt ưu
đãi); hoặc bỏ khối khỏi thiết kế. Điều khoản cọc là ba trường phẳng — thêm vào
`site_profile` hoặc `vehicle_product_revision` là gọn nhất. Riêng "Đánh giá" cần
xác minh với SRS cha trước khi kết luận.

---

### 26. Khoảnh khắc chữ ký không có phương án dự phòng

**Khung:** LANDING — Trang chủ (Màn 4) · bản điện thoại (khối 5)

**Vấn đề:** DES-LS-002 §9 chốt 🔒 "Con số chạy bằng `animation-timeline: scroll()`,
không phải thư viện". API này chỉ có ở Safari từ bản 26 (2025). Với tỷ lệ iPhone ở
Việt Nam, một phần đáng kể khách sẽ mở trang bằng trình duyệt không hỗ trợ.

Nếu không có dự phòng, phần tử giữ trạng thái ban đầu — **chặng 1**, tức
`1.199.000.000`, hiển thị 104 px dưới nhãn `GIÁ LĂN BÁNH · VF 8 ECO · HÀ NỘI`.
Đó là giá **niêm yết** đứng dưới nhãn **lăn bánh**: sai 22,4 triệu, và sai đúng
theo hướng mà cả khối được dựng để chống.

**Hậu quả:** khách trên trình duyệt cũ thấy một con số sai gắn nhãn sai, không có
dấu hiệu nào cho biết trang chưa chạy xong.

**Đề xuất:** trạng thái tĩnh mặc định của khối là **chặng cuối** (giá lăn bánh
đầy đủ, mọi dòng có tick), rồi mới nâng cấp bằng `@supports (animation-timeline:
scroll())` để chạy số. Đây cũng chính là trạng thái mà `prefers-reduced-motion`
đã yêu cầu, nên không phát sinh thiết kế mới — chỉ đổi cái nào là mặc định.

---

## Ca biên còn thiếu

Bộ 16 ca hiện có phủ tốt dữ liệu bất thường, dữ liệu đổi giữa chừng, thao tác lạ
và môi trường. Những ca dưới đây chưa có, xếp theo mức độ:

**Nặng**

1. **Không có biểu phí cho tỉnh khách chọn.** Bảng có 6/63 tỉnh, và trình soạn có
   công tắc "Cho khách đổi tỉnh". Khách chọn Nghệ An thì được; chọn Thanh Hoá thì
   trang hiện gì? Không được hiện 0, không được lặng lẽ dùng biểu phí Hà Nội. Đây
   là ca chắc chắn xảy ra ngay ngày đầu.
2. **Biểu phí hết hiệu lực** (`effective_to` đã qua, chưa có bản mới). Cùng nhóm
   với ca trên nhưng khác nguyên nhân, và ảnh hưởng **mọi** tỉnh cùng lúc.
3. **Tên miền không resolve được tenant** (`INV-LS-01`). Landing là bề mặt công
   khai duy nhất chọn tenant theo hostname. Nếu domain bị xoá khỏi `site_domain`
   hoặc ai trỏ domain lạ vào edge, khách thấy gì — và bằng logo, màu của tenant
   nào? Bộ 7 trang lỗi không có ca này.
4. **Ảnh bị xoá khỏi Thư viện ảnh khi đang dùng trong revision đã publish.**
   `INV-LS-22` chặn publish khi thiếu alt, nhưng không có gì chặn xoá ảnh đang
   dùng. Trang bán hàng với ô ảnh vỡ.
5. **`media_asset.alt_text` bị sửa thành rỗng sau khi publish.** `INV-LS-22` chặn
   ở bước publish; nếu alt dùng chung nhiều revision và sửa trực tiếp thì revision
   đã publish mất alt mà không đi qua bước bị chặn. Lỗ hổng của chính bất biến.

**Vừa**

6. **Ưu đãi chưa tới `starts_at`.** Cần trạng thái "Đã hẹn" (mục 8 ở trên).
7. **Hai người publish hai revision khác nhau trong cùng giây.** Hộp thoại "Xung
   đột phiên bản" xử lý *sửa* đồng thời, không xử lý *publish* đồng thời —
   `INV-LS-13` đòi mọi thứ đến từ cùng một publication.
8. **Lịch xuất bản đã quá giờ mà chưa chạy** (`publication_schedule.executed_at`
   còn `NULL`). Admin cần hiện "Đã quá hạn 2 giờ".
9. **Vai có `contentEdit` nhưng không có quyền sửa giá.** Ma trận tách "Sửa giá bán
   và ưu đãi" thành quyền riêng, nên tab Phiên bản & giá phải có trạng thái bị khoá.
10. **Không có bài nào `featured`,** hoặc bài featured bị bỏ publish. Trang Tin tức
    dành 540 px cho khối bài nổi bật.
11. **Màu xe chưa có ảnh.** Hướng dẫn đã nêu ("Màu xe không hiện ô chọn — màu đó
    chưa có ảnh nào") nhưng KIT không có.
12. **Cùng số điện thoại gửi hai lead cho hai xe.** Gộp hay tạo mới? Ảnh hưởng
    `INV-LS-15`: xoá dữ liệu cá nhân của một lead thì lead kia còn nguyên.
13. **429 xảy ra khi khách đang điền form trên landing.** Trang lỗi 429 hiện có là
    màn admin. Chuyển khách sang trang lỗi giữa lúc điền là mất dữ liệu đã nhập —
    phải là lỗi trong form, giữ nguyên nội dung.
14. **Khách in trang** bảng giá. Bảy màn 900 px nền tối không có print stylesheet.
15. **Xe chưa có ảnh nào.** Có ca "ảnh dọc lọt khung ngang" nhưng không có ca không
    ảnh, trong khi 6/7 màn là ảnh tràn viền.

---

## VỪA

### Nhất quán hệ thống

- **Nhịp gương ABBA không được dựng.** DES-LS-002 §2c chốt "hàng A là thẻ lớn bên
  trái + hai thẻ nhỏ bên phải, hàng B đảo ngược. Sáu xe mà không thành lưới đều".
  Màn 2 là lưới đều 3×2 — đúng cái được chỉ định phải tránh, ở màn chiếm trọn một
  màn hình.
- **Bộ chọn xe ở chân hero đã bị gỡ,** nên lời hứa §2b ("ai vào cũng thấy xe mình
  quan tâm trong màn hình đầu tiên") không còn đúng: khách muốn Santa Fe phải cuộn
  sang màn 2. Đó là rủi ro §2b nêu ra, và lá chắn của nó đã mất. Cập nhật §2b.
- **Thang tiêu đề khối có 5 cỡ:** 40 (Liên hệ, Tin tức), 44 (Màn 2, Màn 4, Danh
  sách xe), 54 (Màn 6), 62 (Màn 5), 82 (Màn 7). DES-LS-002 §4 chốt 44–56. Hero
  trang chủ 76 px, dưới dải 92–112 đã chốt; Màn 3 dùng 124 px, trên dải.
- **Tiêu đề `Giá lăn bánh chi tiết` ở Màn 2 trang chi tiết xe chỉ 22 px** trong khi
  các màn khác cùng vai dùng 44 px. Màn quan trọng nhất trang có tiêu đề nhỏ nhất.
- **Chữ 9 px** ở 6+ chỗ (`MÀU CÓ SẴN`, `THỜI GIAN GIAO`, nhãn nhóm sidebar,
  `NỔI BẬT`, tiêu đề cột bảng). §4 chốt nhãn kỹ thuật 11 px; nhãn kỹ thuật thực tế
  dùng 9/10/11/12 px.
- **Lề dọc khối:** 64 (Màn 4), 80 (Màn 6), 197 (Màn 7, canh giữa), 54/34 (chân
  trang). Không có thang spacing.
- **Trạng thái tồn xe có hai từ:** trang chủ dùng `Giao ngay`, danh sách xe và chi
  tiết xe dùng `Sẵn xe`, admin dùng `Có xe — giao ngay` + badge `Sẵn xe`. Enum
  chốt là `SẴN_XE`. Tương tự `Điện` (trang chủ) vs `Xe điện` (danh sách xe).
- **Palisade:** trang chủ ghi `Dầu 2.2 · 7 chỗ`, danh sách xe ghi `Xăng · 2.2
  Diesel` — bản thân chuỗi thứ hai tự mâu thuẫn. Bộ lọc chỉ có Điện/Hybrid/Xăng
  nên xe dầu bị gắn nhãn xăng.
- **`VF 9 Plus` ở Màn 3 dùng giá của VF 9 bản gốc** (`1.541.200.000`, khớp
  `1.499.000.000` niêm yết ở danh sách xe). Bản Plus phải cao hơn.
- **Giá dùng màu `signal`** trên thẻ xe, trong khi §3 phân vai `signal` cho nhãn
  kỹ thuật và `brand` cho nhấn số.
- **Badge trạng thái nền alpha 8 %** (`#177a4e14`) đặt trên ảnh xe: khi ảnh thật
  vào, nền không kiểm soát được. Trên placeholder đã cho 3,85 : 1.
- **Preview ở màn Giao diện dùng tenant khác** (`Garage Thành Công`, nút
  `Khám phá xe`) trong khi toàn hệ thống là `Ô tô Việt Anh`.
- **Bo góc cấu hình ở hai nơi:** khối "Kiểu nút" có `Bo tròn / Vuông`, khối "Mật độ
  và bo góc" có `0 / 8 / 16 / 999`. Và "Kiểu nút" trộn hai chiều (tô: Đặc/Viền;
  hình: Bo tròn/Vuông).
- **Ba tuỳ chọn bố cục hero** (`Ảnh lớn bên phải` là mặc định · `Ảnh tràn khung` ·
  `Chỉ chữ`) nhưng chỉ tuỳ chọn thứ hai được vẽ, và bản dựng landing dùng nó — tức
  mặc định khai sai. Mô hình "mỗi khối một màn hình" khó dung nạp "ảnh lớn bên
  phải"; đề xuất bỏ tuỳ chọn hoặc vẽ cả ba.
- **Khối `Chân trang` nằm trong thư viện khối như một khối kéo-thả tuỳ chọn** nhưng
  không có trong danh sách 7 màn hình, dù landing có chân trang. Nghĩa là xoá được
  chân trang và không sửa được nó. Nên là hàng cố định, khoá.

### Tương phản (ngoài mục 17, 18, 19)

| Tỉ lệ | Cỡ | Cặp màu | Chỗ |
|---|---|---|---|
| 1,44 : 1 | 10 px | `#6b6e66` trên `#888785` | `Đặt nổi bật`, SALES ADMIN (sáng) — Xe, 5 chỗ. Bản tối không trượt |
| 2,21 : 1 | 12 px | `$danger` trên trắng | dấu `*` bắt buộc, LANDING — Liên hệ, 4 chỗ (mục 15) |
| 3,01 : 1 | 10 px | `#7a7d74` trên `#dddbd3` | badge `Đặt hàng`, Danh sách xe |
| 3,06 : 1 | 9 px | `#c73526` trên `#1d2125` | badge `NỔI BẬT`, Sửa xe |
| 3,33 : 1 | 15/18 px | `#656768` trên `#0e1113` | dòng bảo hiểm vật chất, khối chữ ký (mục 3) |
| 3,78 : 1 | 10 px | `#7a7d74` trên `#f3f3f3` | badge `Đặt hàng`, Chi tiết xe |
| 3,79 : 1 | 12 px | `$text-dim` trên `#272a2d` | badge `Không đạt`, Leads |
| 3,85 : 1 | 10 px | `#177a4e` trên `#d8ddd2` | badge `Sẵn xe`, Danh sách xe, 3 chỗ |
| 4,07 : 1 | 10 px | `#8a5f12` trên `#e1dacd` | badge `Sắp về`, Danh sách xe, 2 chỗ |
| 4,19 : 1 | 15 px | `#7a7d74` trên trắng | `30 – 45 ngày` (Đà Nẵng) — còn dùng màu mờ khác 4 chi nhánh kia |
| 4,26 : 1 | 13 px | `$text-dim` trên `#1d2125` | placeholder form lái thử, 5 chỗ |

Nhóm badge trạng thái đáng chú ý riêng: cả ba trạng thái tồn xe đều trượt trên nền
sáng, và đây là thông tin quyết định mua.

Nút bị vô hiệu (`Lưu thay đổi`, 3,55 : 1) **không** tính là lỗi — WCAG miễn trừ
thành phần disabled.

### Luồng công việc

- **Kỳ hạn 12 và 24 tháng nhập được ở admin nhưng landing chỉ hiện 36/48/60/84.**
  `allowed_terms_months` là `int[]`, landing phải render đủ.
- **Bốn mốc trả trước trên landing (20/30/40/50 %) không có nơi cấu hình** — mô
  hình chỉ có `min_down_payment_bp`. Hoặc thêm mảng mốc, hoặc chốt quy tắc sinh.
- **`Giá thuê pin / tháng: 3.900.000` nhập được nhưng landing không hiện ở đâu.**
  Với VF 8 đây là yếu tố quyết định mua. Biên tập viên nhập rồi tưởng đã công bố.
- **Điều khoản cọc nhập được nhưng landing không hiện** (xem thêm mục 25).
- **Trạng thái ưu đãi có `Đã tắt`** nhưng `vehicle_promotion` chỉ có
  `starts_at`/`ends_at` — không có cờ bật/tắt. `Sắp hết` cũng là suy ra với ngưỡng
  không cấu hình được.
- **Không có màn nào cho nhân viên chi nhánh cập nhật tồn xe.** SRS §3 chốt tồn xe
  đi đường riêng vì "nhân viên chi nhánh sửa nó vài lần mỗi tuần", nhưng UI chôn nó
  thành tab thứ sáu của màn Sửa xe — cạnh nút `Xuất bản` và các tab nội dung cần
  quyền cao. SRS §8 đã treo "ai được sửa `vehicle_availability`"; thiết kế nên đi
  trước bằng một màn danh sách xe × chi nhánh sửa trực tiếp, đặt ở nhóm CATALOG.
- **Nút `Xem tất cả` ở khối FAQ trang Liên hệ** không có đích: `faq_placement.surface`
  chỉ có `HOME|CONTACT|VEHICLE|NEWS`, không có trang FAQ độc lập trong 9 trang.
- **Không có khung mobile nào cho Sales Admin hoặc xưởng.** File có đúng hai khung
  390 px, cả hai của landing. KIT có quy tắc "dưới 1100 px bảng thành danh sách
  thẻ" và ca biên "màn hình hẹp hơn 1024 px → màn chặn", nhưng không có khung nào
  dựng trạng thái đó.

### Khả thi khi code

- **Khung mock cao 1080 px cao hơn vùng nhìn thật.** Trên 1920×1080 với chrome
  trình duyệt, vùng nhìn còn ~940 px. Mọi màn admin sẽ có ~140 px nội dung nằm dưới
  màn hình so với bản vẽ; ở màn Phiên bản & giá, khối "Thông số kỹ thuật" (dưới
  cùng) rơi ra ngoài.
- **Màn landing 900 px cũng cao hơn vùng nhìn** (~780–800 px trên 1440×900 có
  chrome). Nếu code bằng `100vh` thì Màn 4 (nội dung thật 772 px trong 900) sẽ chật
  hoặc tràn. Chốt: nội dung mỗi màn phải vừa trong **780 px** để `100vh` an toàn,
  hoặc dùng `min-height: 100vh` và bỏ ý "cuộn là lật trang".
- **"còn 6 ngày" và trạng thái hết hạn tính ở đâu.** `INV-LS-19` enforce bằng truy
  vấn (giờ máy chủ). Nếu badge đếm ngược tính ở client theo giờ máy khách thì hai
  nguồn sẽ lệch. KIT — Bảng rộng & chữ dài đã ghi nhận nợ này cho ngày giờ
  (⚠️ "hiện đang vẽ theo giờ trình duyệt"); áp cùng ghi chú cho đếm ngược ưu đãi.
- **Bảng phí có thêm cột `Đăng kiểm` riêng và landing tách 3 dòng** (`Phí đăng kiểm`
  · `Phí đường bộ 12 tháng` · `Bảo hiểm trách nhiệm dân sự`) trong khi admin tab
  giá gộp thành `Đăng kiểm + đường bộ + BHTNDS` ở màn Biểu phí và tách khác ở tab
  Phiên bản & giá. Ba bề mặt, ba cách nhóm khoản mục. Chốt một danh sách khoản.
- **Quyền `Xem đơn sửa chữa của xưởng` xuất hiện trong ma trận Sales Admin.** Các ô
  đều là `minus` nên **không** vi phạm `INV-LS-14`, và hướng dẫn cũng cố ý để trống
  cả hàng. Nhưng việc hàng này tồn tại trong màn phân quyền của Sales Admin đặt ra
  câu hỏi kiến trúc chưa có câu trả lời: quyền cross-app khai ở đâu. Giữ hàng thì
  nên có chú thích "luôn tắt — hai hệ thống không dùng chung quyền".

---

## NHẸ

- **Ba bộ tên token cho cùng một thứ:** `--ink-void` (DES-LS-002 §3), `ink-0`
  (file `.pen`), `--surface-0` (màn Giao diện). Giá trị cũng lệch: `#08090a` vs
  `#0a0b0c`; `#f6f5f3` vs `#f3f1eb`.
- **Sáu tông nền tối** trong bản dựng landing, không tông nào khớp token khai báo.
- **`MƯỜI BỐN PHIÊN BẢN`** viết bằng chữ ở trang chủ, `14 phiên bản` bằng số ở
  danh sách xe.
- **`line-height`** 1,6 (màn Giao diện) vs 1,65 (DES-LS-002 §4).
- **Nhãn `CHẶNG 4 / 5`** trong khi §9 và trình soạn đều nói 4 chặng.
- **Hero trang chủ ghi `HÀ NỘI · HẢI PHÒNG · TP.HCM`** nhưng chi tiết xe có chi
  nhánh Đà Nẵng và admin có thêm Vinh, Nha Trang, Cần Thơ.
- **`4,7/5 điểm hài lòng`** không có nguồn. Không phải số suy ra nên `INV-LS-16`
  không áp, nhưng là phát biểu định lượng trên trang bán hàng.
- **Biển số TP.HCM `11.000.000`** — thực tế khu vực I là 20 triệu như Hà Nội.
  Bộ số mẫu này sẽ được dùng để đối chiếu tay theo §7 mục 2.
- **`Showroom Long Biên`** (admin) vs `Long Biên` (landing); và gọi mọi chi nhánh
  là "Showroom" trong khi Long Biên và Hải Phòng là `showroom + xưởng`.
- **`Đủ 6 màu`** là số suy ra từ `vehicle_color`; nếu revision có 7 màu thì câu này
  sai. `Đủ mọi màu` an toàn hơn.
- **Bảng gom nhóm sidebar ở SRS §6 lỗi thời** so với bản dựng: bản dựng có `Câu hỏi`
  trong WEBSITE và `Biểu phí lăn bánh` trong CẤU HÌNH (đúng theo phần rà soát ở
  cuối §6), bảng ở đầu §6 thì không. Bản dựng đúng; sửa bảng.
- **SRS §2 và §2c mâu thuẫn** về bộ lọc ở Màn 2: §2 ghi "lọc nhanh", §2c ghi trang
  chủ "cố tình không có bộ lọc". Bản dựng có lọc theo động cơ. Chốt: có lọc theo
  động cơ ở trang chủ, còn lọc tầm giá / chi nhánh / sắp xếp / so sánh là của
  trang catalog — rồi sửa §2c cho khớp.

---

## Không tìm thấy lỗi nghiêm trọng

- **Ma trận quyền** (SALES ADMIN — Người dùng & quyền): khớp đủ bảng "Ai làm được
  gì" trong hướng dẫn, `INV-LS-14` (cả 5 vai đều `minus` ở hàng xưởng) và
  `INV-LS-21` (Biên tập không có ô xuất bản). Dùng `check`/`minus` khác hình dạng
  nên không phụ thuộc màu — đạt WCAG 1.4.1. Khối "Vì sao tách hai quyền" giải thích
  đúng cơ chế.
- **Quy tắc phân loại lỗi** (ô / form / toast / băng báo / hộp thoại / trang lỗi)
  và bộ 5 trạng thái ô nhập: mạch lạc, và quy tắc "khối tóm tắt lỗi chỉ hiện sau
  lần bấm Gửi đầu tiên" là đúng.
- **Quy tắc cắt chữ trong bảng rộng:** phân biệt "được cắt" / "không bao giờ cắt"
  đúng chỗ — tiền, biển số, VIN, mã đơn, nhãn trạng thái không cắt; và ba quy tắc
  số liệu (căn phải, `Liên hệ` thay vì `0 ₫`, số âm có dấu −) khớp nguyên tắc tiền
  của CLAUDE.md.
- **Ba hộp thoại phá huỷ:** gõ lại tên mẫu xe để xoá, xoá dữ liệu cá nhân nói thẳng
  là không hoàn tác được, xung đột phiên bản không có nút "lưu đè". Đúng cả ba.
