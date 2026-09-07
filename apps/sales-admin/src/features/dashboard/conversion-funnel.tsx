import { LEAD_STATUS_LABEL, type LeadStatus } from '@garageos/contracts';

/*
 * Phễu chuyển đổi.
 *
 * 🔒 Chỉ bốn trạng thái CÓ THẬT trong `LeadStatus`. Bộ thiết kế vẽ một bậc "Hẹn
 *    lái thử" — mô hình dữ liệu không có bậc đó, và bịa ra một bậc rỗng để khớp
 *    hình vẽ là cách một biểu đồ nói dối. Xem báo cáo cuối, mục trường còn thiếu.
 */
const BAC: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'];

export function ConversionFunnel({ dem }: { dem: Record<LeadStatus, number> }): React.ReactElement {
  const goc = Math.max(1, dem.NEW);

  return (
    <section className="rounded-lg border border-line bg-ink-1 p-5">
      <p className="tech-label mb-3.5 text-text-dim">Phễu chuyển đổi</p>
      <div className="flex flex-col gap-3">
        {BAC.map((status) => {
          const n = dem[status];
          const phanTram = Math.round((n / goc) * 100);
          return (
            <div key={status}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-text">{LEAD_STATUS_LABEL[status]}</span>
                <span className="numeric text-xs text-text-muted">
                  {n} · {phanTram}%
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-ink-3"
                role="img"
                aria-label={`${LEAD_STATUS_LABEL[status]}: ${n} lead, ${phanTram}% so với lead mới`}
              >
                <div
                  className={status === 'LOST' ? 'h-full bg-text-muted' : 'h-full bg-brand'}
                  style={{ width: `${Math.min(100, phanTram)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3.5 text-[11px] text-text-muted">
        Tỉ lệ tính trên số lead mới trong cùng tập dữ liệu.
      </p>
    </section>
  );
}
