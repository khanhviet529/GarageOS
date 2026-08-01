/**
 * Tiền — 🔒 INV-M-01: luôn là số nguyên, đơn vị đồng.
 * Xem docs/adr/0003-money-as-integer.md
 */

/** Số tiền tính bằng đồng. Luôn nguyên. */
export type Amount = number;

export function assertAmount(value: number, label = 'amount'): Amount {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} phải là số nguyên (đơn vị đồng), nhận: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} vượt giới hạn số nguyên an toàn: ${value}`);
  }
  return value;
}

export interface LineInput {
  /** Số lượng — có thể lẻ (giờ công 1.5h, dầu 4.8L) */
  readonly quantity: number;
  /** Đơn giá tính bằng đồng, nguyên */
  readonly unitPrice: Amount;
  /** Chiết khấu tính bằng đồng, nguyên */
  readonly discountAmount?: Amount;
  /** Thuế suất phần trăm, nguyên (10 = 10%) */
  readonly taxRatePercent?: number;
}

export interface LineTotals {
  readonly gross: Amount;
  readonly discount: Amount;
  readonly net: Amount;
  readonly tax: Amount;
  readonly total: Amount;
}

/**
 * Tính tổng MỘT dòng.
 *
 * 🔒 INV-M-02: làm tròn ở TỪNG DÒNG, không ở tổng. Làm tròn ở tổng khiến
 * tổng in ra không bằng tổng các dòng cộng lại.
 */
export function calculateLineTotal(input: LineInput): LineTotals {
  assertAmount(input.unitPrice, 'unitPrice');
  const discount = assertAmount(input.discountAmount ?? 0, 'discountAmount');
  const taxRate = input.taxRatePercent ?? 0;

  if (input.quantity <= 0) throw new Error(`quantity phải > 0, nhận: ${input.quantity}`);
  if (taxRate < 0 || taxRate > 100) throw new Error(`taxRatePercent ngoài [0,100]: ${taxRate}`);

  // GARAGEOS-003: kiểm tra KẾT QUẢ, không chỉ đầu vào. quantity là số thập
  // phân nên tích có thể vượt miền an toàn dù cả hai đầu vào đều hợp lệ.
  const gross = assertAmount(
    Math.round(input.quantity * input.unitPrice),
    'gross (quantity x unitPrice)',
  );

  // 🔒 INV-M-07: chiết khấu không vượt giá trị dòng
  if (discount > gross) {
    throw new Error(`discountAmount (${discount}) vượt giá trị dòng (${gross})`);
  }

  const net = gross - discount;
  const tax = assertAmount(Math.round((net * taxRate) / 100), 'tax');
  return { gross, discount, net, tax, total: assertAmount(net + tax, 'total') };
}

/**
 * Tổng nhiều dòng.
 * 🔒 Cộng các số đã làm tròn — KHÔNG làm tròn lại ở đây.
 */
export function sumLineTotals(lines: readonly LineTotals[]): LineTotals {
  return lines.reduce<LineTotals>(
    (acc, l) => ({
      gross: acc.gross + l.gross,
      discount: acc.discount + l.discount,
      net: acc.net + l.net,
      tax: acc.tax + l.tax,
      total: acc.total + l.total,
    }),
    { gross: 0, discount: 0, net: 0, tax: 0, total: 0 },
  );
}
