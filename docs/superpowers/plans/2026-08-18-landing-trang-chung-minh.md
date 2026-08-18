# Landing "Trang chứng minh" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi hướng thị giác của landing bán xe sang dark cinematic, và đưa con số chi phí sở hữu tính từ bảng giá thật của xưởng lên làm xương sống của trang — thay cho các lời hứa không có bằng chứng.

**Architecture:** Không thêm bảng, không thêm endpoint. Toàn bộ dữ liệu cần thiết đã có ở `GET /vehicle-products/:slug/chi-phi-so-huu` (`ChiPhiSoHuuView`), hiện chỉ được dùng ở một khối client-side nằm dưới đáy trang chi tiết. Kế hoạch này (a) thêm một hàm thuần ở `packages/domain` để rút phần tóm tắt, (b) thêm một lớp fetch SSR không-bao-giờ-ném ở landing, (c) dựng ba khối trình bày mới theo hướng thị giác ATELIER đã có.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · `node:test` (packages/domain) · Playwright + axe (e2e) · CSS thuần với token ngữ nghĩa

**Hướng thị giác:** DARK CINEMATIC, port từ `E:\TL\test promt\index.html` (bản
tham chiếu `apex-automotive`). Nền `#0a0b0c`→`#202327`, accent đỏ signal `#e63b2e`,
display grotesque condensed chữ hoa, hình học 4px, hero full-bleed lấy ảnh xe làm
nền. Task 0 làm phần này; các task sau viết CSS bằng **token ngữ nghĩa** nên chúng
đúng ở cả hai hướng và không phải sửa lại.

---

## Phân tích nghiệp vụ — vì sao làm thế này

### GarageOS bán cái gì

Không phải "phần mềm quản lý xưởng", cũng không phải "trang bán xe". Theo
[`docs/00-vision.md`](../../00-vision.md), đối tượng là **showroom/đại lý có xưởng
hậu mãi** (mô hình 3S/4S), và lý do chọn được ghi thẳng:

> chuỗi giá trị khép kín làm cho dữ liệu khách hàng và xe có **một nguồn duy
> nhất**, thay vì để CRM bán hàng và phần mềm xưởng nói chuyện với nhau qua file
> Excel.

Bốn điểm khác biệt được tuyên bố: thiết kế cho xe điện từ đầu · duyệt báo giá
chặt · sổ kho và hoá đơn bất biến · chuỗi giá trị khép kín.

### Ba trong bốn điểm đó khách mua xe không nhìn thấy

Duyệt báo giá chặt và chứng từ bất biến là giá trị dành cho **chủ xưởng**. Khách
đứng ở landing không quan tâm, và cũng không có cách nào kiểm chứng.

Điểm thứ tư — chuỗi khép kín — thì khách kiểm chứng được, nhưng landing hiện tại
chỉ **tuyên bố** nó. Trang chủ có ba dòng: "Giá niêm yết công khai · Lái thử theo
lịch của bạn · Hậu mãi liền mạch". Cả ba là tính từ. Bất kỳ đại lý nào cũng viết
được ba dòng đó, nên chúng không phân biệt được gì.

### Thứ không đại lý nào copy được

`ChiPhiSoHuuView` trong [`packages/contracts/src/marketing.ts`](../../../packages/contracts/src/marketing.ts):

| Trường | Nội dung |
|---|---|
| `theoNam[].tienCong` / `.tienVatTu` | Tiền công và vật tư từng năm, tách riêng |
| `theoNam[].hangMuc` | Tên các hạng mục bảo dưỡng của năm đó |
| `soSanhXeXang` | Cùng quãng đường, **cùng bảng giá**, nhưng theo lịch của xe xăng |
| `giaCongMoiGio` | Giá công mỗi giờ đang áp dụng |
| `tenBangGia` + `ápDụngTừ` | Tên bảng giá và ngày hiệu lực |

`apps/api/src/public-landing/public-landing.service.ts` tính các con số này bằng
`JOIN` qua `price_list`, `price_list_item`, `maintenance_plan_item` và
`maintenance_plan_part` — **đúng những bảng cố vấn dịch vụ dùng để lập báo giá
thật**. Chú thích trong contract nói rõ hệ quả:

> 🔒 Tiền là số nguyên đồng. Con số này khách sẽ **CẦM TỚI XƯỞNG đối chiếu với
> hoá đơn thật**, nên nó không được là ước lượng làm tròn cho đẹp.

Đó là điều một trang bán xe thông thường **không thể** làm. Một đại lý không sở
hữu xưởng thì không có bảng giá công, không có lịch bảo dưỡng theo loại động cơ,
và không có gì để khách đối chiếu. Ở đây con số vừa có nguồn, vừa nêu tên nguồn,
vừa mời khách đi kiểm tra.

### Chẩn đoán landing hiện tại

| Vấn đề | Bằng chứng |
|---|---|
| Điểm khác biệt bị chôn | `<ChiPhiSoHuu>` chỉ xuất hiện ở `xe/[slug]/page.tsx:151`, dưới mô tả và bảng phiên bản. Trang chủ không nhắc tới |
| Trang chủ bán bằng tính từ | `trust-row` là ba cụm từ không có số nào |
| Lặp đúng lỗi repo đã ghi | `globals.css` từng ghi về khối 360°: *"Điểm khác biệt lớn nhất của sản phẩm này từng bị chôn trong trang chi tiết xe... nên khách rời trang mà không biết nó tồn tại."* Chi phí sở hữu đang ở đúng tình trạng đó |
| Khối chi phí là client-side | Không vào HTML đầu tiên, nên không phục vụ SEO và không hiện khi JS chưa chạy |

### Hướng thiết kế: trang chứng minh, không phải trang quảng cáo

Xương sống của trang là **ba hiện vật kiểm chứng được**, mỗi cái mang theo dòng
xuất xứ của chính nó:

1. **Phiếu chi phí sở hữu** — trình bày như một phiếu in của xưởng, đặt trên
   trang chủ. Có tổng 5 năm, năm nặng nhất, số năm không tốn gì, và dòng xuất xứ
   "Bảng giá X, hiệu lực từ ngày Y".
2. **So sánh xe điện với xe xăng** — cùng quãng đường, cùng bảng giá. Đây là cách
   duy nhất làm tuyên bố "thiết kế cho xe điện từ đầu" trở thành một con số thay
   vì một câu quảng cáo.
3. **Lịch bảo dưỡng thật theo năm** — dựng từ `theoNam[].hangMuc`, tức chính
   những hạng mục xưởng sẽ làm, không phải mô tả chung.

Hướng thị giác ATELIER (giấy + plate mực, Libre Bodoni, hairline rule) đã có sẵn
và phù hợp: một phiếu in là một plate editorial. Không cần đổi hệ token.

### Hàng rào — những gì kế hoạch này KHÔNG làm

- Không hứa "theo dõi sửa chữa xe vừa mua". `docs/00-vision.md` ghi ⚠️ rằng
  `vehicle.plate_number` đang `NOT NULL` còn xe mới giao chưa có biển, nên luồng
  đó **chưa dùng được thật**. Landing không được bán một tính năng chưa chạy.
- Không hiện tồn xe, không hiện xe cũ, không checkout — đều ngoài phạm vi theo
  `docs/00-vision.md`.
- Không thêm bảng, không thêm migration, không sửa endpoint.

---

## Global Constraints

