#!/usr/bin/env node
/**
 * Kiểm tương phản WCAG 2.2 cho BẢNG MÀU THẬT của landing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Vì sao có file này bên cạnh `infra/kiem-tuong-phan.mjs`
 *
 * File ở `infra/` ghim cứng bảng màu cũ (`--surface-0: #0a0b0c`, …) và chú thích
 * của chính nó nói nó phải là "đúng các giá trị trong apps/landing/src/styles/
 * tokens.css". Bảng màu đó đã đổi sang bảng token của DES-LS-002 §3, và ba họ
 * màu MỚI — `--photo`, `--paper-*` đầy đủ, `--signal-light` — chưa từng được đo.
 *
 * File `infra/` không nằm trong phạm vi được sửa của đợt này, nên chỗ đo bảng
 * màu thật là ở đây. Phép tính KHÔNG chép lại: `tiLe` và `kiemTheme` import
 * thẳng từ file gốc, đúng để không có hai công thức.
 *
 * 🔒 Cặp nào ở đây cũng là một cặp CÓ THẬT trong CSS. Một bảng kiểm liệt kê
 *    những cặp không ai dùng thì luôn xanh, và luôn vô dụng.
 */
import { kiemTheme, tiLe, tren } from '../../../infra/kiem-tuong-phan.mjs';

/* ── Bảng token: apps/landing/src/styles/tokens.css ────────────────────── */
const INK_0 = '#08090a';
const INK_1 = '#15181b';
const INK_2 = '#1d2125';
const INK_3 = '#2a2f34';
const PHOTO = '#0e1113';
const PAPER_0 = '#f3f1eb';
const PAPER_1 = '#e8e5dd';
const PAPER_CARD = '#ffffff';

const TEXT = '#f5f5f3';
const TEXT_MUTED = '#b5b7b4';
const TEXT_DIM = '#8b908c';
const PAPER_INK = '#161817';
const PAPER_MUTED = '#5d605b';

const NEN_TOI = [['nền 0', INK_0], ['nền 1', INK_1], ['nền 2', INK_2], ['nền 3', INK_3], ['giếng ảnh', PHOTO]];
const NEN_GIAY = [['giấy 0', PAPER_0], ['giấy 1', PAPER_1], ['thẻ giấy', PAPER_CARD]];

