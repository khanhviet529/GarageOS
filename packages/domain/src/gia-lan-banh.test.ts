import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bieuPhiHieuLuc, tinhGiaLanBanh, type BieuPhiLanBanh } from './gia-lan-banh.js';

/**
 * Bộ số đối chiếu tay: **Hà Nội, hiệu lực 01/07/2026** — cùng bộ đang hiện trên
 * thiết kế Pencil và trong hướng dẫn người dùng. Mọi con số trên landing phải
 * cộng ra được từ đây bằng một cái máy tính bỏ túi.
 */
const HA_NOI_BEV: BieuPhiLanBanh = {
  provinceName: 'Hà Nội',
  powertrain: 'BEV',
  registrationFeeRateBp: 0, // xe điện hiện được miễn
  plateFeeAmount: 20_000_000n,
  inspectionFeeAmount: 340_000n,
  roadMaintenanceFeeAmount: 1_560_000n,
  civilInsuranceFeeAmount: 480_000n,
  materialInsuranceRateBp: 120,
  dealerFeeAmount: 0n,
  dealerFeeLabel: null,
  effectiveFrom: '2026-07-01',
};

const HA_NOI_ICE: BieuPhiLanBanh = { ...HA_NOI_BEV, powertrain: 'ICE', registrationFeeRateBp: 1200 };

describe('tinhGiaLanBanh', () => {
  test('VF 8 Eco tại Hà Nội — 1.199.000.000 + 22.380.000', () => {
    const kq = tinhGiaLanBanh({ listPrice: 1_199_000_000n }, HA_NOI_BEV);
    assert.equal(kq.total, 1_221_380_000n);
  });

  test('xe xăng cùng tỉnh phải cộng thêm trước bạ 12 %', () => {
    const kq = tinhGiaLanBanh({ listPrice: 869_000_000n }, HA_NOI_ICE);
    // 869.000.000 × 1,12 + 22.380.000
    assert.equal(kq.total, 995_660_000n);
  });

  test('🔒 bảo hiểm vật chất nằm NGOÀI tổng', () => {
    const kq = tinhGiaLanBanh({ listPrice: 1_199_000_000n }, HA_NOI_BEV);
    const vatChat = kq.lines.find((l) => l.key === 'materialInsurance');
    assert.ok(vatChat, 'phải có dòng bảo hiểm vật chất');
    assert.equal(vatChat.insideTotal, false);
    assert.equal(vatChat.amount, 14_388_000n);
    // Tổng không đổi khi có hay không có dòng đó.
    const khongVatChat = tinhGiaLanBanh({ listPrice: 1_199_000_000n }, { ...HA_NOI_BEV, materialInsuranceRateBp: 0 });
    assert.equal(kq.total, khongVatChat.total);
  });

  test('tổng đúng bằng tổng các dòng insideTotal — không có số hạng ẩn', () => {
    const kq = tinhGiaLanBanh({ listPrice: 1_259_000_000n, colorSurcharge: 12_000_000n }, HA_NOI_ICE);
    const cong = kq.lines.filter((l) => l.insideTotal).reduce((s, l) => s + l.amount, 0n);
    assert.equal(kq.total, cong);
  });

  test('phụ thu màu vào cơ sở tính trước bạ, vì đó là giá trị trên hoá đơn', () => {
    const khong = tinhGiaLanBanh({ listPrice: 1_000_000_000n }, HA_NOI_ICE);
    const co = tinhGiaLanBanh({ listPrice: 1_000_000_000n, colorSurcharge: 20_000_000n }, HA_NOI_ICE);
    // Chênh lệch = phụ thu + 12 % của phụ thu.
    assert.equal(co.total - khong.total, 20_000_000n + 2_400_000n);
  });

  test('màu không phụ thu thì không sinh dòng "0 ₫" — bảng minh bạch không phải bảng dài', () => {
    const kq = tinhGiaLanBanh({ listPrice: 1_199_000_000n, colorSurcharge: 0n }, HA_NOI_BEV);
    assert.equal(kq.lines.some((l) => l.key === 'colorSurcharge'), false);
  });

  test('🔒 INV-LS-16: kết quả luôn kèm nguồn để hiện nhãn ước tính', () => {
    const kq = tinhGiaLanBanh({ listPrice: 1_199_000_000n }, HA_NOI_BEV);
    assert.deepEqual(kq.source, { provinceName: 'Hà Nội', effectiveFrom: '2026-07-01', powertrain: 'BEV' });
  });

  test('phụ phí đại lý mang tên riêng, không núp dưới tên đăng kiểm', () => {
    const kq = tinhGiaLanBanh(
      { listPrice: 1_000_000_000n },
      { ...HA_NOI_BEV, dealerFeeAmount: 5_000_000n, dealerFeeLabel: 'Phí dịch vụ đăng ký hộ' },
    );
    const dong = kq.lines.find((l) => l.key === 'dealerFee');
    assert.equal(dong?.label, 'Phí dịch vụ đăng ký hộ');
    const dangKiem = kq.lines.find((l) => l.key === 'inspectionFee');
    assert.equal(dangKiem?.amount, 340_000n, 'phí đăng kiểm giữ nguyên con số thật của nó');
  });

  test('giá niêm yết không dương thì từ chối', () => {
    assert.throws(() => tinhGiaLanBanh({ listPrice: 0n }, HA_NOI_BEV), /dương/);
  });
});

describe('bieuPhiHieuLuc', () => {
  const bang = [
    { effectiveFrom: '2025-01-01', effectiveTo: '2026-07-01', ma: 'cu' },
    { effectiveFrom: '2026-07-01', effectiveTo: null, ma: 'moi' },
  ];

  test('chọn đúng bản đang hiệu lực, biên trái đóng biên phải mở', () => {
    assert.equal(bieuPhiHieuLuc(bang, '2026-06-30')?.ma, 'cu');
    assert.equal(bieuPhiHieuLuc(bang, '2026-07-01')?.ma, 'moi');
    assert.equal(bieuPhiHieuLuc(bang, '2026-09-04')?.ma, 'moi');
  });

  test('🔒 không có biểu phí thì trả null, KHÔNG đoán và không rơi về tỉnh khác', () => {
    assert.equal(bieuPhiHieuLuc(bang, '2024-12-31'), null);
    assert.equal(bieuPhiHieuLuc([], '2026-09-04'), null);
  });
});
