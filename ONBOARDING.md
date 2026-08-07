# Bắt đầu với GarageOS

> Tài liệu này dành cho **người mới tham gia dự án**. Đọc hết mất khoảng 20
> phút, và sau đó bạn biết: dự án làm gì, vì sao nó được thiết kế như vậy, chạy
> nó lên thế nào, và còn những việc gì phải làm.
>
> Cập nhật: 2026-08-04 · Trạng thái chi tiết ở [`STATUS.md`](STATUS.md)

---

## 1. Dự án này là gì

**GarageOS — hệ thống quản lý xưởng dịch vụ ô tô đa chi nhánh**, hỗ trợ xe
xăng, hybrid và xe điện.

Một garage nhận xe, chẩn đoán, báo giá, sửa, rồi giao xe. Nghe đơn giản. Nhưng
phần lớn phần mềm quản lý garage làm sai đúng những chỗ khó, và dự án này coi
**những chỗ khó đó là bài toán trung tâm**:

| Tình huống có thật | Phần mềm ngây thơ làm sai thế nào |
|---|---|
| Khách nói *"phanh với đèn thì làm đi, điều hoà để lần sau"* | Trạng thái duyệt đặt ở cấp báo giá → phải lập báo giá mới → gõ lại giá dễ sai, và mất dữ liệu về thứ khách đã từ chối |
| Kho còn **đúng một** bộ má phanh, hai khách cùng duyệt lúc 9:00 và 9:01 | Chỉ kiểm `tồn > 0` rồi cho qua → cả hai đơn đều nhận → thợ thứ hai ra kho không có hàng, sau khi hệ thống đã hứa với khách |
| Nhân viên gõ `30A-123.45`, lần sau gõ `30A12345` | Một chiếc xe thành hai hồ sơ → lịch sử phân mảnh → tra bảo hành không ra |
| Garage tăng giá công tháng sau | Báo giá đã gửi khách tuần trước đổi theo → con số khách đồng ý khác con số xưởng thu |
| Xe thuần điện vào xưởng | Danh sách vẫn chào "thay dầu động cơ" trước mặt khách |

### Mục đích của dự án

Đây là **dự án portfolio để xin việc fullstack**, và về sau dùng lại được cho
mục đích thương mại. Điều đó quyết định cách làm:

- **Chiều sâu quan trọng hơn số lượng tính năng.** Một bài toán tranh chấp đồng
  thời giải đúng có giá trị hơn mười màn CRUD.
- **Mỗi quyết định phải giải thích được.** Comment trong mã nguồn viết *vì sao*,
  không viết *làm gì* — người đọc tự đọc được code.
- **Test phải chứng minh hệ thống TỪ CHỐI làm điều sai**, không chỉ chứng minh
  tính năng chạy được.

📖 Bối cảnh đầy đủ: [`README.md`](README.md) · phạm vi và hàng rào scope:
[`docs/00-vision.md`](docs/00-vision.md)

---

## 2. Đọc gì, theo thứ tự nào

Bộ tài liệu thiết kế ở [`docs/`](docs/README.md) dài **9.300 dòng** và được
viết **trước** dòng code đầu tiên. Đừng đọc hết ngay. Đọc theo thứ tự này:

| # | Đọc | Mất bao lâu | Vì sao cần |
|---|---|---|---|
| 1 | [`README.md`](README.md) | 5 phút | Dự án giải quyết gì |
| 2 | [`CLAUDE.md`](CLAUDE.md) | 5 phút | **5 nguyên tắc không thoả hiệp** — vi phạm là PR bị từ chối |
| 3 | [`docs/01-glossary.md`](docs/01-glossary.md) | 5 phút | Gọi tên sự vật cho thống nhất. Đặt tên ngoài từ điển là lỗi |
| 4 | [`docs/05-invariants.md`](docs/05-invariants.md) | 20 phút | **41 bất biến.** Đây là tài liệu quan trọng nhất của cả dự án |
| 5 | [`CONTRIBUTING.md`](CONTRIBUTING.md) | 5 phút | Quy ước nhánh, commit, quy trình review |
| 6 | [`STATUS.md`](STATUS.md) | 10 phút | Đang ở đâu, nợ kỹ thuật, và **những cái bẫy đã gặp — đừng chẩn đoán lại** |