- Tiền là **số nguyên đồng**. `ChiPhiSoHuuView` dùng `z.number().int()` (không phải `bigint`) vì view công khai đã quy đổi ở tầng API; giữ nguyên `number` ở phía landing, không quy đổi lại.
- Định dạng số bằng `new Intl.NumberFormat('vi-VN')`. Ký hiệu `₫` phải đi qua `<Gia>` hoặc class `.gia-ky-hieu` — Libre Bodoni **không có U+20AB** (xem `apps/landing/src/lib/site.ts`).
- Không viết màu thẳng vào CSS. Chỉ dùng token ngữ nghĩa trong `apps/landing/src/app/globals.css`.
- Khối nào tự sơn nền tối phải có `background` **và** `isolation: isolate` **và** nằm trong danh sách plate mực ở `globals.css`.
- `line-height` của chữ display không xuống dưới `1.12` — dấu tiếng Việt xếp tầng bị cắt.
- Tiếng Việt cho người dùng, tiếng Anh cho tên biến/hàm — trừ từ vựng nghiệp vụ đã chốt ở `docs/01-glossary.md`, giữ tiếng Việt như code hiện có (`tinhChiPhiSoHuu`, `theoNam`).
- Landing **không có** test runner unit. Hàm thuần đặt ở `packages/domain` và test bằng `node:test`. Hành vi trên trang test bằng Playwright.
- Không push thẳng `main`. Không commit code đỏ.
- Chạy `pnpm kiem:tuong-phan` sau mọi thay đổi màu.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `packages/domain/src/tom-tat-chi-phi.ts` | **Tạo.** Hàm thuần rút tóm tắt từ `ChiPhiSoHuuView`. Không import framework |
| `packages/domain/src/tom-tat-chi-phi.test.ts` | **Tạo.** Test cho hàm trên |
| `packages/domain/src/index.ts` | **Sửa.** Export hàm mới |
| `apps/landing/src/lib/chi-phi.ts` | **Tạo.** Lớp fetch SSR không-bao-giờ-ném |
| `apps/landing/src/components/phieu-chi-phi.tsx` | **Tạo.** Phiếu chi phí sở hữu |
| `apps/landing/src/components/so-sanh-dong-co.tsx` | **Tạo.** Băng so sánh điện/xăng |
| `apps/landing/src/components/lich-bao-duong.tsx` | **Tạo.** Lịch bảo dưỡng theo năm |
| `apps/landing/src/app/page.tsx` | **Sửa.** Thay `trust-row` bằng phiếu; thêm băng so sánh |
| `apps/landing/src/components/chi-phi-so-huu.tsx` | **Sửa.** Gắn lịch bảo dưỡng vào |
| `apps/landing/src/app/xe/[slug]/page.tsx` | **Sửa.** Thêm neo `#chi-phi` |
| `apps/landing/src/app/globals.css` | **Sửa.** CSS cho ba khối mới |
| `apps/landing/src/app/layout.tsx` | **Sửa (Task 0).** Ba font mới |
| `apps/landing/src/app/icon.svg`, `apple-icon.svg`, `manifest.ts` | **Sửa (Task 0).** Về palette tối |
| `infra/kiem-tuong-phan.mjs` | **Sửa (Task 0).** Cặp màu của hướng tối |
| `e2e/landing-cong-khai.spec.ts` | **Sửa.** Thêm LD-E08, LD-E09 |

---

### Task 0: Đổi hướng thị giác sang dark cinematic

Landing đang ở hướng ATELIER (giấy + plate mực). Task này đưa nó sang dark
cinematic của bản tham chiếu `index.html`.

**Vì sao đổi:** ảnh xe của tenant là low-key **nền đen tuyệt đối**
(`infra/seed-assets/xe-silhouette.jpg`). Hướng giấy phải bọc mọi ảnh trong một
"plate mực" để mép hộp đen không lộ ra — một cơ chế tồn tại chỉ để bù cho việc
nền trang và nền ảnh không khớp nhau. Hướng tối bỏ hẳn nhu cầu đó: ảnh liền mạch
với trang, và `globals.css` bản gốc đã ghi đúng lý do này.

🔒 **Giữ nguyên kiến trúc token.** Chỉ đổi **giá trị mặc định**, không đổi tên
token và không sửa rule nào ở dưới. `docs/.../landing-sales-design.md` mục 4.1
đòi mỗi tenant ghi đè được `BrandTheme`, nên đỏ signal là *mặc định*, không phải
màu cố định của nền tảng.

**Files:**
- Modify: `apps/landing/src/app/globals.css`
- Modify: `apps/landing/src/app/layout.tsx`
- Modify: `apps/landing/src/app/icon.svg`
- Modify: `apps/landing/src/app/apple-icon.svg`
- Modify: `apps/landing/src/app/manifest.ts`
- Modify: `infra/kiem-tuong-phan.mjs`

**Interfaces:**
- Consumes: không gì.
- Produces: các token mặc định mà mọi task sau dùng — `--surface-0..3`, `--text`, `--text-muted`, `--line`, `--line-strong`, `--brand`, `--action`, `--accent`, `--font-display`, `--font-ui`, `--font-mono`. Tên không đổi so với hiện tại; **chỉ giá trị đổi**.

- [ ] **Step 1: Đổi ba giọng chữ**

Trong `apps/landing/src/app/layout.tsx`, thay khối import font và ba khai báo
`Libre_Bodoni` / `Be_Vietnam_Pro` / `JetBrains_Mono` bằng:

```tsx
import { Archivo_Narrow, Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';

/*
 * Ba giọng chữ, không có giọng thứ tư.
 *
 * 🔒 Cả ba PHẢI có subset `vietnamese`. Bản tham chiếu dùng Inter Tight cho giọng
 *    display, nhưng Inter Tight chỉ có `latin-ext` — các ký tự tiếng Việt xếp
 *    tầng (ặ ệ ộ ớ ừ) nằm ở U+1EA0–1EF9 nên sẽ rơi về font dự phòng ngay giữa một
 *    tiêu đề, không lỗi build, không lỗi lint.
 *
 * 💡 Archivo Narrow là chính font mà bản tham chiếu đã xếp làm dự phòng cho Inter
 *    Tight, nên chọn nó giữ đúng ý định thiết kế — condensed, grotesque, chịu
 *    được chữ hoa cỡ lớn — và nó CÓ tiếng Việt.
 */
const display = Archivo_Narrow({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display-vn',
});

const giaoDien = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ui-vn',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono-vn',
});
```

Rồi đổi thẻ `<html>` cho khớp tên biến mới:

```tsx
    <html
      lang="vi"
      className={`${display.variable} ${giaoDien.variable} ${mono.variable}`}
    >
```

- [ ] **Step 2: Đổi giá trị token sang hướng tối**

Trong `apps/landing/src/app/globals.css`, thay **toàn bộ** khối `:root { … }`
bằng khối dưới đây. Không sửa gì bên dưới `:root` ở step này.

```css
:root {
  /* ---- Bề mặt: 0 là sâu nhất, 3 là nổi nhất ---- */
  --surface-0: #0a0b0c;
  --surface-1: #111315;
  --surface-2: #17191c;
  --surface-3: #202327;

  /*
   * `--ink-*` giữ lại và trỏ về chính bề mặt tối.
   *
   * 💡 Ở hướng giấy, `--ink-*` là tông của plate mực chèn vào trang. Ở hướng tối
   *    thì cả trang đã là mực, nên plate không còn là một thứ KHÁC — nhưng vài
   *    rule vẫn gọi tên token này. Trỏ chúng về bề mặt thay vì xoá: xoá tên token
   *    đang được dùng chỉ để "cho gọn" là cách tạo ra một biến không tồn tại.
   */
  --ink-0: var(--surface-0);
  --ink-1: var(--surface-1);
  --ink-2: var(--surface-2);
  --ink-3: var(--surface-3);

  /* ---- Chữ ---- */
  --text: #f5f5f3;
  --text-muted: #a5a7aa;
  /*
   * ⚠️ `--text-dim` từng là #8b96a8 — 4.49:1, TRƯỢT AA đúng 0.01. Một mức "mờ hơn
   *    muted" khi muted đã sát ngưỡng thì chỉ có thể là mức trượt ngưỡng.
   * 💡 Cho nó giá trị đạt chuẩn; thứ bậc thị giác do cỡ chữ và họ mono tạo ra.
   */
  --text-dim: #a5a7aa;
  --text-on-action: #ffffff;
  --text-on-ink: var(--text);
  --text-on-ink-muted: var(--text-muted);

  /* ---- Đường kẻ ---- */
  --line: rgb(255 255 255 / 12%);
  --line-strong: rgb(255 255 255 / 34%);
  --line-on-ink: var(--line);
  --line-on-ink-strong: var(--line-strong);

  /* ---- Thương hiệu và hành động ----
   *
   * ⚠️ `--action` KHÔNG dùng lại `--brand`. Trắng trên #e63b2e chỉ đạt **4.18:1**
   *    — trượt AA. Nghĩa là nút chính của cả trang, thứ được bấm nhiều nhất, là
   *    chỗ khó đọc nhất. Bài học này có trong CẢ hai codebase, và nó không thay
   *    đổi theo hướng thiết kế.
   *
   * 💡 `--brand` là màu THƯƠNG HIỆU dùng cho chữ và đồ hoạ; `--action` là màu NỀN
   *    của nút, đậm hơn một bậc để cõng được chữ trắng.
   */
  --brand: #e63b2e;
  --brand-strong: #c22a1c;
  --brand-dim: rgb(230 59 46 / 16%);
  --action: #d6301f;
  --action-hover: #c22a1c;

  --accent: #e63b2e;
  --ok: #62d19b;
  --danger: #ff7b72;

  /* ---- Ba giọng chữ ---- */
  --font-display: var(--font-display-vn), 'Archivo Narrow', 'Inter Tight',
    'Helvetica Neue', Arial, sans-serif;
  --font-ui: var(--font-ui-vn), 'Be Vietnam Pro', Inter, ui-sans-serif, system-ui,
    sans-serif;
  --font-mono: var(--font-mono-vn), 'JetBrains Mono', ui-monospace, Consolas,
    monospace;

  /* ---- Thang chữ ---- */
  --fs-xs: 0.75rem;
  --fs-sm: 0.875rem;
  --fs-md: 1rem;
  --fs-lg: 1.125rem;
  --fs-xl: clamp(1.4rem, 2.2vw, 1.875rem);
  --fs-2xl: clamp(1.9rem, 3.4vw, 3rem);
  --fs-3xl: clamp(2.6rem, 6vw, 5.2rem);

  /*
   * 🔒 Chiều cao dòng của chữ display tiếng Việt không xuống dưới ~1.12, kể cả ở
   *    hướng cinematic nơi bản tham chiếu đặt 1.02. Dấu xếp tầng (Ổ, Ế, Ữ) cao
   *    hơn chiều cao chữ hoa nên bị dòng trên CẮT. Đây là lỗi chỉ lộ ra ở tiếng
   *    Việt, và lộ ra ở đúng dòng chữ to nhất trang.
   */
  --lh-display: 1.14;
  --lh-hero: 1.12;
  --lh-body: 1.55;

  /* ---- Khoảng cách: thang 4px ---- */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;
  --s-9: 96px;
  --s-10: 128px;

  /* ---- Hình khối: sắc theo bản sắc ---- */
  --r-sm: 4px;
  --r-md: 4px;
  --r-lg: 8px;
  --r-full: 999px;
  --shadow-1: 0 1px 0 rgb(255 255 255 / 5%) inset;
  --shadow-2: 0 24px 70px rgb(0 0 0 / 55%);

  --max-w: 1180px;
  --max-w-wide: 1560px;
  --measure: 66ch;
  --measure-tight: 46ch;
}
```

