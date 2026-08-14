'use client';

/**
 * Client API cho Sales Admin — SRS Phase 1 mục 5.3/10.2.
 *
 * Cookie HttpOnly do API đặt; gọi với `credentials: 'include'`. Mọi mutation có
 * trạng thái loading/chống double-submit do từng trang lo; lỗi hệ thống hiển
 * thị `requestId` từ envelope lỗi chung.
 */

const API_ORIGIN = (process.env['NEXT_PUBLIC_ADMIN_API_ORIGIN'] ?? 'http://localhost:3001').replace(/\/+$/, '');

export interface ApiEnvelopeError {
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly requestId: string | undefined,
    readonly details: unknown,
  ) {
    super(message);
  }
}

async function goiThuc(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

/*
 * 🔒 Chỉ MỘT lần gia hạn đang bay tại một thời điểm.
 *
 * Màn Kanban lead mở nhiều request song song. Không có hàng đợi này thì cả loạt
 * cùng gặp 401 và cùng gọi `/auth/refresh` — mà refresh XOAY VÒNG, nên lần thứ
 * hai trở đi dùng token đã bị thu hồi. Máy chủ coi đó là dấu hiệu token bị đánh
 * cắp và thu hồi TOÀN BỘ phiên: người dùng bị đá ra bởi chính cơ chế bảo vệ họ.
 *
 * Cùng khuôn với `apps/web/src/lib/api.ts`. Hai app, một vấn đề, một cách giải.
 */
let dangGiaHan: Promise<boolean> | null = null;

async function giaHanPhien(): Promise<boolean> {
  dangGiaHan ??= (async () => {
    try {
      const res = await goiThuc('/api/v1/auth/refresh', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    } finally {
      queueMicrotask(() => {
        dangGiaHan = null;
      });
    }
  })();
  return dangGiaHan;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await goiThuc(path, init);

  /*
   * 401 -> gia hạn ĐÚNG MỘT LẦN rồi gọi lại.
   *
   * Access token sống 15 phút (`docs/13-nfr.md`), còn nhân viên bán hàng mở màn
   * lead cả buổi. Trước bản sửa này, sau 15 phút:
   *
   *   · `AuthProvider` chỉ gọi `/me` MỘT LẦN lúc mount, nên khung giao diện vẫn
   *     hiện tên và menu như đang đăng nhập
   *   · nhưng mọi thao tác trả 401 kèm một thông báo lỗi kỹ thuật
   *   · không có chỗ nào nói "phiên hết hạn", không có đường về trang đăng nhập
   *
   * Đó là kiểu hỏng tệ nhất: hệ thống trông như vẫn chạy, và người dùng nghĩ
   * mình thao tác sai.
   *
   * Không thử lại lần hai: gia hạn xong vẫn 401 nghĩa là phiên chết thật, và
   * lặp tiếp chỉ biến một lỗi thành một vòng lặp.
   */
  if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
    if (await giaHanPhien()) {
      res = await goiThuc(path, init);
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiEnvelopeError;
    throw new ApiError(
      res.status,
      body.error?.code,
      body.error?.message ?? `Lỗi ${res.status}`,
      body.error?.requestId,
      body.error?.details,
    );
  }
  return (await res.json()) as T;
}

export function apiOrigin(): string {
  return API_ORIGIN;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const id = err.requestId !== undefined ? ` (requestId: ${err.requestId})` : '';
    return `${err.message}${id}`;
  }
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
}
