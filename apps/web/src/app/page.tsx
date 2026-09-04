'use client';

/**
 * Trang chủ — lối vào nhẹ cho cả hai đối tượng:
 *   - Nhân viên garage (đã đăng nhập) → "Vào bảng điều khiển" → /tiep-nhan
 *   - Khách hàng (chưa đăng nhập, có mã truy cập) → "Tra cứu đơn của tôi"
 *
 * Quyết định thiết kế: KHÔNG redirect tự động.
 *
 * Phiên bản trước dùng `useEffect` đẩy về /tiep-nhan hoặc /dang-nhap. Vấn đề:
 *   - Người dùng mở tab mới gõ "garageos.vn" — họ muốn biết đây là gì, bị đẩy
 *     đi ngay lập tức, không có cách nào ghé trang tra cứu công khai.
 *   - Nhân viên muốn vào nhanh — landing CHỈ là một bước nhảy, vẫn còn đúng
 *     một bước bấm. Không tiết kiệm được gì mà mất đi khả năng ghé qua tra cứu
 *     không cần đăng nhập.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { auth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CongTacTheme } from '@/components/cong-tac-theme';

export default function Home() {
  const [daKiem, setDaKiem] = useState(false);
  const [daDangNhap, setDaDangNhap] = useState(false);

  useEffect(() => {
    // Chỉ cần biết "đã từng đăng nhập" để gợi ý đường vào nhanh — KHÔNG dùng để
    // redirect. Phiên chết thật thì lớp gọi API ở trang đích xử lý.
    setDaDangNhap(auth.user() !== null);
    setDaKiem(true);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="flex w-[min(460px,100%)] flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-[30px] place-items-center rounded-sm bg-action">
            <Wrench className="size-4 text-white" aria-hidden />
          </span>
          <h1 className="text-17 font-bold tracking-[-0.3px] text-text">GarageOS</h1>
          <div className="ml-auto">
            <CongTacTheme />
          </div>
        </div>

        <div className="card flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-26 font-bold leading-tight tracking-[-0.7px] text-text">
              Một chiếc xe. Một hồ sơ xuyên suốt.
            </p>
            <p className="text-13 leading-body text-text-dim">
              Hệ thống quản lý xưởng dịch vụ ô tô — xăng, hybrid và điện.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            {/*
              Nút chính chỉ đổi nhãn SAU khi biết trạng thái phiên. Trước đó nó
              vẫn là một nút bấm được, không phải một khoảng trống — trang được
              kết xuất tĩnh nên "chưa biết" là trạng thái của mọi lần tải đầu.
            */}
            <Button asChild size="khach" className="flex-1">
              <Link href={daDangNhap ? '/tiep-nhan' : '/dang-nhap'}>
                {daKiem && daDangNhap ? 'Vào bảng điều khiển' : 'Đăng nhập nhân viên'}
              </Link>
            </Button>
            <Button asChild variant="vien" size="khach" className="flex-1">
              <Link href="/tra-cuu">Tra cứu đơn của tôi</Link>
            </Button>
          </div>

          <p className="hint">
            Nếu bạn là khách hàng và vừa gửi xe, mở liên kết trong tin nhắn của garage —
            hoặc nhập mã truy cập ở trang tra cứu.
          </p>
        </div>
      </div>
    </main>
  );
}