- [ ] **Step 3: Bỏ khối "PLATE MỰC"**

Ngay dưới `:root` có một rule danh sách chọn `.hero, .spotlight, .site-footer,
.card-media, .viewer-canvas, .plate { … }` remap token sang tông mực. Ở hướng tối
nó vô nghĩa — cả trang đã là mực. **Xoá toàn bộ rule đó và khối chú thích
`═══ PLATE MỰC ═══` phía trên nó**, thay bằng:

```css
/*
 * Ở hướng tối không còn khái niệm "plate mực": cả trang đã là mực, nên không
 * khối nào cần remap token bề mặt.
 *
 * 🔒 Nhưng bài học sinh ra khối đó vẫn còn giá trị và vẫn áp dụng: khối nào TỰ
 *    SƠN nền khác trang thì phải chọn luôn màu chữ trong cùng khai báo. Nếu về
 *    sau có ai thêm một khối nền sáng vào trang tối này, nó phải tự khai báo
 *    `--text` của nó — không được để token của trang tối chảy vào.
 */
```

- [ ] **Step 4: Sửa các rule còn giả định nền sáng**

Bốn chỗ được sửa cho hướng giấy giờ sai chiều. Sửa lần lượt:

```css
/* Header: kính mờ tối, không phải giấy mờ */
.site-header {
  position: sticky; top: 0; z-index: 20;
  background: rgb(10 11 12 / 72%);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(18px);
}

/* Dấu thương hiệu: khối accent đặc */
.brand-mark {
  width: 30px; height: 30px; display: grid; place-items: center;
  border: 1px solid var(--line-strong); border-radius: var(--r-sm);
  background: var(--action);
}

.nav-cta:hover { background: rgb(255 255 255 / 7%); }

/* Nút phụ: lấy sáng từ nền tối */
.btn-secondary {
  background: rgb(255 255 255 / 6%);
  border-color: var(--line-strong);
  color: var(--text) !important;
}
.btn-secondary:hover { background: rgb(255 255 255 / 12%); border-color: var(--line-strong); }
```

Và hai chỗ đổi lại thành gradient tối:

```css
.hero::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background:
    linear-gradient(100deg, var(--surface-0) 10%, rgb(10 11 12 / 72%) 38%, rgb(10 11 12 / 8%) 66%),
    linear-gradient(to top, var(--surface-0) 2%, transparent 34%);
}

.spotlight::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(to right, var(--surface-0) 6%, rgb(10 11 12 / 82%) 38%, rgb(10 11 12 / 18%) 78%);
}
```

🔒 **Giữ `isolation: isolate` và `background` trên `.spotlight`.** Đó là bản sửa
cho một lỗi thật: hai lớp `z-index: -1/-2` của nó lùi ra sau nền trang và biến
mất khi thiếu hai dòng đó. Trên nền tối lỗi này **vô hình** (khối mất ảnh trông y
như khối có ảnh rất tối), nên rất dễ bị xoá "cho gọn". Đừng xoá.

- [ ] **Step 5: Trả `display--upper` cho giọng display**

Hướng cinematic đặt tiêu đề bằng chữ hoa condensed. Thay rule `h1, h2, h3`:

```css
h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: var(--lh-display);
  text-transform: uppercase;
  text-wrap: balance;
}
```

⚠️ `letter-spacing: -0.02em`, không phải `-0.05em` như bản tham chiếu. Chữ hoa
tiếng Việt có dấu nằm sát thân chữ; siết quá thì dấu của chữ này chạm thân chữ
bên cạnh.

- [ ] **Step 6: Đưa icon và manifest về palette tối**

`apps/landing/src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="6" fill="#0a0b0c"/>
  <path d="M12 38h40v5H12z" fill="#f5f5f3"/>
  <circle cx="32" cy="25" r="11" fill="#e63b2e"/>
</svg>
```

`apps/landing/src/app/apple-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="18" fill="#0a0b0c"/>
  <path d="M36 112h108v16H36z" fill="#f5f5f3"/>
  <circle cx="90" cy="72" r="31" fill="#e63b2e"/>
</svg>
```

Trong `apps/landing/src/app/manifest.ts`, đổi hai giá trị (giữ nguyên chú thích
giải thích vì sao chúng buộc phải viết cứng):

```ts
    background_color: '#0a0b0c',
    theme_color: '#d6301f',
```

- [ ] **Step 7: Cập nhật cặp màu trong script kiểm tương phản**

Trong `infra/kiem-tuong-phan.mjs`, thay khối hằng bề mặt và mảng `CAP` bằng:

```js
const NEN_0 = '#0a0b0c';
const NEN_1 = '#111315';
const NEN_2 = '#17191c';
const NEN_3 = '#202327';

const CAP = [
  ['chữ chính trên nền 0', '#f5f5f3', NEN_0, 4.5],
  ['chữ chính trên nền 1', '#f5f5f3', NEN_1, 4.5],
  ['chữ chính trên nền 2', '#f5f5f3', NEN_2, 4.5],
  ['chữ chính trên nền 3', '#f5f5f3', NEN_3, 4.5],
  ['chữ mờ trên nền 0', '#a5a7aa', NEN_0, 4.5],
  ['chữ mờ trên nền 1', '#a5a7aa', NEN_1, 4.5],
  ['chữ mờ trên nền 2', '#a5a7aa', NEN_2, 4.5],
  ['chữ mờ trên nền 3', '#a5a7aa', NEN_3, 4.5],

  ['brand làm chữ trên nền 0', '#e63b2e', NEN_0, 4.5],
  ['brand làm chữ trên nền 2', '#e63b2e', NEN_2, 4.5],
  ['chữ trắng trên nút chính', '#ffffff', '#d6301f', 4.5],
  ['chữ trắng trên nút hover', '#ffffff', '#c22a1c', 4.5],

  ['thành công trên nền 0', '#62d19b', NEN_0, 4.5],
  ['lỗi trên nền 0', '#ff7b72', NEN_0, 4.5],
  ['lỗi trên nền 2', '#ff7b72', NEN_2, 4.5],

  ['viền điều khiển trên nền 0', tren('#ffffff', 0.34, NEN_0), NEN_0, 3],
  ['đường chia trên nền 0 — trang trí', tren('#ffffff', 0.12, NEN_0), NEN_0, 1],
];
```

- [ ] **Step 8: Chạy kiểm tương phản và SỬA cho tới khi hết trượt**

```bash
cd e:/GarageOS && node infra/kiem-tuong-phan.mjs
```

Expected: mọi cặp `ĐẠT`.

Nếu một cặp trượt, **đổi giá trị token, không đổi ngưỡng**. Ngưỡng là WCAG; token
là lựa chọn của ta. Ví dụ nếu `brand làm chữ trên nền 2` trượt thì `--brand` cần
sáng hơn khi dùng làm chữ — thêm một token dẫn xuất, đừng hạ `4.5` xuống `4`.

