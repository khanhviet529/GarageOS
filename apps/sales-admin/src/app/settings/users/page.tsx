'use client';

import { PageShell } from '@/components/layout/page-shell';
import { PendingEndpoint } from '@/components/pending-endpoint';

export default function UsersPage(): React.ReactElement {
  return (
    <PageShell title="Người dùng & quyền" subtitle="Vai trò và quyền xuất bản">
      <PendingEndpoint
        moTa="Màn này xem ai đang có vai trò nào, và đặc biệt là ai có quyền xuất bản — quyền tách khỏi quyền sửa, nên cần một chỗ nhìn thấy được ai duyệt được nội dung."
        can={[
          'GET /api/v1/admin/users',
          'PUT /api/v1/admin/users/:id/roles',
        ]}
        tamThoi={
          <>
            🔒 Ma trận quyền là dữ liệu của hệ thống, không phải của giao diện: nó nằm ở
            <span className="numeric"> packages/contracts/src/permissions.ts</span> và được service kiểm bằng
            <span className="numeric"> assertCan</span>. Màn này khi có sẽ chỉ ĐỌC và gán vai trò, không định
            nghĩa lại quyền.
          </>
        }
      />
    </PageShell>
  );
}
