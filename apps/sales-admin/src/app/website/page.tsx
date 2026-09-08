'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Plus } from 'lucide-react';
import Link from 'next/link';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';
import { landingPagesApi } from '@/features/landing-builder/api';
import { useLandingPages } from '@/features/landing-builder/queries';
import { errorMessage } from '@/lib/client';
import { queryKeys } from '@/lib/query/keys';

export default function WebsitePages(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:landingRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:landingWrite');

  const pages = useLandingPages(canRead);
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: landingPagesApi.createHome,
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.landingPages() }),
  });

  const items = pages.data ?? [];
  const soNhap = items.filter((p) => p.draft !== null).length;
  const chuaDang = items.filter((p) => p.published === null);

  return (
    <PageShell
      title="Trang & điều hướng"
      subtitle={
        pages.isLoading
          ? 'Đang tải…'
          : `${items.length} trang${soNhap > 0 ? ` · ${soNhap} bản nháp` : ''}`
      }
      actions={
        canWrite &&
        items.length === 0 && (
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-[15px] w-[15px]" />
            Tạo trang chủ
          </Button>
        )
      }
    >
      {pages.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(pages.error)}
        </Alert>
      )}
      {create.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(create.error)}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem trang website.</Alert>
      ) : pages.isLoading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {/*
           * ═══════════════════════════════════════════════════════════════
           * 🔒 TRANG CHƯA XUẤT BẢN THÌ MỌI ĐƯỜNG DẪN TỚI NÓ ĐANG TỰ ẨN.
           *
           * Không vẽ nó như một mục bình thường. Người biên tập nhìn danh
           * sách và thấy "Khuyến mãi tháng 9" nằm đó sẽ tin là khách vào
           * được — trong khi landing bỏ qua mọi mục trỏ tới bản nháp. Cái
           * bẫy ở đây là sự IM LẶNG: không có lỗi, không có cảnh báo, chỉ
           * là một mục menu không bao giờ xuất hiện.
           *
           * Nên: màu cảnh báo, icon mắt gạch, và nói thẳng ra bằng chữ.
           * ═══════════════════════════════════════════════════════════════
           */}
          {chuaDang.length > 0 && (
            <Alert tone="warn" className="items-start">
              <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">
                  {chuaDang.length} trang chưa xuất bản đang tự ẩn khỏi điều hướng
                </span>
                <span className="mt-0.5 block text-xs">
                  Mọi mục menu trỏ tới các trang này sẽ không hiện trên landing cho tới khi chúng được xuất
                  bản: {chuaDang.map((p) => p.slug).join(' · ')}
                </span>
              </span>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Trang của website</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-text-muted">
                  Chưa có trang nào. Tạo trang chủ để bắt đầu.
                </p>
              ) : (
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead pinned className="bg-ink-1">
                          Trang
                        </TableHead>
                        <TableHead>Đường dẫn</TableHead>
                        <TableHead>Bản nháp</TableHead>
                        <TableHead>Đã xuất bản</TableHead>
                        <TableHead>Trạng thái điều hướng</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((page) => {
                        const daDang = page.published !== null;
                        return (
                          <TableRow key={page.id}>
                            <TableCell pinned className="bg-ink-1 text-text">
                              {page.slug === '/' ? 'Trang chủ' : page.slug}
                            </TableCell>
                            <TableCell className="numeric text-text-muted">{page.slug}</TableCell>
                            <TableCell className="numeric text-text-muted">
                              {page.draft === null ? '—' : `v${page.draft.revisionNumber}`}
                            </TableCell>
                            <TableCell className="numeric text-text-muted">
                              {page.published === null ? (
                                <span className="text-warn">chưa xuất bản</span>
                              ) : (
                                `v${page.published.revisionNumber}`
                              )}
                            </TableCell>
                            <TableCell>
                              {daDang ? (
                                <Badge tone="ok">Hiện trên landing</Badge>
                              ) : (
                                <Badge tone="warn" dot={false}>
                                  <EyeOff className="h-3 w-3 shrink-0" />
                                  Đang tự ẩn
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/website/pages/${page.id}/edit`}
                                className="text-xs text-brand hover:underline"
                              >
                                Mở trình soạn →
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Menu đầu trang và chân trang</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <p className="text-xs text-text-muted">
                Sắp xếp mục menu đầu trang, hai cột liên kết ở chân trang, và bảng chuyển hướng URL khi
                đổi đường dẫn một trang.
              </p>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/website/navigation">Mở Menu &amp; chuyển hướng</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