- [ ] **Step 9: Lint, typecheck, xem bằng mắt**

```bash
pnpm --filter @garageos/landing lint && pnpm --filter @garageos/landing typecheck
```

Expected: sạch.

```bash
pnpm db:up && pnpm db:seed
pnpm --filter @garageos/api dev &
pnpm --filter @garageos/landing dev &
sleep 15 && curl -s -o /dev/null -w 'landing=%{http_code}\n' http://localhost:3003/
```

Mở `http://localhost:3003/` và kiểm bốn thứ: nền tối · tiêu đề chữ hoa condensed
đọc được dấu tiếng Việt (Ổ, Ế, Ữ **không** bị cắt) · nút chính đỏ đậm với chữ
trắng · ảnh xe liền mạch với nền, không có mép hộp.

- [ ] **Step 10: Chạy e2e và a11y để chắc chắn không làm hỏng gì**

```bash
npx playwright test e2e/landing-cong-khai.spec.ts e2e/accessibility.spec.ts --reporter=list -g "landing|Trang bán xe" 2>&1 | tail -14
```

Expected: 10 passed.

⚠️ Nếu bài a11y đỏ ở `color-contrast`, chạy `node infra/kiem-tuong-phan.mjs`
trước. Script kiểm TOKEN; axe kiểm những gì thật sự render — kể cả chữ nằm trên
ảnh, nơi token không nói được gì.

- [ ] **Step 11: Commit**

```bash
git add apps/landing/src/app/globals.css apps/landing/src/app/layout.tsx \
  apps/landing/src/app/icon.svg apps/landing/src/app/apple-icon.svg \
  apps/landing/src/app/manifest.ts infra/kiem-tuong-phan.mjs
git commit -m "feat(landing): doi huong thi giac sang dark cinematic"
```

---

### Task 1: Hàm thuần `tomTatChiPhi`

Trang chủ cần bốn con số dẫn xuất mà `ChiPhiSoHuuView` chưa có sẵn: bình quân mỗi
năm, năm đắt nhất, chênh lệch so với xe xăng, và một cờ cho biết dữ liệu có dùng
được không. Đặt ở `packages/domain` vì đây là logic thuần, và vì landing không có
test runner unit.

**Files:**
- Create: `packages/domain/src/tom-tat-chi-phi.ts`
- Create: `packages/domain/src/tom-tat-chi-phi.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: không gì từ task khác. Hàm nhận một cấu trúc tối thiểu (`NguonChiPhi`) chứ không nhận trực tiếp `ChiPhiSoHuuView`, để không tạo phụ thuộc mới `domain → contracts`.
- Produces:
  - `export interface NguonChiPhi { soNam: number; tong: number; soNamKhongTon: number; soSanhXeXang: number | null; theoNam: ReadonlyArray<{ nam: number; tong: number }>; }`
  - `export interface TomTatChiPhi { tong: number; soNam: number; binhQuanMoiNam: number; namDatNhat: { nam: number; tong: number } | null; chenhLechXeXang: number | null; soNamKhongTon: number; }`
  - `export function tomTatChiPhi(v: NguonChiPhi): TomTatChiPhi | null`

- [ ] **Step 1: Viết test thất bại**

Tạo `packages/domain/src/tom-tat-chi-phi.test.ts`:

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tomTatChiPhi } from './tom-tat-chi-phi.js';

/**
 * 🔒 Tóm tắt này là con số xuất hiện TRÊN TRANG CHỦ. Nó phải hoặc đúng, hoặc
 *    không xuất hiện — không có phương án thứ ba là "hiện một số gần đúng".
 */

const nguon = {
  soNam: 5,
  tong: 12_000_000,
  soNamKhongTon: 2,
  soSanhXeXang: 21_500_000,
  theoNam: [
    { nam: 1, tong: 0 },
    { nam: 2, tong: 3_000_000 },
    { nam: 3, tong: 0 },
    { nam: 4, tong: 7_000_000 },
    { nam: 5, tong: 2_000_000 },
  ],
};

describe('tomTatChiPhi', () => {
  test('rút đúng bình quân, năm đắt nhất và chênh lệch so với xe xăng', () => {
    const t = tomTatChiPhi(nguon);
    assert.ok(t !== null);
    assert.equal(t.tong, 12_000_000);
    assert.equal(t.soNam, 5);
    assert.equal(t.binhQuanMoiNam, 2_400_000);
    assert.deepEqual(t.namDatNhat, { nam: 4, tong: 7_000_000 });
    assert.equal(t.chenhLechXeXang, 9_500_000);
    assert.equal(t.soNamKhongTon, 2);
  });

  test('bình quân là số nguyên đồng — không để lẻ xu lọt ra trang', () => {
    const t = tomTatChiPhi({ ...nguon, tong: 10_000_001, soNam: 3 });
    assert.ok(t !== null);
    assert.equal(Number.isInteger(t.binhQuanMoiNam), true);
    assert.equal(t.binhQuanMoiNam, 3_333_334);
  });

  test('không có dữ liệu năm nào thì trả null, không trả số 0', () => {
    assert.equal(tomTatChiPhi({ ...nguon, theoNam: [] }), null);
  });

  test('soNam bằng 0 thì trả null thay vì chia cho 0', () => {
    assert.equal(tomTatChiPhi({ ...nguon, soNam: 0 }), null);
  });

  test('xe xăng không có gì để so sánh — chenhLechXeXang là null', () => {
    const t = tomTatChiPhi({ ...nguon, soSanhXeXang: null });
    assert.ok(t !== null);
    assert.equal(t.chenhLechXeXang, null);
  });

  test('xe điện đắt hơn xe xăng thì chênh lệch là số ÂM, không phải 0', () => {
    // Không giả định chiều của kết quả. Một bảng giá có thể làm xe điện đắt hơn,
    // và trang phải nói đúng điều đó thay vì che đi.
    const t = tomTatChiPhi({ ...nguon, soSanhXeXang: 9_000_000 });
    assert.ok(t !== null);
    assert.equal(t.chenhLechXeXang, -3_000_000);
  });

  test('nhiều năm cùng mức đắt nhất thì lấy năm ĐẦU TIÊN', () => {
    const t = tomTatChiPhi({
      ...nguon,
      theoNam: [
        { nam: 1, tong: 5_000_000 },
        { nam: 2, tong: 5_000_000 },
      ],
    });
    assert.ok(t !== null);
    assert.deepEqual(t.namDatNhat, { nam: 1, tong: 5_000_000 });
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó thất bại**

```bash
cd packages/domain && pnpm test 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './tom-tat-chi-phi.js'`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `packages/domain/src/tom-tat-chi-phi.ts`:

```ts
/**
 * Tóm tắt chi phí sở hữu cho trang chủ.
 *
 * 🔒 Trả `null` thay vì số 0 khi dữ liệu không dùng được. Trang chủ phải có
 *    quyền KHÔNG hiện khối này; một phiếu chi phí ghi "0 ₫" trông như một lời
 *    hứa miễn phí, và đó tệ hơn cả việc không hiện gì.
 */
export interface NguonChiPhi {
  soNam: number;
  tong: number;
  soNamKhongTon: number;
  /** `null` khi chính chiếc xe đang xem đã là xe xăng. */
  soSanhXeXang: number | null;
  theoNam: ReadonlyArray<{ nam: number; tong: number }>;
}

export interface TomTatChiPhi {
  tong: number;
  soNam: number;
  binhQuanMoiNam: number;
  namDatNhat: { nam: number; tong: number } | null;
  /**
   * Dương = đi xe này rẻ hơn xe xăng bấy nhiêu đồng. ÂM = đắt hơn.
   * `null` = không có gì để so sánh.
   */
  chenhLechXeXang: number | null;
  soNamKhongTon: number;
}