Sau đó, đọc **theo việc bạn nhận**: mỗi lát cắt ở
[`docs/15-roadmap.md`](docs/15-roadmap.md) đều trỏ tới một case nghiệp vụ trong
[`docs/07-business-cases/`](docs/07-business-cases/) (15 case, mỗi case phân
tích luồng chính, luồng phụ, và các phương án đã cân nhắc rồi loại).

> 💡 Ký hiệu **🔒** trong tài liệu và mã nguồn = ràng buộc bắt buộc, không được
> nới. Ký hiệu **⚠️** = giả định đã biết là chưa xác minh — không phải lỗi.

---

## 3. Chạy được trong 10 phút

**Cần có:** Node 20+, pnpm, Docker Desktop.

```bash
pnpm install
pnpm db:up          # Postgres 16 + Redis trong Docker (cổng 5433 / 6380)
pnpm db:migrate     # SQL viết tay ở infra/migrations/, chạy theo thứ tự số
pnpm db:seed        # dữ liệu demo: 2 tenant, 3 chi nhánh, 6 vai, danh mục, kho
pnpm dev            # API :3001 + Web :3000
```

Mở http://localhost:3000 và đăng nhập bằng một trong các tài khoản demo (mật
khẩu **`demo1234`** cho tất cả):

| Số điện thoại | Vai | Thấy được gì |
|---|---|---|
| `0901000001` | Chủ chuỗi | Toàn bộ chi nhánh |
| `0901000002` | Quản lý chi nhánh | Xếp lịch xưởng, điều chỉnh tồn |
| `0901000003` | Cố vấn dịch vụ | Tiếp nhận xe, lập báo giá |
| `0901000004` | Kỹ thuật viên | Job card của mình, **không thấy tiền** |
| `0901000005` | Thủ kho | Tồn kho, nhập/xuất, giá vốn |
| `0901000006` | Thu ngân | Thanh toán |
| `0901000007` | Kỹ thuật viên | Như trên, nhưng **chưa có chứng chỉ cao áp** — để nhìn thấy INV-W-03 chặn |

**Kiểm chứng môi trường đã đúng:**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Phải ra **5/5 xanh** và **303 test xanh**. Nếu đỏ, xem mục 7 (cạm bẫy) trước
khi đi tìm nguyên nhân — nhiều khả năng nó đã được ghi lại rồi.

### ⚠️ Ba điều dễ vấp ngay ngày đầu

1. **E2E phải chạy trên bản build, không phải dev server.** Cùng một commit:
   `next dev` cho 8/42 đỏ trong 10 phút (mỗi lần đỏ một bộ khác); `next build
   && next start` cho 42/42 xanh trong 1 phút. Dev server biên dịch theo yêu
   cầu nên timeout của Playwright bắn trúng lúc đang biên dịch. **Đỏ trên dev
   server không phải bằng chứng code sai.**

   ```bash
   cd apps/web && pnpm build && npx next start -p 3000   # rồi mới
   npx playwright test
   ```

2. **Cổng 5433 có thể bị project khác chiếm.** `docker ps -a` để kiểm tra.

3. **Đừng chạy `pnpm db:seed >/dev/null`.** Seed cố ý **không** dùng `CASCADE`
   để lỗi "quên bảng mới trong `TRUNCATE`" phải ồn ào. Che output đi là mất
   luôn cảnh báo đó, và mọi test sau đó chạy trên dữ liệu cũ.

---

## 4. Bản đồ mã nguồn

```
apps/api        NestJS   — controller → service (nghiệp vụ + quyền) → DB
apps/web        Next.js 15 — nhân viên + trang tra cứu công khai cho khách
packages/contracts  DỮ LIỆU: Zod schema, type, enum, bảng hằng (state machine)
packages/domain     HÀM:    logic thuần, không import framework
packages/db         Kết nối, ngữ cảnh tenant, test bất biến lược đồ
packages/config     eslint, tsconfig, prettier
infra/migrations    SQL viết tay — 🔒 NGUỒN SỰ THẬT của schema (32 file)
infra/seed.ts       Dữ liệu demo
e2e/                Playwright — 59 kịch bản
```

