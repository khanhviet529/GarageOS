'use client';

/**
 * Trang chủ — landing nhẹ cho cả hai đối tượng:
 *   - Nhân viên garage (đã đăng nhập) → bấm "Vào bảng điều khiển" → /tiep-nhan
 *   - Khách hàng (chưa đăng nhập, có mã truy cập) → bấm "Tra cứu đơn của tôi" → /tra-cuu
 *
 * Quyết định thiết kế: KHÔNG redirect tự động.
 *
 * Phiên bản trước dùng `useEffect` đẩy về /tiep-nhan hoặc /dang-nhap. Vấn đề:
 *   - Người dùng mở tab mới gõ "garageos.vn" — họ muốn biết đây là gì, bị đẩy
 *     đi ngay lập tức, không có cách nào ghé trang tra cứu công khai.
 *   - Nhân viên muốn vào nhanh — landing CHỈ là một bước nhảy, vẫn còn
 *     đúng một bước bấm. Không tiết kiệm được gì mà mất đi khả năng ghé qua
 *     tra cứu không cần đăng nhập.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { Loading } from '@/components/ErrorState';

export default function Home() {
  const [daKiem, setDaKiem] = useState(false);

  useEffect(() => {
    // Chỉ cần biết "đã từng đăng nhập" để gợi ý đường vào nhanh — KHÔNG dùng để
    // redirect. Phiên chết thật thì lớp gọi API ở trang đích xử lý.
    setDaKiem(true);
  }, []);

  if (!daKiem) {
    return (
      <main className="landing">
        <Loading what="" />
      </main>
    );
  }

  const daDangNhap = auth.user() !== null;

  return (
    <main className="landing">
      <div className="landing-card">
        <h1 className="landing-logo">GarageOS</h1>
        <p className="landing-tag">Hệ thống quản lý xưởng dịch vụ ô tô</p>

        <div className="landing-actions">
          {daDangNhap ? (
            <Link href="/tiep-nhan" className="landing-cta landing-cta-primary">
              Vào bảng điều khiển
            </Link>
          ) : (
            <Link href="/dang-nhap" className="landing-cta landing-cta-primary">
              Đăng nhập nhân viên
            </Link>
          )}
          <Link href="/tra-cuu" className="landing-cta landing-cta-secondary">
            Tra cứu đơn của tôi
          </Link>
        </div>

        <p className="landing-note">
          Nếu bạn là khách hàng và vừa gửi xe, mở liên kết trong tin nhắn của
          garage — hoặc nhập mã truy cập ở trang tra cứu.
        </p>
      </div>
    </main>
  );
}