export function tomTatChiPhi(v: NguonChiPhi): TomTatChiPhi | null {
  if (v.theoNam.length === 0 || v.soNam <= 0) return null;

  /*
   * `Math.ceil`, không phải `Math.round`. Đây là con số khách mang tới xưởng đối
   * chiếu, nên khi phải làm tròn thì làm tròn LÊN — sai lệch theo hướng trang
   * nói cao hơn thực tế, không phải hướng trang hứa thấp hơn hoá đơn.
   */
  const binhQuanMoiNam = Math.ceil(v.tong / v.soNam);

  let namDatNhat: { nam: number; tong: number } | null = null;
  for (const n of v.theoNam) {
    // So sánh `>` chứ không `>=`: nhiều năm cùng mức thì giữ năm đầu tiên.
    if (namDatNhat === null || n.tong > namDatNhat.tong) {
      namDatNhat = { nam: n.nam, tong: n.tong };
    }
  }

  const chenhLechXeXang =
    v.soSanhXeXang === null ? null : v.soSanhXeXang - v.tong;

  return {
    tong: v.tong,
    soNam: v.soNam,
    binhQuanMoiNam,
    namDatNhat,
    chenhLechXeXang,
    soNamKhongTon: v.soNamKhongTon,
  };
}
```

- [ ] **Step 4: Chạy test để chắc chắn nó pass**

```bash
cd packages/domain && pnpm test 2>&1 | tail -20
```

Expected: PASS — 7 test của `tomTatChiPhi` đều xanh.

Nếu test "bình quân là số nguyên đồng" đỏ với `3333333.666…`, nghĩa là bạn dùng
phép chia thường; phải là `Math.ceil`.

- [ ] **Step 5: Export từ package**

Thêm vào `packages/domain/src/index.ts` (giữ thứ tự chữ cái nếu file đang xếp theo đó):

```ts
export * from './tom-tat-chi-phi.js';
```

- [ ] **Step 6: Chạy typecheck cả monorepo**

```bash
cd ../.. && pnpm typecheck 2>&1 | tail -5
```

Expected: `8 successful, 8 total`

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/tom-tat-chi-phi.ts packages/domain/src/tom-tat-chi-phi.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): tom tat chi phi so huu cho trang chu"
```

---

### Task 2: Lớp fetch SSR không-bao-giờ-ném

Trang chủ render phía server. `fetchPublic` **ném** khi API lỗi. Nếu trang chủ gọi
trực tiếp thì một bảng giá thiếu sẽ làm cả trang chủ trả 500 — một tính năng phụ
đánh sập trang chính.

**Files:**
- Create: `apps/landing/src/lib/chi-phi.ts`

**Interfaces:**
- Consumes: `fetchPublic<T>(host: string, path: string): Promise<T>` và `requestHost(): Promise<string>` từ `@/lib/api`; `tomTatChiPhi`, `type TomTatChiPhi` từ `@garageos/domain` (Task 1).
- Produces:
  - `export const KM_MOI_NAM_MAC_DINH = 15000`
  - `export interface ChiPhiTrangChu { tomTat: TomTatChiPhi; tenBangGia: string; apDungTu: string; giaCongMoiGio: number; kmMoiNam: number; }`
  - `export async function layChiPhiTrangChu(slug: string): Promise<ChiPhiTrangChu | null>`

- [ ] **Step 1: Viết implementation**

Tạo `apps/landing/src/lib/chi-phi.ts`:

```ts
import type { ChiPhiSoHuuView } from '@garageos/contracts';
import { tomTatChiPhi, type TomTatChiPhi } from '@garageos/domain';
import { requestHost, fetchPublic } from '@/lib/api';

/**
 * 15 000 km/năm — mức trung bình dùng làm mặc định khi khách chưa chọn gì.
 * Trang PHẢI in con số này ra: một chi phí bảo dưỡng không kèm quãng đường là
 * một con số không kiểm chứng được.
 */
export const KM_MOI_NAM_MAC_DINH = 15000;

export interface ChiPhiTrangChu {
  tomTat: TomTatChiPhi;
  tenBangGia: string;
  apDungTu: string;
  giaCongMoiGio: number;
  kmMoiNam: number;
}

/**
 * Lấy chi phí sở hữu cho trang chủ. **Không bao giờ ném.**
 *
 * 🔒 `fetchPublic` ném khi API trả lỗi. Trang chủ là trang quan trọng nhất của
 *    tenant, và khối chi phí là một phần BỔ SUNG của nó. Nếu một tenant chưa cấu
 *    hình bảng giá hoặc lịch bảo dưỡng, kết quả đúng là trang chủ hiện thiếu một
 *    khối — không phải trang chủ trả 500.
 *
 * 💡 Đây cũng là lý do hàm trả `null` chứ không trả một object rỗng: người gọi
 *    buộc phải xử lý trường hợp không có dữ liệu, thay vì vô tình render số 0.
 */
export async function layChiPhiTrangChu(slug: string): Promise<ChiPhiTrangChu | null> {
  try {
    const host = await requestHost();
    const duong =
      `/vehicle-products/${encodeURIComponent(slug)}/chi-phi-so-huu` +
      `?kmMoiNam=${KM_MOI_NAM_MAC_DINH}&soNam=5`;
    const v = await fetchPublic<ChiPhiSoHuuView>(host, duong);

    const tomTat = tomTatChiPhi({
      soNam: v.soNam,
      tong: v.tong,
      soNamKhongTon: v.soNamKhongTon,
      soSanhXeXang: v.soSanhXeXang,
      theoNam: v.theoNam.map((n) => ({ nam: n.nam, tong: n.tong })),
    });
    if (tomTat === null) return null;

    return {
      tomTat,
      tenBangGia: v.tenBangGia,
      // Tên trường trong contract có dấu tiếng Việt — giữ đúng như vậy khi đọc.
      apDungTu: v['ápDụngTừ'],
      giaCongMoiGio: v.giaCongMoiGio,
      kmMoiNam: v.kmMoiNam,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Chạy typecheck để xác nhận tên trường có dấu được chấp nhận**

```bash
pnpm --filter @garageos/landing typecheck 2>&1 | tail -5
```

Expected: không output.

Nếu lỗi `Property 'ápDụngTừ' does not exist`, mở `packages/contracts/src/marketing.ts`,
tìm `ChiPhiSoHuuView` và copy đúng tên trường — nó có dấu, và đó là chủ ý của contract.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/lib/chi-phi.ts
git commit -m "feat(landing): lop fetch chi phi so huu cho SSR, khong nem"
```

---

### Task 3: Phiếu chi phí sở hữu

**Files:**
- Create: `apps/landing/src/components/phieu-chi-phi.tsx`
- Modify: `apps/landing/src/app/globals.css` (thêm vào cuối file)

**Interfaces:**
- Consumes: `type ChiPhiTrangChu` từ `@/lib/chi-phi` (Task 2).
- Produces: `export function PhieuChiPhi({ du, tenXe, slug }: { du: ChiPhiTrangChu; tenXe: string; slug: string }): React.ReactElement`

- [ ] **Step 1: Viết component**

Tạo `apps/landing/src/components/phieu-chi-phi.tsx`:

```tsx
import Link from 'next/link';
import type { ChiPhiTrangChu } from '@/lib/chi-phi';

/**
 * Phiếu chi phí sở hữu — hiện vật trung tâm của trang chủ.
 *
 * 🔒 Ba thứ BẮT BUỘC in ra cùng con số, không được lược bớt cho gọn:
 *      · quãng đường mỗi năm  — không có nó thì chi phí vô nghĩa
 *      · tên bảng giá         — cho biết con số đến từ đâu
 *      · ngày hiệu lực        — cho biết con số còn hạn hay không
 *
 * 💡 Đây là điều làm khối này khác một khối marketing: nó tự nêu nguồn và tự mời
 *    khách đi kiểm tra. Bỏ ba dòng đó đi thì nó tụt xuống thành một con số đẹp
 *    không ai xác nhận được, tức là đúng thứ mọi trang bán xe khác đã có.
 */

const dinhDang = (d: number): string => new Intl.NumberFormat('vi-VN').format(d);

function So({ dong, lon }: { dong: number; lon?: boolean }): React.ReactElement {
  return (
    <span className={lon === true ? 'phieu-so phieu-so--lon' : 'phieu-so'}>
      <span className="gia-so">{dinhDang(dong)}</span>{' '}
      <span className="gia-ky-hieu">₫</span>
    </span>
  );
}

export function PhieuChiPhi({
  du,
  tenXe,
  slug,
}: {
  du: ChiPhiTrangChu;
  tenXe: string;
  slug: string;
}): React.ReactElement {
  const { tomTat } = du;
  return (
    <section className="phieu" aria-labelledby="phieu-tieu-de">
      <div className="container">
        <p className="eyebrow">Chi phí bảo dưỡng, tính từ bảng giá của xưởng</p>
        <h2 id="phieu-tieu-de">
          {tomTat.soNam} năm đầu của {tenXe} tốn <So dong={tomTat.tong} lon />
        </h2>

        <dl className="phieu-bang">
          <div>
            <dt>Bình quân mỗi năm</dt>
            <dd><So dong={tomTat.binhQuanMoiNam} /></dd>
          </div>
          {tomTat.namDatNhat !== null && (
            <div>
              <dt>Năm tốn nhiều nhất</dt>
              <dd>
                Năm {tomTat.namDatNhat.nam} · <So dong={tomTat.namDatNhat.tong} />
              </dd>
            </div>
          )}
          <div>
            <dt>Số năm không phải chi gì</dt>
            <dd className="tnum">
              {tomTat.soNamKhongTon} / {tomTat.soNam}
            </dd>
          </div>
          <div>
            <dt>Giá công mỗi giờ</dt>
            <dd><So dong={du.giaCongMoiGio} /></dd>
          </div>
        </dl>

        {/*
          Dòng xuất xứ. Nó là phần khiến cả khối này có giá trị, nên nó nằm trong
          luồng đọc chính chứ không nằm ở chân trang dưới dạng chữ nhỏ.
        */}
        <p className="phieu-nguon">
          Tính cho {dinhDang(du.kmMoiNam)} km mỗi năm theo{' '}
          <strong>{du.tenBangGia}</strong>, hiệu lực từ {du.apDungTu}. Đây là bảng
          giá xưởng đang dùng để lập báo giá thật — bạn mang con số này tới quầy và
          đối chiếu được.
        </p>

        <p className="phieu-cta">
          <Link className="btn" href={`/xe/${slug}#chi-phi`}>
            Xem chi tiết từng năm
          </Link>
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Thêm CSS**

