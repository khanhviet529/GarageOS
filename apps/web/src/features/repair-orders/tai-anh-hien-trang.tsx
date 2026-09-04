'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Tải ảnh hiện trạng lên — BC-01 bước 6.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Ảnh là bằng chứng mạnh nhất khi khách khiếu nại một vết trầy không do xưởng
 * gây ra. Suốt bốn phase, ô ảnh trên màn này luôn rỗng và có một dòng cảnh báo
 * nói "chức năng tải ảnh nằm ở lát cắt tiếp theo" — trung thực, nhưng cái giá
 * là mỗi tranh chấp trong khoảng đó đều không có trọng tài.
 */

const LOAI_CHO_PHEP = ['image/jpeg', 'image/png', 'image/webp'] as const;
const TRAN_BYTE = 8 * 1024 * 1024;

interface Props {
  orderId: string;
  onXong: () => void;
}

export function TaiAnhHienTrang({ orderId, onXong }: Props): React.ReactElement {
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [phase, setPhase] = useState('INTAKE');
  const [caption, setCaption] = useState('');
  const oFile = useRef<HTMLInputElement>(null);

  async function chon(file: File): Promise<void> {
    setLoi(null);

    /*
     * 🔒 Kiểm ở đây là để NÓI SỚM, không phải để bảo vệ.
     *
     * Máy chủ kiểm lại cả loại lẫn chữ ký nội dung (`laAnhThat`), vì mọi thứ
     * trình duyệt gửi đều sửa được. Nhưng bắt người dùng chờ tải xong 8 MB rồi
     * mới báo "sai định dạng" là lãng phí thời gian của họ.
     */
    if (!LOAI_CHO_PHEP.includes(file.type as (typeof LOAI_CHO_PHEP)[number])) {
      setLoi('Chỉ nhận ảnh JPEG, PNG hoặc WebP. Ảnh chụp từ điện thoại luôn hợp lệ.');
      return;
    }
    if (file.size > TRAN_BYTE) {
      setLoi(
        `Ảnh nặng ${(file.size / 1024 / 1024).toFixed(1)} MB, vượt mức 8 MB. ` +
          'Chụp lại ở độ phân giải thấp hơn hoặc dùng ảnh đã nén.',
      );
      return;
    }

    setDangTai(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let nhiPhan = '';
      for (const b of bytes) nhiPhan += String.fromCharCode(b);

      await api.taiAnhHienTrang(orderId, {
        phase,
        contentType: file.type,
        dataBase64: btoa(nhiPhan),
        ...(caption.trim() === '' ? {} : { caption: caption.trim() }),
      });
      setCaption('');
      if (oFile.current !== null) oFile.current.value = '';
      onXong();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không tải được ảnh, thử lại giúp tôi');
    } finally {
      setDangTai(false);
    }
  }

  return (
    <div className="stack" style={{ marginTop: 12, gap: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          Giai đoạn
          <select
            value={phase}
            onChange={(e) => { setPhase(e.target.value); }}
            disabled={dangTai}
          >
            <option value="INTAKE">Lúc tiếp nhận</option>
            <option value="DIAGNOSIS">Khi chẩn đoán</option>
            <option value="IN_PROGRESS">Đang sửa</option>
            <option value="AFTER">Sau khi sửa</option>
            <option value="DELIVERY">Lúc giao xe</option>
          </select>
        </label>

        <label style={{ flex: 1, minWidth: 200 }}>
          Ghi chú (tuỳ chọn)
          <input
            type="text"
            value={caption}
            maxLength={500}
            placeholder="Ví dụ: vết trầy cửa trái"
            onChange={(e) => { setCaption(e.target.value); }}
            disabled={dangTai}
          />
        </label>

        <label>
          {/*
            `capture="environment"` mở thẳng camera sau trên điện thoại. Người
            dùng thật của ô này đang đứng cạnh chiếc xe, không ngồi trước máy
            tính — bắt họ chụp rồi tìm file trong thư viện là thêm hai bước đủ
            để việc đó không xảy ra.
          */}
          <span className="sr-only">Chọn ảnh hiện trạng</span>
          <input
            ref={oFile}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={dangTai}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f !== undefined) void chon(f);
            }}
          />
        </label>
      </div>

      {dangTai && <p className="muted small" role="status">Đang tải ảnh lên…</p>}
      {loi !== null && <p className="alert error" role="alert">{loi}</p>}
    </div>
  );
}
