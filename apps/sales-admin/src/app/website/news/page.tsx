'use client';

import { PageShell } from '@/components/layout/page-shell';
import { PendingEndpoint } from '@/components/pending-endpoint';

export default function NewsPage(): React.ReactElement {
  return (
    <PageShell title="Tin tức" subtitle="Bài viết hiển thị trên landing">
      <PendingEndpoint
        moTa="Màn này quản lý danh sách bài viết trên landing: soạn, sắp xếp, đặt ảnh bìa và xuất bản theo cùng luồng nháp/duyệt như trang và mẫu xe."
        can={[
          'GET/POST /api/v1/marketing/articles',
          'GET/PATCH /api/v1/marketing/articles/:id/draft',
          'POST /api/v1/marketing/articles/:id/publish',
        ]}
        tamThoi={
          <>
            Trong lúc chờ, nội dung dạng bài có thể đặt bằng khối “Nội dung biên tập” trong Trình soạn trang chủ —
            khối đó dùng cùng trình soạn có cấu trúc và cùng luồng xuất bản.
          </>
        }
      />
    </PageShell>
  );
}
