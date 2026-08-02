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
  user: (): { fullName: string; roles: string[]; branchIds: string[] } | null => {
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

export interface RepairOrderListItem {
  id: string; code: string; status: string;
  plateNumber: string; powertrain: 'ICE' | 'HYBRID' | 'BEV';
  customerName: string; customerComplaint: string; receivedAt: string;
}

export interface RepairOrderDetail {
  id: string; code: string; status: string;
  customerComplaint: string;
  version: number;
  odometerIn: number | null;
  odometerUnavailable: boolean;
  odometerOverrideReason: string | null;
  energyLevelIn: number | null;
  receivedAt: string;
  promisedAt: string | null;
  broughtByName: string | null;
  broughtByPhone: string | null;
  customerAccessToken: string;
  vehicle: {
    id: string; plateNumber: string;
    powertrain: 'ICE' | 'HYBRID' | 'BEV';
    makeName: string | null; modelName: string | null;
  };
  customer: { id: string; displayName: string; phone: string };
  assets: { id: string; description: string; returnedAt: string | null }[];
  photos: { id: string; phase: string; storageKey: string; caption: string | null }[];
}

export interface CatalogForVehicle {
  powertrain: 'ICE' | 'HYBRID' | 'BEV';
  laborRatePerHour: number;
  priceListName: string;
  serviceItems: {
    id: string; code: string; name: string;
    category: 'MAINTENANCE' | 'REPAIR' | 'DIAGNOSIS' | 'HV_SYSTEM';
    standardHours: number;
    requiredCertifications: string[];
    warrantyMonths: number;
    laborAmount: number;
  }[];
  parts: {
    id: string; sku: string; name: string; unit: string;
    category: string | null; isHighVoltage: boolean;
    sellPrice: number | null;
  }[];
}

export interface QuotationLine {
  id: string; seq: number;
  lineType: 'LABOR' | 'PART';
  parentLineId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRatePercent: number;
  lineTotal: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason: string | null;
  isWarranty: boolean;
}

export interface Quotation {
  id: string; repairOrderId: string; seq: number;
  status: string;
  laborRatePerHour: number;
  subtotalAmount: number; discountAmount: number;
  taxAmount: number; totalAmount: number;
  validUntil: string | null; sentAt: string | null; createdAt: string;
  lines: QuotationLine[];
}

export const api = {
  login: (phone: string, password: string) =>
    call<{ accessToken: string; user: { fullName: string; roles: string[]; branchIds: string[] } }>(
      'POST',
      '/api/v1/auth/login',
      { phone, password },
    ),
  lookupPlate: (plate: string) =>
    call<VehicleLookup>('GET', `/api/v1/vehicles/lookup?plate=${encodeURIComponent(plate)}`),
  createCustomer: (input: unknown) => call<{ id: string }>('POST', '/api/v1/customers', input),
  createVehicle: (input: unknown) => call<{ id: string }>('POST', '/api/v1/vehicles', input),
  createRepairOrder: (input: unknown) =>
    call<{ id: string; code: string }>('POST', '/api/v1/repair-orders', input),
  listRepairOrders: () => call<RepairOrderListItem[]>('GET', '/api/v1/repair-orders?open=true'),
  getRepairOrder: (id: string) => call<RepairOrderDetail>('GET', `/api/v1/repair-orders/${id}`),
  getCatalog: (vehicleId: string) =>
    call<CatalogForVehicle>('GET', `/api/v1/catalog/vehicle/${vehicleId}`),

  listQuotations: (orderId: string) =>
    call<Quotation[]>('GET', `/api/v1/repair-orders/${orderId}/quotations`),
  createQuotation: (orderId: string) =>
    call<{ id: string; seq: number }>('POST', `/api/v1/repair-orders/${orderId}/quotations`),
  addQuotationLine: (quotationId: string, input: unknown) =>
    call<{ id: string; seq: number }>('POST', `/api/v1/quotations/${quotationId}/lines`, input),
  removeQuotationLine: (quotationId: string, lineId: string) =>
    call<void>('DELETE', `/api/v1/quotations/${quotationId}/lines/${lineId}`),
  sendQuotation: (quotationId: string) =>
    call<{ validUntil: string }>('POST', `/api/v1/quotations/${quotationId}/send`),
  changeOrderStatus: (orderId: string, input: unknown) =>
    call<{ status: string; version: number }>(
      'POST', `/api/v1/repair-orders/${orderId}/status`, input,
    ),
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

/** 🔒 Phải khớp enum `repair_order_status` — docs/06-state-machines.md */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Đã tiếp nhận',
  DIAGNOSING: 'Đang kiểm tra',
  QUOTED: 'Đã lập báo giá',
  AWAITING_APPROVAL: 'Chờ khách duyệt',
  AWAITING_PARTS: 'Chờ phụ tùng',
  IN_PROGRESS: 'Đang sửa',
  QUALITY_CHECK: 'Kiểm tra chất lượng',
  AWAITING_PAYMENT: 'Chờ thanh toán',
  AWAITING_DELIVERY: 'Chờ giao xe',
  DELIVERED: 'Đã giao xe',
  CANCELLED: 'Đã huỷ',
};

/**
 * 🔒 Bảng chuyển trạng thái — phải khớp `packages/contracts/src/state-machine.ts`
 * và bảng `repair_order_transition` trong database.
 *
 * ⚠️ Chép lại ở đây thay vì import trực tiếp là nợ kỹ thuật đã biết: apps/web
 * đang giữ một bản sao của các hằng số hiển thị để giảm phụ thuộc lúc dựng.
 * Có test đối chiếu TypeScript ↔ database; bản sao này thì chưa.
 */
export const REPAIR_ORDER_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['DIAGNOSING', 'CANCELLED'],
  DIAGNOSING: ['QUOTED', 'CANCELLED'],
  QUOTED: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['AWAITING_PARTS', 'IN_PROGRESS', 'AWAITING_DELIVERY', 'QUOTED', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_APPROVAL', 'AWAITING_PARTS', 'QUALITY_CHECK', 'CANCELLED'],
  QUALITY_CHECK: ['IN_PROGRESS', 'AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['AWAITING_DELIVERY'],
  AWAITING_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Nhãn cho NÚT BẤM — là hành động, không phải tình trạng */
export const ORDER_ACTION_LABEL: Record<string, string> = {
  DIAGNOSING: 'Bắt đầu kiểm tra',
  QUOTED: 'Chuyển về lập báo giá',
  AWAITING_APPROVAL: 'Gửi khách duyệt',
  AWAITING_PARTS: 'Chờ phụ tùng',
  IN_PROGRESS: 'Bắt đầu sửa',
  QUALITY_CHECK: 'Chuyển kiểm tra chất lượng',
  AWAITING_PAYMENT: 'Đạt — chuyển thanh toán',
  AWAITING_DELIVERY: 'Đã thu tiền — chờ giao xe',
  DELIVERED: 'Giao xe cho khách',
  CANCELLED: 'Huỷ đơn',
};

export const CANCEL_CATEGORY_LABEL: Record<string, string> = {
  CUSTOMER_REQUEST: 'Khách yêu cầu huỷ',
  GARAGE_UNABLE: 'Xưởng không thực hiện được',
  VEHICLE_ISSUE: 'Vấn đề của xe ngoài phạm vi',
};

export const ODOMETER_REASON_LABEL: Record<string, string> = {
  ODOMETER_REPLACED: 'Đã thay cụm đồng hồ',
  PREVIOUS_ENTRY_WRONG: 'Lần trước nhập sai',
  OTHER: 'Lý do khác',
};

export const SERVICE_CATEGORY_LABEL: Record<string, string> = {
  MAINTENANCE: 'Bảo dưỡng',
  REPAIR: 'Sửa chữa',
  DIAGNOSIS: 'Chẩn đoán',
  HV_SYSTEM: 'Hệ thống cao áp',
};

export const CERTIFICATION_LABEL: Record<string, string> = {
  HV_ELECTRICAL: 'An toàn điện cao áp',
  EV_DIAGNOSTICS: 'Chẩn đoán xe điện',
};

/** Tiền — 🔒 luôn là số nguyên đồng (ADR-0003), không có phần thập phân */
export const QUOTATION_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  SENT: 'Đã gửi khách',
  APPROVED: 'Khách duyệt toàn bộ',
  PARTIALLY_APPROVED: 'Khách duyệt một phần',
  REJECTED: 'Khách từ chối',
  EXPIRED: 'Hết hạn',
  SUPERSEDED: 'Đã bị thay thế',
};

export const LINE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

export function formatMoney(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
