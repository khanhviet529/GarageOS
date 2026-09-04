'use client';

import { Lock } from 'lucide-react';
import { useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';
import { useLandingPages, useLandingRevisions } from '@/features/landing-builder/queries';
import { errorMessage } from '@/lib/client';
import { gioPhut, ngay } from '@/lib/format';

export default function PublicationHistoryPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:landingRead');

  const pages = useLandingPages(canRead);
  const [selected, setSelected] = useState<string | null>(null);
  const pageId = selected ?? pages.data?.[0]?.id ?? '';
  const revisions = useLandingRevisions(pageId);

  const items = revisions.data ?? [];

  return (
    <PageShell
      title="Lịch sử xuất bản"
      subtitle={revisions.isLoading ? 'Đang tải…' : `${items.length} bản đã ghi nhận`}
      actions={
        (pages.data?.length ?? 0) > 1 && (
          <Select value={pageId} onValueChange={setSelected}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(pages.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.slug === '/' ? 'Trang chủ' : p.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    >
      {pages.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(pages.error)}
        </Alert>
      )}
      {revisions.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(revisions.error)}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem lịch sử xuất bản.</Alert>
      ) : revisions.isLoading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {/*
           * 🔒 Bản đã xuất bản là BẤT BIẾN. Quay lui không sửa bản cũ — nó tạo
           *    một lần xuất bản MỚI mang nội dung cũ. Nói ra điều này ở đây,
           *    vì một danh sách "lịch sử" thường được đọc như một thứ có thể
           *    sửa được.
           */}
          <Alert className="items-start">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Bản đã xuất bản không sửa và không xoá được. Quay lui một bản cũ sẽ tạo thêm một lần xuất bản
              mới mang nội dung cũ — lịch sử chỉ dài thêm, không bao giờ ngắn đi.
            </span>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Các bản của trang</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-text-muted">
                  Trang này chưa có bản nào được xuất bản.
                </p>
              ) : (
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead pinned className="bg-ink-1">
                          Bản
                        </TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Tạo lúc</TableHead>
                        <TableHead>Xuất bản lúc</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell pinned className="numeric bg-ink-1 text-text">
                            v{r.revisionNumber}
                          </TableCell>
                          <TableCell>
                            <Badge tone={r.status === 'PUBLISHED' ? 'ok' : 'neutral'}>
                              {r.status === 'PUBLISHED' ? 'Đã xuất bản' : r.status === 'DRAFT' ? 'Bản nháp' : r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="numeric text-text-muted">
                            {ngay(r.createdAt)} {gioPhut(r.createdAt)}
                          </TableCell>
                          <TableCell className="numeric text-text-muted">
                            {r.publishedAt === null ? '—' : `${ngay(r.publishedAt)} ${gioPhut(r.publishedAt)}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