const CAP = [
  /* Chữ trên NĂM bề mặt tối. Kiểm cả năm, không chỉ tầng sâu nhất: `.lead-form
     input` nằm trên `--ink-2`, chip lọc nằm trên `--ink-3`, hero nằm trên
     `--photo`. Một token chữ chỉ đạt trên nền tối nhất là token không giao được
     cho component. */
  ...NEN_TOI.map(([ten, nen]) => [`chữ chính trên ${ten}`, TEXT, nen, 4.5]),
  ...NEN_TOI.map(([ten, nen]) => [`chữ phụ trên ${ten}`, TEXT_MUTED, nen, 4.5]),

  /* 🔒 `--text-dim` KHÔNG đạt trên `--ink-3` (4,16 : 1). Nó là nhãn mono và chú
     thích, và trong CSS nó chỉ nằm trên nền 0/1/2 và giếng ảnh. Cặp với nền 3
     cố tình vắng mặt ở đây, và đó là một RÀNG BUỘC dùng, không phải một chỗ bỏ
     sót: chip trên `--ink-3` dùng `--text-muted`. */
  ['nhãn mờ trên nền 0', TEXT_DIM, INK_0, 4.5],
  ['nhãn mờ trên nền 1', TEXT_DIM, INK_1, 4.5],
  ['nhãn mờ trên nền 2', TEXT_DIM, INK_2, 4.5],
  ['nhãn mờ trên giếng ảnh', TEXT_DIM, PHOTO, 4.5],

  /* Nhãn kỹ thuật chia theo BỀ MẶT, không theo theme. */
  ...NEN_TOI.map(([ten, nen]) => [`signal-dark trên ${ten}`, '#c9a227', nen, 4.5]),
  ...NEN_GIAY.map(([ten, nen]) => [`signal-light trên ${ten}`, '#7a5c00', nen, 4.5]),

  /* Thương hiệu và hành động */
  ...NEN_TOI.map(([ten, nen]) => [`brand làm chữ trên ${ten}`, '#ff705c', nen, 4.5]),
  ['chữ trắng trên nút chính', '#ffffff', '#c73526', 4.5],
  ['chữ trắng trên nút chính hover', '#ffffff', '#ae2e21', 4.5],
  ['chữ tối trên nút đảo', PHOTO, PAPER_CARD, 4.5],
  ['chữ giấy trên nút giấy', PAPER_0, PAPER_INK, 4.5],
  ['chữ trắng trên nút giấy hover', PAPER_0, '#b32e20', 4.5],

  /* Khối giấy */
  ...NEN_GIAY.map(([ten, nen]) => [`chữ chính trên ${ten}`, PAPER_INK, nen, 4.5]),
  ...NEN_GIAY.map(([ten, nen]) => [`chữ phụ trên ${ten}`, PAPER_MUTED, nen, 4.5]),
  /* 🔒 `--paper-ok`/`--paper-warn` KHÔNG đạt trên `--paper-1` (4,24 và 4,48).
     Nhãn trạng thái vì thế luôn ngồi trên một viên `--paper-card`: xem
     `.the-trang-thai.the-giay` trong utilities.css. Giếng ảnh của thẻ xe là
     `--paper-1`, và nhãn nằm trên viên trắng chứ không nằm thẳng lên giếng. */
  ['trạng thái "sẵn xe" trên thẻ giấy', '#177a4e', PAPER_CARD, 4.5],
  ['trạng thái "sắp về" trên thẻ giấy', '#8a5f12', PAPER_CARD, 4.5],
  ['trạng thái "sẵn xe" trên giấy 0', '#177a4e', PAPER_0, 4.5],
  ['trạng thái "sắp về" trên giấy 0', '#8a5f12', PAPER_0, 4.5],
  ['lỗi trên thẻ giấy', '#b3271a', PAPER_CARD, 4.5],

  /* Dải trả góp: khối TỐI đặt trong một màn SÁNG. */
  ['signal-dark trên dải trả góp', '#c9a227', PAPER_INK, 4.5],
  ['chữ giấy trên dải trả góp', PAPER_1, PAPER_INK, 4.5],
  ['chữ mờ trên dải trả góp', TEXT_DIM, PAPER_INK, 4.5],

  /* Trạng thái trên nền tối */
  ['thành công trên nền 1', '#62d19b', INK_1, 4.5],
  ['thành công trên nền 2', '#62d19b', INK_2, 4.5],
  ['chờ trên nền 2', '#e6b877', INK_2, 4.5],
  ['lỗi trên nền 1', '#ff8f84', INK_1, 4.5],
  ['lỗi trên nền 2', '#ff8f84', INK_2, 4.5],

  /* Vòng focus là ĐỒ HOẠ → ngưỡng 3 : 1 (SC 1.4.11). */
  ['vòng focus trên nền 0', '#ff705c', INK_0, 3],
  ['vòng focus trên giếng ảnh', '#ff705c', PHOTO, 3],
  ['vòng focus trên giấy 0', '#b32e20', PAPER_0, 3],
  ['vòng focus trên thẻ giấy', '#b32e20', PAPER_CARD, 3],

  /* Thanh tiến trình của khối bóc giá mang THÔNG TIN → 3 : 1. */
  ['thanh tiến trình trên rãnh', '#7a5c00', tren(PAPER_INK, 0.14, PAPER_0), 3],

  /*
   * Đường kẻ là TRANG TRÍ, ghi lại với ngưỡng 1.
   *
   * 🔒 `--line-strong` là viền của nút phụ, và nút phụ luôn có NHÃN CHỮ đạt
   *    18 : 1. SC 1.4.11 điều chỉnh "thông tin thị giác CẦN THIẾT để nhận ra
   *    một thành phần" — ở đây chữ đã làm việc đó, nên viền không phải thứ mang
   *    thông tin. Chỗ nào ranh giới LÀ dấu hiệu duy nhất (ô nhập rỗng, ô màu)
   *    thì dùng `--text-dim`, và cặp đó nằm ngay dưới với ngưỡng 3.
   */
  ['đường kẻ trên nền 0 — trang trí', tren('#ffffff', 0.12, INK_0), INK_0, 1],
  ['viền nút phụ trên giếng ảnh — nút có nhãn chữ', tren('#ffffff', 0.25, PHOTO), PHOTO, 1],
  ['đường kẻ trên giấy 0 — trang trí', tren(PAPER_INK, 0.14, PAPER_0), PAPER_0, 1],
  ['ranh giới mang dấu hiệu trên nền 1', TEXT_DIM, INK_1, 3],
  ['ranh giới mang dấu hiệu trên nền 2', TEXT_DIM, INK_2, 3],
];

const { dat, truot } = kiemTheme(CAP);
const rong = Math.max(...CAP.map((c) => c[0].length));

console.log('\n  WCAG 2.2 — bảng token landing (DES-LS-002 §3)\n');
for (const [ten, truoc, sau, min] of CAP) {
  const r = tiLe(truoc, sau);
  console.log(
    `  ${r >= min ? 'ĐẠT ' : 'TRƯỢT'}  ${ten.padEnd(rong)}  ${r.toFixed(2)}:1  (cần ${min}:1)  ${truoc} trên ${sau}`,
  );
}
console.log(`\n  ${dat.length}/${CAP.length} đạt${truot.length > 0 ? ` — ${truot.length} TRƯỢT` : ''}\n`);
process.exit(truot.length > 0 ? 1 : 0);
