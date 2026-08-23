'use client';

import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/client';

interface MediaItem { id: string; stableKey: string; kind: string; status: string; width: number | null; height: number | null }
export default function MediaPage(): React.ReactElement {
  const media = useQuery({ queryKey: ['marketing-media'], queryFn: () => api<{ items: MediaItem[] }>('/api/v1/marketing/media') });
  return <main className="container"><div className="page-heading"><div><p className="eyebrow">Website</p><h1>Media library</h1><p>Chọn các tài sản đã được pipeline kiểm tra; V1 không nhận URL tự do.</p></div></div>{media.isLoading && <p className="note">Đang tải media…</p>}{media.error && <p className="error" role="alert">{errorMessage(media.error)}</p>}{media.data !== undefined && <table className="table"><thead><tr><th>Asset</th><th>Loại</th><th>Trạng thái</th><th>Kích thước</th></tr></thead><tbody>{media.data.items.map((item) => <tr key={item.id}><td><strong>{item.stableKey}</strong><br /><span className="note">{item.id}</span></td><td>{item.kind}</td><td>{item.status}</td><td>{item.width === null ? '—' : `${item.width} × ${item.height}`}</td></tr>)}</tbody></table>}</main>;
}
