'use client';

import { useState, type FormEvent } from 'react';
import { Lock, Phone, Wrench } from 'lucide-react';
import { api, auth, ApiCallError } from '@/lib/api';
import { ErrorState } from '@/components/error-state';
import { CongTacTheme } from '@/components/cong-tac-theme';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.login(phone.trim(), password);
      // Token đi trong cookie HttpOnly; chỗ này chỉ nhớ tên và vai để vẽ header
      auth.save(r.user);
      window.location.href = '/tiep-nhan';
    } catch (err) {
      setError(err instanceof ApiCallError ? err.api.message : 'Không kết nối được máy chủ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh">
      {/* ── Bảng đăng nhập ─────────────────────────────────────────────── */}
      <div className="flex w-full flex-col justify-between gap-10 border-line bg-ink-1 p-6 sm:p-10 lg:w-[560px] lg:shrink-0 lg:border-r lg:p-14">
        <div className="flex items-center gap-2.5">
          <span className="grid size-[30px] place-items-center rounded-sm bg-action">
            <Wrench className="size-4 text-white" aria-hidden />
          </span>
          <h1 className="text-17 font-bold tracking-[-0.3px] text-text">GarageOS</h1>
          <div className="ml-auto">
            <CongTacTheme />
          </div>
        </div>

        <form className="flex w-full flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-30 font-bold tracking-[-0.8px] text-text">Đăng nhập</h2>
            <p className="text-14 text-text-dim">Dùng số điện thoại đã đăng ký tại xưởng.</p>
          </div>

          {error !== null && <ErrorState message={error} />}

          <div className="field">
            <label htmlFor="phone">
              Số điện thoại <span className="req">*</span>
            </label>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-dim"
                aria-hidden
              />
              <input
                id="phone"
                name="phone"
                autoComplete="username"
                autoFocus
                required
                className="pl-10 text-14"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxx"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">
              Mật khẩu <span className="req">*</span>
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-dim"
                aria-hidden
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="pl-10 text-14"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" size="khach" className="w-full" dangXuLy={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>

          {/*
            🔒 Danh sách tài khoản demo chỉ hiện khi được BẬT TƯỜNG MINH.
            Không có rào này thì khoảnh khắc bản build lên bất kỳ URL nào người
            ngoài chạm tới — staging cho khách xem thử, demo cho nhà đầu tư, máy
            chủ LAN mở port — ai mở trang đăng nhập cũng đăng nhập được bằng
            quyền chủ chuỗi.
          */}
          {process.env.NEXT_PUBLIC_DEMO_HINTS === '1' && (
            <div className="alert info">
              <strong>Tài khoản demo</strong> — mật khẩu <code className="mono">demo1234</code>
              <div className="mt-1.5 leading-body">
                <code className="mono">0901000003</code> Cố vấn dịch vụ ·{' '}
                <code className="mono">0901000001</code> Chủ garage
                <br />
                <code className="mono">0901000004</code> Thợ ·{' '}
                <code className="mono">0902000001</code> Tenant khác (kiểm tra cô lập)
              </div>
            </div>
          )}
        </form>

        <p className="text-11 leading-body text-text-dim">
          Phiên đăng nhập hết hạn sau 30 ngày không hoạt động.
        </p>
      </div>

      {/*
        Nửa phải là một câu duy nhất về sản phẩm.

        Ẩn dưới 1024px: trên điện thoại, nhân viên mở trang này để ĐĂNG NHẬP,
        và mọi thứ đẩy ô nhập xuống dưới nếp gấp đều là chướng ngại. Không có
        thông tin nào bị mất — đây là câu giới thiệu, không phải hướng dẫn.
      */}
      <div className="hidden flex-1 flex-col justify-end gap-3.5 bg-ink-2 p-14 lg:flex">
        <p className="max-w-[18ch] text-34 font-bold leading-tight tracking-[-1px] text-text">
          Một chiếc xe. Một hồ sơ xuyên suốt.
        </p>
        <p className="max-w-[46ch] text-14 leading-body text-text-dim">
          Từ lúc tiếp nhận đến mỗi lần bảo dưỡng nhiều năm sau.
        </p>
      </div>
    </main>
  );
}
