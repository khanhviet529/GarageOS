/**
 * Số thập phân cố định trên `bigint` — dùng cho luỹ thừa lãi suất.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Vì sao không dùng `number`
 *
 * Công thức trả góp cần `(1 + r)^n`. Trên `number` thì kết quả phụ thuộc thứ tự
 * phép tính và phiên bản máy ảo: hai máy có thể ra hai con số lệch nhau vài
 * phần tỷ, và khi nhân với gốc vay tám chữ số rồi làm tròn về nghìn đồng thì
 * chênh lệch đó **lật được một bậc làm tròn**. Một khoản trả góp lệch 1.000 đồng
 * giữa máy chủ và máy khách là một khiếu nại có cơ sở.
 *
 * 🔒 `CLAUDE.md` nguyên tắc 3: tiền không bao giờ đi qua float. Luỹ thừa lãi
 *    suất là chỗ duy nhất trong dự án cần số thực — nên nó được nhốt vào đây,
 *    biểu diễn bằng số nguyên có thang cố định 10^18.
 */

/** Thang cố định: 1,0 được biểu diễn bằng 10^18. */
export const THANG = 10n ** 18n;

/** Chia có làm tròn nửa lên. Chỉ dùng cho số không âm — tiền và lãi suất. */
export function chiaLamTron(tuSo: bigint, mauSo: bigint): bigint {
  if (mauSo <= 0n) throw new Error('mauSo phải dương');
  if (tuSo < 0n) return -((-tuSo * 2n + mauSo) / (mauSo * 2n));
  return (tuSo * 2n + mauSo) / (mauSo * 2n);
}

/** Nhân hai số thang cố định. */
export function nhanThang(a: bigint, b: bigint): bigint {
  return chiaLamTron(a * b, THANG);
}

/**
 * `(1 + r)^n` với `co So` là `(1 + r)` đã nhân thang.
 *
 * Nhân lặp `n` lần thay vì dùng bình phương liên tiếp: `n` tối đa là 120 kỳ nên
 * chi phí không đáng kể, còn sai số tích luỹ ~120 ulp ở thang 10^-18 — nhỏ hơn
 * một phần nghìn tỷ của một đồng.
 */
export function luyThuaThang(coSo: bigint, soMu: number): bigint {
  if (!Number.isInteger(soMu) || soMu < 0) throw new Error('soMu phải là số nguyên không âm');
  let ketQua = THANG;
  for (let i = 0; i < soMu; i += 1) ketQua = nhanThang(ketQua, coSo);
  return ketQua;
}

/**
 * Đổi lãi suất năm tính bằng basis point sang lãi suất THÁNG ở thang cố định.
 *
 * 750 bp (7,5 %/năm) -> 0,00625/tháng, biểu diễn đúng bằng 6_250_000_000_000_000.
 * Phép chia này chia hết với mọi bp thực tế, nên không có sai số ở bước đầu vào.
 */
export function laiSuatThangTuBp(bp: number): bigint {
  if (!Number.isInteger(bp) || bp < 0) throw new Error('bp phải là số nguyên không âm');
  return chiaLamTron(BigInt(bp) * THANG, 120_000n);
}

/** Làm tròn số tiền về bội của `donVi` (mặc định 1.000 đồng — cách báo giá thật). */
export function lamTronTien(soTien: bigint, donVi: bigint): bigint {
  if (donVi <= 0n) throw new Error('donVi phải dương');
  return chiaLamTron(soTien, donVi) * donVi;
}