Thêm vào cuối `apps/landing/src/app/globals.css`:

```css
/* ═══════════════════════ Phiếu chi phí sở hữu ═══════════════════════ */

/*
 * Trình bày như một phiếu in của xưởng: nền giấy phụ, số liệu xếp thành cột có
 * hairline ở trên. Không bo góc, không đổ bóng — một phiếu in có mép cắt.
 */
.phieu {
  padding: var(--s-9) 0;
  background: var(--surface-2);
  border-block: 1px solid var(--line);
}
.phieu h2 {
  max-width: 34ch;
  margin: var(--s-4) 0 var(--s-7);
  font-size: var(--fs-2xl);
}

.phieu-so { font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Con số chính to hơn phần chữ quanh nó — thứ bậc do CỠ CHỮ tạo ra, không do
   thêm một màu nhấn thứ hai. */
.phieu-so--lon { font-size: 1.16em; }

.phieu-bang {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-6) var(--s-5);
  margin: 0;
}
@media (min-width: 60rem) {
  .phieu-bang { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.phieu-bang > div { padding-top: var(--s-3); border-top: 1px solid var(--line-strong); }
.phieu-bang dt {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.phieu-bang dd {
  margin: var(--s-3) 0 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-lg);
}

.phieu-nguon {
  max-width: var(--measure);
  margin: var(--s-7) 0 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.phieu-nguon strong { color: var(--text); }
.phieu-cta { margin: var(--s-6) 0 0; }
```

- [ ] **Step 3: Chạy lint, typecheck và kiểm tương phản**

```bash
pnpm --filter @garageos/landing lint && pnpm --filter @garageos/landing typecheck && pnpm kiem:tuong-phan | tail -3
```

Expected: lint không output, typecheck không output, tương phản `27/27 đạt`.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/components/phieu-chi-phi.tsx apps/landing/src/app/globals.css
git commit -m "feat(landing): phieu chi phi so huu"
```

---

### Task 4: Băng so sánh điện với xăng

**Files:**
- Create: `apps/landing/src/components/so-sanh-dong-co.tsx`
- Modify: `apps/landing/src/app/globals.css`

**Interfaces:**
- Consumes: `type ChiPhiTrangChu` từ `@/lib/chi-phi` (Task 2). Dùng lại class `.phieu-so` và `.gia-ky-hieu` do Task 3 định nghĩa.
- Produces: `export function SoSanhDongCo({ du, tenXe }: { du: ChiPhiTrangChu; tenXe: string }): React.ReactElement | null`

- [ ] **Step 1: Viết component**

Tạo `apps/landing/src/components/so-sanh-dong-co.tsx`:

```tsx
import type { ChiPhiTrangChu } from '@/lib/chi-phi';

/**
 * So sánh chi phí bảo dưỡng với xe xăng — cùng quãng đường, cùng bảng giá.
 *
 * 🔒 Trả `null` trong HAI trường hợp, cả hai đều quan trọng:
 *
 *    · `chenhLechXeXang === null` — chính chiếc xe đang xem đã là xe xăng. So
 *      sánh xe xăng với xe xăng không nói gì.
 *    · `chenhLechXeXang <= 0` — xe này KHÔNG rẻ hơn. Khối này là một khẳng định,
 *      và một khẳng định sai thì phải im lặng chứ không đổi giọng thành "chỉ đắt
 *      hơn một chút".
 *
 * 💡 Đây là chỗ tuyên bố "thiết kế cho xe điện từ đầu" ở `docs/00-vision.md` trở
 *    thành một con số. Cùng bảng giá, cùng quãng đường, khác lịch bảo dưỡng.
 */
