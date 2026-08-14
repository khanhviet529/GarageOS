'use client';

/**
 * Trang tra cứu công khai — bước ĐẦU TIÊN của khách.
 *
 * Khách mở trang này vì hai lý do:
 *  1. Bấm từ link trong tin nhắn của garage → đã có token → /tra-cuu/[token].
 *  2. Gõ tay địa chỉ /tra-cuu → CHƯA có token → trang này phải hỏi mã.
 *
 * Trước trang này, route /tra-cuu trả 404 — khách thấy trang trắng của Next
 * rồi tưởng hệ thống hỏng. Đây là lối vào mà khoảng 60–80% khách truy cập
 * theo kiểu (2): cố vấn gửi link qua Zalo nhưng khách gõ lại địa chỉ thay
 * vì bấm, hoặc garage dán mã QR trên thẻ bàn giao.
 *
 * Mã truy cập KHÔNG phải mã đơn. Khách không nhớ được "RO-2026-00042" — họ
 * nhớ được đoạn mã ngắn mà garage đã in trên giấy. Comment ở đây để nhắc
 * nhở người đọc: ĐỪNG bao giờ thay ô nhập này bằng ô nhập mã đơn.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { formatPlate } from '@garageos/domain';

export default function TraCuuLanding() {
  const [ma, setMa] = useState('');
  const router = useRouter();

  function di(e: FormEvent): void {
    e.preventDefault();
    const daSap = ma.trim();
    if (daSap === '') return;
    router.push(`/tra-cuu/${encodeURIComponent(daSap)}`);
  }

  return (
    <main className="public">
      <header className="public-header">
        <div className="garage">GarageOS</div>
        <div className="plate mono">Tra cứu đơn</div>
      </header>

      <div className="card stack">
        <h2>Nhập mã truy cập</h2>
        <p className="muted">
          Mã gồm chữ và số, garage in trên giấy bàn giao hoặc gửi kèm liên kết
          trong tin nhắn.
        </p>

        <form onSubmit={di} className="stack">
          <div className="field">
            <label htmlFor="ma-truy-cap">Mã truy cập <span className="req">*</span></label>
            <input
              id="ma-truy-cap"
              className="otp"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={ma}
              onChange={(e) => setMa(e.target.value)}
              placeholder="Ví dụ: A1B2C3D4"
              aria-describedby="ma-truy-cap-hint"
            />
            <span className="hint" id="ma-truy-cap-hint">
              Gõ hoặc dán mã, rồi nhấn <span className="kbd">Enter</span>. Không phân biệt
              chữ hoa/thường.
            </span>
          </div>
          <button className="lg" type="submit" disabled={ma.trim() === ''}>
            Xem đơn
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Khách hàng đã từng vào xưởng?</h3>
        <p className="muted small">
          Xe {formatPlate('30A-123.45')} vừa được tiếp nhận — theo dõi tiến độ, xem
          báo giá và duyệt hạng mục ngay tại đây khi garage gửi.
        </p>
        <p className="muted small">
          Nếu bạn là nhân viên garage, hãy <a href="/dang-nhap">đăng nhập</a> để dùng
          bảng điều khiển đầy đủ.
        </p>
      </div>

      <p className="public-foot">
        © {new Date().getFullYear()} GarageOS · Hệ thống quản lý xưởng dịch vụ ô tô
      </p>
    </main>
  );
}
