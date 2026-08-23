'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/client';
import styles from './page.module.css';

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
        body: JSON.stringify({ phone: String(form.get('phone') ?? '').trim(), password: String(form.get('password') ?? '') }),
      });
      window.location.assign('/');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.identity} aria-label="GarageOS Admin Console">
        <p className={styles.brand}><span className={styles.mark} aria-hidden="true">G</span>GarageOS</p>
        <div className={styles.identityCopy}>
          <p className={styles.eyebrow}>Automotive operations</p>
          <h1>Điều hành showroom và website từ một nơi.</h1>
          <p>Quản lý lead, catalog xe và nội dung public theo đúng quyền của bạn.</p>
        </div>
        <p className={styles.footer}>Sales &amp; Website Console</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <h2>Đăng nhập</h2>
          <p className={styles.intro}>Dùng tài khoản GarageOS của bạn để tiếp tục.</p>
          <form className={styles.form} onSubmit={(event) => void onSubmit(event)} noValidate>
            <label htmlFor="phone">Số điện thoại<input id="phone" name="phone" required inputMode="tel" autoComplete="username" /></label>
            <label htmlFor="password">Mật khẩu<input id="password" name="password" type="password" required autoComplete="current-password" /></label>
            {error !== null && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submit} type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
