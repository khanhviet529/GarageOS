import { LEAD_STATUS_LABEL, type LeadStatus } from '@garageos/contracts';
import { Check, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Dải trạng thái.
 *
 * 🔒 BỐN BẬC, đúng bằng `LeadStatus`. Bộ thiết kế vẽ năm bậc — thêm "Hẹn lái
 *    thử" và "Chốt". "Hẹn lái thử" là `LeadIntent`, không phải trạng thái; còn
 *    "Chốt" chưa tồn tại ở đâu trong mô hình dữ liệu. Vẽ một bậc mà máy trạng
 *    thái không bao giờ tới được là hứa với người dùng một đường đi không có.
 */
const DUONG_DI: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED'];

export function LeadStatusSteps({ status }: { status: LeadStatus }): React.ReactElement {
  const mat = status === 'LOST';
  const viTri = mat ? -1 : DUONG_DI.indexOf(status);

  return (
    <ol className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-ink-1 px-5 py-4">
      {DUONG_DI.map((b, i) => {
        const xong = !mat && i <= viTri;
        return (
          <li key={b} className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full',
                xong ? 'bg-action text-text-on-action' : 'bg-ink-3 text-text-muted',
              )}
            >
              {xong ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            </span>
            <span className={cn('text-xs', xong ? 'text-text' : 'text-text-muted')}>
              {LEAD_STATUS_LABEL[b]}
            </span>
            {i < DUONG_DI.length - 1 && <span className="mx-2 h-px w-12 bg-ink-3" aria-hidden="true" />}
          </li>
        );
      })}

      {mat && (
        <li className="ml-3 flex items-center gap-2.5 border-l border-line pl-4">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ink-3 text-text-muted">
            <X className="h-3 w-3" />
          </span>
          <span className="text-xs text-text">{LEAD_STATUS_LABEL.LOST}</span>
        </li>
      )}
    </ol>
  );
}
