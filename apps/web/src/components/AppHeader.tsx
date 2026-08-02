'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth, roleLabel } from '@/lib/api';

/**
 * Thanh trên cùng — dùng chung cho mọi màn hình nội bộ.
 *
 * Kèm luôn việc chặn truy cập khi chưa đăng nhập: đặt ở một chỗ để không có
 * màn hình nào quên. Trang nào cũng tự viết lại đoạn kiểm tra token là cách
 * chắc chắn để một hôm nào đó có một trang thiếu nó.
 */
export function AppHeader({ current }: { current: 'tiep-nhan' | 'xe-trong-xuong' | 'don' }) {
  const [who, setWho] = useState<{ fullName: string; roles: string[] } | null>(null);

  useEffect(() => {
    if (auth.token() === null) {
      window.location.href = '/dang-nhap';
      return;
    }
    setWho(auth.user());
  }, []);

  return (
    <header className="app-header">
      <h1>GarageOS</h1>
      <nav className="nav">
        <Link href="/tiep-nhan" className={current === 'tiep-nhan' ? 'active' : ''}>
          Tiếp nhận xe
        </Link>
        <Link
          href="/xe-trong-xuong"
          className={current === 'xe-trong-xuong' || current === 'don' ? 'active' : ''}
        >
          Xe trong xưởng
        </Link>
      </nav>
      <div className="spacer" />
      {who !== null && (
        <span className="who">
          {who.fullName} · {who.roles.map(roleLabel).join(', ')}
        </span>
      )}
      <button
        className="secondary"
        onClick={() => {
          auth.clear();
          window.location.href = '/dang-nhap';
        }}
      >
        Đăng xuất
      </button>
    </header>
  );
}
