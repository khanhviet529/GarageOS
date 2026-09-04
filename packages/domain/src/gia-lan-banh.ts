import type { OnroadFeeLine, OnroadPriceBreakdown, Powertrain } from '@garageos/contracts';
import { chiaLamTron } from './so-thap-phan.js';

/**
 * Giá lăn bánh — phép cộng mà người mua ô tô tự làm để đối chiếu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Cái gì thuộc "lăn bánh" và cái gì không
 *
 *   lăn bánh = giá xe + phụ thu màu + trước bạ + biển số + đăng kiểm
 *            + phí đường bộ + bảo hiểm TNDS bắt buộc [+ phụ phí đại lý nếu có]
 *
 * **Bảo hiểm vật chất KHÔNG nằm trong đó.** Nó tự nguyện, nên trả về như một
 * dòng `insideTotal: false` — hiện SAU tổng, không cộng vào.
 *
 * Bản dựng thiết kế đầu cộng nó vào tổng, khiến landing lệch 12,5 triệu so với
 * chính công cụ "Thử phép cộng" trong admin. Khối được dựng để chứng minh minh
 * bạch lại tự mâu thuẫn trong cùng một khung nhìn — đó là loại lỗi khách phát
 * hiện trước, bằng máy tính bỏ túi.
 *
 * 🔒 Hàm thuần, `bigint`, làm tròn Ở TỪNG DÒNG chứ không ở tổng
 *    (`CLAUDE.md` nguyên tắc 3). Giá lăn bánh **không được lưu** ở đâu cả:
 *    lưu một con số suy ra là tự tạo ra hai nguồn sự thật, và bản bị lệch luôn
 *    là bản khách đang nhìn.
 */

export interface BieuPhiLanBanh {
  provinceName: string;
  powertrain: Powertrain;
  /** Trước bạ, basis point trên giá tính thuế. Xe điện hiện là 0. */
  registrationFeeRateBp: number;
  plateFeeAmount: bigint;
  inspectionFeeAmount: bigint;
  roadMaintenanceFeeAmount: bigint;
  civilInsuranceFeeAmount: bigint;
  /** Bảo hiểm vật chất — % giá xe, NGOÀI tổng lăn bánh. */
  materialInsuranceRateBp: number;
  dealerFeeAmount: bigint;
  dealerFeeLabel: string | null;
  effectiveFrom: string;
}

export interface DauVaoLanBanh {
  /** Giá niêm yết của phiên bản. */
  listPrice: bigint;
  /** Phụ thu màu, 0 nếu màu không phụ thu. */
  colorSurcharge?: bigint;
}

/**
 * 🔒 Trước bạ tính trên **giá xe cộng phụ thu màu**, vì đó là giá trị ghi trên
 *    hoá đơn bán xe — cơ sở tính lệ phí trước bạ. Tách phụ thu ra khỏi cơ sở
 *    tính sẽ cho một con số thấp hơn thực tế, và người mua phát hiện lúc nộp
 *    tiền chứ không phải lúc xem trang.
 */
