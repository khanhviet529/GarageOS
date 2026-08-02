'use client';
import { useEffect } from 'react';
import { auth } from '@/lib/api';

export default function Home() {
  useEffect(() => {
    window.location.href = auth.token() === null ? '/dang-nhap' : '/tiep-nhan';
  }, []);
  return <div className="container">Đang chuyển hướng…</div>;
}
