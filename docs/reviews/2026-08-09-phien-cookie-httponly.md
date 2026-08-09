# Verdict — /codex-review phiên cookie HttpOnly

**Phạm vi:** `git diff 9786fc6..HEAD` — 1.825 dòng · **Codex:** 0.144.0-alpha.4
**Vì sao bắt buộc:** thay đổi chạm xác thực và phân quyền (`CLAUDE.md`).

| # | ID | Vị trí | Kết luận | Cách phân xử |
|---|---|---|---|---|
| 1 | AUTH-001 | `auth.service.ts` xoay vòng refresh | ✅ **CONFIRMED** | Test đỏ — và lộ ra hậu quả NẶNG HƠN Codex mô tả |

Một phát hiện, và nó đúng. Không có mục nào `UNRESOLVED`.

---

## AUTH-001 — xoay vòng token là check-then-act

### Codex nói gì

> Đọc trạng thái token rồi mới xoay vòng. Hai request đồng thời cùng thấy
> `revoked_at IS NULL`, cả hai cùng phát token mới → **hai token con cùng
> sống**, phá vỡ bất biến "mỗi refresh token dùng đúng một lần".

### Bằng chứng — và một khác biệt đáng chú ý

Bài kiểm chứng chạy năm lượt, mỗi lượt hai request `Promise.allSettled` thật
song song. Nó đỏ ngay lượt đầu, nhưng **không phải theo cách Codex đoán**:

```
not ok — lượt 1: người dùng có 0 token còn sống — xoay vòng đã nhân đôi phiên
```

**0**, không phải 2. Đường đi thật:

1. T1 đọc token R (chưa thu hồi) → phát token mới N, thu hồi R
2. T2 đọc R **sau khi** T1 commit → thấy R đã thu hồi → kết luận "token bị đánh
   cắp" → **thu hồi TOÀN BỘ phiên**, gồm cả N mà T1 vừa cấp
3. Một request trả 201, nhưng người dùng không còn phiên nào

💡 **Một cú bấm đúp đăng xuất người dùng.** Cùng một gốc mà Codex chỉ ra
(check-then-act), nhưng biểu hiện ngược hẳn với dự đoán — và nguy hiểm hơn, vì
nó xảy ra với người dùng BÌNH THƯỜNG chứ không cần kẻ tấn công nào.

⚠️ Bài test đầu tiên tôi viết đã **xanh nhầm**: nó đếm
`replaced_by_id IS NOT NULL AND revoked_at IS NULL`, mà token CON luôn có
`replaced_by_id` rỗng — câu đó không bao giờ tìm thấy gì. Một khẳng định không
bao giờ đỏ được là một khẳng định không đo gì cả. Sửa thành "người dùng phải có
đúng MỘT token còn sống" thì nó đỏ ngay.

### Đã sửa — hai phần

**1. Giành token bằng compare-and-set** (`issueRefresh`)

```sql
UPDATE refresh_token SET revoked_at = now()
 WHERE id = $1 AND revoked_at IS NULL
```

`WHERE ... AND revoked_at IS NULL` biến câu này thành một phép vừa-kiểm-vừa-ghi:
PostgreSQL khoá hàng, chỉ giao dịch nào còn thấy `NULL` mới ghi được. Giao dịch
thứ hai chờ, rồi thấy 0 dòng bị ảnh hưởng — nó biết mình thua và **không phát
token nào**.

🔒 Cùng họ với `STOCKTAKE-001` ở vòng review trước: kiểm rồi mới ghi thì luôn có
một khoảng ở giữa. Lần đó vá bằng partial unique index, lần này bằng CAS — cùng
một nguyên tắc, hai công cụ khác nhau tuỳ hình dạng bài toán.

**2. Cửa sổ ân hạn 10 giây** (`refresh`, migration 0054)

`docs/13-nfr.md` yêu cầu "dùng lại token cũ → thu hồi toàn bộ phiên". Nhưng
"dùng lại" gộp hai thứ khác hẳn nhau:

| | Là gì | Phản ứng đúng |
|---|---|---|
| A | Token bị thu hồi **từ lâu** nay xuất hiện lại | Dấu hiệu bị đánh cắp → thu hồi toàn bộ |
| B | Hai request gia hạn **cách nhau vài mili giây** | Hai tab / bấm đúp → chỉ 401 |

0054 cho `auth_find_refresh_token` trả thêm `replaced_by_id`, đủ để phân biệt:
token vừa bị thay thế trong 10 giây gần đây là (B).

⚠️ **Ân hạn không nới lỏng bảo mật.** Kẻ tấn công dùng token cũ trong cửa sổ đó
vẫn nhận 401 và vẫn không có phiên nào. Nó chỉ ngăn phản ứng hạt nhân khi hai
request HỢP LỆ chạm nhau.

### Test được giữ lại

| Test | Vai trò |
|---|---|
| `hai request ĐỒNG THỜI cùng một token — chỉ MỘT được` | Hồi quy cho cuộc đua; chạy 5 lượt vì cửa sổ đua rất hẹp |
| `thua cuộc đua KHÔNG được đá người dùng ra khỏi hệ thống` | Canh vế ngược lại — nếu ai đó bỏ cửa sổ ân hạn, bài này đỏ |
| `dùng lại token ĐÃ THU HỒI → thu hồi TOÀN BỘ phiên` | Lùi `revoked_at` ra ngoài ân hạn để đo đúng (A), không đo nhầm (B) |

---

## Bốn rủi ro tôi tự nêu — Codex không xác nhận cái nào

Đã ghi trong `self-notes.md` và gửi kèm. Codex đọc và không báo cái nào thành
phát hiện. Ghi lại để lần sau không phải nghĩ lại:

1. **Thu hồi toàn bộ phiên có thể bị lợi dụng thành DoS** — cửa sổ ân hạn vừa
   thêm thu hẹp bề mặt này đáng kể: chỉ token cũ hơn 10 giây mới kích hoạt.
2. **`WEB_ORIGIN=*` sẽ vô hiệu hoá lớp chống CSRF trong im lặng** — vẫn đúng.
   Chưa có hàng rào nào chặn cấu hình đó. Ghi vào nợ kỹ thuật.
3. **`/auth/refresh` và `/auth/logout` không có `JwtGuard`** — cố ý, vì access
   token có thể đã hết hạn. Đầu vào là một băm sha256 không đoán được.
4. **Cookie không đặt `Domain`** — chưa kiểm chứng ở cấu hình production nơi web
   và API ở hai tên miền khác nhau. Ghi vào `docs/DEPLOY.md`.

## Kiểm tra sau khi sửa

| | |
|---|---|
| `pnpm lint` | ✅ 6/6 |
| `pnpm typecheck` | ✅ 6/6 |
| API test | ✅ 445/445 |
| db + domain | ✅ 42 + 12 |
| E2E Playwright | ✅ 73/73 |

## Nhận xét

Codex tìm ra đúng **một** lỗi trong 1.825 dòng chạm xác thực — và đó là lỗi
đáng tìm nhất trong đám: một cuộc đua mà bộ test 10 bài của tôi không hề chạm
tới, vì mọi bài đều gọi tuần tự.

🔒 Bài học lặp lại lần thứ ba trong dự án: **kiểm rồi mới ghi thì luôn có một
khoảng ở giữa.** Ba lần, ba chỗ khác nhau (kiểm kê kho, thu tiền, xoay vòng
token), ba lần đều do reviewer độc lập chỉ ra chứ không phải tự thấy.
