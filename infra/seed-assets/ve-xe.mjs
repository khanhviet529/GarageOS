/**
 * Sinh ảnh minh hoạ xe dạng SVG cho dữ liệu mẫu.
 *
 * Dùng: node infra/seed-assets/ve-xe.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao là HÌNH VẼ chứ không phải ảnh chụp
 *
 * `docs/…/automotive-landing-experience-design.md` mục 3 cấm dùng ảnh AI cho
 * catalog chính thức: "tính nhất quán hình học, màu và trang bị không đủ để làm
 * dữ liệu bán hàng".
 *
 * Ảnh chụp thật cũng vướng một chuyện khác. Dữ liệu mẫu dùng tên tự đặt
 * (`Aurora E1`, `Meridian X5`), nên mọi ảnh chụp đều là MỘT CHIẾC XE KHÁC đặt
 * dưới một cái tên không phải của nó. Đã loại ba tấm vì lý do đó — xem
 * `LICENSE.md`.
 *
 * 💡 Một hình vẽ vector thì hiển nhiên là minh hoạ. Nó không giả vờ là ảnh chụp
 *    chiếc xe nào cả, nên không có gì để lệch. Với dữ liệu DEMO, trung thực về
 *    việc "đây là hình minh hoạ" tốt hơn là mượn ảnh một chiếc xe có thật.
 *
 * ⚠️ KHÔNG dùng cho catalog thật. Xưởng bán xe thật phải có ảnh chụp chính
 *    chiếc xe trong showroom của mình — đó là điều kiện của cả module trải
 *    nghiệm 360°.
 *
 * Phong cách khớp với hai ảnh chụp đang có: low-key, viền sáng, nền tối. Nhờ vậy
 * ảnh vẽ và ảnh chụp đứng cạnh nhau không lệch tông.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1800;
const H = 1200;

/*
 * Tỉ lệ lấy từ xe thật, không ước lượng bằng mắt.
 *
 * ⚠️ Bản đầu vẽ "cho giống xe" và ra một khối tròn như clipart: mái quá cong,
 *    thân quá cao so với chiều dài, bánh lồi ra ngoài đường viền thân.
 *
 * 💡 Xe con thật có dài/cao khoảng 2,9 : 1, và tâm bánh nằm ĐÚNG trên đường
 *    gầm — không phải treo dưới nó. Vòm bánh KHOÉT VÀO thân, chứ bánh không dán
 *    lên trên. Hai điều đó quyết định hình có ra dáng xe hay không, nhiều hơn
 *    mọi chi tiết khác.
 */
const XE = {
  sedan: {
    dai: [230, 1585],   // đuôi -> mũi
    mai: 545,           // đỉnh mái
    gam: 858,           // đường gầm
    thatLung: 700,      // mép dưới kính
    banh: { sau: 505, truoc: 1300, r: 118 },
    truA: 1215,         // chân trụ A
    truC: 640,          // chân trụ C
  },
  suv: {
    dai: [235, 1590],
    mai: 470,
    gam: 846,
    thatLung: 660,
    banh: { sau: 510, truoc: 1295, r: 138 },
    truA: 1200,
    truC: 620,
  },
};

/**
 * Thân xe — một đường khép kín, có KHOÉT vòm bánh.
 *
 * Vòm bánh vẽ bằng cung tròn ngược chiều (`sweep-flag 0`) để đường viền lõm vào
 * trong thân. Đây là chi tiết làm hình đọc ra "xe" thay vì "khối hộp có bánh".
 */
function thanXe(k) {
  const { dai: [x0, x1], mai, gam, thatLung, banh, truA, truC } = k;
  const rv = banh.r + 16; // vòm rộng hơn bánh một chút
  return [
    `M ${x0 + 26} ${gam}`,
    `C ${x0 + 4} ${gam - 46}, ${x0} ${thatLung + 34}, ${x0 + 40} ${thatLung + 6}`,
    `L ${truC - 96} ${thatLung - 12}`,
    `C ${truC - 30} ${mai + 74}, ${truC + 96} ${mai + 4}, ${(truA + truC) / 2} ${mai}`,
    `C ${truA - 40} ${mai + 2}, ${truA + 54} ${mai + 66}, ${truA + 118} ${thatLung - 16}`,
    `L ${x1 - 210} ${thatLung + 22}`,
    `C ${x1 - 74} ${thatLung + 44}, ${x1} ${gam - 92}, ${x1 - 4} ${gam - 34}`,
    `L ${x1 - 10} ${gam}`,
    // gầm chạy ngược về đuôi, khoét hai vòm bánh
    `L ${banh.truoc + rv} ${gam}`,
    `A ${rv} ${rv} 0 0 0 ${banh.truoc - rv} ${gam}`,
    `L ${banh.sau + rv} ${gam}`,
    `A ${rv} ${rv} 0 0 0 ${banh.sau - rv} ${gam}`,
    'Z',
  ].join(' ');
}

