'use client';

import { PageShell } from '@/components/layout/page-shell';
import { PendingEndpoint } from '@/components/pending-endpoint';

export default function BanksPage(): React.ReactElement {
  return (
    <PageShell title="Ngân hàng liên kết" subtitle="Mẫu ưu đãi trả góp dùng lại cho nhiều mẫu xe">
      <PendingEndpoint
        moTa="Màn này khai danh sách ngân hàng và các mẫu chương trình trả góp dùng chung, để từng mẫu xe chọn lại thay vì khai lặp lãi suất ở mọi nơi."
        can={[
          'GET/PUT /api/v1/showroom/financing-programs',
        ]}
        tamThoi={
          <>
            Hiện chương trình trả góp khai theo từng bản sửa của mẫu xe
            (<span className="numeric">PUT /showroom/revisions/:id/financing</span>), nên cùng một chương trình
            phải nhập lại cho mỗi xe — và khi lãi suất đổi thì phải sửa ở từng chỗ.
          </>
        }
      />
    </PageShell>
  );
}
