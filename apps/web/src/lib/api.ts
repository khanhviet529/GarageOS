'use client';

import { ROLE_LABEL } from '@garageos/contracts';

/**
 * Client gọi API — phiên nằm trong cookie `HttpOnly`, KHÔNG trong localStorage.
 *
 * 🔒 Ở đây không có biến nào giữ token, và đó không phải vì kỷ luật: máy chủ
 *    **không gửi token cho web nữa**. Đăng nhập trả về đúng thông tin người
 *    dùng để vẽ giao diện; phần chứng thực đi trong cookie mà JavaScript không
 *    đọc được. Một lỗ XSS vẫn có thể gọi API thay người dùng, nhưng không mang
 *    được phiên ra khỏi trình duyệt.
 *
 * `USER_KEY` vẫn ở localStorage và đó là chủ ý: nó chỉ là tên và vai để vẽ
 * header, không phải chứng thực. Ai sửa nó cũng chẳng được thêm quyền gì —
 * mọi quyết định phân quyền nằm ở máy chủ, đọc từ token trong cookie.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const USER_KEY = 'garageos.user';

/**
 * Tạo chuỗi query từ object `{ from?, to? }`. Bỏ qua giá trị undefined.
 * Trả về chuỗi rỗng nếu không có tham số nào, để ghép `${qs}` không sinh
 * dấu `?` thừa.
 */
function qs(params: Record<string, string | undefined> | undefined): string {
  if (params === undefined) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

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
  user: (): { id: string; fullName: string; roles: string[]; branchIds: string[] } | null => {
    // 🔒 `JSON.parse` KHÔNG được để trần ở đây: hàm này chạy trong useEffect của
    //    AppHeader, tức là trên mọi màn hình nội bộ. Dữ liệu phiên hỏng (ghi dở
    //    do tab bị kill, phiên bản cũ lưu cấu trúc khác) sẽ ném lỗi và làm trắng
    //    màn hình — cùng lúc mất luôn nút Đăng xuất để tự thoát.
    try {
      const raw = globalThis.localStorage?.getItem(USER_KEY);
      return raw === null || raw === undefined ? null : JSON.parse(raw);
    } catch {
      auth.clear();
      return null;
    }
  },
  save: (user: unknown): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear: (): void => {
    localStorage.removeItem(USER_KEY);
  },
};

/**
 * `credentials: 'include'` là dòng làm cả cơ chế chạy được.
 *
 * Web và API nằm ở hai cổng khác nhau (3000 và 3001), nên với trình duyệt đây
 * là cross-origin. Mặc định `fetch` KHÔNG gửi cookie cross-origin — thiếu tuỳ
 * chọn này thì mọi request đi ra mà không có phiên, và triệu chứng là 401 ở
 * khắp nơi ngay sau khi đăng nhập thành công.
 */
async function goiThuc(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/*
 * Chỉ MỘT lần gia hạn đang bay tại một thời điểm.
 *
 * Một màn hình mở bốn request song song, cả bốn cùng gặp 401 khi access token
 * vừa hết hạn. Không có hàng đợi này thì chúng gọi bốn lần `/auth/refresh` —
 * và vì refresh XOAY VÒNG, ba lần sau dùng token đã bị thu hồi. Máy chủ coi
 * đó là dấu hiệu token bị đánh cắp và thu hồi TOÀN BỘ phiên. Người dùng bị đá
 * ra ngoài bởi chính cơ chế bảo vệ họ.
 */
let dangGiaHan: Promise<boolean> | null = null;

async function giaHanPhien(): Promise<boolean> {
  dangGiaHan ??= (async () => {
    try {
      const res = await goiThuc('POST', '/api/v1/auth/refresh');
      return res.ok;
    } catch {
      return false;
    } finally {
      // Nhả chốt ở microtask kế tiếp: mọi request đang chờ đã kịp bám vào
      // cùng một promise, và request SAU đó thì được gia hạn mới.
      queueMicrotask(() => {
        dangGiaHan = null;
      });
    }
  })();
  return dangGiaHan;
}

export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await goiThuc(method, path, body);

  /*
   * 401 -> thử gia hạn ĐÚNG MỘT LẦN rồi gọi lại.
   *
   * Access token sống 15 phút (docs/13-nfr.md), nên với người dùng mở màn hình
   * cả buổi thì đây là đường đi thường xuyên, không phải ngoại lệ. Không có nó,
   * cứ 15 phút một lần họ bị đá về trang đăng nhập giữa lúc đang làm việc.
   *
   * Không thử lại lần hai: nếu gia hạn xong vẫn 401 thì phiên đã chết thật, và
   * lặp tiếp chỉ biến một lỗi thành một vòng lặp.
   */
  if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
    if (await giaHanPhien()) res = await goiThuc(method, path, body);
  }

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


