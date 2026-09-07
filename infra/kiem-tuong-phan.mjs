#!/usr/bin/env node
/**
 * Kiểm tương phản WCAG 2.2 cho hệ thị giác landing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao đây là một script chạy được, không phải một dòng chú thích.
 *
 * `docs/superpowers/specs/2026-08-12-landing-sales-design.md` mục 4.1 đòi CHẶN
 * PUBLISH khi cặp chữ/nền của `BrandTheme` không đạt AA. Hàng rào đó chỉ có
 * nghĩa nếu chính theme MẶC ĐỊNH của chúng ta cũng bị đo bằng cùng một thước —
 * nếu không thì tenant đầu tiên đã ở trạng thái trượt trước khi ai đó đổi màu.
 *
 * Bản trước có một token (`--text-dim`) ghi chú "4.49:1 — TRƯỢT AA đúng 0.01".
 * Nó nằm đó vì không có gì đo lại. Đó chính là loại lỗi file này tồn tại để bắt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Dùng:
 *   node infra/kiem-tuong-phan.mjs          kiểm theme mặc định, thoát != 0 nếu trượt
 *
 * Và `kiemTheme()` ở dưới được export để luồng publish `BrandTheme` gọi lại —
 * cùng một phép tính, không phải bản sao thứ hai sẽ lệch dần theo thời gian.
 */

import { pathToFileURL } from 'node:url';

/* ── Phép tính ─────────────────────────────────────────────────────────── */

/** Độ chói tương đối theo WCAG 2.x. */
function doChoi(hex) {
  const n = hex.replace('#', '');
  const kenh = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const tuyenTinh = kenh.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * tuyenTinh[0] + 0.7152 * tuyenTinh[1] + 0.0722 * tuyenTinh[2];
}

/** Tỉ lệ tương phản giữa hai màu đục. */
export function tiLe(a, b) {
  const [cao, thap] = [doChoi(a), doChoi(b)].sort((x, y) => y - x);
  return (cao + 0.05) / (thap + 0.05);
}

/**
 * Bẹt một màu trong suốt xuống nền của nó.
 *
 * 🔒 Đường kẻ trong `globals.css` là `rgb(... / n%)`. Tương phản của một đường
 *    kẻ là tương phản của màu ĐÃ TRỘN, không phải của màu mực gốc. Đoán màu đó
 *    bằng mắt là cách một bảng màu tuyên bố một tỉ lệ mà nó không có.
 */
export function tren(hex, alpha, nen) {
  const doc = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
  const [fr, fg, fb] = doc(hex);
  const [br, bg, bb] = doc(nen);
  const tron = (f, b) => Math.round(alpha * f + (1 - alpha) * b);
  return (
    '#' +
    [tron(fr, br), tron(fg, bg), tron(fb, bb)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/* ── Phân giải cặp khai bằng TÊN TOKEN ─────────────────────────────────── */

/**
 * Đổi một cặp `[tên, tokenChữ, tokenNền, ngưỡng]` thành hai mã màu đã bẹt.
 *
 * 🔒 Nền phải đục. Một nền trong suốt nằm trên một nền trong suốt là chuỗi
 *    không xác định — nếu gặp, đó là lỗi khai báo token, không phải lỗi đo.
 *
 * 🔒 Token không tra được thì NỔ, không bỏ qua. Bỏ qua âm thầm là cách cổng cũ
 *    hỏng: nó đo cái nó có và im lặng về cái nó không có.
 */
export function phanGiaiCap(bang, [ten, tokenChu, tokenNen, min]) {
  const chu = bang.get(tokenChu);
  const nen = bang.get(tokenNen);
  if (chu === undefined) throw new Error(`Không có token ${tokenChu} (cặp "${ten}")`);
  if (nen === undefined) throw new Error(`Không có token ${tokenNen} (cặp "${ten}")`);
  if (nen.alpha < 1) throw new Error(`Nền ${tokenNen} trong suốt — không đo được (cặp "${ten}")`);
  const truoc = chu.alpha < 1 ? tren(chu.hex, chu.alpha, nen.hex) : chu.hex;
  return { ten, truoc, sau: nen.hex, min, tokenChu, tokenNen };
}

export function kiemTheme(cap) {
  const dat = [];
  const truot = [];
  for (const [ten, truoc, sau, min] of cap) {
    const r = tiLe(truoc, sau);
    (r >= min ? dat : truot).push({ ten, truoc, sau, min, tiLe: r });
  }
  return { dat, truot };
}


/* ── Chạy trực tiếp: đo cả ba app theo CSS thật ────────────────────────── */

/*
 * 🔒 So sánh bằng URL thật, không bằng so khớp chuỗi tên file.
 *
 * Bản trước cắt đường dẫn rồi so phần đuôi — nên bất kỳ file nào trùng tên ở
 * thư mục khác cũng kích hoạt khối này. `pathToFileURL` cho đúng một câu trả
 * lời trên cả Windows lẫn POSIX, và không phải né dấu gạch chéo ngược.
 */
const chayTrucTiep =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (chayTrucTiep) {
  const { docToken, APP_CO_TOKEN } = await import('./doc-token.mjs');
  const { CAP_THEO_APP } = await import('./cap-mau.mjs');

  const chon = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const app_chay = chon.length > 0 ? chon : APP_CO_TOKEN;

  let tongDat = 0;
  let tongTruot = 0;

  for (const app of app_chay) {
    const bang_theme = docToken(app);
    const cap_theme = CAP_THEO_APP[app];
    if (cap_theme === undefined) throw new Error(`Chưa khai cặp màu cho app "${app}"`);

    for (const [theme, bang] of Object.entries(bang_theme)) {
      const khai = cap_theme[theme];
      if (khai === undefined) throw new Error(`Chưa khai cặp cho ${app}/${theme}`);

      const cap = khai.map((c) => phanGiaiCap(bang, c));
      const { dat, truot } = kiemTheme(cap.map((c) => [c.ten, c.truoc, c.sau, c.min]));
      tongDat += dat.length;
      tongTruot += truot.length;

      console.log(`\n  ${app} · ${theme} — WCAG 2.2 AA, đo từ apps/${app}/src/styles/tokens.css\n`);
      const rong = Math.max(...cap.map((c) => c.ten.length));
      for (const c of cap) {
        const r = tiLe(c.truoc, c.sau);
        console.log(
          `  ${r >= c.min ? 'ĐẠT ' : 'TRƯỢT'}  ${c.ten.padEnd(rong)}  ${r.toFixed(2)}:1` +
            `  (cần ${c.min}:1)  ${c.tokenChu} ${c.truoc} trên ${c.tokenNen} ${c.sau}`,
        );
      }
      console.log(`  ── ${dat.length}/${cap.length} đạt${truot.length > 0 ? ` — ${truot.length} TRƯỢT` : ''}`);
    }
  }

  console.log(`\n  TỔNG: ${tongDat}/${tongDat + tongTruot} đạt${tongTruot > 0 ? ` — ${tongTruot} TRƯỢT` : ''}\n`);
  process.exit(tongTruot > 0 ? 1 : 0);
}
