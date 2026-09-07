/**
 * Đọc giá trị token MÀU thật từ file CSS của từng app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao file này tồn tại
 *
 * `infra/kiem-tuong-phan.mjs` từng ghim cứng bảng màu vào chính nó:
 *
 *     const NEN_0 = '#0a0b0c';   // bảng chốt là #08090a
 *     const NEN_1 = '#111315';   // bảng chốt là #15181b
 *     const NEN_2 = '#181b1e';   // bảng chốt là #1d2125
 *     const NEN_3 = '#24282c';   // bảng chốt là #2a2f34
 *
 * Bốn nền, cả bốn đều lệch. Nghĩa là cổng tương phản đã đo một bảng màu **không
 * tồn tại ở đâu cả** — và nó vẫn báo xanh, suốt nhiều đợt, kể cả sau khi ba app
 * được dựng lại. Một cổng xanh vì đo nhầm đối tượng còn tệ hơn không có cổng:
 * nó tiêu diệt đúng tín hiệu mà ta dựa vào để biết mình ổn.
 *
 * 💡 Cách sửa không phải là chép lại bảng màu cho đúng — lần sau nó lại lệch.
 *    Cách sửa là **bỏ bản sao đi**: cổng đọc thẳng giá trị từ CSS mà trình duyệt
 *    sẽ dùng. Token đổi thì cổng đo cái mới, không cần ai nhớ cập nhật.
 *
 * 🔒 Cổng khai cặp bằng TÊN TOKEN, không bằng mã màu. Khai bằng mã màu là dựng
 *    lại đúng bản sao vừa bỏ đi.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tách `#rrggbb`, `#rrggbbaa`, `rgb(r g b / p%)`, `rgb(r,g,b)` thành
 * `{ hex, alpha }`. Trả `null` cho thứ không phải màu (biến, hàm khác, số).
 *
 * 🔒 Giữ alpha RIÊNG thay vì trộn sẵn vào một nền giả định: cùng một đường kẻ
 *    `rgb(255 255 255 / 12%)` cho ra hai màu khác nhau trên thẻ và trên ô nhập.
 *    Trộn sớm là mất luôn khả năng đo đúng chỗ nó thật sự nằm.
 */
export function phanTichMau(raw) {
  const s = String(raw).trim().replace(/;$/, '').trim();

  const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(s);
  if (hex8 !== null) return { hex: `#${hex8[1].toLowerCase()}`, alpha: parseInt(hex8[2], 16) / 255 };

  const hex6 = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex6 !== null) return { hex: `#${hex6[1].toLowerCase()}`, alpha: 1 };

  const hex3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (hex3 !== null) {
    const [r, g, b] = [...hex3[1]].map((c) => c + c);
    return { hex: `#${(r + g + b).toLowerCase()}`, alpha: 1 };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)(%?)\s*)?\)$/i.exec(s);
  if (rgb !== null) {
    const kenh = [rgb[1], rgb[2], rgb[3]].map((v) => Math.round(Number(v)));
    if (kenh.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
    const a = rgb[4] === undefined ? 1 : rgb[5] === '%' ? Number(rgb[4]) / 100 : Number(rgb[4]);
    return { hex: `#${kenh.map((v) => v.toString(16).padStart(2, '0')).join('')}`, alpha: a };
  }

  return null;
}

/**
 * Đọc mọi khai báo `--ten: giá trị` trong một khối selector.
 *
 * Không dùng trình phân tích CSS đầy đủ, và đó là chủ ý: ba file token của dự
 * án đều là danh sách khai báo phẳng trong `:root` và một selector theme. Kéo
 * một phụ thuộc phân tích CSS vào `infra/` để đọc ba file phẳng là đổi một rủi
 * ro nhỏ lấy một rủi ro lớn hơn.
 */
function docKhoi(cssRaw, selector) {
  /*
   * 🔒 Bỏ chú thích TRƯỚC khi tìm selector, và neo selector vào ĐẦU DÒNG.
   *
   * Bản đầu dùng `css.indexOf(selector)` và trúng ngay chữ `.dark` nằm trong
   * một dòng chú thích ở đầu file — nên khối `.dark` không bao giờ được đọc, và
   * cả hai theme của `apps/web` trả về cùng một bảng màu. Cổng vẫn báo xanh:
   * đúng cái bẫy "đo nhầm đối tượng" mà file này sinh ra để dẹp, tái diễn ngay
   * trong lần viết lại đầu tiên.
   */
  const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  const neo = new RegExp(`^\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{`, 'm');
  const khop = neo.exec(css);
  if (khop === null) return null;
  const dau = css.indexOf('{', khop.index);
  if (dau === -1) return null;

  let sau = 1;
  let i = dau + 1;
  for (; i < css.length && sau > 0; i += 1) {
    if (css[i] === '{') sau += 1;
    else if (css[i] === '}') sau -= 1;
  }
  const than = css.slice(dau + 1, i - 1);

  const ra = new Map();
  for (const m of than.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const mau = phanTichMau(m[2]);
    if (mau !== null) ra.set(`--${m[1]}`, mau);
  }
  return ra;
}

/**
 * Ba app khai theme ở ba selector khác nhau, và điều đó không sai:
 *
 *  · `apps/web`           `:root` là SÁNG, `.dark` là TỐI
 *  · `apps/sales-admin`   `:root` là TỐI,  `.light` là SÁNG
 *  · `apps/landing`       chỉ một `:root` — landing KHÔNG có theme, nó có
 *                         KHỐI sáng và KHỐI tối trong cùng một trang
 *                         (`--paper-*` là họ token cho bề mặt sáng)
 */
const BAN_DO = {
  web: { tep: 'src/styles/tokens.css', theme: { sang: ':root', toi: '.dark' } },
  'sales-admin': { tep: 'src/styles/tokens.css', theme: { toi: ':root', sang: '.light' } },
  landing: { tep: 'src/styles/tokens.css', theme: { chung: ':root' } },
};

/**
 * Trả về `{ <tênTheme>: Map<token, {hex, alpha}> }` cho một app.
 *
 * Theme phái sinh kế thừa `:root` rồi ghi đè — giống hệt cách CSS phân giải,
 * nên token chỉ khai ở `:root` (ví dụ `--paper-*`) vẫn tra được ở theme kia.
 */
export function docToken(app, goc = process.cwd()) {
  const cau_hinh = BAN_DO[app];
  if (cau_hinh === undefined) throw new Error(`Không biết app "${app}"`);

  const duong = join(goc, 'apps', app, cau_hinh.tep);
  if (!existsSync(duong)) throw new Error(`Không tìm thấy ${duong}`);
  const css = readFileSync(duong, 'utf8');

  const goc_map = docKhoi(css, ':root');
  if (goc_map === null) throw new Error(`${duong} không có khối :root`);

  const ra = {};
  for (const [ten, selector] of Object.entries(cau_hinh.theme)) {
    const rieng = selector === ':root' ? goc_map : docKhoi(css, selector);
    if (rieng === null) throw new Error(`${duong} không có khối ${selector}`);
    ra[ten] = new Map([...goc_map, ...rieng]);
  }
  return ra;
}

export const APP_CO_TOKEN = Object.keys(BAN_DO);