// --- Kho (Phase 2.1) --------------------------------------------------------

export interface Warehouse {
  id: string; branchId: string; code: string; name: string; isDefault: boolean;
}

export interface StockBalance {
  warehouseId: string; warehouseName: string;
  partId: string; sku: string; partName: string; unit: string;
  onHand: number; reserved: number; available: number;
  /** 🔒 `null` khi vai đăng nhập không được xem giá vốn — API lọc, không phải giao diện */
  avgCost: number | null;
  minStockLevel: number;
  belowMinimum: boolean;
}

export interface PendingIssue {
  reservationId: string; repairOrderId: string; repairOrderCode: string;
  plateNumber: string; partId: string; sku: string; partName: string; unit: string;
  quantity: number; expiresAt: string;
  /** Đã quá hạn giữ chỗ — job nhả chạy theo chu kỳ nên vẫn còn thấy ở đây */
  quaHan: boolean;
}

export interface StockMovementItem {
  id: string; warehouseId: string; partId: string;
  sku: string; partName: string;
  type: string; quantity: number;
  unitCost: number | null;
  refType: string | null; refId: string | null; reason: string | null;
  createdByName: string; createdAt: string;
}

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: 'Nhập kho',
  ISSUE: 'Xuất cho đơn',
  RETURN: 'Trả về kho',
  TRANSFER_IN: 'Chuyển đến',
  TRANSFER_OUT: 'Chuyển đi',
  ADJUSTMENT: 'Điều chỉnh',
};


// --- Phân công (Phase 2.3) --------------------------------------------------

export interface Bay {
  id: string; branchId: string; code: string; name: string; capabilities: string[];
}

export interface PendingWorkItem {
  quotationLineId: string; repairOrderId: string; repairOrderCode: string;
  plateNumber: string; powertrain: string; description: string;
  standardHours: number; requiredCertifications: string[]; serviceCategory: string;
  /** Có giá trị = hạng mục này đang chờ LÀM LẠI của việc đã QC không đạt */
  reworkOfId: string | null;
  reworkReason: string | null;
}

export interface TechnicianOption {
  id: string; fullName: string; loadHours: number;
  eligible: boolean;
  /** Vì sao không chọn được — hiện ra thay vì ẩn người đó đi */
  reason: string | null;
}

export const REWORK_REASON_LABEL: Record<string, string> = {
  TECHNICIAN_ERROR: 'Lỗi thi công',
  PART_DEFECT: 'Phụ tùng lỗi',
  DIAGNOSIS_ERROR: 'Chẩn đoán sai',
  CUSTOMER_CHANGE: 'Khách đổi ý',
};

/** Ai chịu chi phí — hiện cho người QC thấy hệ quả TRƯỚC khi họ chọn */
export const REWORK_WHO_PAYS: Record<string, string> = {
  TECHNICIAN_ERROR: 'Garage chịu — không tính tiền khách',
  PART_DEFECT: 'Nhà cung cấp chịu — không tính tiền khách',
  DIAGNOSIS_ERROR: 'Garage chịu — không tính tiền khách',
  CUSTOMER_CHANGE: 'Khách chịu — vẫn tính tiền như phát sinh',
};

export interface TechnicianQualityItem {
  technicianId: string; technicianName: string;
  soViecDaQc: number;
  /** 🔒 KHÔNG gồm phụ tùng lỗi — đó không phải lỗi thợ */
  soViecLoiTho: number;
  soViecLoiPhuTung: number;
  gioLamLai: number; gioTinhTien: number; tiLeLamLai: number;
}

export interface WorkAssignmentItem {
  id: string; repairOrderId: string; repairOrderCode: string; plateNumber: string;
  quotationLineId: string; description: string;
  technicianId: string; technicianName: string;
  bayId: string; bayName: string;
  plannedStart: string; plannedEnd: string;
  status: string; qcNote: string | null; completionPercent: number | null;
  reworkOfId: string | null;
  reworkReason: string | null;
  qcReworkReason: string | null;
  /** 🔒 `false` = giờ công vẫn ghi cho thợ nhưng không tính doanh thu */
  isBillable: boolean;
  version: number;
}