/** Khoang kính — hình thang, hẹp dần về sau, đúng dáng greenhouse thật. */
function kinh(k) {
  const { mai, thatLung, truA, truC } = k;
  const m = mai + 26;
  return [
    `M ${truC - 60} ${thatLung - 26}`,
    `C ${truC + 6} ${m + 56}, ${truC + 112} ${m + 2}, ${(truA + truC) / 2} ${m}`,
    `C ${truA - 46} ${m + 2}, ${truA + 34} ${m + 52}, ${truA + 84} ${thatLung - 30}`,
    'Z',
  ].join(' ');
}

function banhXe(cx, cy, r) {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#04060a"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="none" stroke="url(#vien)" stroke-width="3.5" opacity=".9"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="none" stroke="#44536e" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#141c28"/>`;
}

function ve({ dang, sacDo }) {
  const k = XE[dang];
  const { banh, gam } = k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <defs>
    <linearGradient id="nen" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="hsl(${sacDo} 28% 13%)"/>
      <stop offset="0.6" stop-color="hsl(${sacDo} 24% 7%)"/>
      <stop offset="1" stop-color="#04060a"/>
    </linearGradient>
    <linearGradient id="vien" x1="0.05" y1="0" x2="0.95" y2="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.2" stop-color="#eef5ff" stop-opacity=".9"/>
      <stop offset="0.55" stop-color="#cfe2ff" stop-opacity=".5"/>
      <stop offset="0.85" stop-color="#eef5ff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="son" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0" stop-color="hsl(${sacDo} 26% 16%)"/>
      <stop offset="0.7" stop-color="#080b12"/>
      <stop offset="1" stop-color="#05070c"/>
    </linearGradient>
    <radialGradient id="denPha"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d9ecff" stop-opacity=".85"/><stop offset="1" stop-color="#7fb2ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="sanNha"><stop offset="0" stop-color="hsl(${sacDo} 45% 34%)" stop-opacity=".42"/><stop offset="1" stop-color="hsl(${sacDo} 45% 34%)" stop-opacity="0"/></radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#nen)"/>
  <ellipse cx="900" cy="${gam + 62}" rx="700" ry="104" fill="url(#sanNha)"/>

  <path d="${thanXe(k)}" fill="url(#son)"/>
  <path d="${thanXe(k)}" fill="none" stroke="url(#vien)" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="${kinh(k)}" fill="#0b111a"/>
  <path d="${kinh(k)}" fill="none" stroke="#8fb4e8" stroke-width="2" opacity=".4"/>

  ${banhXe(banh.sau, gam, banh.r)}
  ${banhXe(banh.truoc, gam, banh.r)}

  <ellipse cx="${k.dai[1] - 60}" cy="${k.thatLung + 64}" rx="132" ry="92" fill="url(#denPha)" opacity=".5"/>
  <rect x="${k.dai[1] - 128}" y="${k.thatLung + 52}" width="84" height="18" rx="9" fill="#eaf4ff" opacity=".95"/>
  <rect x="${k.dai[0] + 16}" y="${k.thatLung + 54}" width="56" height="16" rx="8" fill="#ff5a4d" opacity=".8"/>
  <ellipse cx="${k.dai[0] + 44}" cy="${k.thatLung + 62}" rx="74" ry="50" fill="#ff5a4d" opacity=".14"/>
</svg>`;
}

const OUT = import.meta.dirname;
for (const [ten, cauHinh] of [
  ['xe-ve-sedan.svg', { dang: 'sedan', sacDo: 214 }],
  ['xe-ve-suv.svg', { dang: 'suv', sacDo: 262 }],
  ['xe-ve-sedan-2.svg', { dang: 'sedan', sacDo: 168 }],
]) {
  writeFileSync(join(OUT, ten), ve(cauHinh), 'utf8');
  console.log('đã vẽ', ten);
}
