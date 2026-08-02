'use client';
import { useState, type FormEvent } from 'react';
import { api, auth, ApiCallError } from '@/lib/api';

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
      auth.save(r.accessToken, r.user);
      window.location.href = '/tiep-nhan';
    } catch (err) {
      setError(err instanceof ApiCallError ? err.api.message : 'Không kết nối được máy chủ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form className="card stack" style={{ width: 380 }} onSubmit={submit}>
        <div>
          <h2 style={{ marginBottom: 2 }}>GarageOS</h2>
          <p className="muted small">Quản lý xưởng dịch vụ ô tô</p>
        </div>

        {error !== null && <div className="alert error" role="alert">{error}</div>}

        <div className="field">
          <label htmlFor="phone">Số điện thoại <span className="req">*</span></label>
          <input
            id="phone" name="phone" autoComplete="username" autoFocus required
            value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Mật khẩu <span className="req">*</span></label>
          <input
            id="password" name="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="lg" type="submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>

        <div className="alert info small">
          <strong>Tài khoản demo</strong> — mật khẩu <code>demo1234</code>
          <div style={{ marginTop: 6, lineHeight: 1.7 }}>
            <code>0901000003</code> Cố vấn dịch vụ · <code>0901000001</code> Chủ garage<br />
            <code>0901000004</code> Thợ · <code>0902000001</code> Tenant khác (kiểm tra cô lập)
          </div>
        </div>
      </form>
    </div>
  );
}