export interface TimeLogSegmentItem {
  id: string; workAssignmentId: string;
  technicianId: string; technicianName: string;
  startedAt: string; endedAt: string | null;
  pauseReason: string | null;
  /** 🔒 Đoạn do job đóng hộ — số liệu KHÔNG đáng tin để tính lương */
  autoClosed: boolean;
  /** Khác `technicianName` nghĩa là có người nhập hộ */
  enteredByName: string;
  note: string | null;
  hours: number;
}

export interface AssignmentTimeSummaryItem {
  workAssignmentId: string;
  standardHours: number;
  actualHours: number;
  efficiency: number | null;
  dangLam: boolean;
  vuotDinhMucNhieu: boolean;
  coDoanDongHo: boolean;
  segments: TimeLogSegmentItem[];
}

export const PAUSE_REASON_LABEL: Record<string, string> = {
  WAITING_PARTS: 'Chờ phụ tùng',
  WAITING_APPROVAL: 'Chờ khách duyệt',
  WAITING_EQUIPMENT: 'Thiếu thiết bị',
  SHIFT_END: 'Hết ca',
  REASSIGNED: 'Chuyển người khác',
  OTHER: 'Lý do khác',
};

export const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Đã xếp lịch',
  IN_PROGRESS: 'Đang làm',
  PAUSED: 'Tạm dừng',
  DONE: 'Đã xong',
  QC_PASSED: 'Đạt kiểm tra',
  QC_FAILED: 'Không đạt',
  CANCELLED: 'Đã huỷ',
};

/* ── Báo cáo — Phase 6 ─────────────────────────────────────────────────── */

export interface ProfitPerOrder {
  repairOrderId: string;
  code: string;
  plateNumber: string;
  powertrain: string;
  status: string;
  deliveredAt: string | null;
  doanhThuDuKien: number;
  giaVonPhuTung: number;
  chiPhiCong: number;
  chiPhiRework: number;
  chiPhiBaoHanh: number;
  lai: number;
  bienLoi: number | null;
  laDonBaoHanh: boolean;
}

export interface ProfitReport {
  from: string;
  to: string;
  orders: ProfitPerOrder[];
  tongDoanhThu: number;
  tongChiPhi: number;
  tongLai: number;
  daLoaiTru: string[];
}

export interface WaitTimeReport {
  from: string;
  to: string;
  stages: {
    trangThai: string;
    boPhan: string;
    soLuot: number;
    trungViGio: number;
    p90Gio: number;
    tongGio: number;
  }[];
  daLoaiTru: string[];
}

export interface TechnicianProductivity {
  technicianId: string;
  technicianName: string;
  soViecXong: number;
  gioDinhMuc: number | null;
  gioThucTe: number | null;
  nangSuat: number | null;
  soLanQcTruot: number;
  soViecLamLai: number;
  tiLeRework: number | null;
  chiPhiLamLai: number;
}

export interface StockReportLine {
  warehouseId: string;
  warehouseName: string;
  partId: string;
  sku: string;
  partName: string;
  category: string | null;
  onHand: number;
  reserved: number;
  available: number;
  minStockLevel: number;
  giaTriTon: number;
  duoiMucToiThieu: boolean;
  vongQuay: number | null;
  soNgayTon: number | null;
  laVonChet: boolean;
}

export interface OnTimeReport {
  from: string;
  to: string;
  soDonBanGiao: number;
  soDonDungHen: number;
  tiLeDungHen: number | null;
  tongSoLanDoiHen: number;
  soDonCoDoiHen: number;
  daLoaiTru: string[];
}

/* ── Hoá đơn và tiền — Phase 3 ─────────────────────────────────────────── */

export interface InvoiceLineItem {
  id: string;
  seq: number;
  lineType: 'LABOR' | 'PART' | 'FEE';
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRatePercent: number;
  grossAmount: number;
  taxAmount: number;
  lineTotal: number;
  isWarranty: boolean;
  expectedPayerType: 'CUSTOMER' | 'INSURER' | 'WARRANTY';
  sourceQuotationLineId: string | null;
  daThu: number;
}

export interface ReconciliationRow {
  description: string;
  baoGia: number;
  thucTe: number;
  chenhLech: number;
  lyDo: string;
}

