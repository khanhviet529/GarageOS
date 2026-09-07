'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
    <div className="flex flex-col gap-2.5">
      <p className="nhan-ky-thuat">Thêm ảnh hiện trạng</p>

      <div className="row">
        <div className="field">
          <label htmlFor="anh-giai-doan">Giai đoạn</label>
          <select
            id="anh-giai-doan"
            className="w-auto"
            value={phase}
            onChange={(e) => {
              setPhase(e.target.value);
            }}
            disabled={dangTai}
          >
            <option value="INTAKE">Lúc tiếp nhận</option>
            <option value="DIAGNOSIS">Khi chẩn đoán</option>
            <option value="IN_PROGRESS">Đang sửa</option>
            <option value="AFTER">Sau khi sửa</option>
            <option value="DELIVERY">Lúc giao xe</option>
          </select>
        </div>

        <div className="field min-w-[200px] flex-1">
          <label htmlFor="anh-ghi-chu">Ghi chú (tuỳ chọn)</label>
          <input
            id="anh-ghi-chu"
            type="text"
            value={caption}
            maxLength={500}
            placeholder="Ví dụ: vết trầy cửa trái"
            onChange={(e) => {
              setCaption(e.target.value);
            }}
            disabled={dangTai}
          />
        </div>
      </div>

      {/*
        Vùng kéo thả của khung `KIT — Ô nhập & xác thực`: viền nét đứt, icon,
        một dòng nói định dạng và giới hạn. Cả khối là một `<label>` nên bấm ở
        đâu cũng mở được bộ chọn tệp, và ô `<input type="file">` thật vẫn nằm
        trong đó cho bàn phím và trình đọc màn hình.

        `capture="environment"` mở thẳng camera sau trên điện thoại. Người dùng
        thật của ô này đang đứng cạnh chiếc xe, không ngồi trước máy tính — bắt
        họ chụp rồi đi tìm file trong thư viện là thêm hai bước đủ để việc đó
        không xảy ra.
      */}
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-dashed border-line-strong px-4 py-[18px] text-center transition-colors',
          dangTai ? 'cursor-not-allowed opacity-100' : 'hover:border-text-dim hover:bg-ink-2',
        )}
      >
        <Camera className="size-[18px] text-text-dim" aria-hidden />
        <span className="text-12 font-medium text-text-muted">Bấm để chụp hoặc chọn ảnh</span>
        <span className="nhan-ky-thuat">JPG, PNG, WebP · tối đa 8 MB mỗi tệp</span>
        <input
          ref={oFile}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={dangTai}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f !== undefined) void chon(f);
          }}
        />
      </label>

      {dangTai && (
        <p className="text-12 text-text-dim" role="status">
          Đang tải ảnh lên…
        </p>
      )}
      {loi !== null && (
        <p className="alert error" role="alert">
          {loi}
        </p>
      )}
    </div>
  );
}