🔒 **Chiều phụ thuộc một hướng:** `domain` → `contracts`. Không có vòng.

### Những file đáng đọc đầu tiên

| File | Vì sao |
|---|---|
| [`packages/contracts/src/permissions.ts`](packages/contracts/src/permissions.ts) | **Bảng phân quyền tập trung.** Trước khi có nó, kiểm tra vai rải rác theo từng service và chỉ chỗ nào được review kỹ mới có — một thợ tạo được khách hàng, tạo được đơn, lập được báo giá |
| [`infra/migrations/0025_stock.sql`](infra/migrations/0025_stock.sql) | Mẫu của cả dự án: bất biến enforce ở DB, comment giải thích vì sao chọn thế |
| [`apps/api/src/stock/reserve-parts.ts`](apps/api/src/stock/reserve-parts.ts) | Chống deadlock bằng thứ tự khoá — một dòng `ORDER BY` là cả bài toán |
| [`infra/migrations/0028_work_assignment.sql`](infra/migrations/0028_work_assignment.sql) | `EXCLUDE USING gist` — vì sao khoá dòng KHÔNG giải được bài toán đặt lịch |
| [`packages/db/test/schema-invariants.spec.ts`](packages/db/test/schema-invariants.spec.ts) | Test **quét toàn bộ lược đồ**, không liệt kê tay. Đã tìm ra 4 bảng mà không reviewer nào nghĩ tới |

---

## 5. Năm quy tắc sẽ khiến PR bị từ chối

Chi tiết ở [`CLAUDE.md`](CLAUDE.md). Tóm tắt:

**1. Bất biến enforce ở tầng thấp nhất có thể.**
Ràng buộc DB > trigger > service > UI. **UI không bao giờ tính là enforce** —
ẩn một cột trên màn hình không làm nó biến mất khỏi response JSON.

**2. Chứng từ tài chính và kho là bất biến.**
`stock_movement`, `invoice` (sau `ISSUED`), `audit_log` chỉ được `INSERT`. Sửa
sai bằng **chứng từ đảo**, không bằng `UPDATE`. Điều này được enforce bằng
`REVOKE UPDATE, DELETE`, không phải bằng việc code nhớ cư xử đúng.

**3. Tiền luôn là số nguyên, đơn vị đồng** (`bigint`). Không bao giờ `float`.
Làm tròn **ở từng dòng**, không ở tổng.

**4. Mọi truy vấn giới hạn theo `tenant_id`** — enforce bằng RLS, không dựa vào
việc nhớ thêm `WHERE`. `tenantId` **luôn** lấy từ token, không bao giờ từ body:

```ts
async reserve(actor: ActorContext, input: ReserveInput)   // ✅ ĐÚNG
async reserve(tenantId: string, input: ReserveInput)      // ❌ SAI
```

**5. Nghiệp vụ ở tầng service thuần**, không phụ thuộc framework.

### Kèm theo

- 🔒 Thay đổi chạm **kho, tiền, phân quyền, bất biến** → bắt buộc qua
  `/codex-review` trước khi merge.
- 🔒 Thêm bất biến mới → **phải có test** trước khi merge.
- 🔒 **Không push thẳng `main`.** Không commit code đỏ.
- 🔒 Test dùng **Postgres thật trong Docker**, không SQLite — exclusion
  constraint và RLS không tồn tại ở đó, test sẽ xanh giả.
- 🔒 Gọi `assertLedgerMatchesBalance()` sau **mọi** kịch bản chạm kho.
- 🔒 Migration là **SQL viết tay**. Không dùng `prisma migrate dev` — Prisma
  không tạo được exclusion constraint, RLS, trigger.

---

## 6. Đang ở đâu — và còn phải làm gì

### Đã xong

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Walking skeleton, CI, RLS đa tenant | ✅ |
| 1 | Tiếp nhận xe → báo giá → khách duyệt từng phần qua OTP | ✅ 6/6 lát cắt |
| 2 | Kho, giữ chỗ, phân công, xuất kho, giờ công, QC/làm lại, phát sinh | ✅ **7/7 lát cắt** |

