'use client';
import { useEffect } from 'react';
import { auth } from '@/lib/api';

export default function Home() {
  useEffect(() => {
    /*
     * Không hỏi "có token không" được nữa — token nằm trong cookie HttpOnly,
     * JavaScript không đọc được. Đó là điểm của cả thay đổi này.
     *
     * Dấu hiệu "đã từng đăng nhập" là hồ sơ người dùng lưu lại lúc đăng nhập.
     * Nếu nó có mà phiên thật đã chết, request đầu tiên trả 401 và lớp gọi API
     * tự đưa về trang đăng nhập — người dùng thấy đúng một lần chuyển trang.
     */
    window.location.href = auth.user() === null ? '/dang-nhap' : '/tiep-nhan';
  }, []);
  return <div className="container">Đang chuyển hướng…</div>;
}
