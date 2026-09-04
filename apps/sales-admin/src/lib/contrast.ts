/**
 * Kiểm tương phản WCAG 2.2.
 *
 * 🔒 CÙNG MỘT PHÉP TÍNH với `infra/kiem-tuong-phan.mjs`. Hai bản sao của một
 *    công thức sẽ lệch nhau vào đúng ngày một bên được sửa — và khi đó màn
 *    "Giao diện" sẽ cho qua một bảng màu mà script kiểm tra chặn, hoặc ngược
 *    lại. Nếu sửa công thức, sửa cả hai chỗ trong cùng một commit.
 */

/** Độ chói tương đối theo WCAG 2.x. */
function doChoi(hex: string): number {
  const n = hex.replace('#', '');
  const kenh = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const tuyenTinh = kenh.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (tuyenTinh[0] ?? 0) + 0.7152 * (tuyenTinh[1] ?? 0) + 0.0722 * (tuyenTinh[2] ?? 0);
}

/** Tỉ lệ tương phản giữa hai màu đục. */
export function tiLe(a: string, b: string): number {
  const [cao, thap] = [doChoi(a), doChoi(b)].sort((x, y) => y - x) as [number, number];
  return (cao + 0.05) / (thap + 0.05);
}

export function hopLe(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function sang(hex: string, buoc: number): string {
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
 * Tìm màu gần nhất đạt ngưỡng, bằng cách kéo màu chữ sáng lên hoặc tối xuống.
 *
 * 🔒 Chặn mà không nói được "vậy dùng màu gì" thì chỉ chuyển việc sang người
 *    dùng: họ sẽ thử từng giá trị hex cho tới khi dấu đỏ biến mất, và cái họ học
 *    được là cách làm tắt dấu đỏ chứ không phải cách chọn màu đọc được.
 *
 * Đi theo hướng làm tăng tương phản với chính nền đang có: nền tối thì kéo chữ
 * sáng lên, nền sáng thì kéo tối xuống. Trả về `null` khi cả hai hướng đều
 * không tới ngưỡng — lúc đó vấn đề nằm ở NỀN, không phải ở chữ.
 */
export function goiYMau(chu: string, nen: string, nguong: number): string | null {
  if (!hopLe(chu) || !hopLe(nen)) return null;
  const nenSang = doChoi(nen) > 0.18;
  const huong = nenSang ? -6 : 6;
  let mau = chu;
  for (let i = 0; i < 42; i += 1) {
    mau = sang(mau, huong);
    if (tiLe(mau, nen) >= nguong) return mau;
  }
  return null;
}

export interface CapMau {
  nhan: string;
  chu: string;
  nen: string;
  /** 4.5 cho chữ thường; 3 cho chữ lớn và thành phần giao diện. */
  nguong: number;
}

export interface KetQuaCap extends CapMau {
  tiLe: number;
  dat: boolean;
  goiY: string | null;
}

export function kiemCapMau(cap: CapMau[]): KetQuaCap[] {
  return cap.map((c) => {
    const r = hopLe(c.chu) && hopLe(c.nen) ? tiLe(c.chu, c.nen) : 0;
    const dat = r >= c.nguong;
    return { ...c, tiLe: r, dat, goiY: dat ? null : goiYMau(c.chu, c.nen, c.nguong) };
  });
}
