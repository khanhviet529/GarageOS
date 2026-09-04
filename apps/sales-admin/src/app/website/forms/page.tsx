'use client';

import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { PendingEndpoint } from '@/components/pending-endpoint';

export default function FormsPage(): React.ReactElement {
  return (
    <PageShell title="Biểu mẫu & lead" subtitle="Cấu hình biểu mẫu thu nhu cầu khách trên landing">
      <PendingEndpoint
        moTa="Màn này khai các trường của biểu mẫu đăng ký lái thử và nhận báo giá, cùng nội dung câu đồng ý liên hệ đi kèm."
        can={[
          'GET/PUT /api/v1/marketing/lead-forms',
          'GET /api/v1/marketing/lead-forms/:id/consent-versions',
        ]}
        tamThoi={
          <>
            Nhu cầu khách gửi lên vẫn nhận và xử lý bình thường ở{' '}
            <Link href="/leads" className="text-brand hover:underline">
              Leads
            </Link>
            ; chỉ phần cấu hình biểu mẫu là chưa có.
          </>
        }
      />
    </PageShell>
  );
}