export interface InvoiceView {
  id: string;
  code: string;
  repairOrderId: string;
  repairOrderCode: string;
  customerId: string;
  customerName: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'ADJUSTED' | 'CANCELLED';
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  daThu: number;
  conNo: number;
  issuedAt: string | null;
  dueDate: string | null;
  varianceReason: string | null;
  adjustmentOfInvoiceId: string | null;
  adjustmentReason: string | null;
  lines: InvoiceLineItem[];
  reconciliation: {
    rows: ReconciliationRow[];
    tongBaoGia: number;
    tongThucTe: number;
    chenhLech: number;
    chenhLechPhanTram: number;
    nguongPhanTram: number;
    vuotNguong: boolean;
  };
}

export interface CustomerDebtRow {
  customerId: string;
  displayName: string;
  type: string;
  creditLimitAmount: number;
  paymentTermDays: number;
  tongConNo: number;
  quaHan: number;
  quaHanLauNhat: number;
  soHoaDonChuaThu: number;
  trongHan: number;
  quaHan1_30: number;
  quaHan31_60: number;
  quaHanTren60: number;
  conHanMuc: number;
  creditOnHold: boolean;
}

export interface PaymentView {
  id: string;
  customerId: string;
  payerType: 'CUSTOMER' | 'INSURER' | 'WARRANTY';
  payerName: string | null;
  amount: number;
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT';
  paidAt: string;
  reference: string | null;
  reversalOfPaymentId: string | null;
  allocations: {
    invoiceLineId: string;
    invoiceCode: string;
    description: string;
    amount: number;
  }[];
}

export interface InsuranceClaimView {
  id: string;
  repairOrderId: string;
  repairOrderCode: string;
  insurerName: string;
  policyNumber: string;
  claimNumber: string | null;
  deductibleAmount: number;
  approvedAmount: number | null;
  status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'SURVEYED'
    | 'APPROVED'
    | 'PARTIALLY_APPROVED'
    | 'REJECTED'
    | 'SETTLED'
    | 'CANCELLED';
  rejectionReason: string | null;
  submittedAt: string | null;
  settledAt: string | null;
}

export interface CancelPreviewView {
  repairOrderId: string;
  status: string;
  openTimeLogCount: number;
  activeAssignmentCount: number;
  activeReservationCount: number;
  issuedParts: {
    movementId: string;
    partId: string;
    sku: string;
    partName: string;
    quantity: number;
    quotationLineId: string | null;
  }[];
  cancellable: boolean;
  lyDoKhongHuyDuoc: string | null;
}

