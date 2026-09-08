/**
 * Tương phản WCAG 2.2, và bảng màu của landing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 MỘT bản của phép tính, MỘT bản của danh sách cặp màu.
 *
 * Trước file này, công thức tương phản có HAI bản: `apps/sales-admin/src/lib/
 * contrast.ts` và `infra/kiem-tuong-phan.mjs`. Chú thích ở bản thứ nhất đã ghi
 * rõ rủi ro — "hai bản sao của một công thức sẽ lệch nhau vào đúng ngày một bên
 * được sửa" — và cách chống duy nhất nó đề ra là nhớ sửa cả hai.
 *
 * Thêm bản thứ ba ở máy chủ để kiểm lúc lưu sẽ biến lời nhắc đó thành ba chỗ
 * phải nhớ. Nên phép tính về đây, và cả ba nơi gọi cùng một hàm.
 *
 * 💡 Phần dễ bỏ sót hơn công thức là DANH SÁCH CẶP MÀU. Hai bên dùng chung công
 *    thức mà kiểm hai tập cặp khác nhau thì vẫn cho ra hai kết luận khác nhau —
 *    và giao diện sẽ khoá nút vì một cặp mà máy chủ không biết, hoặc tệ hơn:
 *    máy chủ cho qua một bảng màu mà giao diện đã chặn. Nên `capMauLanding()`
 *    cũng ở đây.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Độ chói tương đối theo WCAG 2.x. */
function doChoi(hex: string): number {
  const n = hex.replace('#', '');
  const kenh = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const tuyenTinh = kenh.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (tuyenTinh[0] ?? 0) + 0.7152 * (tuyenTinh[1] ?? 0) + 0.0722 * (tuyenTinh[2] ?? 0);
}

/** Tỉ lệ tương phản giữa hai màu ĐỤC. Màu có alpha phải được chồng nền trước. */
export function tiLeTuongPhan(a: string, b: string): number {
  const [cao, thap] = [doChoi(a), doChoi(b)].sort((x, y) => y - x) as [number, number];
  return (cao + 0.05) / (thap + 0.05);
}

