# GarageOS

Hệ thống quản lý xưởng dịch vụ ô tô đa chi nhánh, hỗ trợ xe xăng / hybrid / điện.

**NestJS · Next.js 15 · PostgreSQL 16 · TypeScript · monorepo pnpm + Turborepo**

[![CI](https://github.com/khanhviet529/GarageOS/actions/workflows/ci.yml/badge.svg)](https://github.com/khanhviet529/GarageOS/actions/workflows/ci.yml)

---

> 👋 **Mới tham gia dự án?** Đọc [`ONBOARDING.md`](ONBOARDING.md) trước — nó
> gom lại: dự án làm gì, chạy lên thế nào, quy tắc nào không được vi phạm, và
> toàn bộ danh sách việc còn phải làm.

## Dự án này giải quyết gì

Một garage ô tô nhận xe, chẩn đoán, báo giá, sửa, rồi giao xe. Nghe đơn giản,
nhưng phần lớn phần mềm quản lý garage ở Việt Nam làm sai đúng những chỗ khó:

| Tình huống có thật | Phần mềm ngây thơ làm sai thế nào |
|---|---|
| Khách nói *"phanh với đèn thì làm đi, điều hoà để lần sau"* | Trạng thái duyệt đặt ở cấp báo giá → phải lập báo giá mới → chậm, gõ lại giá dễ sai, và **mất dữ liệu** về việc khách đã từ chối gì để lần sau chào lại |
| Nhân viên gõ `30A-123.45`, lần sau gõ `30A12345` | Một chiếc xe có hai hồ sơ → lịch sử phân mảnh → tra bảo hành không ra |
| Xe thuần điện vào xưởng | Danh sách vẫn chào bán "thay dầu động cơ" → lộ ngay sự thiếu chuyên nghiệp trước mặt khách |
| Garage tăng giá công tháng sau | Báo giá đã gửi khách tuần trước đổi theo → con số khách đồng ý khác con số xưởng thu |
| Khách khiếu nại vết trầy không do xưởng gây ra | Không có ảnh hiện trạng → garage thường thua |

GarageOS coi những tình huống đó là **bài toán trung tâm**, không phải ngoại lệ.
Toàn bộ thiết kế nằm ở [`docs/`](docs/README.md) — 9.300 dòng, viết trước khi
viết dòng code đầu tiên.

---

## Demo: một vòng đầu-cuối

Kịch bản dưới đây **chạy thật** trong CI mỗi lần push, bằng một test Playwright
điều khiển hai trình duyệt song song — máy tính ở quầy và điện thoại của khách
([`e2e/tra-cuu-cong-khai.spec.ts`](e2e/tra-cuu-cong-khai.spec.ts)).

### 1. Tiếp nhận xe

Gõ biển số → hệ thống chuẩn hoá và tra. Ba kết quả, ba hành động khác nhau.
Cảnh báo số km lùi hiện **ngay khi gõ**, không đợi bấm lưu — lúc đó người dùng
vẫn đang đứng cạnh đồng hồ công tơ mét.

![Màn tiếp nhận xe](docs/images/01-tiep-nhan.png)

### 2. Danh mục lọc theo loại động cơ

Cùng một màn hình, mở với xe thuần điện: **không có** "thay dầu động cơ". Hạng
mục không áp dụng được thì không xuất hiện, chứ không phải bị làm mờ.

![Danh mục xe điện](docs/images/02-danh-muc-xe-dien.png)

### 3. Lập báo giá

Danh mục bên trái, báo giá đang hình thành bên phải. Cố vấn ngồi cạnh khách vừa
nói vừa thêm hạng mục, nên tổng tiền phải luôn trong tầm mắt. Phụ tùng gắn vào
hạng mục công đã dùng nó.

![Lập báo giá](docs/images/03-lap-bao-gia.png)

### 4. Khách duyệt từng phần trên điện thoại

Khách mở link, không cần cài ứng dụng, không cần tài khoản. Chọn từng hạng mục,
tổng của phần đã chọn cập nhật ngay. Xác nhận bằng mã OTP gửi về số điện thoại
trên hồ sơ khách.

![Khách duyệt trên điện thoại](docs/images/04-khach-duyet.png)

Phụ tùng **nằm bên trong** hạng mục công và không có công tắc riêng — khách
không thể duyệt phụ tùng mà không duyệt công.

### 5. Máy trạng thái

Chỉ hiện những bước hợp lệ từ trạng thái hiện tại. Nút không hợp lệ không xuất
hiện — làm mờ vẫn buộc người dùng đọc và loại trừ.

![Bước tiếp theo](docs/images/05-may-trang-thai.png)

---

## Điều gì đáng xem về mặt kỹ thuật

### Bất biến enforce ở tầng thấp nhất có thể

41 bất biến được liệt kê ở [`docs/05-invariants.md`](docs/05-invariants.md), và
nguyên tắc là **ràng buộc DB > trigger > service > UI**. UI không bao giờ tính
là enforce.

```sql
-- 🔒 INV-V-03: một xe chỉ có MỘT đơn đang mở
CREATE UNIQUE INDEX one_open_order_per_vehicle
  ON repair_order (tenant_id, vehicle_id)
  WHERE status NOT IN ('DELIVERED','CANCELLED');
```

```sql
-- 🔒 INV-V-01: hạng mục phải hợp loại động cơ — TẦNG BẢO VỆ THẬT.
-- Giao diện chỉ giấu hạng mục khỏi danh sách; trigger này chặn hẳn, dù request
-- đến từ API, script bảo trì hay import.
CREATE TRIGGER trg_qline_powertrain
  BEFORE INSERT OR UPDATE OF service_item_id ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_powertrain_dong_bao_gia();
```

### Cô lập tenant bằng Row-Level Security, không bằng `WHERE`

```ts
// 🔒 tenantId đến từ token đã xác thực, không bao giờ từ tham số request
await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', actor.tenantId]);
```

⚠️ **Cái bẫy tốn nhiều thời gian nhất của dự án:** superuser và role có
`BYPASSRLS` **bỏ qua RLS kể cả khi** bảng đã `FORCE ROW LEVEL SECURITY`. Cô lập
trông như hoạt động cho tới lúc không. Dự án tách hai role — `garageos` chạy
migration, `garageos_app` chạy ứng dụng — và **API từ chối khởi động** nếu role
kết nối có đặc quyền.

### Tiền là số nguyên đồng, làm tròn ở từng dòng

Database tính tiền của một dòng bằng trigger; TypeScript có bản song song để xem
trước trên giao diện. Có **test đối chiếu hai bên khớp từng đồng** trên 7 tổ hợp
số lượng lẻ và thuế suất — cùng loại rủi ro "một quy tắc, hai bản cài đặt" như
`normalize_plate`.

### Máy trạng thái ba lớp

| Lớp | Việc của nó |
|---|---|
| [`packages/contracts`](packages/contracts/src/state-machine.ts) | Web chỉ vẽ nút hợp lệ |
| Service | Thông báo lỗi tiếng Việt + khoá lạc quan qua `version` |
| Trigger database | Chặn cả script bảo trì và import |

Bảng chuyển đổi tồn tại ở hai nơi (TypeScript và một bảng dữ liệu trong DB) nên
có **test đối chiếu hai chiều**: lệch nhau nghĩa là web vẽ ra nút database từ
chối, hoặc tệ hơn — database cho qua một đường web không bao giờ hiển thị nên
không ai từng thử.

### Vòng review đối kháng

Mọi thay đổi chạm kho / tiền / quyền / bất biến phải qua `/codex-review`: tôi
code, một mô hình khác review độc lập, hai bên phản biện, và **trọng tài là một
test chạy được** chứ không phải sự đồng thuận.

6 vòng đã chạy, **17 phát hiện, 17 xác nhận đúng**. Mỗi vòng có bản ghi trong
[`docs/reviews/`](docs/reviews/README.md) nêu rõ test nào đỏ trước khi sửa —
kể cả những phát hiện chỉ ra lỗi của chính tôi:

> Phạm vi chi nhánh chỉ chặn lúc **ghi**, không chặn lúc **đọc**. Tôi đã tự viết
> kiểm tra ở `create()` và còn ghi comment *"RLS không chặn được vì cùng tenant"*,
> rồi quên áp đúng lập luận đó cho đường đọc.

---

## Cấu trúc

```
apps/api        NestJS   — controller → service (nghiệp vụ + quyền) → repository → DB
apps/web        Next.js  — nhân viên + trang tra cứu công khai cho khách
packages/contracts  Zod schema, type, enum, bảng hằng (state machine)
packages/domain     Logic thuần: tiền, biển số — không import framework
packages/db         Truy cập dữ liệu có cô lập tenant
infra/migrations    SQL viết tay — 🔒 nguồn sự thật của schema
docs/               Thiết kế đầy đủ, 9.300 dòng
```

🔒 **Migration là SQL viết tay, không dùng `prisma migrate`** — Prisma không tạo
được exclusion constraint, RLS policy hay trigger. Xem
[ADR-0007](docs/adr/0007-prisma-plus-raw-sql.md).

---

## Chạy tại chỗ

Cần Docker và Node 20+.

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev            # API :3001 · web :3000
```

Mở http://localhost:3000, đăng nhập `0901000003` / `demo1234` (cố vấn dịch vụ).
Trang đăng nhập liệt kê sẵn các tài khoản demo khác.

```bash
pnpm test           # 162 test tích hợp trên Postgres THẬT — cần API đang chạy
pnpm e2e            # 17 kịch bản Playwright — cần cả API lẫn web
```

🔒 Test dùng **PostgreSQL thật trong Docker, không dùng SQLite** — exclusion
constraint và RLS không tồn tại ở đó, test sẽ xanh giả.

---

## Trạng thái

**Phase 1 hoàn thành**: tiếp nhận → danh mục → báo giá → khách duyệt từng phần →
máy trạng thái đầy đủ.

| | |
|---|---|
| Test tự động | 162 |
| E2E Playwright | 17 |
| Migration | 15 |
| Vòng codex-review | 6 · 17 phát hiện · 17 xác nhận |

Chi tiết, nợ kỹ thuật đã biết và các bẫy hạ tầng đã gặp: [`STATUS.md`](STATUS.md).
Lộ trình các phase sau: [`docs/15-roadmap.md`](docs/15-roadmap.md).

---

## Bản đồ tài liệu

| Cần gì | Đọc |
|---|---|
| Vì sao làm dự án này, phạm vi tới đâu | [`00-vision.md`](docs/00-vision.md) |
| Điều gì tuyệt đối không được sai | [`05-invariants.md`](docs/05-invariants.md) |
| Trạng thái nào sang trạng thái nào | [`06-state-machines.md`](docs/06-state-machines.md) |
| Case nghiệp vụ cụ thể (15 case) | [`07-business-cases/`](docs/07-business-cases/) |
| Schema, ràng buộc, trigger | [`10-data-model.md`](docs/10-data-model.md) |
| Vì sao chọn thế này chứ không thế kia | [`adr/`](docs/adr/) |
| Nhật ký review, có dấu vết kiểm chứng | [`reviews/`](docs/reviews/README.md) |
