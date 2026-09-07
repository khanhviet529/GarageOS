import type { FinancingPhase, FinancingQuote } from '@garageos/contracts';
import { THANG, chiaLamTron, laiSuatThangTuBp, lamTronTien, luyThuaThang } from './so-thap-phan.js';

/**
 * Khoản trả góp tham khảo — `INV-LS-18`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Hàm này trả về MỘT MẢNG KỲ, không trả về một con số.
 *
 * Cấu trúc lãi hai giai đoạn (ưu đãi `promo_months` kỳ đầu, sau đó lãi thường)
 * làm các kỳ **không bằng nhau**. Đó chính là lý do `INV-LS-18` bắt làm tròn
 * từng kỳ; ép về một con số duy nhất làm mất luôn ý nghĩa của bất biến đó, và
 * tệ hơn — nó nói với khách rằng tháng 13 vẫn trả đúng bằng tháng 12.
 *
 * Bề mặt phải hiện HAI con số: *12 tháng đầu* và *từ tháng 13*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Quy ước tính giai đoạn hai
 *
 * Sau kỳ ưu đãi cuối cùng, dư nợ còn lại được **tính lại thành niên kim mới**
 * theo lãi suất thường trên số kỳ còn lại. Đây là cách ngân hàng Việt Nam làm
 * và là cách duy nhất giữ đúng tổng số kỳ đã cam kết với khách.
 *
 * 🔒 Kỳ cuối cùng trả **đúng phần còn lại**, không trả theo niên kim. Làm tròn
 *    về nghìn đồng ở từng kỳ để lại một phần dư vài nghìn; nhét nó vào kỳ cuối
 *    là cách duy nhất để tổng đã trả khớp với dư nợ. Nếu giấu phần dư đó đi thì
 *    khoản vay không bao giờ về 0 và không ai biết.
 *
 * ⚠️ Đây là số ƯỚC TÍNH để tham khảo (`INV-LS-16`). Hệ thống không xét duyệt hồ
 *    sơ, không cam kết lãi suất và không nộp hồ sơ hộ khách.
 */

export interface DauVaoTraGop {
  /** Giá dùng làm cơ sở vay — thường là giá lăn bánh, do nơi gọi quyết định. */
  giaXe: bigint;
  tyLeTraTruocBp: number;
  soKy: number;
  laiSuatUuDaiBp: number;
  soThangUuDai: number;
  laiSuatSauUuDaiBp: number;
  /** Đơn vị làm tròn khoản trả hàng tháng. Mặc định 1.000 đồng — cách báo giá thật. */
  donViLamTron?: bigint;
}

export interface KetQuaTraGop extends FinancingQuote {
  /** Kỳ cuối cùng trả đúng phần còn lại, có thể lệch vài nghìn so với kỳ trước. */
  finalPeriodAmount: bigint;
}

/** Niên kim: `P·r·(1+r)^n / ((1+r)^n − 1)`. Lãi 0 thì chia đều. */
function nienKim(goc: bigint, laiThang: bigint, soKy: number): bigint {
  if (soKy <= 0) throw new Error('soKy phải dương');
  if (goc <= 0n) return 0n;
  if (laiThang === 0n) return chiaLamTron(goc, BigInt(soKy));
  const luyThua = luyThuaThang(THANG + laiThang, soKy);
  return chiaLamTron(goc * laiThang * luyThua, THANG * (luyThua - THANG));
}

export function tinhTraGop(dauVao: DauVaoTraGop): KetQuaTraGop {
  const { giaXe, tyLeTraTruocBp, soKy, laiSuatUuDaiBp, laiSuatSauUuDaiBp } = dauVao;
  const donVi = dauVao.donViLamTron ?? 1_000n;

  if (giaXe <= 0n) throw new Error('Giá xe phải dương');
  if (!Number.isInteger(soKy) || soKy <= 0) throw new Error('Số kỳ phải là số nguyên dương');
  if (tyLeTraTruocBp < 0 || tyLeTraTruocBp >= 10_000) {
    throw new Error('Tỷ lệ trả trước phải trong khoảng [0 %, 100 %)');
  }

  const downPayment = chiaLamTron(giaXe * BigInt(tyLeTraTruocBp), 10_000n);
  const principal = giaXe - downPayment;

  // Kỳ ưu đãi dài hơn kỳ vay thì cả khoản vay chạy lãi ưu đãi — không có giai
  // đoạn hai để nói tới.
  const soThangUuDai = Math.max(0, Math.min(dauVao.soThangUuDai, soKy));
  const laiUuDai = laiSuatThangTuBp(laiSuatUuDaiBp);
  const laiThuong = laiSuatThangTuBp(laiSuatSauUuDaiBp);

  const kyDau = soThangUuDai > 0 ? soThangUuDai : soKy;
  const laiKyDau = soThangUuDai > 0 ? laiUuDai : laiThuong;
  const bpKyDau = soThangUuDai > 0 ? laiSuatUuDaiBp : laiSuatSauUuDaiBp;

  const tienKyDau = lamTronTien(nienKim(principal, laiKyDau, soKy), donVi);

  let duNo = principal;
  let daTra = 0n;
  let laiDaTra = 0n;
  let tienKySau = 0n;
  let kyCuoi = 0n;

  for (let ky = 1; ky <= soKy; ky += 1) {
    const trongKyDau = ky <= kyDau;
    const lai = chiaLamTron(duNo * (trongKyDau ? laiKyDau : laiThuong), THANG);

    if (!trongKyDau && tienKySau === 0n) {
      // Bước sang giai đoạn hai: tính lại niên kim trên dư nợ còn lại.
      tienKySau = lamTronTien(nienKim(duNo, laiThuong, soKy - kyDau), donVi);
    }

    let tra = trongKyDau ? tienKyDau : tienKySau;
    if (ky === soKy) tra = duNo + lai; // kỳ cuối trả hết, không trả theo niên kim

    if (tra <= lai && ky !== soKy) {
      // Khoản trả không đủ bù lãi thì dư nợ phình ra mãi mãi. Thà nổ ở đây còn
      // hơn hiện một bảng trả góp không bao giờ kết thúc.
      throw new Error('Khoản trả hàng tháng không đủ trả lãi — kiểm tra lại lãi suất và số kỳ');
    }

    duNo -= tra - lai;
    daTra += tra;
    laiDaTra += lai;
    kyCuoi = tra;
  }

  const phases: FinancingPhase[] = [
    { fromPeriod: 1, toPeriod: kyDau, monthlyAmount: tienKyDau, annualRateBp: bpKyDau },
  ];
  if (kyDau < soKy) {
    phases.push({
      fromPeriod: kyDau + 1,
      toPeriod: soKy,
      monthlyAmount: tienKySau,
      annualRateBp: laiSuatSauUuDaiBp,
    });
  }

  return {
    principal,
    downPayment,
    termMonths: soKy,
    phases,
    totalPaid: daTra,
    totalInterest: laiDaTra,
    finalPeriodAmount: kyCuoi,
  };
}
