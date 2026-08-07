import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Client gọi API cho app thợ.
 *
 * 🔒 Khác web ở MỘT điểm quan trọng: token để trong `expo-secure-store`, không
 * để trong bộ nhớ thường.
 *
 * Web đang dùng `localStorage` và đó là nợ kỹ thuật đã ghi ở STATUS.md — chấp
 * nhận được vì trình duyệt ở quầy do xưởng quản lý. Điện thoại thì khác: nó là
 * thiết bị CÁ NHÂN, hay bị mất, và một token nằm trong bộ nhớ thường của app
 * đọc được bằng công cụ sao lưu thông thường trên máy đã root.
 *
 * `SecureStore` dùng Keychain (iOS) và EncryptedSharedPreferences (Android).
 */
const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3001';

const KHOA_TOKEN = 'garageos.accessToken';
const KHOA_NGUOI = 'garageos.user';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

export class ApiCallError extends Error {
  constructor(
    readonly api: ApiError,
    readonly status: number,
  ) {
    super(api.message);
  }
}

/**
 * `SecureStore` không có trên web. Expo web dùng để xem trước giao diện chứ
 * không phải môi trường chạy thật, nên rơi về `localStorage` ở đó là chấp nhận
 * được — nhưng phải nói rõ để không ai tưởng web cũng được bảo vệ.
 */
const kho = {
  async doc(k: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(k) ?? null;
    return SecureStore.getItemAsync(k);
  },
  async ghi(k: string, v: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(k, v);
      return;
    }
    await SecureStore.setItemAsync(k, v);
  },
  async xoa(k: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(k);
      return;
    }
    await SecureStore.deleteItemAsync(k);
  },
};

export interface NguoiDung {
  id: string;
  fullName: string;
  roles: string[];
  branchIds: string[];
}

export const phien = {
  token: (): Promise<string | null> => kho.doc(KHOA_TOKEN),
  async nguoiDung(): Promise<NguoiDung | null> {
    const raw = await kho.doc(KHOA_NGUOI);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as NguoiDung;
    } catch {
      // Dữ liệu phiên hỏng thì xoá đi thay vì để app trắng màn hình mỗi lần mở
      await phien.xoa();
      return null;
    }
  },
  async luu(token: string, nguoi: NguoiDung): Promise<void> {
    await kho.ghi(KHOA_TOKEN, token);
    await kho.ghi(KHOA_NGUOI, JSON.stringify(nguoi));
  },
  async xoa(): Promise<void> {
    await kho.xoa(KHOA_TOKEN);
    await kho.xoa(KHOA_NGUOI);
  },
};

async function goi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await phien.token();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
  if (!res.ok) {
    const err = json.error ?? { code: 'UNKNOWN', message: 'Lỗi không xác định' };
    // 401 nghĩa là token hết hạn hoặc bị thu hồi — xoá phiên để app quay về
    // màn đăng nhập thay vì lặp lỗi mãi.
    if (res.status === 401) await phien.xoa();
    throw new ApiCallError(err, res.status);
  }
  return json as T;
}

// --- Kiểu dữ liệu app thợ dùng ----------------------------------------------

export interface JobCard {
  id: string;
  repairOrderId: string;
  repairOrderCode: string;
  plateNumber: string;
  vehicleId: string;
  description: string;
  bayName: string;
  plannedStart: string;
  plannedEnd: string;
  status: string;
  /** 🔒 KHÔNG có trường tiền nào — xem `tho-khong-thay-tien.spec.ts` */
}

export interface DoanGio {
  id: string;
  startedAt: string;
  endedAt: string | null;
  pauseReason: string | null;
  autoClosed: boolean;
  hours: number;
}

export interface GioCong {
  actualHours: number;
  standardHours: number;
  segments: DoanGio[];
  coDoanDongHo: boolean;
}

export const api = {
  dangNhap: (phone: string, password: string) =>
    goi<{ accessToken: string; user: NguoiDung }>('POST', '/api/v1/auth/login', {
      phone,
      password,
    }),

  /** Lịch hôm nay — API đã lọc theo phạm vi của vai đăng nhập */
  lichHomNay: (ngay: string) => goi<JobCard[]>('GET', `/api/v1/assignments?date=${ngay}`),

  gioCong: (assignmentId: string) =>
    goi<GioCong>('GET', `/api/v1/assignments/${assignmentId}/time`),

  batDau: (workAssignmentId: string) =>
    goi<{ segmentId: string }>('POST', '/api/v1/time-logs/start', { workAssignmentId }),

  /** Bỏ trống `reason` = hoàn thành; có lý do = tạm dừng */
  ketThuc: (workAssignmentId: string, reason?: string, note?: string) =>
    goi<{ actualHours: number; assignmentStatus: string }>('POST', '/api/v1/time-logs/stop', {
      workAssignmentId,
      ...(reason === undefined ? {} : { reason }),
      ...(note === undefined ? {} : { note }),
    }),

  danhMuc: (vehicleId: string) =>
    goi<{ serviceItems: { id: string; code: string; name: string }[] }>(
      'GET',
      `/api/v1/catalog/vehicle/${vehicleId}`,
    ),

  baoPhatSinh: (input: {
    repairOrderId: string;
    serviceItemId: string;
    foundInAssignmentId?: string;
    description: string;
    blocksAssignmentIds: string[];
  }) =>
    goi<{ id: string; soViecTamDung: number }>('POST', '/api/v1/supplements', input),
};

export const API_BASE = API_URL;
