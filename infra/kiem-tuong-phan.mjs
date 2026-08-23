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

/* ── Theme mặc định: đúng các giá trị trong apps/landing/src/styles/tokens.css ── */

const NEN_0 = '#0a0b0c';
const NEN_1 = '#111315';
const NEN_2 = '#181b1e';
const NEN_3 = '#24282c';
const GIAY = '#f3f1eb';

/**
 * Một cặp cần kiểm.
 *
 * `min` là 4.5 cho chữ thường, 3 cho chữ lớn (>=24px, hoặc >=19px in đậm) và cho
 * ranh giới của một thành phần điều khiển (SC 1.4.11). Một đường kẻ chia nội dung
 * là trang trí và không bị SC 1.4.11 điều chỉnh — nó có mặt ở đây để ghi nhận,
 * với `min: 1`.
 */
const CAP = [
  /* --- Chữ trên bốn tầng bề mặt ---
     Kiểm CẢ BỐN, không chỉ tầng sâu nhất. Một token chữ chỉ đạt trên nền tối
     nhất là token không thể giao cho component: `.card` nằm trên `--surface-2`,
     `.lead-form input` nằm trên `--surface-3`. */
  ['chữ chính trên nền 0', '#f5f5f3', NEN_0, 4.5],
  ['chữ chính trên nền 1', '#f5f5f3', NEN_1, 4.5],
  ['chữ chính trên nền 2', '#f5f5f3', NEN_2, 4.5],
  ['chữ chính trên nền 3', '#f5f5f3', NEN_3, 4.5],
  ['chữ mờ trên nền 0', '#b5b7b4', NEN_0, 4.5],
  ['chữ mờ trên nền 1', '#b5b7b4', NEN_1, 4.5],
  ['chữ mờ trên nền 2', '#b5b7b4', NEN_2, 4.5],
  ['chữ mờ trên nền 3', '#b5b7b4', NEN_3, 4.5],

  /* --- Thương hiệu và hành động --- */
  ['brand làm chữ trên nền 0', '#ff705c', NEN_0, 4.5],
  ['brand làm chữ trên nền 1', '#ff705c', NEN_1, 4.5],
  ['brand làm chữ trên nền 2', '#ff705c', NEN_2, 4.5],
  ['brand làm chữ trên nền 3', '#ff705c', NEN_3, 4.5],
  /* Vòng focus và điểm mốc là ĐỒ HOẠ → ngưỡng 3:1, không phải 4.5. */
  ['vòng focus trên nền 3', '#ff705c', NEN_3, 3],
  ['đỏ tiến trình làm đồ hoạ trên nền 3', '#ff705c', NEN_3, 3],
  ['chữ trắng trên nút chính', '#ffffff', '#c73526', 4.5],
  ['chữ trắng trên nút hover', '#ffffff', '#ae2e21', 4.5],
  ['chữ chính trên nền giấy', '#161817', GIAY, 4.5],
  ['chữ phụ trên nền giấy', '#5d605b', GIAY, 4.5],
  ['accent biên tập trên nền giấy', '#c73526', GIAY, 4.5],

  /* --- Trạng thái --- */
  ['thành công trên nền 0', '#62d19b', NEN_0, 4.5],
  ['thành công trên nền 2', '#62d19b', NEN_2, 4.5],
  ['lỗi trên nền 0', '#ff8f84', NEN_0, 4.5],
  ['lỗi trên nền 2', '#ff8f84', NEN_2, 4.5],
  ['lỗi trên nền 3', '#ff8f84', NEN_3, 4.5],

  /* --- Ranh giới điều khiển (SC 1.4.11) và đường chia --- */
  ['viền điều khiển trên nền 0', tren('#ffffff', 0.38, NEN_0), NEN_0, 3],
  ['viền điều khiển trên nền 2', tren('#ffffff', 0.38, NEN_2), NEN_2, 3],
  ['đường chia trên nền 0 — trang trí', tren('#ffffff', 0.14, NEN_0), NEN_0, 1],
  ['đường chia trên nền 2 — trang trí', tren('#ffffff', 0.14, NEN_2), NEN_2, 1],
];

/**
 * Kiểm một danh sách cặp. Trả về `{ dat, truot }`.
 *
 * Luồng publish `BrandTheme` gọi hàm này với các cặp dựng từ màu tenant chọn,
 * rồi chặn publish nếu `truot.length > 0` (mục 4.1 của thiết kế landing).
 */
export function kiemTheme(cap) {
  const dat = [];
  const truot = [];
  for (const [ten, truoc, sau, min] of cap) {
    const r = tiLe(truoc, sau);
    (r >= min ? dat : truot).push({ ten, truoc, sau, min, tiLe: r });
  }
  return { dat, truot };
}

/* ── Chạy trực tiếp ────────────────────────────────────────────────────── */

const chayTrucTiep =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (chayTrucTiep) {
  const { dat, truot } = kiemTheme(CAP);
  const rong = Math.max(...CAP.map((c) => c[0].length));

  console.log('\n  WCAG 2.2 — theme mặc định của landing (dark cinematic)\n');
  for (const [ten, truoc, sau, min] of CAP) {
    const r = tiLe(truoc, sau);
    const ok = r >= min;
    console.log(
      `  ${ok ? 'ĐẠT ' : 'TRƯỢT'}  ${ten.padEnd(rong)}  ${r.toFixed(2)}:1` +
        `  (cần ${min}:1)  ${truoc} trên ${sau}`,
    );
  }
  console.log(`\n  ${dat.length}/${CAP.length} đạt${truot.length > 0 ? ` — ${truot.length} TRƯỢT` : ''}\n`);
  process.exit(truot.length > 0 ? 1 : 0);
}
