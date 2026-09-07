/**
 * Danh sách cặp màu cần đo, khai bằng **tên token** — không bằng mã màu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Khai bằng tên, không bằng mã, vì đó là toàn bộ bài học của lần hỏng trước:
 *    cổng cũ chép mã màu vào chính nó, bảng token đổi, và cổng lặng lẽ đo một
 *    bảng không tồn tại. Tên token thì không thể lệch — nó hoặc tra ra, hoặc
 *    cổng nổ vì token đã bị đổi tên.
 *
 * Mỗi dòng: `[tên đọc được, token chữ, token nền, ngưỡng]`
 *
 * Ngưỡng theo WCAG 2.2:
 *   4.5  chữ thường
 *   3    chữ lớn (≥24px, hoặc ≥19px in đậm) và **ranh giới thành phần điều
 *        khiển** khi ranh giới đó là dấu hiệu nhận ra duy nhất (SC 1.4.11)
 *   1    trang trí thuần — ghi nhận con số, không chặn
 *
 * 🔒 Một token chữ phải đạt trên MỌI tầng nền nó được phép nằm lên. Chỉ đo tầng
 *    sâu nhất là cách một token trượt lọt vào component: thẻ nằm trên `ink-1`,
 *    ô nhập nằm trên `ink-2`, chip nằm trên `ink-3`.
 */

/** Bốn tầng nền dùng chung cho app có theme. */
const TANG = ['--ink-0', '--ink-1', '--ink-2', '--ink-3'];

/** Sinh cặp "một token chữ trên mọi tầng nền". */
function tren4(nhan, chu, min = 4.5, tang = TANG) {
  return tang.map((nen) => [`${nhan} trên ${nen.replace('--', '')}`, chu, nen, min]);
}

/**
 * `apps/web` và `apps/sales-admin` — cùng bộ, vì chúng là hai app quản trị dùng
 * chung một hệ: bốn tầng nền, hai theme, cùng vai trò token.
 */
function quanTri(theme) {
  /*
   * 🔒 Nhãn kỹ thuật đổi token theo BỀ MẶT, không theo tên biến.
   *
   * `--signal-dark #c9a227` trên nền sáng đo **2,14:1** — gần như vô hình. Đây
   * đúng là cái bẫy DES-LS-002 §3 đã cảnh báo, và bản đầu của chính file này
   * rơi vào: khai một token duy nhất cho cả hai theme rồi báo bốn cặp trượt
   * trong khi lỗi nằm ở danh sách cặp, không ở app.
   */
  const nhan_ky_thuat = theme === 'sang' ? '--signal-light' : '--signal-dark';
  return QUAN_TRI_CHUNG.concat([
    ['nhãn kỹ thuật trên ink-0', nhan_ky_thuat, '--ink-0', 4.5],
    ['nhãn kỹ thuật trên ink-1', nhan_ky_thuat, '--ink-1', 4.5],
  ]);
}

const QUAN_TRI_CHUNG = [
  ...tren4('chữ chính', '--text'),
  ...tren4('chữ phụ', '--text-muted'),

  /*
   * ⚠️ `--text-dim` KHÔNG được đo trên `--ink-3`, và đó là một ràng buộc dùng
   *    chứ không phải một chỗ bỏ sót: cặp đó đo 4,16:1 (tối) và 4,04:1 (sáng).
   *    Cả ba agent đều tự tìm ra cùng một điều và cùng chọn `--text-muted` cho
   *    chip. Ghi ở đây để lần sau không ai "sửa" bằng cách thêm dòng vào cổng.
   */
  ...tren4('chữ nhãn', '--text-dim', 4.5, ['--ink-0', '--ink-1', '--ink-2']),

  ['thương hiệu làm chữ trên ink-0', '--brand', '--ink-0', 4.5],
  ['thương hiệu làm chữ trên ink-1', '--brand', '--ink-1', 4.5],
  ['thương hiệu làm đồ hoạ trên ink-2', '--brand', '--ink-2', 3],

  ...tren4('trạng thái ổn', '--ok', 4.5, ['--ink-0', '--ink-1', '--ink-2']),
  ...tren4('trạng thái cảnh báo', '--warn', 4.5, ['--ink-0', '--ink-1', '--ink-2']),
  ...tren4('trạng thái lỗi', '--danger', 4.5, ['--ink-0', '--ink-1', '--ink-2']),

  /* Ranh giới điều khiển: ô nhập nằm trên thẻ, nút phụ nằm trên nền trang. */
  ['viền ô nhập trên ink-1', '--line-strong', '--ink-1', 3],
  ['viền nút phụ trên ink-0', '--line-strong', '--ink-0', 3],
  ['đường chia trên ink-1 — trang trí', '--line', '--ink-1', 1],
];

