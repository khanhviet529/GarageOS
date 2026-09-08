'use client';

import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { ACTION_ROLES, ROLE_LABEL, Role, type PermissionAction } from '@garageos/contracts';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { AdminUser } from '@/features/nguoi-dung/api';
import { useAdminUsers, useUserMutations } from '@/features/nguoi-dung/queries';
import { errorMessage } from '@/lib/client';

/**
 * 🔒 Ba quyền "xuất bản" — thứ mà màn này tồn tại để nhìn thấy được.
 *
 * Quyền sửa và quyền công bố tách nhau ở khắp hệ (bài viết, câu hỏi, trang
 * landing, đánh giá). Tách rồi thì phải có một chỗ trả lời được câu "ai duyệt
 * được nội dung ra tên miền của khách" — nếu không, việc tách chỉ tạo thêm
 * bước mà không ai kiểm soát được kết quả.
 */
const QUYEN_XUAT_BAN: PermissionAction[] = [
  'marketing:articlePublish',
  'marketing:landingPublish',
  'marketing:catalogPublish',
];

function duyetDuoc(roles: readonly string[]): boolean {
  return QUYEN_XUAT_BAN.some((q) => roles.some((r) => (ACTION_ROLES[q] as readonly string[]).includes(r)));
}

export default function UsersPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'org:userRead');
  const canWrite = me !== null && hasAction(me.roles, 'org:userRoleWrite');

  const query = useAdminUsers(canRead);
  const actions = useUserMutations();
  const [sua, setSua] = useState<AdminUser | null>(null);
  const [chon, setChon] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = query.data?.items ?? [];

  function mo(u: AdminUser): void {
    setSua(u);
    setChon([...u.roles]);
    setError(null);
  }

  async function luu(): Promise<void> {
    if (sua === null) return;
    setBusy(true);
    try {
      await actions.setRoles.mutateAsync({
        id: sua.id,
        input: { roles: chon as AdminUser['roles'], version: sua.version },
      });
      setSua(null);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Người dùng & quyền"
      subtitle={query.isLoading ? 'Đang tải…' : `${items.length} tài khoản`}
    >
      {error !== null && sua === null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem danh sách người dùng.</Alert>
      ) : query.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="flex max-w-4xl flex-col gap-4">
          {/*
            🔒 Nói thẳng ranh giới của màn này. Không có nút nào sửa được ma trận
               quyền, và đó là chủ ý — ma trận là dữ liệu của hệ thống, có test
               canh từng dòng. Người dùng cần biết điều đó để không đi tìm.
          */}
          <div className="flex gap-2.5 rounded-md bg-ink-2 p-3.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <p className="text-[12px] text-text-muted">
              Màn này gán VAI cho người dùng. Vai nào làm được gì thì do hệ thống định nghĩa và có bài
              kiểm canh từng dòng — không sửa được từ giao diện.
              {!canWrite && ' Chỉ chủ doanh nghiệp mới gán được vai.'}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tài khoản</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {items.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-ink-2 px-3 py-2.5"
                >
                  <span className="text-[13px] text-text">{u.fullName}</span>
                  <span className="numeric text-[11px] text-text-muted">{u.phone}</span>
                  {!u.isActive && <Badge tone="neutral">Đã khoá</Badge>}
                  {u.roles.map((r) => (
                    <Badge key={r} tone={r === 'OWNER' ? 'brand' : 'neutral'}>
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                  {duyetDuoc(u.roles) && <Badge tone="ok">Duyệt xuất bản</Badge>}
                  {u.branchNames.length > 0 && (
                    <span className="text-[11px] text-text-muted">{u.branchNames.join(' · ')}</span>
                  )}
                  <span className="flex-1" />
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => mo(u)}
                      disabled={u.id === me?.userId}
                      /*
                       * 🔒 Không tự đổi vai của chính mình — máy chủ cũng chặn.
                       *    Ở đây làm mờ nút kèm lời giải thích, để người dùng
                       *    không bấm rồi nhận một lỗi khó hiểu.
                       */
                      title={u.id === me?.userId ? 'Không tự đổi vai của chính mình' : undefined}
                    >
                      Đổi vai
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={sua !== null} onOpenChange={(v) => !v && setSua(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi vai — {sua?.fullName}</DialogTitle>
            <DialogDescription>
              Người dùng có thể giữ nhiều vai. Quyền là hợp của mọi vai họ giữ.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 px-5 py-4">
            {error !== null && (
              <Alert tone="danger" className="mb-2">
                {error}
              </Alert>
            )}
            {Role.options.map((r) => (
              <div key={r} className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2">
                <Label htmlFor={`vai-${r}`} className="font-normal">
                  {ROLE_LABEL[r]}
                </Label>
                <Switch
                  id={`vai-${r}`}
                  checked={chon.includes(r)}
                  onCheckedChange={(v) =>
                    setChon((cu) => (v ? [...new Set([...cu, r])] : cu.filter((x) => x !== r)))
                  }
                />
              </div>
            ))}
            {chon.length === 0 && (
              <p className="mt-1 text-[11px] text-warn">
                Phải giữ ít nhất một vai — tài khoản không vai nào thì đăng nhập được mà không làm được gì.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSua(null)} disabled={busy}>
              Huỷ
            </Button>
            <Button onClick={() => void luu()} disabled={busy || chon.length === 0}>
              {busy ? 'Đang lưu…' : 'Lưu vai'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
