/**
 * Chuẩn hoá biển số — 🔒 INV-V-02, BC-01 mục 3.4
 *
 * PHẢI khớp chính xác hàm `normalize_plate()` trong DB
 * (infra/migrations/0001_init.sql). Lệch nhau thì tầng app và unique index
 * bất đồng, sinh lỗi "biển số đã tồn tại" cho biển người dùng chưa từng nhập.
 */
export function normalizePlate(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export const PLATE_MIN_LENGTH = 5;

export function isValidPlate(input: string): boolean {
  return normalizePlate(input).length >= PLATE_MIN_LENGTH;
}

/**
 * Định dạng lại biển số để HIỂN THỊ: 30A12345 -> 30A-123.45
 * Chỉ dùng ở tầng trình bày; lưu trữ và so sánh luôn dùng bản chuẩn hoá.
 */
export function formatPlate(input: string): string {
  const p = normalizePlate(input);
  const m = /^(\d{2}[A-Z]{1,2})(\d{3})(\d{2})$/.exec(p);
  if (m !== null) return `${m[1]}-${m[2]}.${m[3]}`;
  const m4 = /^(\d{2}[A-Z]{1,2})(\d{4})$/.exec(p);
  if (m4 !== null) return `${m4[1]}-${m4[2]}`;
  return p;
}

/** Khoảng cách Levenshtein — gợi ý biển gần giống khi nhân viên gõ nhầm */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        (cur[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}