export function tinhGiaLanBanh(dauVao: DauVaoLanBanh, bieuPhi: BieuPhiLanBanh): OnroadPriceBreakdown {
  const { listPrice } = dauVao;
  const colorSurcharge = dauVao.colorSurcharge ?? 0n;
  if (listPrice <= 0n) throw new Error('Giá niêm yết phải dương');
  if (colorSurcharge < 0n) throw new Error('Phụ thu màu không được âm');

  const coSoTinhThue = listPrice + colorSurcharge;
  const truocBa = chiaLamTron(coSoTinhThue * BigInt(bieuPhi.registrationFeeRateBp), 10_000n);
  const vatChat = chiaLamTron(coSoTinhThue * BigInt(bieuPhi.materialInsuranceRateBp), 10_000n);

  const lines: OnroadFeeLine[] = [
    { key: 'listPrice', label: 'Giá niêm yết', amount: listPrice, insideTotal: true },
  ];

  // Dòng phụ thu màu chỉ xuất hiện khi có phụ thu. Một dòng "0 ₫" trong bảng
  // minh bạch là nhiễu, không phải minh bạch.
  if (colorSurcharge > 0n) {
    lines.push({ key: 'colorSurcharge', label: 'Phụ thu màu', amount: colorSurcharge, insideTotal: true });
  }

  lines.push({
    key: 'registrationFee',
    label:
      bieuPhi.registrationFeeRateBp === 0
        ? 'Lệ phí trước bạ (miễn cho loại động cơ này)'
        : `Lệ phí trước bạ (${formatBp(bieuPhi.registrationFeeRateBp)})`,
    amount: truocBa,
    insideTotal: true,
  });
  lines.push({ key: 'plateFee', label: 'Đăng ký biển số', amount: bieuPhi.plateFeeAmount, insideTotal: true });
  lines.push({ key: 'inspectionFee', label: 'Phí đăng kiểm', amount: bieuPhi.inspectionFeeAmount, insideTotal: true });
  lines.push({ key: 'roadMaintenanceFee', label: 'Phí đường bộ 12 tháng', amount: bieuPhi.roadMaintenanceFeeAmount, insideTotal: true });
  lines.push({ key: 'civilInsuranceFee', label: 'Bảo hiểm trách nhiệm dân sự', amount: bieuPhi.civilInsuranceFeeAmount, insideTotal: true });

  if (bieuPhi.dealerFeeAmount > 0n) {
    lines.push({
      key: 'dealerFee',
      // Phụ phí đại lý phải mang TÊN CỦA NÓ. Gộp vào "đăng kiểm" là cách một
      // khoản 35 triệu từng đội lốt một khoản 340 nghìn.
      label: bieuPhi.dealerFeeLabel ?? 'Phụ phí đại lý',
      amount: bieuPhi.dealerFeeAmount,
      insideTotal: true,
    });
  }

  if (vatChat > 0n) {
    lines.push({
      key: 'materialInsurance',
      label: 'Bảo hiểm vật chất — tự nguyện, ngoài tổng',
      amount: vatChat,
      insideTotal: false,
    });
  }

  const total = lines.reduce((sum, line) => (line.insideTotal ? sum + line.amount : sum), 0n);

  return {
    lines,
    total,
    source: {
      provinceName: bieuPhi.provinceName,
      effectiveFrom: bieuPhi.effectiveFrom,
      powertrain: bieuPhi.powertrain,
    },
  };
}

/** `1200` -> `"12 %"`, `1250` -> `"12,5 %"`. Không bao giờ hiện "12.5". */
function formatBp(bp: number): string {
  const nguyen = Math.trunc(bp / 100);
  const le = bp % 100;
  if (le === 0) return `${nguyen} %`;
  return `${nguyen},${String(le).padStart(2, '0').replace(/0$/, '')} %`;
}

/**
 * Chọn biểu phí đang hiệu lực cho một ngày.
 *
 * 🔒 Không có biểu phí thì trả `null`, **không** rơi về một tỉnh khác và không
 *    đoán. Landing phải đổi sang trạng thái "Chưa có biểu phí cho tỉnh này" và
 *    chỉ hiện giá niêm yết — thà thiếu một con số còn hơn hiện một con số sai
 *    của tỉnh khác.
 */
export function bieuPhiHieuLuc<T extends { effectiveFrom: string; effectiveTo: string | null }>(
  danhSach: readonly T[],
  ngay: string,
): T | null {
  const ungVien = danhSach.filter((b) => b.effectiveFrom <= ngay && (b.effectiveTo === null || ngay < b.effectiveTo));
  if (ungVien.length === 0) return null;
  // Ràng buộc EXCLUDE ở migration 0071 đã chặn chồng lấn, nên nhiều nhất một
  // dòng. Vẫn sắp xếp để hàm này đúng cả khi gọi trên dữ liệu chưa qua DB.
  return ungVien.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]!;
}
