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
 * Mã truy cập KHÔNG phải mã đơn, và cũng KHÔNG phải một đoạn mã ngắn dễ nhớ.
 *
 * ⚠️ Bản đầu của trang này ghi "Ví dụ: A1B2C3D4" và "Không phân biệt chữ
 *    hoa/thường". Cả hai đều sai, và sai theo cách tệ nhất — chúng mô tả một
 *    hệ thống KHÔNG TỒN TẠI:
 *
 *      · token thật do `randomBytes(32).toString('base64url')` sinh ra, dài 43
 *        ký tự; `resolveToken` từ chối thẳng mọi chuỗi dưới 32. Ai gõ theo đúng
 *        cái ví dụ 8 ký tự đó đều thất bại.
 *      · `public_resolve_tracking_token` so khớp bằng `=`, tức PHÂN BIỆT hoa
 *        thường. Khách gõ lại bằng chữ thường thì nhận "link không hợp lệ" mà
 *        không hiểu vì sao.
 *
 * 💡 Một lời hứa trên giao diện là một hợp đồng. Hứa điều hệ thống không làm
 *    thì người dùng không kết luận "trang này viết sai", họ kết luận "hệ thống
 *    này hỏng".
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function TraCuuLanding() {
  const [ma, setMa] = useState('');
  const router = useRouter();

  /*
   * 🔒 Độ dài tối thiểu khớp với máy chủ, không phải một con số tự nghĩ ra.
   *
   * `PublicTrackingService.resolveToken` từ chối thẳng mọi chuỗi dưới 32 ký tự,
   * và token thật do `randomBytes(32).toString('base64url')` sinh ra — 43 ký tự.
   * Kiểm ở đây chỉ để nói sớm và nói rõ; chặn thật vẫn ở máy chủ.
   */
  const DAI_TOI_THIEU = 32;
  const daSap = ma.trim();
  const quaNgan = daSap !== '' && daSap.length < DAI_TOI_THIEU;

  function di(e: FormEvent): void {
    e.preventDefault();
    if (daSap === '' || quaNgan) return;
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
              placeholder="Dán mã từ tin nhắn hoặc giấy bàn giao"
              aria-describedby="ma-truy-cap-hint"
            />
            <span className="hint" id="ma-truy-cap-hint">
              Mã dài, nên <strong>dán</strong> thay vì gõ tay. Phân biệt chữ hoa và chữ
              thường.
            </span>
          </div>
          {quaNgan && (
            <p className="alert error">
              Mã này quá ngắn — mã truy cập dài {DAI_TOI_THIEU} ký tự trở lên. Kiểm tra
              xem đã dán thiếu phần đầu hoặc phần cuối chưa.
            </p>
          )}
          <button className="lg" type="submit" disabled={daSap === '' || quaNgan}>
            Xem đơn
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Khách hàng đã từng vào xưởng?</h3>
        <p className="muted small">
          Khi garage gửi link, bạn theo dõi được tiến độ sửa chữa, xem báo giá và
          duyệt từng hạng mục ngay tại đây.
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
