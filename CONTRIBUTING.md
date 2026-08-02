# Quy ước phát triển — GarageOS

## 1. Quy ước nhánh

```
<loại>/<mô-tả-ngắn-kebab-case>
```

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| `feat/` | Thêm tính năng mới | `feat/tiep-nhan-xe` |
| `fix/` | Sửa lỗi | `fix/giu-cho-race-condition` |
| `refactor/` | Đổi cấu trúc, không đổi hành vi | `refactor/tach-tang-service` |
| `test/` | Chỉ thêm/sửa test | `test/bat-bien-ton-kho` |
| `docs/` | Chỉ tài liệu | `docs/adr-multi-tenant` |
| `chore/` | Hạ tầng, cấu hình, phụ thuộc | `chore/ci-github-actions` |
| `perf/` | Tối ưu hiệu năng | `perf/index-tra-cuu-bien-so` |

**Quy tắc:**

- 🔒 **Không push thẳng vào `main`.** Mọi thay đổi đi qua nhánh riêng.
- Một nhánh = một lát cắt dọc ([15-roadmap.md](docs/15-roadmap.md)), không gộp nhiều việc.
- Mô tả nhánh **không dấu**, kebab-case, ≤ 5 từ.
- Xoá nhánh sau khi merge.

## 2. Quy ước commit

Theo **Conventional Commits**, phần mô tả viết **tiếng Việt có dấu**:

```
<loại>(<phạm vi>): <mô tả ngắn, không viết hoa đầu, không dấu chấm cuối>

<thân — tuỳ chọn: giải thích VÌ SAO, không phải LÀM GÌ>

<chân — tuỳ chọn: liên kết bất biến, ADR, case nghiệp vụ>
```

### Loại

| Loại | Ý nghĩa |
|---|---|
| `feat` | Tính năng mới cho người dùng |
| `fix` | Sửa lỗi |
| `refactor` | Đổi cấu trúc, hành vi không đổi |
| `test` | Thêm/sửa test |
| `docs` | Tài liệu |
| `chore` | Hạ tầng, cấu hình, phụ thuộc |
| `perf` | Tối ưu hiệu năng |
| `style` | Định dạng code, không đổi logic |

### Phạm vi

Theo module hoặc package:

`api` · `web` · `mobile` · `contracts` · `domain` · `db` · `ci` · `docs`
`repair-order` · `quotation` · `inventory` · `work` · `billing` · `warranty`

### Ví dụ tốt

```
feat(inventory): thêm giữ chỗ phụ tùng khi duyệt báo giá

Giữ chỗ chỉ giảm `reserved`, không đụng `on_hand` — phụ tùng vẫn nằm
trên kệ cho tới khi thợ thực sự lắp. Tránh tình trạng thủ kho nhìn thấy
hàng mà hệ thống báo hết.

Bất biến: INV-S-01, INV-S-05
Case: BC-04
```

```
fix(db): khoá dòng stock_balance theo thứ tự part_id để tránh deadlock

Hai đơn cùng giữ chỗ nhiều món giao nhau theo thứ tự ngược sẽ tạo chu
trình chờ. Sắp xếp part_id tăng dần trước khi khoá.

Bất biến: INV-S-01
Case: BC-04 mục 4
```

```
test(inventory): 50 request giữ chỗ đồng thời khi tồn = 1

Bất biến: INV-S-01
```

### Ví dụ xấu

| Commit | Vì sao xấu |
|---|---|
| `update code` | Không nói gì |
| `fix bug` | Bug nào? |
| `feat: Thêm tính năng mới.` | Viết hoa đầu, có dấu chấm cuối, mô tả rỗng |
| `feat(api): thêm giữ chỗ, sửa lỗi hoá đơn, đổi CI` | Gộp nhiều việc — tách ra |

### Quy tắc bắt buộc

- 🔒 Dòng đầu **≤ 72 ký tự**
- 🔒 Commit **chạm bất biến** ([05-invariants.md](docs/05-invariants.md)) phải ghi mã bất biến ở chân
- 🔒 Commit **triển khai case nghiệp vụ** phải ghi mã case (`BC-xx`)
- 🔒 **Không commit code đỏ.** `lint` + `typecheck` + `test` phải xanh
- Thân commit giải thích **vì sao**, không phải **làm gì** — diff đã nói làm gì

## 3. Quy trình một lát cắt

```
1. Tạo nhánh từ main
2. Viết test trước cho bất biến mới (TDD)
3. Code cho test xanh
4. Tự review: lint / typecheck / test
5. /codex-review          ← review độc lập + phản biện
6. Sửa các CONFIRMED
7. Commit theo quy ước
8. Merge vào main, xoá nhánh
```

🔒 **Bước 5 không được bỏ qua** với bất kỳ thay đổi nào chạm: kho, tiền, phân
quyền, hoặc bất biến.

## 4. Nguyên tắc không thoả hiệp

Trích từ [docs/README.md](docs/README.md):

1. Bất biến enforce ở **tầng thấp nhất có thể** — ưu tiên DB hơn service, service hơn UI
2. Chứng từ tài chính và kho **bất biến** — sửa bằng chứng từ đảo
3. Tiền **luôn là số nguyên**, đơn vị đồng
4. Mọi truy vấn **giới hạn theo `tenant_id`** — enforce ở hạ tầng
5. Nghiệp vụ ở tầng service thuần, **không phụ thuộc framework**

## 5. 🔒 Vì sao test chạy tuần tự

Trong mỗi package, test chạy với `node --test --test-concurrency=1` — tuần tự
từng file (xem `infra/run-tests.mjs`).

Đây là test **tích hợp**: chúng dùng chung một database và một tiến trình API.
Chạy song song là để chúng giẫm lên nhau. Ví dụ đã xảy ra thật: một test đóng
bảng giá hiện hành rồi mở bảng giá mới; trong khoảnh khắc giữa hai lệnh đó, mọi
test khác đang đọc giá đều nhận "chưa có bảng giá nào đang hiệu lực".

Lỗi loại này xanh trên máy này và đỏ trên CI chỉ vì số lõi CPU khác nhau — loại
lỗi tốn nhiều thời gian nhất để chẩn đoán. Đổi lấy vài giây chạy lâu hơn là một
đánh đổi rẻ.

💡 Kèm theo: thao tác nhiều bước lên dữ liệu dùng chung phải nằm trong **một
giao dịch**, kể cả trong test. Không có giao dịch thì vẫn còn khe hở, chỉ là hẹp
hơn.
