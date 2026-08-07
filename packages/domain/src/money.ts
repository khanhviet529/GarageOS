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
 * Giá trị dòng TRƯỚC chiết khấu và thuế.
 *
 * 🔒 Tách ra thành hàm riêng vì có chỗ THỨ HAI cần đúng con số này mà không
 * cần cả dòng: kiểm PR-03 (chiết khấu vượt ngưỡng) phải biết mẫu số để tính
 * phần trăm, nhưng chưa được phép ném lỗi INV-M-07 — lỗi đó là việc của ràng
 * buộc DB, và ném ở đây sẽ biến một 422 sạch thành 500.
 *
 * Nếu nơi kia tự viết `Math.round(qty * price)` thì thành bản sao thứ ba của
 * cùng một công thức (trigger `tinh_tien_dong()` là bản thứ nhất). Dự án này đã
 * ghi rõ ở `0010_quotation.sql`: "hai công thức thì sớm muộn cũng lệch nhau".
 *
 * 🔒 `quantity` được ép về 2 chữ số thập phân TRƯỚC khi nhân, vì cột trong
 * database là `numeric(12,2)`. Không ép thì TypeScript tính trên 1,005 còn
 * database lưu 1,01 và tính trên đó — hai con số khác nhau cho cùng một dòng.
 */
export function calculateGross(quantity: number, unitPrice: number): Amount {
  const luongLuu = Math.round(quantity * 100) / 100;
  return assertAmount(Math.round(luongLuu * unitPrice), 'gross (quantity x unitPrice)');
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
  // (`calculateGross` giữ nguyên phép kiểm đó.)
  const gross = calculateGross(input.quantity, input.unitPrice);

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

/**
 * Đọc số tiền từ PostgreSQL.
 *
 * node-pg trả cột `bigint` về dưới dạng CHUỖI để không mất chính xác. Gọi
 * `Number()` thẳng lên nó sẽ âm thầm làm tròn mọi giá trị vượt 2^53 — không
 * lỗi, không cảnh báo, chỉ là một con số khác.
 *
 * codex-review CAT-001. ADR-0003 chốt tiền là `number` trong TypeScript vì
 * mọi số tiền THẬT của một garage đều cách giới hạn đó nhiều bậc độ lớn. Hàm
 * này giữ nguyên quyết định đó nhưng biến "âm thầm sai" thành "dừng ngay":
 * nếu database chứa một giá trị không biểu diễn được, ta muốn biết ở đúng dòng
 * đọc nó, chứ không phải ở hoá đơn của khách.
 */
export function parseAmountFromDb(value: unknown, label = 'amount'): Amount {
  if (value === null || value === undefined) {
    throw new Error(`${label}: thiếu giá trị tiền`);
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${label}: giá trị tiền không hợp lệ (${String(value)})`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `${label}: giá trị tiền trong database vượt giới hạn số nguyên an toàn ` +
        `(${String(value)}). Đọc tiếp sẽ trả về con số KHÁC với dữ liệu thật.`,
    );
  }
  return n;
}