export interface SettlementView {
  id: string;
  repairOrderId: string;
  repairOrderCode: string;
  status: 'DRAFT' | 'CONFIRMED' | 'DISPUTED' | 'WAIVED';
  chinhSachCong: 'ACTUAL_HOURS' | 'PERCENTAGE' | 'NONE';
  thuCongChanDoan: boolean;
  lines: {
    id: string;
    seq: number;
    nguon: 'DIAGNOSIS' | 'LABOR' | 'PART_FITTED' | 'PART_DAMAGED' | 'REFIT';
    description: string;
    completionPercent: number | null;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  totalAmount: number;
  disputeNote: string | null;
  confirmedAt: string | null;
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  ISSUED: 'Đã phát hành',
  PARTIALLY_PAID: 'Đã thu một phần',
  PAID: 'Đã thu đủ',
  ADJUSTED: 'Đã điều chỉnh',
  CANCELLED: 'Đã huỷ',
};

export const api = {
  /*
   * Không khai `accessToken` trong kiểu trả về — máy chủ không gửi nó cho web
   * nữa. Khai một trường không tồn tại là mời người sau đọc nó và tin là có.
   */
  login: (phone: string, password: string) =>
    call<{ user: { fullName: string; roles: string[]; branchIds: string[] } }>(
      'POST',
      '/api/v1/auth/login',
      { phone, password },
    ),
  logout: () => call<{ ok: true }>('POST', '/api/v1/auth/logout'),
  lookupPlate: (plate: string) =>
    call<VehicleLookup>('GET', `/api/v1/vehicles/lookup?plate=${encodeURIComponent(plate)}`),
  createCustomer: (input: unknown) => call<{ id: string }>('POST', '/api/v1/customers', input),
  createVehicle: (input: unknown) => call<{ id: string }>('POST', '/api/v1/vehicles', input),
  createRepairOrder: (input: unknown) =>
    call<{ id: string; code: string }>('POST', '/api/v1/repair-orders', input),
  listRepairOrders: () => call<RepairOrderListItem[]>('GET', '/api/v1/repair-orders?open=true'),
  getRepairOrder: (id: string) => call<RepairOrderDetail>('GET', `/api/v1/repair-orders/${id}`),

  /** Tải ảnh hiện trạng — BC-01 bước 6. Ảnh đi base64 trong JSON, xem contract. */
  taiAnhHienTrang: (
    orderId: string,
    input: { phase: string; contentType: string; dataBase64: string; caption?: string },
  ) => call<{ id: string; storageKey: string }>(
    'POST', `/api/v1/repair-orders/${orderId}/photos`, input,
  ),
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
  listWarehouses: () => call<Warehouse[]>('GET', '/api/v1/warehouses'),
  listStockParts: () =>
    call<{ id: string; sku: string; name: string; unit: string }[]>('GET', '/api/v1/stock/parts'),
  listStockBalances: (q: { warehouseId?: string; search?: string; belowMinimum?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (q.warehouseId !== undefined) p.set('warehouseId', q.warehouseId);
    if (q.search !== undefined && q.search !== '') p.set('search', q.search);
    if (q.belowMinimum === true) p.set('belowMinimum', '1');
    const qs = p.toString();
    return call<StockBalance[]>('GET', `/api/v1/stock/balances${qs === '' ? '' : `?${qs}`}`);
  },
  listStockMovements: (q: { warehouseId?: string; partId?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.warehouseId !== undefined) p.set('warehouseId', q.warehouseId);
    if (q.partId !== undefined) p.set('partId', q.partId);
    const qs = p.toString();
    return call<StockMovementItem[]>('GET', `/api/v1/stock/movements${qs === '' ? '' : `?${qs}`}`);
  },
  listPendingIssues: () => call<PendingIssue[]>('GET', '/api/v1/stock/pending-issues'),
  issueStock: (input: unknown) =>
    call<{ movementId: string; quantity: number; vuotDinhMuc: boolean }>(
      'POST', '/api/v1/stock/issues', input,
    ),
  receiveStock: (input: unknown) =>
    call<{ id: string; onHand: number; avgCost: number }>('POST', '/api/v1/stock/receipts', input),

  reportProfit: (loc?: { from?: string; to?: string }) =>
    call<ProfitReport>(
      'GET',
      `/api/v1/reports/profit${qs(loc)}`,
    ),
  reportWaitTime: (loc?: { from?: string; to?: string }) =>
    call<WaitTimeReport>(
      'GET',
      `/api/v1/reports/wait-time${qs(loc)}`,
    ),
  reportProductivity: () =>
    call<TechnicianProductivity[]>('GET', '/api/v1/reports/productivity'),
  reportStock: () => call<StockReportLine[]>('GET', '/api/v1/reports/stock'),
  reportOnTime: (loc?: { from?: string; to?: string }) =>
    call<OnTimeReport>('GET', `/api/v1/reports/on-time${qs(loc)}`),

  invoicesForOrder: (orderId: string) =>
    call<InvoiceView[]>('GET', `/api/v1/repair-orders/${orderId}/invoices`),
  buildInvoice: (repairOrderId: string) =>
    call<InvoiceView>('POST', '/api/v1/invoices', { repairOrderId }),
  issueInvoice: (id: string, input: unknown) =>
    call<InvoiceView>('POST', `/api/v1/invoices/${id}/issue`, input),
  adjustInvoice: (id: string, input: unknown) =>
    call<InvoiceView>('POST', `/api/v1/invoices/${id}/adjust`, input),
  recordPayment: (input: unknown) => call<PaymentView>('POST', '/api/v1/payments', input),
  reversePayment: (id: string, input: unknown) =>
    call<PaymentView>('POST', `/api/v1/payments/${id}/reverse`, input),
  customerPayments: (customerId: string) =>
    call<PaymentView[]>('GET', `/api/v1/customers/${customerId}/payments`),
  debtReport: () => call<CustomerDebtRow[]>('GET', '/api/v1/reports/debt'),

  insuranceForOrder: async (orderId: string): Promise<InsuranceClaimView | null> => {
    /*
     * NestJS biểu diễn `null` ở endpoint này bằng body rỗng. Lớp `call()` cố
     * tình coi JSON rỗng là `{}` để báo lỗi HTTP vẫn đọc được; riêng ở đây `{}`
     * không phải hồ sơ. Chuẩn hoá nó thành null trước khi giao cho giao diện.
     */
    const result = await call<InsuranceClaimView | Record<string, never> | null>(
      'GET',
      `/api/v1/repair-orders/${orderId}/insurance-claim`,
    );
    return result !== null && typeof result === 'object' && 'id' in result
      ? result as InsuranceClaimView
      : null;
  },
  createInsuranceClaim: (input: unknown) =>
    call<InsuranceClaimView>('POST', '/api/v1/insurance-claims', input),
  updateInsuranceClaim: (id: string, input: unknown) =>
    call<InsuranceClaimView>('POST', `/api/v1/insurance-claims/${id}/status`, input),
  setInsuranceExpectedLines: (id: string, invoiceLineIds: string[]) =>
    call<{ soDong: number }>('POST', `/api/v1/insurance-claims/${id}/expected-lines`, {
      invoiceLineIds,
    }),

  cancelPreview: (orderId: string) =>
    call<CancelPreviewView>('GET', `/api/v1/repair-orders/${orderId}/cancel-preview`),
  /*
   * Không còn `try/catch` dịch 404 thành `null`: máy chủ trả 200 cho đơn chưa
   * huỷ. Bọc lỗi để diễn đạt một trạng thái BÌNH THƯỜNG là chỗ dễ nuốt mất một
   * lỗi thật — `error.status === 404` cũng đúng khi id đơn sai.
   *
   * ⚠️ NestJS trả `null` bằng THÂN RỖNG, không phải chuỗi JSON `null`. `call()`
   *    gặp thân rỗng thì trả `{}` — mà `{}` là truthy, nên giao diện tưởng có
   *    bảng quyết toán rồi đọc trường không tồn tại và cả trang chi tiết đơn
   *    sập vào ranh giới lỗi.
   *
   *    Đã xảy ra đúng như vậy: bỏ lớp chuẩn hoá này làm 13 bài E2E đỏ với màn
   *    "Màn hình gặp sự cố". Cùng khuôn với `insuranceClaimForOrder` ngay phía
   *    trên — hai endpoint cùng hình dạng thì client cũng phải xử lý cùng cách.
   */
  settlementForOrder: async (orderId: string): Promise<SettlementView | null> => {
    const kq = await call<SettlementView | Record<string, never> | null>(
      'GET',
      `/api/v1/repair-orders/${orderId}/settlement`,
    );
    return kq !== null && typeof kq === 'object' && 'id' in kq ? (kq as SettlementView) : null;
  },
  cancelOrder: (orderId: string, input: unknown) =>
    call<SettlementView>('POST', `/api/v1/repair-orders/${orderId}/cancel`, input),
  confirmSettlement: (id: string) =>
    call<SettlementView>('POST', `/api/v1/settlements/${id}/confirm`),
  disputeSettlement: (id: string, note: string) =>
    call<SettlementView>('POST', `/api/v1/settlements/${id}/dispute`, { note }),
  waiveSettlement: (id: string, note: string) =>
    call<SettlementView>('POST', `/api/v1/settlements/${id}/waive`, { note }),

  listBays: () => call<Bay[]>('GET', '/api/v1/bays'),
  listPendingWork: () => call<PendingWorkItem[]>('GET', '/api/v1/assignments/pending-work'),
  suggestTechnicians: (quotationLineId: string, plannedStart: string) =>
    call<TechnicianOption[]>(
      'GET',
      `/api/v1/assignments/technician-options?quotationLineId=${quotationLineId}` +
        `&plannedStart=${encodeURIComponent(plannedStart)}`,
    ),
  listSchedule: (date: string) =>
    call<WorkAssignmentItem[]>('GET', `/api/v1/assignments?date=${date}`),
  technicianQuality: () =>
    call<TechnicianQualityItem[]>('GET', '/api/v1/assignments/quality'),
  createAssignment: (input: unknown) =>
    call<{ id: string; plannedEnd: string }>('POST', '/api/v1/assignments', input),
  timeSummary: (assignmentId: string) =>
    call<AssignmentTimeSummaryItem>('GET', `/api/v1/assignments/${assignmentId}/time`),
  startTimeLog: (workAssignmentId: string) =>
    call<{ id: string }>('POST', '/api/v1/time-logs/start', { workAssignmentId }),
  stopTimeLog: (input: unknown) =>
    call<{ actualHours: number; assignmentStatus: string }>(
      'POST', '/api/v1/time-logs/stop', input,
    ),

  changeAssignmentStatus: (id: string, input: unknown) =>
    call<{ status: string }>('POST', `/api/v1/assignments/${id}/status`, input),

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
export { ROLE_LABEL };
export const roleLabel = (r: string): string =>
  (ROLE_LABEL as Record<string, string>)[r] ?? r;

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