**Con số:** 303 test · 59 kịch bản E2E · 32 migration · 7 ADR

### Còn phải làm — toàn bộ

Sắp theo thứ tự nên làm. Cột "Khó" là ước lượng độ khó kỹ thuật, không phải khối lượng.

#### A. Phase 3 — tiền (6 lát cắt)

| Lát cắt | Nội dung | Khó |
|---|---|---|
| 3.1 | Hoá đơn từ công việc **thực tế** + bảng đối chiếu với báo giá | ⭐⭐⭐ |
| 3.2 | 🔒 Bất biến sau phát hành + hoá đơn điều chỉnh | ⭐⭐⭐⭐ |
| 3.3 | Thanh toán + phân bổ tới từng dòng | ⭐⭐⭐ |
| 3.4 | Bảo hiểm chi trả một phần | ⭐⭐⭐⭐ |
| 3.5 | Công nợ khách doanh nghiệp | ⭐⭐⭐ |
| 3.6 | Adapter hoá đơn điện tử (**bản giả lập** — không tích hợp thật) | ⭐⭐ |

Bất biến phải xanh: `INV-M-*` ([05-invariants.md](docs/05-invariants.md))

#### B. Phase 4 — app mobile cho thợ (6 lát cắt)

Expo + auth · danh sách job card · bấm giờ · chụp ảnh có hàng đợi upload · báo
phát sinh · 🔒 kiểm chứng **thợ không thấy bất kỳ số tiền nào** · build APK.

> ⚠️ `apps/mobile` **chưa tồn tại**. Đây là phase dựng mới hoàn toàn.

#### C. Phase 5 — bảo hành, huỷ đơn, ngoại lệ (5 lát cắt)

Coverage bảo hành hạn kép tháng/km · đơn bảo hành quy chi phí về đơn gốc · huỷ
đơn giữa chừng + quyết toán · kiểm kê kho · xe bỏ quên + phí lưu bãi.

#### D. Phase 6 — báo cáo (5 lát cắt)

Doanh thu và lãi/lỗ theo đơn · ⭐ thời gian chờ theo bộ phận · năng suất thợ
**hiển thị cùng** tỉ lệ rework (để năng suất cao vì làm ẩu không bị đọc thành
năng suất tốt) · tồn kho và vòng quay · công nợ theo tuổi nợ.

#### E. Phase 7 — hoàn thiện để trưng bày (7 việc)

Đây là phase quyết định giá trị portfolio, **không được bỏ**: ảnh chụp màn hình
+ **link demo sống** + tài khoản demo trong README · seed phong phú trên môi
trường demo · sơ đồ kiến trúc · viết đủ 7 ADR (đã có 7, rà lại) · badge CI ·
**video demo 90 giây** · rà lịch sử commit.

#### F. Phase 8 — AI (6 lát cắt) — ⚠️ chỉ làm sau khi 1–7 xong

Bọc service thành tool cho agent · 🔒 authz enforce **trong tool**, không tin
LLM · RAG có trích dẫn nguồn · bộ eval 30–50 câu chạy trong CI · guardrail +
giới hạn token · log prompt/token/độ trễ/chi phí.

💡 Nhờ nguyên tắc "nghiệp vụ ở `packages/domain` thuần" từ Phase 0, bước 8.1
chỉ là lớp bọc mỏng — không phải refactor.

---

### H. Nợ kỹ thuật — làm xen kẽ, không đợi hết phase

Danh sách đầy đủ kèm lý do chấp nhận ở [`STATUS.md`](STATUS.md). Những cái
đáng làm sớm:

