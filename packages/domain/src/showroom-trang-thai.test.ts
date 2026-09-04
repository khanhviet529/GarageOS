import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nhanKhaNangGiao, trangThaiUuDai, uuDaiHienCongKhai } from './showroom-trang-thai.js';

const BAY_GIO = new Date('2026-09-04T10:00:00+07:00');
const d = (s: string) => new Date(s);

describe('trangThaiUuDai — INV-LS-19', () => {
  test('đang trong hạn và đang bật thì chạy', () => {
    assert.equal(
      trangThaiUuDai({ isEnabled: true, startsAt: d('2026-09-01T00:00:00+07:00'), endsAt: d('2026-09-30T23:59:00+07:00') }, BAY_GIO),
      'DANG_CHAY',
    );
  });

  test('🔒 chưa tới ngày bắt đầu là "Đã hẹn", không phải biến mất', () => {
    assert.equal(
      trangThaiUuDai({ isEnabled: true, startsAt: d('2026-10-01T00:00:00+07:00'), endsAt: null }, BAY_GIO),
      'DA_HEN',
    );
  });

  test('qua ngày kết thúc là hết hạn — không cần job dọn dẹp', () => {
    assert.equal(
      trangThaiUuDai({ isEnabled: true, startsAt: d('2026-08-01T00:00:00+07:00'), endsAt: d('2026-09-01T00:00:00+07:00') }, BAY_GIO),
      'HET_HAN',
    );
  });

  test('🔒 người tắt thì thắng đồng hồ: còn hạn nhưng đã tắt vẫn là "Đã tắt"', () => {
    assert.equal(
      trangThaiUuDai({ isEnabled: false, startsAt: d('2026-09-01T00:00:00+07:00'), endsAt: d('2026-09-30T00:00:00+07:00') }, BAY_GIO),
      'DA_TAT',
    );
  });

  test('không hạn kết thúc thì chạy mãi', () => {
    assert.equal(
      trangThaiUuDai({ isEnabled: true, startsAt: d('2026-01-01T00:00:00+07:00'), endsAt: null }, BAY_GIO),
      'DANG_CHAY',
    );
  });

  test('chỉ ưu đãi đang chạy mới ra landing', () => {
    const ds = [
      { ma: 'chay', isEnabled: true, startsAt: d('2026-09-01T00:00:00+07:00'), endsAt: null },
      { ma: 'hen', isEnabled: true, startsAt: d('2026-10-01T00:00:00+07:00'), endsAt: null },
      { ma: 'het', isEnabled: true, startsAt: d('2026-01-01T00:00:00+07:00'), endsAt: d('2026-02-01T00:00:00+07:00') },
      { ma: 'tat', isEnabled: false, startsAt: d('2026-09-01T00:00:00+07:00'), endsAt: null },
    ];
    assert.deepEqual(uuDaiHienCongKhai(ds, BAY_GIO).map((u) => u.ma), ['chay']);
  });
});

describe('nhanKhaNangGiao — INV-LS-17', () => {
  const cn = (branchId: string, status: 'SAN_XE' | 'SAP_VE' | 'DAT_HANG' | 'TAM_NGUNG', min: number | null = null, max: number | null = null) => ({
    branchId,
    branchName: branchId,
    status,
    leadTimeDaysMin: min,
    leadTimeDaysMax: max,
  });

  test('🔒 nhãn luôn nêu phạm vi, không bao giờ là "Sẵn xe" trơ trọi', () => {
    const n = nhanKhaNangGiao([cn('a', 'SAN_XE'), cn('b', 'SAN_XE'), cn('c', 'SAP_VE', 7, 10)]);
    assert.equal(n?.status, 'SAN_XE');
    assert.equal(n?.branchCount, 2);
    assert.equal(n?.label, 'Sẵn xe tại 2 chi nhánh');
  });

  test('mọi chi nhánh cùng trạng thái thì nói "mọi chi nhánh"', () => {
    const n = nhanKhaNangGiao([cn('a', 'SAN_XE'), cn('b', 'SAN_XE')]);
    assert.equal(n?.label, 'Sẵn xe tại mọi chi nhánh');
  });

  test('lấy trạng thái tốt nhất, không lấy trạng thái đầu danh sách', () => {
    const n = nhanKhaNangGiao([cn('a', 'DAT_HANG', 30, 45), cn('b', 'SAN_XE')]);
    assert.equal(n?.status, 'SAN_XE');
  });

  test('khi phải chờ thì nhãn nói khoảng thời gian, gộp min–max của các chi nhánh cùng bậc', () => {
    const n = nhanKhaNangGiao([cn('a', 'SAP_VE', 7, 10), cn('b', 'SAP_VE', 14, 20)]);
    assert.equal(n?.label, 'Sắp về · 7–20 ngày');
    assert.equal(n?.leadTimeDaysMin, 7);
    assert.equal(n?.leadTimeDaysMax, 20);
  });

  test('tất cả tạm ngừng thì nói thẳng là tạm ngừng', () => {
    const n = nhanKhaNangGiao([cn('a', 'TAM_NGUNG'), cn('b', 'TAM_NGUNG')]);
    assert.equal(n?.label, 'Tạm ngừng nhận đặt');
  });

  test('chưa chi nhánh nào khai thì trả null — không đoán, không hiện badge', () => {
    assert.equal(nhanKhaNangGiao([]), null);
  });

  test('🔒 kết quả không có trường nào mang số lượng xe', () => {
    const n = nhanKhaNangGiao([cn('a', 'SAN_XE')])!;
    const khoa = Object.keys(n);
    assert.deepEqual(khoa.filter((k) => /quantity|soLuong|stock|count/i.test(k)), ['branchCount']);
    assert.match(n.label, /chi nhánh/, 'con số duy nhất được phép đếm là chi nhánh');
  });
});
