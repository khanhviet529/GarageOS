'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/client';
import { queryKeys } from '@/lib/query/keys';
import { landingPagesApi } from '@/features/landing-builder/api';
import { useLandingPages } from '@/features/landing-builder/queries';

export default function WebsitePages(): React.ReactElement {
  const pages = useLandingPages();
  const client = useQueryClient();
  const create = useMutation({ mutationFn: landingPagesApi.createHome, onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.landingPages() }) });
  return <main className="container">
    <div className="page-heading"><div><p className="eyebrow">Website</p><h1>Landing pages</h1><p>Chỉ nội dung đã publish mới hiển thị công khai.</p></div>{pages.data?.length === 0 && <button className="btn" onClick={() => create.mutate()}>Tạo homepage</button>}</div>
    {pages.isLoading && <p className="note">Đang tải landing pages…</p>}
    {pages.error && <p className="error" role="alert">{errorMessage(pages.error)}</p>}
    {create.error && <p className="error" role="alert">{errorMessage(create.error)}</p>}
    {pages.data !== undefined && pages.data.length > 0 && <table className="table"><thead><tr><th>Trang</th><th>Draft</th><th>Published</th><th /></tr></thead><tbody>{pages.data.map((page) => <tr key={page.id}><td><strong>{page.slug === '/' ? 'Homepage' : page.slug}</strong></td><td>{page.draft === null ? '—' : `v${page.draft.revisionNumber}`}</td><td>{page.published === null ? 'Chưa publish' : `v${page.published.revisionNumber}`}</td><td><Link href={`/website/pages/${page.id}/edit`}>Mở builder</Link></td></tr>)}</tbody></table>}
  </main>;
}
