'use client';

import { PageShell } from '@/components/layout/page-shell';
import { PendingEndpoint } from '@/components/pending-endpoint';

export default function FaqPage(): React.ReactElement {
  return (
    <PageShell title="Câu hỏi thường gặp" subtitle="Nhóm câu hỏi hiển thị trên landing">
      <PendingEndpoint
        moTa="Màn này quản lý các cặp câu hỏi — trả lời theo nhóm, kéo đổi thứ tự và chọn nhóm nào hiện ở trang nào."
        can={[
          'GET/PUT /api/v1/marketing/faq-groups',
          'GET/PUT /api/v1/marketing/faq-groups/:id/items',
        ]}
      />
    </PageShell>
  );
}