| Nợ | Vì sao đáng làm sớm | Khó |
|---|---|---|
| Rate limit đăng nhập lưu trong **bộ nhớ tiến trình** | Chạy nhiều instance là hỏng. Chuyển sang Redis | ⭐⭐ |
| Token đăng nhập để trong `localStorage` | Cookie HttpOnly + refresh token xoay vòng | ⭐⭐⭐ |
| Chưa có test kiến trúc chặn `withTenantId` dùng sai chỗ | Hai hàm này mở đường đi **ngoài** ngữ cảnh tenant. Hiện chỉ `PublicTrackingService` gọi, nhưng không gì bắt buộc điều đó | ⭐⭐ |
| `apps/web/src/lib/api.ts` **chép lại** bảng chuyển trạng thái | Đúng loại lỗi "hai bản cài đặt" mà lát cắt 1.6 sinh ra để chống | ⭐ |
| Mỗi màn web tự dựng lại vòng đời dữ liệu | 5 bản sao `useState(null) + useEffect + .catch`, mỗi bản thiếu một mảnh khác nhau. Một lớp server state (SWR/React Query) xử lý cùng lúc retry, refetch, trạng thái tải | ⭐⭐ |
| Chưa upload ảnh hiện trạng thật | Cần lưu trữ đối tượng (S3/MinIO). Bảng và quyền đã dựng đúng | ⭐⭐ |
| Chưa gửi SMS/Zalo thật | Dev/CI dùng `OTP_DEV_ECHO=true` — ⚠️ **không bao giờ** bật ở production | ⭐⭐ |
| `TECHNICIAN` dùng phạm vi `BRANCH` thay vì `SELF` | Giờ đã có bảng `work_assignment` (2.3), thu hẹp được rồi | ⭐⭐ |

### I. Hai việc đang treo, cần biết trước khi nhận việc

| Việc | Tình trạng |
|---|---|
| **Review độc lập cho 2.2, 2.3, 2.4** | Chưa chạy — công cụ review hết hạn mức tới 2026-08-08. Với 2.2, việc tự rà soát đã tìm ra **ba lỗi thật** (phụ tùng bảo hành không được giữ chỗ; huỷ đơn không nhả chỗ; giữ chỗ một phần không được bù nốt), nên tự rà soát **không thay thế được** review độc lập. Chạy lại ngay khi dùng được |
| **Deploy** | `docs/DEPLOY.md` ghi "deploy-ready, CHƯA deploy". Đang chờ tài khoản nhà cung cấp. Phase 7 cần **link demo sống** nên việc này chặn Phase 7 |

Ghi chú: một lượt `pnpm test` từng đỏ 1 test rồi xanh lại, và lúc đó **chưa
xác định được test nào**. Nguyên nhân đã tìm ra ở Phase 2.6: test "gợi ý thợ
trả về cả người không đủ điều kiện" đòi phải có thợ KHÔNG đủ điều kiện, mà seed
chỉ có một thợ và người đó có đủ chứng chỉ — nó chỉ xanh nhờ **rác trạng thái**
của lần chạy trước. Đã sửa bằng cách thêm thợ thứ hai vào seed.

---

## 7. Cạm bẫy đã gặp — đừng chẩn đoán lại

[`STATUS.md`](STATUS.md) có bảng đầy đủ. Vài cái tốn nhiều giờ nhất:

| Triệu chứng | Nguyên nhân thật |
|---|---|
| RLS "không chạy" trong test | **Superuser và `BYPASSRLS` bỏ qua RLS** kể cả khi bảng đã bật `FORCE`. Test bằng role quản trị sẽ luôn thành công và test thành vô nghĩa |
| `column "new" has no field "version"` | `touch_row()` gán `NEW.version` cho 10 bảng; hai bảng không có cột đó, nên **mọi `UPDATE`** lên chúng lỗi 42703 |
| Web sập khi import package dùng chung | Package viết theo chuẩn ESM của Node (`import './x.js'` cho file `.ts`). Next cần `resolve.extensionAlias` |
| `node dist/main.js` báo `ERR_MODULE_NOT_FOUND` | `tsc` chỉ biên dịch `apps/api`; workspace package trỏ `main` vào **TypeScript thô**. Phải **gói** bằng esbuild — xem `apps/api/build.mjs` |
| Test đỏ ở chỗ **chẳng liên quan** sau vài lần chạy | Mỗi lần khách duyệt để lại một giữ chỗ `ACTIVE`. Không nhả thì sau ~12 lượt, một mã hàng hết khả dụng. Bộ test phải tự nhả ở `after()` |
| Test báo "passed" nhưng thật ra **bị bỏ qua** | `test.skip()` dựa trên `count()` đọc trang chưa nạp xong. Đã mắc **hai lần**. Phải `expect.poll` hoặc `waitForResponse` |

