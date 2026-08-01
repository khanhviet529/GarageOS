import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineTotal, sumLineTotals, assertAmount } from './money.js';

describe('INV-M-01 — tiền là số nguyên đơn vị đồng', () => {
  test('từ chối đơn giá không nguyên', () => {
    assert.throws(() => assertAmount(850000.5, 'unitPrice'), /phải là số nguyên/);
  });

  test('chấp nhận số nguyên', () => {
    assert.equal(assertAmount(850000), 850000);
  });
});

describe('INV-M-02 — làm tròn ở từng dòng, tổng bằng tổng các dòng', () => {
  test('tổng khớp chính xác 0đ sai lệch với 20 dòng có làm tròn', () => {
    // Đơn giá và số lượng chọn để phép nhân ra số lẻ -> buộc phải làm tròn
    const lines = Array.from({ length: 20 }, (_, i) =>
      calculateLineTotal({
        quantity: 1.3 + i * 0.07,
        unitPrice: 123457 + i * 991,
        taxRatePercent: 10,
      }),
    );
    const total = sumLineTotals(lines);
    const manual = lines.reduce((s, l) => s + l.total, 0);

    assert.equal(total.total, manual, 'tổng phải bằng tổng các dòng');
    assert.ok(Number.isInteger(total.total), 'tổng phải nguyên');
  });

  test('làm tròn ở tổng cho kết quả KHÁC — đây là lý do phải làm tròn ở dòng', () => {
    const inputs = [
      { quantity: 1.5, unitPrice: 333333, taxRatePercent: 10 },
      { quantity: 2.5, unitPrice: 333333, taxRatePercent: 10 },
      { quantity: 3.5, unitPrice: 333333, taxRatePercent: 10 },
    ];
    const perLine = sumLineTotals(inputs.map(calculateLineTotal)).total;
    const atTotalOnly = Math.round(
      inputs.reduce((s, i) => s + i.quantity * i.unitPrice * 1.1, 0),
    );
    assert.notEqual(
      perLine,
      atTotalOnly,
      'nếu hai cách cho cùng kết quả thì test này mất ý nghĩa — chọn số khác',
    );
  });
});

describe('INV-M-07 — chiết khấu không vượt giá trị dòng', () => {
  test('chặn chiết khấu vượt', () => {
    assert.throws(
      () => calculateLineTotal({ quantity: 1, unitPrice: 100000, discountAmount: 150000 }),
      /vượt giá trị dòng/,
    );
  });

  test('cho phép chiết khấu bằng đúng giá trị dòng', () => {
    const r = calculateLineTotal({ quantity: 1, unitPrice: 100000, discountAmount: 100000 });
    assert.equal(r.total, 0);
  });
});

describe('Ràng buộc đầu vào', () => {
  test('số lượng phải > 0', () => {
    assert.throws(() => calculateLineTotal({ quantity: 0, unitPrice: 1000 }), /quantity/);
  });

  test('thuế suất trong [0,100]', () => {
    assert.throws(
      () => calculateLineTotal({ quantity: 1, unitPrice: 1000, taxRatePercent: 101 }),
      /taxRatePercent/,
    );
  });
});

describe('Ví dụ nghiệp vụ thật', () => {
  test('má phanh 850.000đ + công 1.2h × 250.000đ, VAT 10%', () => {
    const part = calculateLineTotal({ quantity: 1, unitPrice: 850_000, taxRatePercent: 10 });
    const labor = calculateLineTotal({ quantity: 1.2, unitPrice: 250_000, taxRatePercent: 10 });
    const total = sumLineTotals([part, labor]);

    assert.equal(part.total, 935_000);       // 850.000 + 85.000
    assert.equal(labor.gross, 300_000);      // 1.2 × 250.000
    assert.equal(labor.total, 330_000);      // 300.000 + 30.000
    assert.equal(total.total, 1_265_000);
  });
});