/**
 * `apps/landing` — KHÔNG có theme. Nó có khối tối và khối sáng trong cùng một
 * trang, nên họ `--paper-*` là bộ token của bề mặt sáng, không phải của theme
 * sáng. Đây là lý do `signal` phải tách thành `signal-dark` / `signal-light`
 * (DES-LS-002 §3) và vì sao landing khai thêm `--paper-ok` / `--paper-warn` /
 * `--paper-danger` — biến theo theme sẽ resolve SAI trong một khối sáng nằm
 * giữa trang tối.
 */
const LANDING = [
  ...tren4('chữ chính', '--text'),
  ...tren4('chữ phụ', '--text-muted'),
  ...tren4('chữ nhãn', '--text-dim', 4.5, ['--ink-0', '--ink-1', '--ink-2']),

  ['thương hiệu làm chữ trên ink-0', '--brand', '--ink-0', 4.5],
  ['nhãn kỹ thuật trên nền tối', '--signal-dark', '--ink-0', 4.5],
  ['nhãn kỹ thuật trên giếng ảnh', '--signal-dark', '--photo', 4.5],
  ...tren4('chữ chính trên giếng ảnh', '--text', 4.5, ['--photo']),

  /* Bề mặt SÁNG bên trong trang tối. */
  ['chữ chính trên giấy', '--paper-ink', '--paper-0', 4.5],
  ['chữ chính trên thẻ giấy', '--paper-ink', '--paper-card', 4.5],
  ['chữ phụ trên giấy', '--paper-muted', '--paper-0', 4.5],
  ['chữ phụ trên thẻ giấy', '--paper-muted', '--paper-card', 4.5],
  ['chữ phụ trên giấy tầng 2', '--paper-muted', '--paper-1', 4.5],
  ['nhãn kỹ thuật trên giấy', '--signal-light', '--paper-0', 4.5],
  ['nhãn kỹ thuật trên thẻ giấy', '--signal-light', '--paper-card', 4.5],
  ['thương hiệu trên giấy', '--paper-brand', '--paper-0', 4.5],
  ['nút chính trên giấy', '--paper-action', '--paper-0', 4.5],

  /*
   * ⚠️ `--paper-ok` và `--paper-warn` trên `--paper-1` đo 4,24 và 4,48 — trượt.
   *    Ràng buộc dùng của landing: nhãn trạng thái LUÔN ngồi trên viên
   *    `--paper-card`, kể cả khi viên đó nằm trong giếng ảnh `--paper-1`. Cổng
   *    đo đúng chỗ chúng được phép nằm.
   */
  ['trạng thái ổn trên thẻ giấy', '--paper-ok', '--paper-card', 4.5],
  ['trạng thái cảnh báo trên thẻ giấy', '--paper-warn', '--paper-card', 4.5],
  ['trạng thái lỗi trên thẻ giấy', '--paper-danger', '--paper-card', 4.5],

  ['đường chia trên giấy — trang trí', '--paper-line', '--paper-0', 1],
  ['đường chia trên ink-1 — trang trí', '--line', '--ink-1', 1],
];

export const CAP_THEO_APP = {
  web: { sang: quanTri('sang'), toi: quanTri('toi') },
  'sales-admin': { sang: quanTri('sang'), toi: quanTri('toi') },
  landing: { chung: LANDING },
};
