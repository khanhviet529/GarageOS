'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/client';

export default function LoginPage(): React.ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      // Cookie HttpOnly do API đặt; web không nhận token trong thân phản hồi.
      await api('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          phone: String(form.get('phone') ?? '').trim(),
          password: String(form.get('password') ?? ''),
        }),
      });
      // Reload cứng để AuthProvider gắn lại từ đầu và gọi /me với cookie vừa
      // đặt. `router.replace` + `router.refresh` KHÔNG remount client component
      // nên AuthProvider vẫn giữ trạng thái "chưa đăng nhập" cũ.
      window.location.assign('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
      <p className="eyebrow">GarageOS / Sales workspace</p>
      <h1>Đăng nhập để tiếp tục</h1>
      <p className="note">Quản lý lead, catalog và nội dung công khai trong đúng phạm vi quyền của bạn.</p>
      <form className="form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <label htmlFor="phone">
          Số điện thoại
          <input id="phone" name="phone" required inputMode="tel" autoComplete="username" />
        </label>
        <label htmlFor="password">
          Mật khẩu
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </label>
        {error !== null && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      </section>
    </main>
  );
}
