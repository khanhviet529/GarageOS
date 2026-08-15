# Kết luận rà soát — nhánh landing bán xe

**Ngày:** 2026-08-15 · **Nhánh:** `fix/ra-soat-landing-ban-xe`<br>
**Trạng thái:** ✅ **Xong 100% vùng thay đổi.**

> Nối tiếp [tiến độ rà soát](2026-08-14-tien-do-ra-soat-vung-thay-doi.md) (dừng ở
> ~40%) và [rà soát luồng tenant công khai](2026-08-14-luong-tenant-public-landing.md)
> (8 phát hiện, đã sửa).

---

## 1. Kiểm chứng cuối

```text
API              521/521 ✔   (ba lượt liên tiếp, không seed lại giữa chừng)
db                42/42  ✔   domain  42/42 ✔   infra  10/10 ✔
E2E               86/86  ✔   (năm app cùng chạy, trên bản build production)
lint ✔   typecheck ✔ (giờ gồm cả infra/)   build 5/5 ✔
```

Migration đã áp: `0055` → `0063`.

---

## 2. Phạm vi — đã đóng hết

| Nhóm | Dòng | Trạng thái |
|---|---:|---|
| `infra/migrations/0055`–`0063` | 1.699 | ✅ |
| `apps/api/src/media` | 101 | ✅ |
| `apps/api/src/marketing` | 1.475 | ✅ |
| `apps/api/src/public-landing` | 683 | ✅ |
| `apps/api/src/sales` | 697 | ✅ |
| `packages/contracts` + `packages/domain` | 605 | ✅ |
| `apps/landing` | 3.460 | ✅ |
| `apps/sales-admin` | 2.960 | ✅ |
| `infra/` (seed, media-import, site-domain-apply) | 615 | ✅ |

---

## 3. 20 phát hiện, tất cả đã sửa

### Nặng — người dùng gặp trực tiếp

| # | Phát hiện | Bằng chứng | Commit |
|---|---|---|---|
| 1 | **Form lead không gửi được.** Trình duyệt gọi thẳng API bằng header host KHÔNG ký; chế độ mặc định `signed` từ chối. | `alert: Không tìm thấy trang` trên bản build production | `2df3aec` |
| 2 | **Showroom 360° không tải được** — cùng nguyên nhân | 404 `SITE_NOT_FOUND` | `2df3aec` |
| 3 | **Xe đã đăng không sửa được nữa.** Sau publish, không route nào dựng lại bản nháp cho sản phẩm. | `PATCH …/draft` → 404 vĩnh viễn | `0a64c4e` |
| 4 | **Rollback trải nghiệm trả 500** — mọi lần, không phải ca biên | `duplicate key … _revision_key` | `0a64c4e` |
| 5 | **Bấm "tạo bản nháp" hai lần trả 500** | `500 INTERNAL_ERROR` | `0a64c4e` |
| 6 | **Trang hai của danh sách lead trả 500** | `syntax error at or near "$"` | `0a64c4e` |
| 7 | **Mọi route động của landing 404** khi chạy bản build | `/xe`, `/lien-he`, `/xe/:slug` → 404 | `2df3aec` |
| 8 | **`pnpm build` chết** vì `node:crypto` lọt vào bundle web | `UnhandledSchemeError` | `7ef2efa` |

### Âm thầm — không báo lỗi, vẫn sai

| # | Phát hiện | Hệ quả | Commit |
|---|---|---|---|
| 9 | **`nextCursor` là lời hứa suông** — controller nhận `cursor`, SQL không dùng | Mọi trang đều là trang một; vòng lặp sitemap chỉ dừng nhờ trần | `0a64c4e` |
| 10 | **Mỗi ranh giới trang nuốt một bản ghi** — ở cả hai danh sách | Ba xe, `limit=1`, đi hết phân trang chỉ thấy hai | `0a64c4e` |
| 11 | **Thẻ xe quảng cáo một chiếc xe không tồn tại.** `MIN(giá)` và `MIN(powertrain::text)` là hai phép MIN độc lập | "Xe điện · từ 500.000.000 ₫" cho mẫu có bản điện 2 tỷ | `0a64c4e` |
| 12 | **Lead ghi phiên bản xe khách không chọn** | Màn lead in "Xe quan tâm: … · Bản cao cấp"; tư vấn chào con số khách chưa từng nói | `0a64c4e` |
| 13 | **Job nhập media báo thành công khi không làm gì.** Ba tình huống khác nhau đều thành `null` | `Import xong: 12 asset`, thoát 0, không ảnh nào được gắn | `00cf3c8` |
| 14 | **`.next/standalone/` không có `server.js`** — truy vết sai gốc workspace | `pnpm build` vẫn "successful" | `2df3aec` |
| 15 | **Sitemap dừng ở 50 xe** | Phần còn lại không được đánh chỉ mục | `7ef2efa` |
| 16 | **`config.kind` ghi đè cột `kind`** — danh sách đọc cột, trình xem đọc config | Danh sách ghi "360 ngoại thất", bấm vào mở panorama nội thất | `0a64c4e` |
| 17 | **Lead đã xoá PII hiện như dữ liệu bị mất** | `Đã liên hệ ·  · không có email` | `5e71b16` |
| 18 | **Hết phiên sau 15 phút không ai xử lý** | Khung giao diện vẫn như đang đăng nhập, mọi thao tác 401 | `5e71b16` |

