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
- 🔒 **Đẩy `main` lên remote NGAY sau mỗi lần merge lát cắt.** Không đợi ai nhắc.
- Một nhánh = một lát cắt dọc ([15-roadmap.md](docs/15-roadmap.md)), không gộp nhiều việc.
- Mô tả nhánh **không dấu**, kebab-case, ≤ 5 từ.
- Xoá nhánh sau khi merge — cả local lẫn remote.

⚠️ **Vì sao quy tắc "đẩy ngay" đứng ngang hàng với những quy tắc còn lại:** đã
có lúc bốn lát cắt liên tiếp (Phase 5, 6, 8, 3) được merge vào `main` ở local mà
**không lần nào đẩy lên**. Quy trình chạy đúng tới bước áp chót rồi dừng, và
không có gì báo động vì `git log` ở local trông hoàn toàn bình thường.

Hai cái giá, cái thứ hai nặng hơn:

- Toàn bộ công việc chỉ nằm trên **một máy** — ổ hỏng là mất sạch.
- Người cùng làm mở GitHub ra thấy dự án **dừng ở Phase 4**, trong khi thực tế
  đã xong tới Phase 8. Họ không có cách nào biết mình đang nhìn một bản cũ.

💡 "Merge xong" không phải là xong. **Xong là khi người khác thấy được.**

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
- 🔒 **Không commit code đỏ.** `lint` + `typecheck` + `test` + **`build`** phải xanh
- Thân commit giải thích **vì sao**, không phải **làm gì** — diff đã nói làm gì

## 3. Quy trình một lát cắt

```
1. Tạo nhánh từ main
2. Viết test trước cho bất biến mới (TDD)
3. Code cho test xanh
4. Tự review: lint / typecheck / test
5. pnpm build             ← BẮT BUỘC, xem mục 3.1
6. /codex-review          ← review độc lập + phản biện
7. Sửa các CONFIRMED
8. Commit theo quy ước
9. Merge vào main, ĐẨY LÊN REMOTE, xoá nhánh
```

🔒 **Bước 6 không được bỏ qua** với bất kỳ thay đổi nào chạm: kho, tiền, phân
quyền, hoặc bất biến.

### 3.1 🔒 Vì sao `pnpm build` là một bước riêng, không phải việc lúc triển khai

`next dev` và `next build` là **hai trình biên dịch khác nhau**. `dev` biên dịch
lười từng route, không rút gọn, và chỉ nhắm môi trường Node. `build` biên dịch
toàn chương trình, rút gọn, nhắm cả trình duyệt lẫn Node, và truy vết dependency
để đóng gói. Một lớp lỗi CHỈ tồn tại ở lớp sau — và `lint` với `typecheck` xanh
hết.

Bốn lỗi thật của dự án này, cả bốn đều lọt qua lint + typecheck + test:

| Triệu chứng | Chỉ lộ ra ở |
|---|---|
| `node:crypto` lọt vào bundle trình duyệt qua barrel của `@garageos/domain` | `pnpm build` |
| `output: standalone` truy vết sai gốc → `.next/standalone/` không có `server.js` | đọc cây build |
| script `start` không tương thích standalone → mọi route động 404 | chạy bản build |
| trình duyệt gọi API bằng header host không ký → form lead 404 | E2E trên bản build |

⚠️ Ba lỗi cuối đều để `pnpm build` in ra **"successful"**. Một bản build xanh mà
sản phẩm của nó không chạy được là kiểu hỏng tệ nhất: nó tiêu diệt đúng tín hiệu
mà ta dựa vào để biết mình ổn.

💡 Vì thế bước 5 không dừng ở "build không lỗi". Với thay đổi chạm `apps/*`,
phải **chạy thử bản build** — `pnpm --filter <app> start` rồi mở vài route thật.
E2E ở CI làm việc đó cho landing, sales-admin và web; nhưng ở máy, người sửa là
người chạy.

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
