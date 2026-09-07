'use client';

import { KeyRound, Phone } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/client';

export default function LoginPage(): React.ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          phone: String(form.get('phone') ?? '').trim(),
          password: String(form.get('password') ?? ''),
        }),
      });
      window.location.assign('/');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,880fr)_minmax(420px,560fr)]">
      {/* Nửa trái chỉ có mặt trên màn rộng: trên điện thoại nó đẩy form đăng
          nhập xuống dưới màn hình đầu tiên, và người dùng phải cuộn để làm việc
          duy nhất họ tới đây để làm. */}
      <section className="hidden flex-col justify-end gap-3 bg-ink-2 p-12 lg:flex" aria-hidden="true">
        <p className="max-w-2xl text-[26px] font-semibold leading-tight text-text">
          Trang bán xe và xưởng chạy trên cùng một hệ thống.
        </p>
        <p className="max-w-2xl text-[13px] text-text-muted">
          Nội dung bạn xuất bản hôm nay là thứ khách thấy trước khi họ bước vào showroom.
        </p>
      </section>

      <section className="flex flex-col justify-between gap-8 bg-ink-1 p-8 sm:p-12">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-sm bg-action text-sm font-bold text-text-on-action">
            G
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold text-text">GarageOS</span>
            <span className="tech-label text-text-dim">Sales Admin</span>
          </span>
        </div>

        <div className="w-full max-w-md">
          <h1 className="mb-6 text-[28px] font-semibold text-text">Đăng nhập</h1>

          <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Số điện thoại</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  id="phone"
                  name="phone"
                  required
                  inputMode="tel"
                  autoComplete="username"
                  placeholder="0901 000 011"
                  className="numeric h-11 pl-10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="h-11 pl-10"
                />
              </div>
            </div>

            {/* `Alert` tone danger mang role="alert" — trình đọc màn hình đọc
                ngay, và bài kiểm E2E SA-E02 tìm đúng vai trò này. */}
            {error !== null && <Alert tone="danger">{error}</Alert>}

            <Button type="submit" disabled={submitting} className="h-11 w-full">
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-text-muted">
          Chỉ dành cho nhân viên marketing và bán hàng đã được cấp quyền.
        </p>
      </section>
    </main>
  );
}
