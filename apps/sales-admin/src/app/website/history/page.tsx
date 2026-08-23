'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/client';
import { useLandingPages, useLandingRevisions } from '@/features/landing-builder/queries';

export default function PublicationHistoryPage(): React.ReactElement {
  const pages = useLandingPages();
  const [selected, setSelected] = useState<string | null>(null);
  const pageId = selected ?? pages.data?.[0]?.id ?? '';
  const revisions = useLandingRevisions(pageId);
  return <main className="container"><div className="page-heading"><div><p className="eyebrow">Website</p><h1>Lịch sử xuất bản</h1><p>Published revisions là bất biến; rollback luôn tạo publication mới.</p></div></div>{pages.error && <p className="error">{errorMessage(pages.error)}</p>}{pages.data !== undefined && pages.data.length > 1 && <label>Trang <select value={pageId} onChange={(event) => setSelected(event.target.value)}>{pages.data.map((page) => <option key={page.id} value={page.id}>{page.slug}</option>)}</select></label>}{revisions.isLoading && <p className="note">Đang tải lịch sử…</p>}{revisions.error && <p className="error">{errorMessage(revisions.error)}</p>}{revisions.data !== undefined && <table className="table"><thead><tr><th>Revision</th><th>Trạng thái</th><th>Ngày tạo</th><th>Published</th></tr></thead><tbody>{revisions.data.map((revision) => <tr key={revision.id}><td>v{revision.revisionNumber}</td><td>{revision.status}</td><td>{new Date(revision.createdAt).toLocaleString('vi-VN')}</td><td>{revision.publishedAt === null ? '—' : new Date(revision.publishedAt).toLocaleString('vi-VN')}</td></tr>)}</tbody></table>}</main>;
}