---

## 8. Quy trình làm việc

```
nhánh → test trước (TDD) → code → lint/typecheck/test → /codex-review → sửa → commit
```

- Một nhánh = **một lát cắt dọc**, không gộp nhiều việc.
- Nhánh: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `chore/`, `perf/` +
  mô tả **không dấu**, kebab-case, ≤ 5 từ.
- Commit theo Conventional Commits, **mô tả tiếng Việt có dấu**. Thân commit
  giải thích **VÌ SAO**, không phải LÀM GÌ.
- Commit chạm bất biến → ghi mã (`INV-S-01`) ở chân commit.

Chi tiết đầy đủ: [`CONTRIBUTING.md`](CONTRIBUTING.md)

### Ngôn ngữ

Tiếng Việt cho người dùng và cho commit. Tiếng Anh cho tên biến, tên hàm, tên
bảng. Tên gọi nghiệp vụ **chốt ở** [`docs/01-glossary.md`](docs/01-glossary.md)
— đặt tên ngoài từ điển là lỗi cần sửa, không phải sở thích cá nhân.

---

## 9. Nên nhận việc gì trước

**Nếu bạn muốn hiểu hệ thống trước khi đụng vào chỗ khó** — chọn một trong:

- Nợ kỹ thuật: *`apps/web/src/lib/api.ts` chép lại bảng chuyển trạng thái* →
  import từ `packages/contracts` và thêm test đối chiếu. Nhỏ, chạm đúng nguyên
  tắc "một nguồn sự thật", và bắt bạn đọc qua cả hai tầng.
- Nợ kỹ thuật: *test kiến trúc chặn `withTenantId` dùng sai chỗ* → viết một
  test quét mã nguồn. Bắt bạn hiểu mô hình tenant, mà không phải sửa gì rủi ro.

**Nếu bạn muốn vào phần kỹ thuật nặng ngay** — lát cắt **3.1 (hoá đơn từ công
việc thực tế)** mở đầu Phase 3. Nó nối trực tiếp vào giờ công (2.5) và làm lại
(2.6) vốn đã có sẵn dữ liệu, và mang theo cả nhóm bất biến `INV-M-*` — nhóm mà
sai một chỗ là sai tiền của khách.

**Trước khi nhận bất cứ việc gì chạm kho hoặc tiền:** đọc
[`docs/05-invariants.md`](docs/05-invariants.md) hết một lượt. Không phải để
nhớ, mà để biết chỗ nào có mìn.

---

## 10. Hỏi gì, hỏi ở đâu

| Câu hỏi | Câu trả lời nằm ở |
|---|---|
| Điều gì tuyệt đối không được sai? | [`docs/05-invariants.md`](docs/05-invariants.md) |
| Trạng thái nào sang trạng thái nào? | [`docs/06-state-machines.md`](docs/06-state-machines.md) |
| Case nghiệp vụ cụ thể xử lý ra sao? | [`docs/07-business-cases/`](docs/07-business-cases/) |
| Schema, ràng buộc, trigger | [`docs/10-data-model.md`](docs/10-data-model.md) — nhưng **nguồn sự thật là `infra/migrations/`** |
| Vì sao chọn cách này mà không cách kia? | [`docs/adr/`](docs/adr/) — 7 quyết định kiến trúc |
| Ai được làm gì? | [`docs/02-actors-and-permissions.md`](docs/02-actors-and-permissions.md) + `packages/contracts/src/permissions.ts` |
| Làm gì tiếp theo? | [`docs/15-roadmap.md`](docs/15-roadmap.md) + mục 6 của tài liệu này |
| Vì sao chỗ này lại kỳ lạ thế? | [`STATUS.md`](STATUS.md), mục "bẫy đã gặp" |

Nếu tài liệu và mã nguồn **mâu thuẫn nhau**: mã nguồn đúng, tài liệu cần sửa —
và việc sửa tài liệu là một phần của PR, không phải việc để sau. Đã có tiền lệ:
một comment tuyên bố "bám vào bảng giá đã snapshot" sống qua **sáu vòng review**
vì người đọc tin comment, trong khi cột đó chưa bao giờ tồn tại.
