/**
 * Đọc `specifications` của một phiên bản.
 *
 * ⚠️ Hợp đồng khai trường này là `z.record(z.string(), z.unknown())` — máy chủ
 *    KHÔNG ràng buộc tập khoá. Giao diện vì thế phải làm hai việc cùng lúc:
 *    hiện đẹp những khoá nó biết, và KHÔNG NUỐT những khoá nó chưa biết.
 *
 * 💡 Một khoá lạ hiện ra với tên thô vẫn tốt hơn một khoá lạ biến mất: người
 *    nhập liệu thấy ngay là mình gõ sai tên, thay vì tưởng hệ thống đã nhận.
 *    Đây cùng một loại lỗi với "giá thuê pin nhập được mà landing không hiện".
 */

const NHAN: Record<string, { nhan: string; donVi?: string }> = {
  rangeKm: { nhan: 'Tầm hoạt động', donVi: 'km' },
  seats: { nhan: 'Chỗ ngồi', donVi: 'chỗ' },
  batteryKwh: { nhan: 'Dung lượng pin', donVi: 'kWh' },
  powerHp: { nhan: 'Công suất', donVi: 'mã lực' },
  torqueNm: { nhan: 'Mô-men xoắn', donVi: 'Nm' },
  fastChargeMinutes: { nhan: 'Sạc nhanh', donVi: 'phút' },
  acChargeKw: { nhan: 'Sạc tại nhà', donVi: 'kW' },
  consumptionL100km: { nhan: 'Tiêu thụ', donVi: 'L/100 km' },
  drivetrain: { nhan: 'Dẫn động' },
  lengthMm: { nhan: 'Chiều dài', donVi: 'mm' },
  widthMm: { nhan: 'Chiều rộng', donVi: 'mm' },
  heightMm: { nhan: 'Chiều cao', donVi: 'mm' },
  wheelbaseMm: { nhan: 'Chiều dài cơ sở', donVi: 'mm' },
  groundClearanceMm: { nhan: 'Khoảng sáng gầm', donVi: 'mm' },
  bootLitres: { nhan: 'Cốp sau', donVi: 'L' },
  airbags: { nhan: 'Túi khí', donVi: 'túi' },
  ncapStars: { nhan: 'Đánh giá an toàn', donVi: 'sao' },
  adasLevel: { nhan: 'Hỗ trợ lái', donVi: 'cấp' },
};

export interface ThongSo {
  key: string;
  nhan: string;
  giaTri: string;
}

export function docThongSo(specs: Record<string, unknown>): ThongSo[] {
  const ra: ThongSo[] = [];
  for (const [key, raw] of Object.entries(specs)) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'object') continue;
    const meta = NHAN[key];
    const so = typeof raw === 'number' ? raw.toLocaleString('vi-VN') : String(raw);
    ra.push({
      key,
      nhan: meta?.nhan ?? key,
      giaTri: meta?.donVi === undefined ? so : `${so} ${meta.donVi}`,
    });
  }
  return ra;
}
