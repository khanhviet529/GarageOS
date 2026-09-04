/**
 * Bóc giá lăn bánh — kiểu DÂY, không phải kiểu miền.
 *
 * 🔒 API trả `bigint` dưới dạng CHUỖI (xem `public-landing.controller.ts`): một
 *    con số tiền tám chữ số vẫn an toàn trong `number`, nhưng quy tắc phải đồng
 *    nhất ở mọi bề mặt, nếu không có ngày nó lọt qua chỗ không an toàn. Nên ở
 *    đây tiền cũng là `string`, và mọi phép so sánh đi qua `BigInt`.
 *
 * 🔒 KHÔNG đổi tên trường. Đây là hợp đồng dữ liệu của public API; giao diện
 *    đọc đúng tên máy chủ đặt.
 */
export interface DongPhi {
  key: string;
  label: string;
  amount: string;
  /** `false` = nằm NGOÀI tổng lăn bánh (bảo hiểm vật chất tự nguyện). */
  insideTotal: boolean;
}

export interface DoanTraGop {
  fromPeriod: number;
  toPeriod: number;
  monthlyAmount: string;
  annualRateBp: number;
}

export interface ChuongTrinhTraGop {
  programId: string;
  bankName: string;
  allowedTermsMonths: number[];
  downPaymentOptionsBp: number[];
  rateUpdatedAt: string;
  quote: {
    principal: string;
    downPayment: string;
    termMonths: number;
    phases: DoanTraGop[];
    totalPaid: string;
    totalInterest: string;
  };
}

export interface UuDai {
  kind: string;
  title: string;
  conditionText: string | null;
  valueAmount: string | null;
  endsAt: string | null;
}

export interface BocGiaDayDu {
  reason: null;
  variantName: string;
  batteryRentalAmount: string | null;
  breakdown: {
    lines: DongPhi[];
    total: string;
    source: { provinceName: string; effectiveFrom: string; powertrain: string };
  };
  promotions: UuDai[];
  financing: ChuongTrinhTraGop[];
  /** Nhãn PHẠM VI, không bao giờ là số lượng xe — INV-LS-17. */
  availability: { label: string } | null;
  deposit: { amount: string; holdDays: number | null; refundText: string | null } | null;
}

export type BocGia =
  | BocGiaDayDu
  | { reason: 'PRICE_ON_REQUEST'; variantName: string }
  | { reason: 'NO_FEE_SCHEDULE'; variantName: string; provinceCode: string };

/**
 * Bốn tỉnh có biểu phí trong seed.
 *
 * ⚠️ Danh sách này là bản sao thứ hai của một dữ kiện nằm trong cơ sở dữ liệu.
 *    API chưa có endpoint liệt kê tỉnh đã cấu hình biểu phí, nên giao diện phải
 *    đoán — và bản sao sẽ lệch khi showroom thêm tỉnh thứ năm. Đã ghi vào báo
 *    cáo bàn giao.
 */
export const TINH = [
  { code: '01', name: 'Hà Nội' },
  { code: '79', name: 'TP. Hồ Chí Minh' },
  { code: '31', name: 'Hải Phòng' },
  { code: '48', name: 'Đà Nẵng' },
] as const;

export const TINH_MAC_DINH = '01';

/** Tiền dạng chuỗi từ API → chữ số theo vi-VN. Ký hiệu `₫` đặt riêng ở giao diện. */
export function soTien(v: string): string {
  return BigInt(v).toLocaleString('vi-VN');
}

/** `2026-07-01` hoặc ISO đầy đủ → `01/07/2026`. */
export function ngayVN(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d === undefined || m === undefined || y === undefined ? iso : `${d}/${m}/${y}`;
}

/**
 * Một dòng chữ nói con số đến từ đâu — INV-LS-16.
 *
 * 🔒 Nhãn này đi CÙNG con số, trong cùng khối. Nó không phải chú thích pháp lý
 *    ở chân trang: một con số suy ra mà nguồn nằm cách đó 4.000 px là một con
 *    số không ai kiểm được.
 */
export function nhanUocTinh(source: { provinceName: string; effectiveFrom: string }): string {
  return `Ước tính theo biểu phí ${source.provinceName} hiệu lực ${ngayVN(source.effectiveFrom)}. Không phải giá cam kết.`;
}
