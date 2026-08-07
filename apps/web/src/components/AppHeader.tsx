'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth, roleLabel } from '@/lib/api';

/** Giữ khớp với `ACTION_ROLES['stock:read']` ở packages/contracts */
const VAI_XEM_KHO = ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'];

/** Giữ khớp với `ACTION_ROLES['assignment:read']` ở packages/contracts */
const VAI_XEM_LICH = ['TECHNICIAN', 'SERVICE_ADVISOR', 'STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'];

/**
 * Thanh trên cùng — dùng chung cho mọi màn hình nội bộ.
 *
 * Kèm luôn việc chặn truy cập khi chưa đăng nhập: đặt ở một chỗ để không có
 * màn hình nào quên. Trang nào cũng tự viết lại đoạn kiểm tra token là cách
 * chắc chắn để một hôm nào đó có một trang thiếu nó.
 */
export function AppHeader({
  current,
}: {
  current: 'tiep-nhan' | 'xe-trong-xuong' | 'don' | 'kho' | 'lich-xuong';
}) {
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
      {/* Hiện ra khi Tab lần đầu — bỏ qua thanh điều hướng để tới nội dung */}
      <a href="#noi-dung" className="skip-link">Bỏ qua thanh điều hướng</a>
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
        {/*
          Ẩn mục Kho với vai không có quyền — nhưng đây CHỈ là tiện dụng, không
          phải phân quyền: token nằm trong tay client nên `roles` sửa được. Chặn
          thật nằm ở `assertCan(actor, 'stock:read')` trong StockService.
          Người dùng gõ thẳng /kho vẫn chỉ nhận 403 từ API.
        */}
        {who !== null && VAI_XEM_LICH.some((r) => who.roles.includes(r)) && (
          <Link href="/lich-xuong" className={current === 'lich-xuong' ? 'active' : ''}>
            Lịch xưởng
          </Link>
        )}
        {who !== null && VAI_XEM_KHO.some((r) => who.roles.includes(r)) && (
          <Link href="/kho" className={current === 'kho' ? 'active' : ''}>
            Kho
          </Link>
        )}
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
