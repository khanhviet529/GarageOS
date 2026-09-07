import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * Ô chỉ số.
 *
 * 🔒 `nguon` KHÔNG PHẢI trang trí — nó là nhãn nguồn của con số, đặt CẠNH CON SỐ
 *    và CÙNG KHỐI (INV-LS-16). Một con số không nói nó đếm trên tập nào thì
 *    người đọc sẽ tự điền giả định, và giả định đó thường sai.
 */
export function MetricCard({
  label,
  value,
  note,
  tone = 'neutral',
  loading = false,
}: {
  label: string;
  value: number | string;
  note: string;
  tone?: 'neutral' | 'ok' | 'warn';
  loading?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg bg-ink-2 p-4">
      <p className="tech-label text-text-muted">{label}</p>
      {loading ? (
        <Skeleton className="h-[34px] w-16" />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="numeric text-[34px] font-semibold leading-none text-text">{value}</span>
          <span
            className={cn(
              'text-[11px]',
              tone === 'ok' && 'text-ok',
              tone === 'warn' && 'text-warn',
              /* Trên ink-2, `--text-muted` đạt 4.5:1; `--text-dim` thì không khi
                 khối được nâng lên ink-3. Dùng muted để một token đúng ở mọi tầng. */
              tone === 'neutral' && 'text-text-muted',
            )}
          >
            {note}
          </span>
        </div>
      )}
    </div>
  );
}