export function hexHopLe(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function dichSang(hex: string, buoc: number): string {
  const n = hex.replace('#', '');
  const kenh = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return (
    '#' +
    kenh
      .map((c) => Math.max(0, Math.min(255, Math.round(c + buoc))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Màu gần nhất đạt ngưỡng, bằng cách kéo màu chữ sáng lên hoặc tối xuống.
 *
 * 🔒 Chặn mà không nói được "vậy dùng màu gì" thì chỉ chuyển việc sang người
 *    dùng: họ sẽ thử từng giá trị hex cho tới khi dấu đỏ biến mất, và cái họ học
 *    được là cách làm tắt dấu đỏ chứ không phải cách chọn màu đọc được.
 *
 * `null` khi cả hai hướng đều không tới ngưỡng — lúc đó vấn đề nằm ở NỀN.
 */
export function goiYMauDat(chu: string, nen: string, nguong: number): string | null {
  if (!hexHopLe(chu) || !hexHopLe(nen)) return null;
  const nenSang = doChoi(nen) > 0.18;
  const huong = nenSang ? -6 : 6;
  let mau = chu;
  for (let i = 0; i < 42; i += 1) {
    mau = dichSang(mau, huong);
    if (tiLeTuongPhan(mau, nen) >= nguong) return mau;
  }
  return null;
}

export interface CapMau {
  nhan: string;
  chu: string;
  nen: string;
  /** 4.5 cho chữ thường; 3 cho chữ lớn và thành phần giao diện (SC 1.4.11). */
  nguong: number;
}

export interface KetQuaCap extends CapMau {
  tiLe: number;
  dat: boolean;
  goiY: string | null;
}

export function kiemCapMau(cap: CapMau[]): KetQuaCap[] {
  return cap.map((c) => {
    const r = hexHopLe(c.chu) && hexHopLe(c.nen) ? tiLeTuongPhan(c.chu, c.nen) : 0;
    const dat = r >= c.nguong;
    return { ...c, tiLe: r, dat, goiY: dat ? null : goiYMauDat(c.chu, c.nen, c.nguong) };
  });
}

/**
 * Bốn token ngữ nghĩa mà biên tập viên đổi được.
 *
 * 🔒 Bốn — không phải hai mươi. Mỗi token thêm vào là một cặp màu nữa phải kiểm,
 *    và một cách nữa để bảng màu của một tenant tự mâu thuẫn.
 */
export interface BangMauLanding {
  /** Nền của toàn trang. */
  nenChinh: string;
  /** Thẻ và khối nổi trên nền trang. */
  nenNoi: string;
  /** Nhấn số, nhãn, liên kết. */
  thuongHieu: string;
  /** Nền của nút hành động. */
  nutChinh: string;
}

export const BANG_MAU_MAC_DINH: BangMauLanding = {
  nenChinh: '#08090a',
  nenNoi: '#15181b',
  thuongHieu: '#ff705c',
  nutChinh: '#c73526',
};

/**
 * Ba màu CỐ ĐỊNH của hệ chữ, không cấu hình được.
 *
 * ⚠️ Chúng vẫn tham gia mọi cặp kiểm bên dưới. Cho phép đổi cả màu chữ lẫn màu
 *    nền là mở ra một không gian mà gần như mọi lựa chọn đều trượt AA, và biên
 *    tập viên sẽ dành cả buổi dò hex. Giữ chữ cố định thì mỗi lần đổi chỉ có một
 *    biến, và gợi ý màu nói được điều gì đó có ích.
 */
const CHU_CHINH = '#f5f5f3';
const CHU_PHU = '#b5b7b4';
const CHU_TREN_NUT = '#ffffff';

/**
 * Tám cặp màu THỰC SỰ xuất hiện trên landing.
 *
 * 🔒 Danh sách này là nguồn duy nhất. Giao diện khoá nút Lưu theo nó, và máy chủ
 *    từ chối lượt ghi theo nó — hai bên kiểm hai tập khác nhau thì sớm muộn máy
 *    chủ cho qua một bảng màu mà giao diện đã chặn.
 */
export function capMauLanding(mau: BangMauLanding): CapMau[] {
  return [
    { nhan: 'Chữ chính trên nền trang', chu: CHU_CHINH, nen: mau.nenChinh, nguong: 4.5 },
    { nhan: 'Chữ chính trên nền nổi', chu: CHU_CHINH, nen: mau.nenNoi, nguong: 4.5 },
    { nhan: 'Chữ phụ trên nền trang', chu: CHU_PHU, nen: mau.nenChinh, nguong: 4.5 },
    { nhan: 'Chữ phụ trên nền nổi', chu: CHU_PHU, nen: mau.nenNoi, nguong: 4.5 },
    { nhan: 'Thương hiệu làm chữ trên nền trang', chu: mau.thuongHieu, nen: mau.nenChinh, nguong: 4.5 },
    { nhan: 'Thương hiệu làm chữ trên nền nổi', chu: mau.thuongHieu, nen: mau.nenNoi, nguong: 4.5 },
    { nhan: 'Chữ trắng trên nút chính', chu: CHU_TREN_NUT, nen: mau.nutChinh, nguong: 4.5 },
    /* Viền nút là THÀNH PHẦN giao diện, không phải chữ — ngưỡng 3:1 (SC 1.4.11). */
    { nhan: 'Viền nút chính trên nền trang', chu: mau.nutChinh, nen: mau.nenChinh, nguong: 3 },
  ];
}

/** Những cặp TRƯỢT của một bảng màu. Rỗng = bảng màu dùng được. */
export function capTruotChuan(mau: BangMauLanding): KetQuaCap[] {
  return kiemCapMau(capMauLanding(mau)).filter((k) => !k.dat);
}

/* ── Từ bảng màu ra CSS, và ra một câu trả lời có/không ───────────────────── */

/**
 * Ngưỡng "nền này còn được coi là tối".
 *
 * 🔒 Landing KHÔNG có theme sáng. `apps/landing/src/styles/tokens.css` nói thẳng:
 *    trang là một bề mặt TỐI, và những khối sáng bên trong nó dùng một họ token
 *    riêng (`--paper-*`) mà bảng màu này không chạm tới.
 *
 *    Cho đổi `nenChinh` thành màu sáng thì tám cặp dưới vẫn có thể đạt AA — chỉ
 *    cần chữ đủ tối — nhưng ô nhập (`--ink-2`) và chip (`--ink-3`) vẫn là hai
 *    mảng xám đen, vì chúng KHÔNG nằm trong bốn token. Kết quả là một trang
 *    sáng lỗ chỗ những ô tối, và không cặp nào trong bảng kiểm phát hiện ra:
 *    phép đo đúng, tập đo thiếu.
 *
 * 💡 Hai lối thoát khác đều đắt hơn: suy `--ink-2`/`--ink-3` ra từ nền (thêm hai
 *    biến nữa phải kiểm, và trên nền sáng thì "sáng hơn một bậc" lại là hướng
 *    SAI), hoặc mở cả chín token cho biên tập viên (đúng thứ mà giới hạn bốn
 *    token đã bác). Nói "nền phải tối" là hàng rào rẻ nhất mà thành thật.
 */
export const NEN_PHAI_TOI_DUOI = 0.18;

export function nenQuaSang(hex: string): boolean {
  return hexHopLe(hex) && doChoi(hex) > NEN_PHAI_TOI_DUOI;
}

/** Bốn bậc bo góc. Không có ô nhập tự do — xem `loiBangMau`. */
export const BO_GOC_CHO_PHEP = [0, 4, 8, 16] as const;
export type BoGoc = (typeof BO_GOC_CHO_PHEP)[number];

export interface LoiBangMau {
  ma: 'HEX_SAI' | 'NEN_QUA_SANG' | 'BO_GOC_LA' | 'TUONG_PHAN';
  thongDiep: string;
}

/**
 * 🔒 MỘT CỔNG cho cả giao diện lẫn máy chủ.
 *
 * Màn *Giao diện* khoá nút Lưu theo hàm này, và `PUT /marketing/site-theme` từ
 * chối lượt ghi theo đúng hàm này. Nguyên tắc 1 của dự án: UI không bao giờ
 * tính là enforce — nhưng hai cổng khác nhau còn tệ hơn một cổng, vì lúc đó
 * người dùng thấy nút sáng rồi nhận lỗi 422 mà màn hình không giải thích được.
 *
 * Rỗng = bảng màu dùng được.
 */
export function loiBangMau(mau: BangMauLanding, boGoc: number): LoiBangMau[] {
  const loi: LoiBangMau[] = [];

  const hexSai = (Object.entries(mau) as [keyof BangMauLanding, string][])
    .filter(([, v]) => !hexHopLe(v))
    .map(([k]) => k);
  if (hexSai.length > 0) {
    loi.push({ ma: 'HEX_SAI', thongDiep: `Mã màu không đúng dạng #rrggbb: ${hexSai.join(', ')}.` });
    /* Dừng ở đây: đo tương phản của một chuỗi không phải màu chỉ sinh ra số 0
       và một danh sách lỗi dài gấp đôi nói về cùng một ô nhập. */
    return loi;
  }

  if (!(BO_GOC_CHO_PHEP as readonly number[]).includes(boGoc)) {
    loi.push({ ma: 'BO_GOC_LA', thongDiep: `Bo góc phải là một trong ${BO_GOC_CHO_PHEP.join(', ')} px.` });
  }

  for (const [khoa, nhan] of [
    ['nenChinh', 'Nền chính'],
    ['nenNoi', 'Nền nổi'],
  ] as const) {
    if (nenQuaSang(mau[khoa])) {
      loi.push({
        ma: 'NEN_QUA_SANG',
        thongDiep: `${nhan} quá sáng. Landing là bề mặt tối; khối sáng trên trang dùng bảng màu giấy riêng.`,
      });
    }
  }

  for (const k of capTruotChuan(mau)) {
    loi.push({
      ma: 'TUONG_PHAN',
      thongDiep: `${k.nhan}: ${k.tiLe.toFixed(2)}:1, cần ${k.nguong}:1.`,
    });
  }

  return loi;
}

/**
 * Bảng màu → đúng những biến CSS mà landing đọc.
 *
 * 🔒 Danh sách token ở đây phải khớp `apps/landing/src/styles/tokens.css`. Đặt
 *    một biến không tồn tại thì không có lỗi nào nổ ra — chỉ là màu người dùng
 *    chọn không xuất hiện ở đâu cả.
 *
 * ⚠️ `--ink-2`, `--ink-3`, `--photo` và cả họ `--paper-*` KHÔNG có ở đây: chúng
 *    giữ nguyên giá trị đã được `pnpm kiem:tuong-phan` đo. Đó là lý do
 *    `NEN_PHAI_TOI_DUOI` tồn tại — xem chú thích ở đó.
 */
export function bienCssLanding(mau: BangMauLanding, boGoc: number): Record<string, string> {
  return {
    '--ink-0': mau.nenChinh,
    '--ink-1': mau.nenNoi,
    '--brand': mau.thuongHieu,
    '--action': mau.nutChinh,
    /*
     * Hover SUY RA, không cho khai.
     *
     * Để biên tập viên chọn riêng màu hover là mở đường cho một nút đổi sang
     * một sắc đỏ khác hẳn khi rê chuột. Hệ số 7/8 dựng lại đúng `#ae2e21` từ
     * `#c73526` — cặp đã có trong bảng token, nên đây không phải một con số
     * nghĩ ra để cho vừa.
     *
     * 💡 Không cần thêm cặp kiểm cho nó: tối hơn nền nút thì tương phản với chữ
     *    trắng chỉ TĂNG. Cặp "Chữ trắng trên nút chính" đã bao luôn trạng thái
     *    hover.
     */
    '--action-hover': toiDi(mau.nutChinh, 0.875),
    /*
     * Một con số của người dùng → ba bậc bo góc. Bậc 4 px cho ra đúng 4/6/8 của
     * bảng token hiện tại; `--r-full` là hình viên thuốc, không phải một bậc.
     */
    '--r-sm': `${boGoc}px`,
    '--r-md': `${Math.round(boGoc * 1.5)}px`,
    '--r-lg': `${boGoc * 2}px`,
  };
}

function toiDi(hex: string, heSo: number): string {
  const n = hex.replace('#', '');
  return (
    '#' +
    [0, 2, 4]
      .map((i) => Math.round(parseInt(n.slice(i, i + 2), 16) * heSo).toString(16).padStart(2, '0'))
      .join('')
  );
}