export function SoSanhDongCo({
  du,
  tenXe,
}: {
  du: ChiPhiTrangChu;
  tenXe: string;
}): React.ReactElement | null {
  const chenh = du.tomTat.chenhLechXeXang;
  if (chenh === null || chenh <= 0) return null;

  const dinhDang = (d: number): string => new Intl.NumberFormat('vi-VN').format(d);
  const xeXang = du.tomTat.tong + chenh;
  // Bề rộng thanh của xe này so với xe xăng, theo tỉ lệ thật.
  const tiLe = Math.round((du.tomTat.tong / xeXang) * 100);

  return (
    <section className="so-sanh" aria-labelledby="so-sanh-tieu-de">
      <div className="container">
        <p className="eyebrow">
          Cùng {dinhDang(du.kmMoiNam)} km mỗi năm, cùng một bảng giá
        </p>
        <h2 id="so-sanh-tieu-de">
          {tenXe} tiết kiệm{' '}
          <span className="phieu-so">
            {dinhDang(chenh)} <span className="gia-ky-hieu">₫</span>
          </span>{' '}
          trong {du.tomTat.soNam} năm
        </h2>

        {/*
          Hai thanh theo tỉ lệ THẬT, kèm số bên cạnh. Thanh giúp thấy khác biệt
          ngay; số là thứ kiểm chứng được. Thiếu số thì đây chỉ là đồ hoạ.
        */}
        <dl className="so-sanh-thanh">
          <div>
            <dt>{tenXe}</dt>
            <dd>
              <span
                className="thanh-ve"
                style={{ inlineSize: `${tiLe}%` }}
                aria-hidden="true"
              />
              <span className="tnum">{dinhDang(du.tomTat.tong)} ₫</span>
            </dd>
          </div>
          <div>
            <dt>Xe xăng cùng phân khúc</dt>
            <dd>
              <span
                className="thanh-ve thanh-ve--doi-chung"
                style={{ inlineSize: '100%' }}
                aria-hidden="true"
              />
              <span className="tnum">{dinhDang(xeXang)} ₫</span>
            </dd>
          </div>
        </dl>

        <p className="note">
          Khác biệt đến từ lịch bảo dưỡng, không từ khuyến mãi: xe điện không có
          dầu động cơ, lọc dầu, bugi hay dây curoa cam trong chu kỳ. Con số xe xăng
          được tính bằng chính {du.tenBangGia}.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Thêm CSS**

Thêm vào cuối `apps/landing/src/app/globals.css`:

```css
/* ═══════════════════════ So sánh điện / xăng ═══════════════════════ */

.so-sanh { padding: var(--s-9) 0; }
.so-sanh h2 {
  max-width: 32ch;
  margin: var(--s-4) 0 var(--s-7);
  font-size: var(--fs-2xl);
}

.so-sanh-thanh { display: grid; gap: var(--s-5); margin: 0; max-width: 46rem; }
.so-sanh-thanh dt {
  margin-bottom: var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.so-sanh-thanh dd {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin: 0;
  font-variant-numeric: tabular-nums;
}
/*
 * Thanh là ĐỒ HOẠ và mang `aria-hidden`, nên nó chỉ cần đạt 3:1 (SC 1.4.11).
 * Con số bên cạnh mới là thông tin, và nó lấy màu chữ thường.
 */
.thanh-ve {
  block-size: 12px;
  flex: 0 0 auto;
  background: var(--action);
}
.thanh-ve--doi-chung {
  background: var(--surface-3);
  border: 1px solid var(--line-strong);
}
.so-sanh .note { max-width: var(--measure); margin-top: var(--s-6); }
```

- [ ] **Step 3: Lint, typecheck, tương phản**

```bash
pnpm --filter @garageos/landing lint && pnpm --filter @garageos/landing typecheck && pnpm kiem:tuong-phan | tail -3
```

Expected: sạch, `27/27 đạt`.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/components/so-sanh-dong-co.tsx apps/landing/src/app/globals.css
git commit -m "feat(landing): bang so sanh chi phi dien va xang"
```

---

### Task 5: Gắn hai khối vào trang chủ, bỏ `trust-row`

**Files:**
- Modify: `apps/landing/src/app/page.tsx`

**Interfaces:**
- Consumes: `layChiPhiTrangChu` từ `@/lib/chi-phi` (Task 2); `PhieuChiPhi` (Task 3); `SoSanhDongCo` (Task 4).
- Produces: không có export mới.

- [ ] **Step 1: Thêm import**

Trong `apps/landing/src/app/page.tsx`, thêm vào khối import ở đầu file:

```tsx
import { layChiPhiTrangChu } from '@/lib/chi-phi';
import { PhieuChiPhi } from '@/components/phieu-chi-phi';
import { SoSanhDongCo } from '@/components/so-sanh-dong-co';
```

- [ ] **Step 2: Lấy dữ liệu ở server**

Ngay sau dòng `const noiBat = products[0] ?? null;`, thêm:

```tsx
  /*
   * Chi phí sở hữu của xe nổi bật. Lấy ở server để nó vào HTML đầu tiên — đây là
   * con số đáng được crawl và đáng hiện khi JS chưa chạy.
   *
   * `layChiPhiTrangChu` không bao giờ ném; `null` nghĩa là tenant chưa cấu hình
   * bảng giá hoặc lịch bảo dưỡng, và trang chủ khi đó thiếu một khối thay vì lỗi.
   */
  const chiPhi = noiBat === null ? null : await layChiPhiTrangChu(noiBat.slug);
```

- [ ] **Step 3: Thay `trust-row` bằng một dòng có số**

Tìm và **xoá** khối này trong hero:

```tsx
              <div className="trust-row" aria-label="Cam kết dịch vụ">
                <span>Giá niêm yết công khai</span>
                <span>Lái thử theo lịch của bạn</span>
                <span>Hậu mãi liền mạch</span>
              </div>
```

Thay bằng:

```tsx
              {/*
                ⚠️ Ba dòng "Giá niêm yết công khai · Lái thử theo lịch của bạn ·
                   Hậu mãi liền mạch" đã bị bỏ. Cả ba là tính từ, không có số nào,
                   và bất kỳ đại lý nào cũng viết được — nên chúng không phân biệt
                   được gì.

                💡 Thay bằng một con số có nguồn, dẫn xuống phiếu chi phí. Nếu
                   tenant chưa có bảng giá thì hero không nói gì thêm, và như vậy
                   vẫn trung thực hơn ba tính từ.
              */}
              {chiPhi !== null && (
                <p className="trust-row" aria-label="Chi phí bảo dưỡng dự kiến">
                  <span>
                    Bảo dưỡng {chiPhi.tomTat.soNam} năm đầu:{' '}
                    <strong className="tnum">
                      {new Intl.NumberFormat('vi-VN').format(chiPhi.tomTat.tong)} ₫
                    </strong>{' '}
                    — tính từ {chiPhi.tenBangGia}
                  </span>
                </p>
              )}
```

- [ ] **Step 4: Chèn hai section mới**

Ngay **sau** thẻ `</section>` đóng khối `spotlight` (khối trải nghiệm 360°) và
**trước** dòng `<section className="section section--raised"` (khối cam kết), chèn:

```tsx
        {chiPhi !== null && noiBat !== null && (
          <PhieuChiPhi du={chiPhi} tenXe={noiBat.name} slug={noiBat.slug} />
        )}

        {chiPhi !== null && noiBat !== null && (
          <SoSanhDongCo du={chiPhi} tenXe={noiBat.name} />
        )}
```

- [ ] **Step 5: Lint và typecheck**

```bash
pnpm --filter @garageos/landing lint && pnpm --filter @garageos/landing typecheck
```

Expected: sạch.

⚠️ **Không chạy `next build` khi `next dev` đang chạy cùng thư mục** — nó ghi đè
`.next` và làm dev server trả `MODULE_NOT_FOUND` cho mọi route. Nếu đã lỡ:
`rm -rf apps/landing/.next` rồi khởi động lại dev server.

- [ ] **Step 6: Xem bằng mắt với dữ liệu thật**

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @garageos/api dev &
pnpm --filter @garageos/landing dev &
sleep 15
curl -s -o /dev/null -w 'api=%{http_code}\n' http://localhost:3001/health
curl -s http://localhost:3003/ | grep -c "Bảng giá"
```

Expected: `api=200`, và số đếm `>= 1`.

Nếu đếm ra `0`, kiểm tra API trước — `layChiPhiTrangChu` nuốt lỗi nên trang vẫn
trả 200 và khối chỉ đơn giản không hiện. Đó là hành vi đúng, nhưng nó cũng che mất
nguyên nhân, nên hãy xem log của api.

- [ ] **Step 7: Commit**

```bash
git add apps/landing/src/app/page.tsx
git commit -m "feat(landing): trang chu dan bang con so co nguon thay vi tinh tu"
```

---

### Task 6: Lịch bảo dưỡng thật trên trang chi tiết

Trang chi tiết đã có `<ChiPhiSoHuu>` với bảng số. Thiếu phần trả lời "xưởng sẽ làm
gì" — mà `theoNam[].hangMuc` đã mang sẵn tên hạng mục từng năm.

**Files:**
- Create: `apps/landing/src/components/lich-bao-duong.tsx`
- Modify: `apps/landing/src/components/chi-phi-so-huu.tsx`
- Modify: `apps/landing/src/app/xe/[slug]/page.tsx`
- Modify: `apps/landing/src/app/globals.css`

**Interfaces:**
- Consumes: `type ChiPhiSoHuuView` từ `@garageos/contracts`.
- Produces: `export function LichBaoDuong({ theoNam }: { theoNam: ChiPhiSoHuuView['theoNam'] }): React.ReactElement | null`

- [ ] **Step 1: Viết component**

Tạo `apps/landing/src/components/lich-bao-duong.tsx`:

```tsx
import type { ChiPhiSoHuuView } from '@garageos/contracts';

/**
 * Lịch bảo dưỡng theo năm — dựng từ chính hạng mục xưởng sẽ làm.
 *
 * 💡 Bảng chi phí trả lời "tốn bao nhiêu". Khối này trả lời "để làm gì", và câu
 *    trả lời không phải mô tả chung mà là tên hạng mục lấy từ
 *    `maintenance_plan_item` — cùng nguồn với con số bên trên.
 *
 * 🔒 Năm không có hạng mục nào vẫn được HIỆN, đánh dấu rõ là không phải chi gì.
 *    Bỏ nó đi thì lịch trông như 5 năm đều phải vào xưởng, tức là nói quá.
 */
export function LichBaoDuong({
  theoNam,
}: {
  theoNam: ChiPhiSoHuuView['theoNam'];
}): React.ReactElement | null {
  if (theoNam.length === 0) return null;

  return (
    <section className="lich" aria-labelledby="lich-tieu-de">
      <h2 id="lich-tieu-de">Xưởng sẽ làm gì, năm nào</h2>
      <ol className="lich-nam">
        {theoNam.map((n) => (
          <li key={n.nam} className="lich-muc" data-trong={n.hangMuc.length === 0}>
            <p className="lich-nhan">Năm {n.nam}</p>
            {n.hangMuc.length === 0 ? (
              <p className="lich-khong">Không có hạng mục theo chu kỳ</p>
            ) : (
              <ul className="lich-hang-muc">
                {n.hangMuc.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Thêm CSS**

Thêm vào cuối `apps/landing/src/app/globals.css`:

```css
/* ═══════════════════════ Lịch bảo dưỡng ═══════════════════════ */

/*
 * Đường kẻ 1px `--line-strong`, KHÔNG phải 2px `--text`.
 *
 * ⚠️ `.chi-phi` đã có một đường 2px ở đầu khối. `.lich` nằm BÊN TRONG `.chi-phi`,
 *    nên một đường 2px thứ hai làm hai mức phân cách trông bằng nhau và mất thứ
 *    bậc: mép ngoài của phiếu và một mục bên trong nó phải khác nhau.
 */
.lich {
  margin-top: var(--s-7);
  padding-top: var(--s-6);
  border-top: 1px solid var(--line-strong);
}
.lich h2 { margin: 0 0 var(--s-6); font-size: var(--fs-xl); }
.lich-nam { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.lich-muc {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--s-5);
  padding: var(--s-4) 0;
  border-top: 1px solid var(--line);
}
.lich-muc:first-child { border-top: 0; }
.lich-nhan {
  margin: 0;
  color: var(--brand);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
/* Năm không phải chi gì: nhãn đổi sang màu mờ, KHÔNG ẩn dòng. */
.lich-muc[data-trong='true'] .lich-nhan { color: var(--text-muted); }
.lich-hang-muc {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--s-2);
}
.lich-hang-muc li { color: var(--text); font-size: var(--fs-sm); }
.lich-khong { margin: 0; color: var(--text-muted); font-size: var(--fs-sm); }

@media (max-width: 620px) {
  /* 6rem cho cột nhãn là quá nhiều trên điện thoại — xếp dọc lại. */
  .lich-muc { grid-template-columns: 1fr; gap: var(--s-3); }
}
```

- [ ] **Step 3: Gắn vào `<ChiPhiSoHuu>`**

`<LichBaoDuong>` cần `theoNam`, mà dữ liệu đó nằm trong state của
`chi-phi-so-huu.tsx`. Mở `apps/landing/src/components/chi-phi-so-huu.tsx`, thêm
import ở đầu file:

```tsx
import { LichBaoDuong } from '@/components/lich-bao-duong';
```

Khối bọc là `<section className="chi-phi" aria-labelledby="chi-phi-tieu-de">`
(dòng 68 ở thời điểm viết plan). Ngay **trước** thẻ `</section>` đóng nó, chèn:

```tsx
      <LichBaoDuong theoNam={du.theoNam} />
```

- [ ] **Step 4: Thêm neo `#chi-phi`**

Trong `apps/landing/src/app/xe/[slug]/page.tsx`, tìm dòng:

```tsx
        <div className="container"><ChiPhiSoHuu slug={slug} /></div>
```

Đổi thành:

```tsx
        {/* `id` là đích của nút "Xem chi tiết từng năm" trên phiếu ở trang chủ. */}
        <div className="container" id="chi-phi"><ChiPhiSoHuu slug={slug} /></div>
```

- [ ] **Step 5: Lint, typecheck, tương phản**

```bash
pnpm --filter @garageos/landing lint && pnpm --filter @garageos/landing typecheck && pnpm kiem:tuong-phan | tail -3
```

Expected: sạch, `27/27 đạt`.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src/components/lich-bao-duong.tsx apps/landing/src/components/chi-phi-so-huu.tsx "apps/landing/src/app/xe/[slug]/page.tsx" apps/landing/src/app/globals.css
git commit -m "feat(landing): lich bao duong theo nam tu maintenance plan"
```

---

### Task 7: Cổng kiểm chứng — e2e và a11y

**Files:**
- Modify: `e2e/landing-cong-khai.spec.ts`

**Interfaces:**
- Consumes: hằng `LANDING` đã khai báo ở đầu file spec.
- Produces: không có export.

- [ ] **Step 1: Viết test thất bại**

Thêm vào trong `test.describe('Trang bán xe công khai', ...)` của
`e2e/landing-cong-khai.spec.ts`, **trước** dấu `});` đóng describe:

```ts
  /*
   * 🔒 LD-E08 — Con số chi phí phải ở trong HTML ĐẦU TIÊN, không chờ JS.
   *
   * Khối chi phí bản trước là client-side và nằm ở trang chi tiết, nên nó không
   * được crawl và không hiện khi JS chưa chạy. Bài này khoá lại hành vi mới:
   * trang chủ render sẵn con số VÀ tên bảng giá.
   *
   * ⚠️ Kiểm bằng `page.content()` sau `waitUntil: 'domcontentloaded'` thay vì
   *    `getByText`, vì `getByText` cũng xanh khi chữ do JS chèn vào sau — tức là
   *    nó không phân biệt được đúng thứ bài này muốn phân biệt.
   */
  test('LD-E08 — trang chủ nói chi phí bảo dưỡng kèm tên bảng giá, ngay trong HTML server', async ({
    page,
  }) => {
    await page.goto(LANDING, { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    expect(html).toContain('Bảng giá');
    // Một số tiền có phân cách nghìn kiểu vi-VN, ví dụ "12.000.000".
    expect(html).toMatch(/\d{1,3}(\.\d{3}){2,}/);
  });

  /*
   * 🔒 LD-E09 — Nút trên phiếu phải dẫn tới đúng neo có thật.
   *
   * Một CTA trỏ tới `#chi-phi` mà trang đích không có `id` đó thì vẫn "hoạt
   * động": trình duyệt mở trang và đứng ở đầu. Không có lỗi nào, và khách chỉ
   * thấy nút không làm gì. Bài này kiểm rằng neo TỒN TẠI.
   */
  test('LD-E09 — CTA của phiếu chi phí dẫn tới neo có thật trên trang chi tiết', async ({
    page,
  }) => {
    await page.goto(LANDING);
    const cta = page.getByRole('link', { name: 'Xem chi tiết từng năm' });
    await expect(cta).toBeVisible();

    const href = await cta.getAttribute('href');
    expect(href).not.toBeNull();
    expect(href as string).toContain('#chi-phi');

    await cta.click();
    await expect(page.locator('#chi-phi')).toBeAttached();
  });
```

- [ ] **Step 2: Chạy hai bài mới**

```bash
npx playwright test e2e/landing-cong-khai.spec.ts --reporter=list -g "LD-E08|LD-E09" 2>&1 | tail -10
```

Expected: 2 passed (nếu Task 3–6 đã xong).

Nếu LD-E09 đỏ với "không tìm thấy link", nghĩa là Task 5 Step 4 chưa chèn
`<PhieuChiPhi>`, hoặc `chiPhi` đang là `null` — xem lại Task 5 Step 6.

- [ ] **Step 3: Chạy toàn bộ e2e landing và a11y landing**

```bash
npx playwright test e2e/landing-cong-khai.spec.ts e2e/accessibility.spec.ts --reporter=list -g "landing|Trang bán xe" 2>&1 | tail -20
```

Expected: 12 passed — 9 bài `landing-cong-khai` (7 cũ + 2 mới) và 3 bài a11y landing.

Nếu bài a11y đỏ ở quy tắc `color-contrast`, chạy `pnpm kiem:tuong-phan` trước — nó
chỉ ra cặp token nào trượt. Nếu script nói đạt mà axe nói trượt, nghĩa là chữ đang
nằm trên ẢNH chứ không trên token; khối đó cần một plate mực.

- [ ] **Step 4: Typecheck toàn monorepo và build production**

```bash
pnpm typecheck 2>&1 | tail -3
# Dừng dev server trước khi build — xem cảnh báo ở Task 5 Step 5.
pnpm --filter @garageos/landing build 2>&1 | grep -E "Compiled|error" | head -3
```

Expected: `8 successful, 8 total` và `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add e2e/landing-cong-khai.spec.ts
git commit -m "test(e2e): LD-E08 va LD-E09 cho phieu chi phi so huu"
```

---

## Ghi chú cho người triển khai

**Thứ tự bắt buộc.** Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Task 0 đổi giá trị token; các task sau viết CSS bằng token ngữ nghĩa nên chúng đúng ở cả hai hướng. Task 4 dùng class CSS do
Task 3 định nghĩa (`.phieu-so`); Task 5 cần cả 3 và 4; Task 7 cần 5 và 6.

**Cần Docker.** Task 5 Step 6 và cả Task 7 cần Postgres thật
(`pnpm db:up && pnpm db:migrate && pnpm db:seed`). Không có SQLite thay thế —
`docs/05-invariants.md` dựa vào RLS và exclusion constraint mà SQLite không có.

**Không chạm bất biến.** Kế hoạch này chỉ đọc dữ liệu công khai đã publish, không
viết gì. Không cần `/codex-review` theo `CLAUDE.md` vì không chạm kho, tiền, phân
quyền hay tenant. Nhưng nó **hiển thị** số tiền, nên đừng đổi cách làm tròn ở
`tomTatChiPhi` mà không sửa test đi kèm.

**Điều dễ làm sai nhất.** `apDungTu` đến từ trường `ápDụngTừ` — tên có dấu tiếng
Việt trong contract. Đổi tên ở phía contract sẽ làm hỏng API; chỉ đổi tên khi đọc
ra, như Task 2 đang làm.

**Việc còn mở, không thuộc kế hoạch này.** Trang chủ chỉ hiện chi phí của xe nổi
bật đầu tiên (`products[0]`). Khi tenant có nhiều xe, một bộ chọn xe trong phiếu
sẽ hợp lý hơn — nhưng nó cần state phía client và một endpoint gọi lại theo slug,
nên tách thành việc riêng thay vì nhồi vào đây.
