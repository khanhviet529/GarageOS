/**
 * Chi phí bảo dưỡng theo năm — thứ mà chỉ GarageOS trả lời được.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao tính năng này khác mọi trang bán xe khác
 *
 * Khách xem xe luôn hỏi ba câu, và trang bán xe thường chỉ trả lời được câu đầu:
 *
 *   1. Xe giá bao nhiêu?          -> mọi trang đều có
 *   2. Lăn bánh hết bao nhiêu?    -> vài trang có
 *   3. NUÔI NÓ TỐN BAO NHIÊU?     -> không ai trả lời được
 *
 * Câu ba đòi biết bảng giá dịch vụ THẬT của một xưởng thật. Landing của hãng xe
 * không có nó; landing của đại lý cũng không. GarageOS có, vì cùng hệ thống này
 * đang vận hành cái xưởng sẽ bảo dưỡng chính chiếc xe đó.
 *
 * 💡 Điểm mạnh không nằm ở phép tính — nó tầm thường. Nó nằm ở chỗ CON SỐ ĐẦU
 *    VÀO là bảng giá đang dùng để xuất hoá đơn cho khách khác, nên khách có thể
 *    tới xưởng đối chiếu.
 *
 * Và xe điện tự thắng mà không cần một câu quảng cáo nào: `applicable_powertrains`
 * đã biết xe điện không thay dầu, không bugi, không curoa cam. Bảng tự nói.
 *
 * 🔒 Hàm thuần, không import framework — `CLAUDE.md` nguyên tắc 5. Tiền là
 *    `bigint` đơn vị đồng, làm tròn Ở TỪNG DÒNG chứ không ở tổng — nguyên tắc 3.
 */

/** Một hạng mục trong lịch bảo dưỡng, kèm vật tư tiêu hao của nó. */
export interface HangMucBaoDuong {
  ma: string;
  ten: string;
  /** `service_item.standard_hours` — giờ công định mức. */
  gioDinhMuc: number;
  /** Làm lại mỗi bao nhiêu km. `null` nghĩa là chỉ tính theo thời gian. */
  chuKyKm: number | null;
  /** Làm lại mỗi bao nhiêu tháng. `null` nghĩa là chỉ tính theo quãng đường. */
  chuKyThang: number | null;
  vatTu: { ten: string; giaBan: bigint; soLuong: number }[];
}

export interface ChiPhiMotNam {
  nam: number;
  tienCong: bigint;
  tienVatTu: bigint;
  tong: bigint;
  /** Tên các hạng mục rơi vào năm này — để giao diện nói được VÌ SAO năm đó đắt. */
  hangMuc: string[];
}

export interface ChiPhiSoHuu {
  theoNam: ChiPhiMotNam[];
  tong: bigint;
  /** Số năm KHÔNG có hạng mục nào — dùng để nói "ba năm đầu gần như không tốn gì". */
  soNamKhongTon: number;
}

/**
 * 🔒 Chu kỳ tính theo NĂM, lấy điều kiện nào đến TRƯỚC.
 *
 * Lịch bảo dưỡng thật luôn viết dạng "mỗi 10.000 km hoặc 12 tháng, tuỳ điều kiện
 * nào đến trước". Người chạy 30.000 km/năm chạm mốc km trước; người chạy 5.000
 * km/năm chạm mốc thời gian trước.
 *
 * ⚠️ Bỏ vế thời gian là sai theo hướng nguy hiểm: nó khiến người đi ít trông như
 *    gần không tốn gì, trong khi dầu vẫn phải thay theo tuổi dù xe đứng yên.
 */
function chuKyTheoNam(h: HangMucBaoDuong, kmMoiNam: number): number | null {
  const theoKm = h.chuKyKm !== null && kmMoiNam > 0 ? h.chuKyKm / kmMoiNam : null;
  const theoThang = h.chuKyThang !== null ? h.chuKyThang / 12 : null;
  if (theoKm === null) return theoThang;
  if (theoThang === null) return theoKm;
  return Math.min(theoKm, theoThang);
}

/**
 * Số lần một hạng mục rơi vào năm thứ `nam`.
 *
 * 💡 Đếm bằng hiệu hai phép chia lấy nguyên, không cộng dồn từng năm. Cách này
 *    không tích luỹ sai số làm tròn, và cho đúng kết quả cả khi chu kỳ ngắn hơn
 *    một năm (chạy nhiều thì thay dầu hai lần một năm là chuyện thường).
 */
function soLanTrongNam(chuKy: number, nam: number): number {
  return Math.floor(nam / chuKy) - Math.floor((nam - 1) / chuKy);
}

export function tinhChiPhiSoHuu(input: {
  hangMuc: HangMucBaoDuong[];
  /** `price_list.labor_rate_per_hour` — đồng mỗi giờ. */
  giaCongMoiGio: bigint;
  kmMoiNam: number;
  soNam: number;
}): ChiPhiSoHuu {
  const { hangMuc, giaCongMoiGio, kmMoiNam, soNam } = input;
  const theoNam: ChiPhiMotNam[] = [];
  let tong = 0n;

  for (let nam = 1; nam <= soNam; nam += 1) {
    let tienCong = 0n;
    let tienVatTu = 0n;
    const ten: string[] = [];

    for (const h of hangMuc) {
      const chuKy = chuKyTheoNam(h, kmMoiNam);
      if (chuKy === null || chuKy <= 0) continue;
      const soLan = soLanTrongNam(chuKy, nam);
      if (soLan === 0) continue;

      /*
       * 🔒 Làm tròn Ở TỪNG DÒNG (CLAUDE.md nguyên tắc 3).
       *
       * `gioDinhMuc` là số thập phân (0.80 giờ), nên tiền công một lần phải
       * thành số nguyên đồng TRƯỚC khi nhân số lần. Làm tròn ở tổng sẽ cho ra
       * con số lệch với hoá đơn thật mà xưởng xuất — và cả giá trị của tính năng
       * này nằm ở chỗ hai con số đó khớp nhau.
       */
      const congMotLan = BigInt(Math.round(h.gioDinhMuc * Number(giaCongMoiGio)));
      tienCong += congMotLan * BigInt(soLan);

      for (const v of h.vatTu) {
        const vatTuMotLan = BigInt(Math.round(Number(v.giaBan) * v.soLuong));
        tienVatTu += vatTuMotLan * BigInt(soLan);
      }
      ten.push(h.ten);
    }

    const tongNam = tienCong + tienVatTu;
    tong += tongNam;
    theoNam.push({ nam, tienCong, tienVatTu, tong: tongNam, hangMuc: ten });
  }

  return {
    theoNam,
    tong,
    soNamKhongTon: theoNam.filter((n) => n.tong === 0n).length,
  };
}
