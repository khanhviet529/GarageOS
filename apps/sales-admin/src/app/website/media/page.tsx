'use client';

import { useQuery } from '@tanstack/react-query';
import { ImageIcon, ShieldCheck } from 'lucide-react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/client';

interface MediaItem {
  id: string;
  stableKey: string;
  kind: string;
  status: string;
  width: number | null;
  height: number | null;
}

export default function MediaPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:mediaRead');

  const media = useQuery({
    queryKey: ['marketing-media'],
    queryFn: () => api<{ items: MediaItem[] }>('/api/v1/marketing/media'),
    enabled: canRead,
  });

  const items = media.data?.items ?? [];

  return (
    <PageShell
      title="Thư viện ảnh"
      subtitle={media.isLoading ? 'Đang tải…' : `${items.length} tệp đã qua kiểm tra`}
    >
      {media.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(media.error)}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem thư viện ảnh.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {/*
           * 🔒 Không có ô "dán URL ảnh vào đây". Ảnh chỉ đến từ pipeline đã kiểm
           *    tra — một URL tự do là đường để nội dung ngoài tầm kiểm soát xuất
           *    hiện trên tên miền của khách, và là một kênh rò rỉ thông tin
           *    người xem sang máy chủ lạ.
           */}
          <Alert className="items-start">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Chỉ dùng được tệp đã qua pipeline kiểm tra. Không có ô nhập URL tự do — ảnh từ máy chủ lạ vừa
              nằm ngoài tầm kiểm soát nội dung, vừa để lộ thông tin người xem sang nơi khác.
            </span>
          </Alert>

          {media.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-[4/3] w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-line bg-ink-1 px-5 py-12 text-center">
              <p className="text-[13px] text-text">Thư viện chưa có tệp nào.</p>
              <p className="mt-1 text-xs text-text-muted">
                Tệp được nạp qua `pnpm media:import`, không tải lên trực tiếp từ màn này.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <figure key={item.id} className="m-0 overflow-hidden rounded-lg border border-line bg-ink-1">
                  <div className="flex aspect-[4/3] items-center justify-center bg-ink-2">
                    <ImageIcon className="h-6 w-6 text-text-muted" />
                  </div>
                  <figcaption className="flex flex-col gap-1.5 p-3">
                    <span className="truncate text-[13px] text-text">{item.stableKey}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={item.status === 'READY' ? 'ok' : 'warn'}>{item.status}</Badge>
                      <span className="numeric text-[11px] text-text-muted">
                        {item.width === null ? item.kind : `${item.width} × ${item.height}`}
                      </span>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
