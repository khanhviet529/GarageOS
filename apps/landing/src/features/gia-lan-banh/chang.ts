import type { DongPhi } from '@/features/gia-lan-banh/kieu';

/**
 * Chia bảng phí thành các CHẶNG cho khoảnh khắc chữ ký (DES-LS-002 §9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao hàm này trả `null` được, và vì sao đó là phần quan trọng nhất
 *
 * Con số cộng dồn qua từng chặng là TỔNG RIÊNG PHẦN của chính các dòng máy chủ
 * gửi xuống. Nó không phải một công thức thứ hai — nhưng nó vẫn là một phép
 * cộng chạy ở trình duyệt, và một phép cộng ở trình duyệt thì có thể lệch khỏi
 * tổng của máy chủ khi máy chủ thêm một loại phí mà chỗ này chưa biết.
 *
 * Lúc đó khối được dựng để chứng minh minh bạch sẽ tự mâu thuẫn trong một khung
 * nhìn: bốn dòng cộng ra một số, dòng tổng in ra một số khác. Khách phát hiện
 * bằng máy tính bỏ túi.
 *
 * 💡 Nên hàm ĐỐI CHIẾU tổng riêng phần cuối cùng với tổng của máy chủ. Khớp thì
 *    trả về các chặng; lệch thì trả `null`, và giao diện hiện thẳng con số cuối
 *    không diễn hoạt. Thà mất một hiệu ứng còn hơn công bố hai con số.
 *
 * 🔒 Dòng `insideTotal: false` (bảo hiểm vật chất tự nguyện) KHÔNG bao giờ vào
 *    chặng nào. Nó nằm ngoài tổng vì máy chủ nói thế, và giao diện tôn trọng cờ
 *    đó thay vì cộng lại.
 */
export interface Chang {
  /** Nhãn hiện trên dòng — lấy từ máy chủ khi chặng chỉ có một dòng. */
  nhan: string;
  /** Tiền của riêng chặng này. */
  tien: bigint;
  /** Tổng lăn bánh tính tới hết chặng này. */
  congDon: bigint;
}

/**
 * Nhóm các khoản đi cùng nhau trong một nhịp đọc. Khoá nào không có tên ở đây
 * thì đứng riêng thành một chặng — một khoản phí mới KHÔNG được lặng lẽ biến
 * mất vào một nhóm có sẵn.
 */
const NHOM: { keys: string[]; nhan: string }[] = [
  { keys: ['listPrice', 'colorSurcharge'], nhan: 'Giá niêm yết' },
  { keys: ['registrationFee'], nhan: 'Lệ phí trước bạ' },
  { keys: ['plateFee'], nhan: 'Đăng ký biển số' },
  {
    keys: ['inspectionFee', 'roadMaintenanceFee', 'civilInsuranceFee'],
    nhan: 'Đăng kiểm · đường bộ · bảo hiểm bắt buộc',
  },
];

export function chiaChang(lines: DongPhi[], total: string): Chang[] | null {
  const trong = lines.filter((l) => l.insideTotal);
  const daDung = new Set<string>();
  const chang: Chang[] = [];

  for (const nhom of NHOM) {
    const cua = trong.filter((l) => nhom.keys.includes(l.key));
    if (cua.length === 0) continue;
    for (const l of cua) daDung.add(l.key);
    const tien = cua.reduce((s, l) => s + BigInt(l.amount), 0n);
    // Một dòng thì dùng nguyên nhãn của máy chủ — nó nói chính xác hơn nhãn
    // nhóm (ví dụ "Lệ phí trước bạ (miễn cho loại động cơ này)").
    chang.push({ nhan: cua.length === 1 ? cua[0]!.label : nhom.nhan, tien, congDon: 0n });
  }

  /*
   * 🔒 Khoản lạ đứng riêng, giữ nguyên tên máy chủ đặt. Phụ phí đại lý phải
   *    mang TÊN CỦA NÓ — gộp vào "đăng kiểm" là cách một khoản 35 triệu từng
   *    đội lốt một khoản 340 nghìn.
   */
  for (const l of trong) {
    if (daDung.has(l.key)) continue;
    chang.push({ nhan: l.label, tien: BigInt(l.amount), congDon: 0n });
  }

  if (chang.length === 0) return null;

  let cong = 0n;
  for (const c of chang) {
    cong += c.tien;
    c.congDon = cong;
  }

  // Đối chiếu với máy chủ. Lệch một đồng cũng là lệch.
  return cong === BigInt(total) ? chang : null;
}
