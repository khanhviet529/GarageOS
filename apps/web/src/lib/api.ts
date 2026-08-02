'use client';

/** Client gọi API — giữ token trong localStorage cho Phase 1 (đủ cho demo). */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'garageos.accessToken';
const USER_KEY = 'garageos.user';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiCallError extends Error {
  constructor(readonly api: ApiError, readonly status: number) {
    super(api.message);
  }
}

export const auth = {
  token: (): string | null => globalThis.localStorage?.getItem(TOKEN_KEY) ?? null,
  user: (): { fullName: string; roles: string[] } | null => {
    const raw = globalThis.localStorage?.getItem(USER_KEY);
    return raw === null || raw === undefined ? null : JSON.parse(raw);
  },
  save: (token: string, user: unknown): void => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = auth.token();
  const res = await fetch(`${BASE}${path}`, {
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
    // Hết phiên -> về trang đăng nhập thay vì báo lỗi khó hiểu
    if (res.status === 401 && globalThis.location !== undefined) {
      auth.clear();
      if (!globalThis.location.pathname.startsWith('/dang-nhap')) {
        globalThis.location.href = '/dang-nhap';
      }
    }
    throw new ApiCallError(err, res.status);
  }
  return json as T;
}

export const api = {
  login: (phone: string, password: string) =>
    call<{ accessToken: string; user: { fullName: string; roles: string[] } }>(
      'POST',
      '/api/v1/auth/login',
      { phone, password },
    ),
  lookupPlate: (plate: string) =>
    call<VehicleLookup>('GET', `/api/v1/vehicles/lookup?plate=${encodeURIComponent(plate)}`),
  createCustomer: (input: unknown) => call<{ id: string }>('POST', '/api/v1/customers', input),
  createVehicle: (input: unknown) => call<{ id: string }>('POST', '/api/v1/vehicles', input),
};

export interface VehicleLookup {
  exact: {
    id: string;
    plateNumber: string;
    powertrain: 'ICE' | 'HYBRID' | 'BEV';
    makeName: string | null;
    modelName: string | null;
    lastOdometer: number;
    customer: { id: string; displayName: string; phone: string };
  } | null;
  suggestions: { id: string; plateNumber: string; displayName: string }[];
}

export const POWERTRAIN_LABEL: Record<string, string> = {
  ICE: 'Xăng/Dầu',
  HYBRID: 'Hybrid',
  BEV: 'Điện',
};
/**
 * Nhãn vai trò — người dùng là cố vấn dịch vụ ở xưởng, không phải lập trình
 * viên: họ không nên nhìn thấy tên hằng số trong mã nguồn trên giao diện.
 */
export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Chủ garage',
  MANAGER: 'Quản lý',
  SERVICE_ADVISOR: 'Cố vấn dịch vụ',
  TECHNICIAN: 'Kỹ thuật viên',
  WAREHOUSE_KEEPER: 'Thủ kho',
  ACCOUNTANT: 'Kế toán',
};
export const roleLabel = (r: string): string => ROLE_LABEL[r] ?? r;

export const POWERTRAIN_CLASS: Record<string, string> = {
  ICE: 'ice',
  HYBRID: 'hyb',
  BEV: 'bev',
};
