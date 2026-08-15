import { execFileSync } from 'node:child_process';

/**
 * Seed lại database TRƯỚC mỗi lượt E2E.
 *
 * 🔒 Vì sao cần: nhiều kịch bản GHI dữ liệu — xếp lịch, bấm giờ, nhập kho, báo
 * phát sinh. Chạy lượt thứ hai trên dữ liệu của lượt thứ nhất thì:
 *
 *  · Kịch bản xếp lịch đụng `no_bay_overlap` / `no_technician_overlap` với
 *    chính phân công nó tạo ra lần trước
 *  · Người thợ mà nó chọn đã bận, nên ô chọn bị vô hiệu và `selectOption` treo
 *    tới hết timeout — thông báo lỗi ("Test timeout") không nói gì về nguyên
 *    nhân thật
 *
 * Đã mắc đúng lỗi này khi thêm app thợ: bộ E2E xanh ở lượt đầu, đỏ ở lượt hai,
 * và triệu chứng nằm ở một kịch bản chẳng liên quan gì tới thay đổi vừa làm.
 *
 * Chạy đồng bộ và để lỗi ném ra ngoài: seed hỏng mà vẫn chạy tiếp thì cả bộ
 * test đo trên dữ liệu sai — tệ hơn là không chạy.
 */
export default async function globalSetup(): Promise<void> {
  const bo = process.env.E2E_SKIP_SEED === '1';
  if (bo) {
    console.log('[e2e] E2E_SKIP_SEED=1 — bỏ qua seed, dữ liệu có thể không sạch');
  } else {
    console.log('[e2e] Seed lại database…');
    execFileSync('pnpm', ['db:seed'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  }
  await hamNongRoute();
}

/**
 * Gọi trước mỗi route của landing để Next kịp biên dịch.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ `next dev` biên dịch LƯỜI: route chỉ được build ở lần truy cập đầu tiên.
 *    Lần đó có thể mất hàng chục giây, và bài kiểm đầu tiên chạm vào trang chủ
 *    sẽ hết thời gian chờ. Triệu chứng đúng kiểu tệ nhất:
 *
 *      · lượt chạy đầu sau khi khởi động lại  -> LD-E01 đỏ
 *      · lượt chạy ngay sau đó                -> 7/7 xanh
 *
 *    Cùng một commit, hai kết quả — đúng loại nhập nhằng đã tốn cả buổi để truy
 *    ở phía API (xem `apps/api/test/_don-doan-gio.ts`).
 *
 * 💡 CI KHÔNG dính lỗi này vì nó chạy `pnpm start` trên bản đã build. Tức là
 *    một báo động giả chỉ xảy ra ở máy người phát triển — loại phiền toái mà
 *    người ta học cách bỏ qua, và rồi bỏ qua luôn một lỗi thật.
 *
 * Lỗi mạng ở đây KHÔNG chặn: app có thể chưa chạy, và chính bài kiểm sẽ nói ra
 * điều đó rõ hơn nhiều so với một stack trace từ bước chuẩn bị.
 */
async function hamNongRoute(): Promise<void> {
  const goc = process.env.LANDING_URL ?? 'http://localhost:3003';
  const duong = ['/', '/xe', '/lien-he'];
  await Promise.all(
    duong.map(async (d) => {
      try {
        await fetch(`${goc}${d}`, { signal: AbortSignal.timeout(60_000) });
      } catch {
        /* app chưa chạy — để bài kiểm báo, không báo ở đây */
      }
    }),
  );
}