### Bảo mật

| # | Phát hiện | Bằng chứng | Commit |
|---|---|---|---|
| 19 | **Hàng rào đường dẫn của job nhập media hở hai lối.** `startsWith` so sánh chuỗi, và không có kiểm symlink dù chú thích nói có | Chạy thử guard cũ: `DI QUA -> …/import-secrets/khoa.pem` và `DI QUA -> symlink ra ngoài`. Cả hai kết thúc bằng file bị chép vào thư mục media **công khai**. | `00cf3c8` |
| 20 | **`scopeForAction` fail-open** — action không khớp tiền tố nào trả về scope rộng nhất | Vai không có quyền vẫn đọc được | `b2f3fc6` |

---

## 4. Ba khoảng trống có hệ thống

Ba thứ dưới đây không phải lỗi ở một dòng nào — chúng là **chỗ không có ai canh**.
Mỗi khoảng trống sinh ra nhiều lỗi ở trên cùng lúc.

### 4.1 `infra/` chưa từng được kiểm kiểu, cũng không có bài kiểm nào

`turbo run typecheck` chỉ chạm chín gói trong `apps/*` và `packages/*`. 1.856
dòng ở `infra/` nằm ngoài — mà `tsx` thì xoá kiểu chứ không kiểm kiểu.

Đây lại đúng là phần chạy bằng `DATABASE_ADMIN_URL`: quyền cao nhất, bỏ qua RLS.
Lượt kiểm kiểu **đầu tiên** bắt ngay hai lỗi có sẵn.

→ `infra/tsconfig.json`, nối vào `pnpm typecheck`; `pnpm test:infra` vào CI.

### 4.2 `pnpm build` không nằm trong quy trình

`next dev` và `next build` là hai trình biên dịch khác nhau. Bốn phát hiện ở
trên (#1, #7, #8, #14) chỉ tồn tại ở bản build, và cả bốn đều lọt qua
lint + typecheck + test.

Ba trong bốn còn để `pnpm build` in ra **"successful"** — nên "build xanh" cũng
chưa đủ. Phải chạy thử bản build.

→ CONTRIBUTING.md mục 3.1; E2E chạy trên bản build production.

### 4.3 Landing và Sales Admin chưa từng chạy E2E

`apps/*/package.json` ghi `"test": "echo 'E2E chạy riêng bằng playwright'"` —
mô tả một quy trình không có thật, xanh mỗi lượt CI suốt cả nhánh. CI khởi động
3000 và 3002; 3003 và 3004 chưa bao giờ được mở trong một trình duyệt.

Chỉ riêng việc dựng nền để chạy được chúng đã lộ ra ba phát hiện (#1, #7, #14).

→ 10 kịch bản mới; CI khởi động cả năm app.

---

## 5. Khuôn lặp lại — đã ghi vào STATUS.md

| Khuôn | Số lần | Lần này ở đâu |
|---|---:|---|
| Hai bản cài đặt cho một quy tắc | **6** | `normalizeHostname` (3 bản), `kind` (cột vs config), phiên sales-admin |
| Quên phạm vi chi nhánh | 7 | — |
| Check-then-act | **4** | `revision_number` lấy từ bản nguồn |
| Múi giờ | 5 | — |
| Chú thích nói điều code không làm | **5** | hàng rào symlink, `"test": echo …`, "production same-origin qua edge" |

Khuôn mới lần này: **một tham số được nhận nhưng không dùng** (`cursor`). Tệ hơn
tham số không tồn tại — API trả `nextCursor`, tức là NÓI RẰNG phân trang hoạt động.

---

## 6. Còn lại, không chặn merge

- **Seed dùng tên xe có thật** (`vinfast-vf-3`) kèm giá bịa trong showroom hư
  cấu. Repo sắp công khai — cân nhắc đổi sang tên tự đặt. Đây là lựa chọn về
  hình ảnh, không phải lỗi kỹ thuật.
- **`infra/` chưa được lint** (mới chỉ typecheck + test).
- **`experiencesOf` gọi N+1 truy vấn** trên endpoint công khai. Quy mô hiện tại
  vài trải nghiệm mỗi xe nên chưa đáng đổi.
- **`MediaStorage` vẫn là local FS.** Chú thích nói "production thay bằng
  S3-compatible qua cùng interface" — nhưng chưa có interface, chỉ có một lớp cụ
  thể. MinIO đã có trong `docker-compose.yml`; adapter là việc của Phase 4.3.

---

## 7. Kết luận

Nhánh này **đủ điều kiện merge**. 20 phát hiện đã sửa, mỗi bản sửa có bài kiểm
đi kèm, và ba khoảng trống có hệ thống đã được bịt bằng hàng rào tự động chứ
không bằng một dòng ghi nhớ.

Điều đáng nói nhất không nằm ở con số 20. Nó nằm ở chỗ **tám phát hiện nặng nhất
đều thuộc loại "chạy được ở máy dev, hỏng ở nơi thật"** — và cả tám đều đi qua
được một bộ 510 bài kiểm API đang xanh. Bộ kiểm cũ hỏi đúng những câu nó biết
hỏi; thứ thiếu là một chỗ buộc mã phải chạy như lúc triển khai.
