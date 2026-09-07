/**
 * 🔒 HÀNG RÀO ma trận quyền — mọi quyền khai báo đều phải được thử.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao file này tồn tại
 *
 * `permissions.spec.ts` đã có một bảng "vai nào làm được gì" — nhưng nó liệt kê
 * đúng SÁU thao tác của Phase 1. Hai mươi bốn quyền thêm vào từ Phase 2 tới
 * Phase 8 (kho, phân công, bảo hành, hoá đơn, thanh toán, bảo hiểm) có test
 * riêng rải rác ở từng file, và KHÔNG có gì bảo đảm quyền thứ ba mươi mốt sẽ
 * được thử.
 *
 * Đây đúng hình dạng lỗi mà dự án đã gặp bốn lần và ghi vào STATUS.md:
 *
 *     "Danh sách chỉ bảo vệ được những gì người viết đã nghĩ ra."
 *
 * Cách chữa đã dùng thành công ở `tho-khong-thay-tien.spec.ts`: không liệt kê
 * tay, mà ĐỐI CHIẾU với nguồn sự thật. Ở đây nguồn đó là `ACTION_ROLES`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Hai điều file này KHÔNG làm, có chủ ý
 *
 *  1. **Không chép lại danh sách vai.** Mỗi kịch bản chỉ khai QUYỀN nó thử;
 *     tập vai được phép đọc thẳng từ `ACTION_ROLES`. Chép lại là tạo ra một
 *     bản sao thứ hai của ma trận, và bản sao đó sẽ lệch — lúc đó test xanh
 *     chứng minh mã nguồn khớp với chính bản chép, không khớp với tài liệu.
 *
 *  2. **Không đòi thao tác THÀNH CÔNG.** Nó chỉ phân biệt 403 với không-403.
 *     Một lời gọi thiếu dữ liệu vẫn trả 404 hay 409 — và đó là bằng chứng tốt
 *     rằng quyền đã cho qua. Đòi 201 sẽ biến bài kiểm phân quyền thành bài
 *     kiểm nghiệp vụ, và nó sẽ đỏ vì những lý do không liên quan.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { ACTION_ROLES, type PermissionAction } from '@garageos/contracts';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

/**
 * Mỗi vai một tài khoản seed.
 *
 * 🔒 Bốn vai của nhánh landing/bán xe nằm chung danh sách này CÓ CHỦ Ý. Bài
 * kiểm suy tập vai-bị-cấm bằng `MOI_VAI \ ACTION_ROLES[quyền]`, nên chỉ cần
 * thêm chúng vào đây là toàn bộ kịch bản CŨ — kho, tiền, đơn sửa chữa — tự
 * động được kiểm thêm với vai marketing và sales.
 *
 * Đó chính là `INV-LS-14`: vai mới chỉ có quyền mới, không kế thừa gì của
 * vận hành xưởng. Tách chúng ra một bài riêng sẽ bỏ lọt đúng thứ cần canh.
 */
const TAI_KHOAN = {
  OWNER: '0901000001',
  BRANCH_MANAGER: '0901000002',
  SERVICE_ADVISOR: '0901000003',
  TECHNICIAN: '0901000004',
  STORE_KEEPER: '0901000005',
  CASHIER: '0901000006',
  MARKETING_EDITOR: '0901000010',
  MARKETING_PUBLISHER: '0901000011',
  SALES_ADVISOR: '0901000012',
  SALES_MANAGER: '0901000013',
} as const;
type Vai = keyof typeof TAI_KHOAN;
const MOI_VAI = Object.keys(TAI_KHOAN) as Vai[];

let pool: Pool;
const token: Record<string, string> = {};
const uniq = `${Date.now().toString().slice(-5)}${process.pid.toString().slice(-3)}`;

/** Dữ liệu THẬT để lời gọi đi tới được tầng kiểm quyền */
const co: Record<string, string> = {};

async function call(
  method: string,
  path: string,
  body: unknown,
  vai: Vai,
): Promise<number> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Mode': 'token',
      Authorization: `Bearer ${token[vai]}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return res.status;
}

async function dangNhap(phone: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
    body: JSON.stringify({ phone, password: 'demo1234' }),
  });
  const j = (await res.json()) as { accessToken?: string };
  assert.ok(j.accessToken, `không đăng nhập được ${phone}`);
  return j.accessToken;
}

/**
 * Một kịch bản = một quyền + một lời gọi thật.
 *
 * `kieu`:
 *  · `chan` — vai không có quyền nhận 403 (đa số)
 *  · `luoc` — endpoint mở cho mọi vai nhưng LƯỢC BỚT TRƯỜNG. Không kiểm được
 *    bằng mã trạng thái; những quyền này đã có bài riêng quét từng trường
 *    (`tho-khong-thay-tien.spec.ts`), nên ở đây chỉ ghi nhận là đã có chỗ kiểm.
 */
interface KichBan {
  quyen: PermissionAction;
  ten: string;
  kieu?: 'chan' | 'luoc';
  goi?: (vai: Vai) => Promise<number>;
  /** Vì sao không kiểm bằng 403 — bắt buộc khi `kieu = 'luoc'` */
  kiemODau?: string;
}

const UUID_GIA = '00000000-0000-0000-0000-0000000000ff';

const KICH_BAN: KichBan[] = [
  {
    quyen: 'customer:create',
    ten: 'Tạo khách hàng',
    goi: (v) =>
      call('POST', '/api/v1/customers', {
        type: 'INDIVIDUAL',
        displayName: `Khách hàng rào ${uniq}${v}`,
        phone: `031${uniq}${MOI_VAI.indexOf(v)}`,
      }, v),
  },
  {
    quyen: 'vehicle:create',
    ten: 'Tạo xe',
    goi: (v) =>
      call('POST', '/api/v1/vehicles', {
        customerId: co.customerId,
        plateNumber: `21A-${uniq}${MOI_VAI.indexOf(v)}`,
        powertrain: 'ICE',
      }, v),
  },
  {
    quyen: 'repairOrder:create',
    ten: 'Tiếp nhận xe',
    goi: (v) =>
      call('POST', '/api/v1/repair-orders', {
        vehicleId: co.vehicleId,
        branchId: co.branchId,
        customerComplaint: 'Thử hàng rào quyền tiếp nhận',
        odometerIn: 100,
      }, v),
  },
  {
    quyen: 'repairOrder:photoWrite',
    ten: 'Tải ảnh hiện trạng',
    goi: (v) =>
      call('POST', `/api/v1/repair-orders/${co.orderId}/photos`, {
        phase: 'INTAKE',
        contentType: 'image/png',
        // PNG 1x1 thật — vai bị cấm phải dừng ở 403 TRƯỚC khi chạm nội dung.
        dataBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      }, v),
  },
  {
    quyen: 'repairOrder:read',
    ten: 'Xem danh sách xe trong xưởng',
    goi: (v) => call('GET', '/api/v1/repair-orders', undefined, v),
  },
  {
    quyen: 'quotation:write',
    ten: 'Lập báo giá',
    goi: (v) => call('POST', `/api/v1/repair-orders/${co.orderId}/quotations`, undefined, v),
  },
  {
    quyen: 'quotation:send',
    ten: 'Gửi báo giá cho khách',
    goi: (v) => call('POST', `/api/v1/quotations/${co.quotationId}/send`, undefined, v),
  },
  {
    quyen: 'quotation:read',
    ten: 'Đọc báo giá (thấy tiền)',
    goi: (v) => call('GET', `/api/v1/quotations/${co.quotationId}`, undefined, v),
  },
  {
    quyen: 'quotation:discountOverThreshold',
    ten: 'Áp chiết khấu vượt ngưỡng',
    kieu: 'luoc',
    kiemODau:
      'quotation.spec.ts — chiết khấu trong ngưỡng thì cố vấn làm được, vượt ngưỡng ' +
      'thì bị chặn. Không kiểm được bằng 403 trên một endpoint riêng vì nó là điều ' +
      'kiện TRÊN GIÁ TRỊ, không phải trên endpoint.',
  },
  {
    quyen: 'catalog:readPrice',
    ten: 'Xem giá bán trong danh mục',
    kieu: 'luoc',
    kiemODau:
      'tho-khong-thay-tien.spec.ts — endpoint mở cho cả thợ (họ cần danh mục để ' +
      'báo phát sinh), chỉ LƯỢC BỎ trường tiền. Chặn cả endpoint sẽ làm hỏng luồng ' +
      'báo phát sinh trên app thợ.',
  },
  {
    quyen: 'stock:read',
    ten: 'Xem tồn kho',
    goi: (v) => call('GET', '/api/v1/stock/balances', undefined, v),
  },
  {
    quyen: 'stock:readCost',
    ten: 'Xem giá vốn',
    kieu: 'luoc',
    kiemODau:
      'stock.spec.ts + e2e/kho.spec.ts — cùng endpoint `stock/balances`, khác nhau ' +
      'ở việc có trường `avgCost` hay không.',
  },
  {
    quyen: 'stock:receive',
    ten: 'Nhập kho',
    goi: (v) =>
      call('POST', '/api/v1/stock/receipts', {
        warehouseId: co.warehouseId,
        partId: co.partId,
        quantity: 1,
        unitCost: 1000,
      }, v),
  },
  {
    quyen: 'stock:adjust',
    ten: 'Điều chỉnh tồn kho',
    goi: (v) =>
      call('POST', '/api/v1/stock/adjustments', {
        warehouseId: co.warehouseId,
        partId: co.partId,
        delta: 1,
        reason: 'Thử hàng rào quyền điều chỉnh tồn',
      }, v),
  },
  {
    quyen: 'stock:issue',
    ten: 'Xuất kho',
    goi: (v) => call('POST', '/api/v1/stock/issues', { reservationId: UUID_GIA }, v),
  },
  {
    quyen: 'assignment:read',
    ten: 'Xem lịch xưởng',
    goi: (v) => call('GET', '/api/v1/bays', undefined, v),
  },
  {
    quyen: 'assignment:write',
    ten: 'Xếp khoang và thợ',
    goi: (v) =>
      call('POST', '/api/v1/assignments', {
        quotationLineId: co.quotationLineId,
        technicianId: co.technicianId,
        bayId: co.bayId,
        plannedStart: new Date(Date.now() + 900 * 86_400_000).toISOString(),
      }, v),
  },
  {
    quyen: 'assignment:qc',
    ten: 'Kiểm tra chất lượng',
    goi: (v) =>
      call('POST', `/api/v1/assignments/${co.assignmentId}/status`, {
        to: 'QC_PASSED',
        qcNote: 'Thử hàng rào quyền QC',
      }, v),
  },
  {
    quyen: 'supplement:report',
    ten: 'Báo phát sinh',
    goi: (v) =>
      call('POST', '/api/v1/supplements', {
        repairOrderId: co.orderId,
        serviceItemId: co.serviceItemId,
        description: 'Thử hàng rào quyền báo phát sinh, mô tả đủ dài',
      }, v),
  },
  {
    quyen: 'supplement:resolve',
    ten: 'Quyết định phát sinh bị từ chối',
    goi: (v) =>
      call('POST', `/api/v1/supplements/${UUID_GIA}/resolve`, {
        decision: 'CANNOT_PROCEED',
        note: 'Thử hàng rào quyền quyết định phát sinh',
      }, v),
  },
  {
    quyen: 'warranty:read',
    ten: 'Tra cứu bảo hành',
    goi: (v) => call('GET', `/api/v1/vehicles/${co.vehicleId}/warranty`, undefined, v),
  },
  {
    quyen: 'warranty:claim',
    ten: 'Mở đơn bảo hành',
    goi: (v) =>
      call('POST', '/api/v1/warranty/claims', {
        repairOrderId: co.orderId,
        originalRepairOrderId: co.orderId,
        coverageIds: [UUID_GIA],
      }, v),
  },
  {
    quyen: 'warranty:recover',
    ten: 'Ghi nhận đòi lại từ nhà cung cấp',
    goi: (v) =>
      call('POST', `/api/v1/warranty/claims/${UUID_GIA}/supplier-recovery`, {
        amount: 1000,
        note: 'Thử hàng rào quyền đòi lại nhà cung cấp',
      }, v),
  },
  {
    quyen: 'timeLog:write',
    ten: 'Bấm giờ công',
    goi: (v) => call('POST', '/api/v1/time-logs/start', { workAssignmentId: UUID_GIA }, v),
  },
  {
    quyen: 'timeLog:enterForOther',
    ten: 'Nhập hộ giờ công',
    goi: (v) =>
      call('POST', '/api/v1/time-logs/enter', {
        workAssignmentId: UUID_GIA,
        startedAt: new Date(Date.now() - 7200_000).toISOString(),
        endedAt: new Date(Date.now() - 3600_000).toISOString(),
        note: 'Thử hàng rào quyền nhập hộ giờ công',
      }, v),
  },
  {
    quyen: 'invoice:read',
    ten: 'Xem hoá đơn',
    goi: (v) => call('GET', `/api/v1/repair-orders/${co.orderId}/invoices`, undefined, v),
  },
  {
    quyen: 'invoice:write',
    ten: 'Lập hoá đơn nháp',
    goi: (v) => call('POST', '/api/v1/invoices', { repairOrderId: co.orderId }, v),
  },
  {
    quyen: 'invoice:issue',
    ten: 'Phát hành hoá đơn',
    goi: (v) => call('POST', `/api/v1/invoices/${UUID_GIA}/issue`, { ghiCongNo: false }, v),
  },
  {
    quyen: 'invoice:adjust',
    ten: 'Lập hoá đơn điều chỉnh',
    goi: (v) =>
      call('POST', `/api/v1/invoices/${UUID_GIA}/adjust`, {
        reason: 'Thử hàng rào quyền điều chỉnh hoá đơn',
        lines: [{ lineType: 'FEE', description: 'Thử', quantity: 1, unitPrice: -1000 }],
      }, v),
  },
  {
    quyen: 'payment:record',
    ten: 'Thu tiền',
    goi: (v) =>
      call('POST', '/api/v1/payments', {
        customerId: co.customerId,
        amount: 1000,
        method: 'CASH',
        idempotencyKey: `hangrao-${uniq}-${MOI_VAI.indexOf(v)}`,
        allocations: [{ invoiceLineId: UUID_GIA, amount: 1000 }],
      }, v),
  },
  {
    quyen: 'credit:approveOverLimit',
    ten: 'Duyệt cho nợ vượt hạn mức',
    kieu: 'luoc',
    kiemODau:
      'hoa-don.spec.ts bài 2 — thu ngân bị chặn, quản lý duyệt được. Không kiểm ' +
      'được bằng 403 trên một endpoint riêng vì nó là điều kiện TRÊN SỐ TIỀN của ' +
      'chính lời gọi phát hành hoá đơn.',
  },
  {
    quyen: 'insurance:manage',
    ten: 'Quản lý hồ sơ bồi thường',
    goi: (v) =>
      call('POST', '/api/v1/insurance-claims', {
        repairOrderId: co.orderId,
        insurerName: 'Bảo hiểm thử hàng rào',
        policyNumber: `HR-${uniq}`,
      }, v),
  },

  /* ================= Landing bán xe và Sales (INV-LS-14) =================
   *
   * Mọi kịch bản dưới đây cố ý gọi vào `UUID_GIA` — một id không tồn tại.
   *
   * Bài này phân biệt 403 với không-403, nên đối tượng có thật hay không là
   * chuyện không liên quan; dùng id giả thì không phải dựng dữ liệu, và quan
   * trọng hơn: không để lại rác cho những bài chạy sau.
   *
   * Chọn endpoint KHÔNG có `ZodPipe` khi có thể. Pipe chạy TRƯỚC `assertCan`,
   * nên body sai schema trả 400 và làm cả hai vế của bài kiểm vô nghĩa — vai
   * bị cấm cũng nhận 400 chứ không phải 403.
   */
  {
    quyen: 'marketing:catalogRead',
    ten: 'Xem catalog xe',
    goi: (v) => call('GET', '/api/v1/marketing/vehicle-products', undefined, v),
  },
  {
    quyen: 'marketing:catalogWrite',
    ten: 'Sửa bản nháp catalog xe',
    goi: (v) =>
      call('PATCH', `/api/v1/marketing/vehicle-products/${UUID_GIA}/draft`, { version: 0 }, v),
  },
  {
    quyen: 'marketing:catalogPublish',
    ten: 'Rollback catalog xe',
    goi: (v) =>
      call('POST', `/api/v1/marketing/vehicle-products/${UUID_GIA}/rollback`, undefined, v),
  },
  {
    quyen: 'marketing:categoryRead',
    ten: 'Xem category showroom',
    goi: (v) => call('GET', '/api/v1/marketing/categories', undefined, v),
  },
  {
    quyen: 'marketing:categoryWrite',
    ten: 'Sửa category showroom',
    goi: (v) => call('PATCH', `/api/v1/marketing/categories/${UUID_GIA}`, { name: 'Category test', slug: 'category-test', status: 'ACTIVE', sortOrder: 0, version: 0 }, v),
  },
  {
    quyen: 'marketing:reviewRead',
    ten: 'Xem testimonial',
    goi: (v) => call('GET', '/api/v1/marketing/testimonials', undefined, v),
  },
  {
    quyen: 'marketing:reviewWrite',
    ten: 'Sửa testimonial nháp',
    goi: (v) => call('PATCH', `/api/v1/marketing/testimonials/${UUID_GIA}`, { displayName: 'Test', content: 'Nội dung testimonial hợp lệ', featured: false, sortOrder: 0, version: 0 }, v),
  },
  {
    quyen: 'marketing:reviewPublish',
    ten: 'Publish testimonial',
    goi: (v) => call('POST', `/api/v1/marketing/testimonials/${UUID_GIA}/publish`, undefined, v),
  },
  {
    quyen: 'showroom:feeScheduleRead',
    ten: 'Xem biểu phí lăn bánh',
    goi: (v) => call('GET', '/api/v1/showroom/fee-schedules', undefined, v),
  },
  {
    quyen: 'showroom:feeScheduleWrite',
    ten: 'Sửa biểu phí lăn bánh',
    goi: (v) =>
      call('PUT', '/api/v1/showroom/fee-schedules', {
        provinceCode: '98', provinceName: 'Tỉnh ma trận quyền', powertrain: 'ICE',
        registrationFeeRateBp: 1000, plateFeeAmount: 1_000_000, inspectionFeeAmount: 340_000,
        roadMaintenanceFeeAmount: 1_560_000, civilInsuranceFeeAmount: 480_000,
        effectiveFrom: '2029-01-01',
      }, v),
  },
  {
    /*
     * 🔒 INV-LS-21 ở dạng cụ thể nhất: đổi GIÁ tách khỏi sửa NỘI DUNG.
     *    `MARKETING_EDITOR` sửa được mô tả và ảnh nhưng KHÔNG đổi được giá công
     *    bố — giá là thứ khách chụp màn hình rồi mang đến showroom.
     */
    quyen: 'showroom:priceWrite',
    ten: 'Đổi giá công bố',
    goi: (v) =>
      call('POST', `/api/v1/showroom/products/${UUID_GIA}/price`, {
        variantId: UUID_GIA, newAmount: 999_000_000, reason: 'Kịch bản ma trận quyền',
      }, v),
  },
  {
    quyen: 'showroom:commerceWrite',
    ten: 'Sửa ưu đãi và trả góp',
    goi: (v) => call('PUT', `/api/v1/showroom/revisions/${UUID_GIA}/promotions`, [], v),
  },
  {
    quyen: 'showroom:availabilityWrite',
    ten: 'Cập nhật khả năng giao xe',
    goi: (v) =>
      call('PUT', `/api/v1/showroom/products/${UUID_GIA}/availability`, {
        branchId: UUID_GIA, status: 'TAM_NGUNG', availableVariantIds: [], availableColorIds: [],
      }, v),
  },
  {
    quyen: 'marketing:experienceRead',
    ten: 'Xem trải nghiệm xe',
    goi: (v) =>
      call('GET', `/api/v1/marketing/vehicle-products/${UUID_GIA}/experiences`, undefined, v),
  },
  {
    quyen: 'marketing:landingRead',
    ten: 'Xem trang landing',
    goi: (v) => call('GET', '/api/v1/marketing/landing-pages', undefined, v),
  },
  {
    quyen: 'marketing:landingWrite',
    ten: 'Tạo bản nháp landing',
    goi: (v) => call('POST', `/api/v1/marketing/landing-pages/${UUID_GIA}/draft`, undefined, v),
  },
  {
    quyen: 'marketing:landingPublish',
    ten: 'Publish landing',
    goi: (v) => call('POST', `/api/v1/marketing/landing-pages/${UUID_GIA}/publish`, { version: 0 }, v),
  },
  {
    quyen: 'marketing:mediaRead',
    ten: 'Xem thư viện media',
    goi: (v) => call('GET', '/api/v1/marketing/media', undefined, v),
  },
  {
    quyen: 'marketing:experienceWrite',
    ten: 'Tạo bản nháp trải nghiệm xe',
    goi: (v) =>
      call('POST', `/api/v1/marketing/vehicle-experiences/${UUID_GIA}/draft`, undefined, v),
  },
  {
    quyen: 'marketing:experiencePublish',
    ten: 'Rollback trải nghiệm xe',
    goi: (v) =>
      call('POST', `/api/v1/marketing/vehicle-experiences/${UUID_GIA}/rollback`, undefined, v),
  },
  {
    quyen: 'marketing:seoRead',
    ten: 'Xem hồ sơ trang',
    goi: (v) => call('GET', '/api/v1/marketing/site-profile', undefined, v),
  },
  {
    quyen: 'marketing:seoWrite',
    ten: 'Sửa bản nháp hồ sơ chi nhánh công khai',
    goi: (v) =>
      call(
        'PATCH',
        `/api/v1/marketing/branch-public-profiles/${UUID_GIA}/draft`,
        { version: 0 },
        v,
      ),
  },
  {
    quyen: 'marketing:seoPublish',
    ten: 'Publish hồ sơ trang',
    goi: (v) =>
      call('POST', `/api/v1/marketing/site-profile/${UUID_GIA}/publish`, undefined, v),
  },
  {
    quyen: 'sales:leadRead',
    ten: 'Xem lead',
    goi: (v) => call('GET', `/api/v1/sales/leads/${UUID_GIA}`, undefined, v),
  },
  {
    quyen: 'sales:leadReadAllBranch',
    ten: 'Xem lead của mọi chi nhánh',
    kieu: 'luoc',
    kiemODau:
      'landing-tenant-cong-khai.spec.ts và scopeForAction() — quyền này KHÔNG chặn ' +
      'endpoint nào, nó quyết định phạm vi truy vấn là BRANCH hay SELF. Một vai ' +
      'thiếu nó vẫn gọi được GET /sales/leads, chỉ thấy ít dòng hơn — nên 403 ' +
      'không phải là thứ quan sát được. ⚠️ NỢ: bài quét phạm vi chi nhánh chưa ' +
      'dựng lead ở chi nhánh khác nên chưa canh được vế "thấy ít dòng hơn".',
  },
  {
    quyen: 'sales:leadAssign',
    ten: 'Gán lead cho tư vấn',
    goi: (v) =>
      call(
        'POST',
        `/api/v1/sales/leads/${UUID_GIA}/assign`,
        { assigneeId: UUID_GIA, version: 0 },
        v,
      ),
  },
  {
    quyen: 'sales:leadTransition',
    ten: 'Chuyển trạng thái lead',
    goi: (v) =>
      call(
        'POST',
        `/api/v1/sales/leads/${UUID_GIA}/transition`,
        { to: 'CONTACTED', version: 0 },
        v,
      ),
  },
  {
    quyen: 'sales:leadAddActivity',
    ten: 'Ghi hoạt động lên lead',
    goi: (v) =>
      call(
        'POST',
        `/api/v1/sales/leads/${UUID_GIA}/activities`,
        { type: 'NOTE', note: 'Thử hàng rào quyền' },
        v,
      ),
  },
  {
    quyen: 'sales:leadRedact',
    ten: 'Xoá dữ liệu cá nhân của lead',
    goi: (v) =>
      call(
        'POST',
        `/api/v1/sales/leads/${UUID_GIA}/redact`,
        { reason: 'SUBJECT_REQUEST' },
        v,
      ),
  },
];

before(async () => {
  pool = new Pool({ connectionString: ADMIN_URL });
  for (const [vai, phone] of Object.entries(TAI_KHOAN)) {
    token[vai] = await dangNhap(phone);
  }

  /*
   * Dựng dữ liệu THẬT cho các kịch bản.
   *
   * 🔒 Dùng id thật ở đâu có thể, thay vì uuid bịa. Lý do không phải "sạch hơn":
   * nếu service đọc dữ liệu TRƯỚC khi kiểm quyền, một id bịa sẽ trả 404 cho cả
   * vai không có quyền — và bài kiểm sẽ báo xanh cho một lỗ hổng thật.
   *
   * Chỗ nào buộc phải dùng uuid bịa thì đó chính là chỗ đang khẳng định service
   * kiểm quyền TRƯỚC khi chạm dữ liệu.
   */
  /*
   * 🔒 Chi nhánh phải là chi nhánh mà CỐ VẤN thuộc về, không phải "chi nhánh
   * đầu tiên theo mã".
   *
   * `repairOrder:create` kiểm hai điều: đúng vai VÀ đúng phạm vi chi nhánh. Lấy
   * `ORDER BY code LIMIT 1` trúng HCM01, trong khi cố vấn và quản lý thuộc HN01
   * — cả hai nhận 403 vì PHẠM VI, và bài kiểm báo "chặn nhầm vai được phép".
   *
   * Chủ xưởng thì qua, vì họ có cả ba chi nhánh. Một bài kiểm phân quyền mà chỉ
   * chủ xưởng đi lọt là dấu hiệu rõ nhất rằng đang đo nhầm thứ.
   */
  const { rows: b } = await pool.query<{ id: string }>(
    `SELECT ub.branch_id AS id FROM user_branch ub
       JOIN app_user u ON u.id = ub.user_id
      WHERE u.tenant_id = $1 AND u.phone = $2 LIMIT 1`,
    [TENANT_A, TAI_KHOAN.SERVICE_ADVISOR],
  );
  co.branchId = b[0]!.id;

  const { rows: c } = await pool.query<{ id: string }>(
    `INSERT INTO customer (tenant_id, type, display_name, phone)
     VALUES ($1,'INDIVIDUAL',$2,$3) RETURNING id`,
    [TENANT_A, `Khách hàng rào ${uniq}`, `032${uniq}`],
  );
  co.customerId = c[0]!.id;

  /*
   * 🔒 Đơn RIÊNG cho bài này, không mượn `RO-DEMO-0001`.
   *
   * Kịch bản `quotation:write` gọi "lập báo giá" SÁU LẦN mỗi lượt chạy — một
   * lần cho mỗi vai. Mượn đơn demo thì sau vài lượt nó có hàng chục báo giá
   * rỗng, và bài `tho-khong-thay-tien.spec.ts` (đọc "báo giá mới nhất" của đơn
   * demo) bắt đầu đọc phải một bản nháp trống.
   *
   * Đã xảy ra thật ngay lượt chạy thứ hai: `ORDER BY seq DESC LIMIT 1` trả về
   * một báo giá rỗng do chính lượt trước tạo ra, và cả bộ test sập ở `before`.
   * Một bài kiểm phân quyền làm hỏng dữ liệu của bài khác là cái giá quá đắt
   * cho việc tiết kiệm mấy dòng dựng cảnh.
   */
  const { rows: v } = await pool.query<{ id: string }>(
    `INSERT INTO vehicle (tenant_id, customer_id, plate_number, powertrain)
     VALUES ($1,$2,$3,'ICE') RETURNING id`,
    [TENANT_A, co.customerId, `21Z${uniq}`],
  );
  co.vehicleId = v[0]!.id;

  const { rows: u } = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: ro } = await pool.query<{ id: string }>(
    `INSERT INTO repair_order (tenant_id, branch_id, code, customer_id, vehicle_id,
                               customer_complaint, odometer_in, customer_access_token,
                               created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,'Dựng cảnh cho hàng rào quyền',1000,$6,$7) RETURNING id`,
    [
      TENANT_A,
      co.branchId,
      `RO-HR-${uniq}`,
      co.customerId,
      co.vehicleId,
      `hangrao${uniq}${'x'.repeat(32)}`,
      u[0]!.id,
    ],
  );
  co.orderId = ro[0]!.id;

  const { rows: pl } = await pool.query<{ id: string; labor_rate_per_hour: string }>(
    `SELECT id, labor_rate_per_hour FROM price_list
      WHERE tenant_id = $1 AND effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC LIMIT 1`,
    [TENANT_A],
  );
  const { rows: q } = await pool.query<{ id: string }>(
    `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                            price_list_id, created_by_user_id)
     VALUES ($1,$2,1,$3,$4,$5) RETURNING id`,
    [TENANT_A, co.orderId, pl[0]!.labor_rate_per_hour, pl[0]!.id, u[0]!.id],
  );
  co.quotationId = q[0]!.id;

  const { rows: sv0 } = await pool.query<{ id: string; standard_hours: string }>(
    `SELECT id, standard_hours FROM service_item
      WHERE tenant_id = $1 AND is_active AND cardinality(required_certifications) = 0 LIMIT 1`,
    [TENANT_A],
  );
  const { rows: ql } = await pool.query<{ id: string }>(
    `INSERT INTO quotation_line (tenant_id, quotation_id, seq, line_type, service_item_id,
                                 description, quantity, unit_price, tax_rate_percent)
     VALUES ($1,$2,1,'LABOR',$3,'Hạng mục dựng cảnh',1,$4,0) RETURNING id`,
    [TENANT_A, co.quotationId, sv0[0]!.id, pl[0]!.labor_rate_per_hour],
  );
  co.quotationLineId = ql[0]!.id;

  /*
   * 🔒 Phân công phải thuộc một đơn ĐANG SỬA, không phải phân công cũ nhất.
   *
   * `ORDER BY planned_start LIMIT 1` chọn cái sớm nhất về thời gian — và seed
   * Phase 3 thêm những phân công ĐÃ XONG đặt ở quá khứ, nên chúng chiếm vị trí
   * đầu. Bài kiểm "vai được phép không bị 403" khi đó thao tác lên một phân
   * công của đơn đã chờ thanh toán, và bị chặn vì lý do chẳng liên quan gì tới
   * phân quyền.
   *
   * Nói ra điều kiện thật: bài này cần một phân công còn thao tác được.
   */
  const { rows: wa } = await pool.query<{ id: string; technician_id: string; bay_id: string }>(
    `SELECT w.id, w.technician_id, w.bay_id FROM work_assignment w
       JOIN repair_order r ON r.id = w.repair_order_id
      WHERE w.tenant_id = $1 AND r.status = 'IN_PROGRESS'
      ORDER BY w.planned_start LIMIT 1`,
    [TENANT_A],
  );
  assert.ok(wa[0], 'seed không còn phân công nào của đơn đang sửa');
  co.assignmentId = wa[0]!.id;
  co.technicianId = wa[0]!.technician_id;
  co.bayId = wa[0]!.bay_id;

  const { rows: w } = await pool.query<{ id: string }>(
    `SELECT id FROM warehouse WHERE tenant_id = $1 LIMIT 1`,
    [TENANT_A],
  );
  co.warehouseId = w[0]!.id;

  const { rows: p } = await pool.query<{ id: string }>(
    `SELECT id FROM part WHERE tenant_id = $1 AND is_active LIMIT 1`,
    [TENANT_A],
  );
  co.partId = p[0]!.id;

  const { rows: si } = await pool.query<{ id: string }>(
    `SELECT id FROM service_item WHERE tenant_id = $1 AND is_active LIMIT 1`,
    [TENANT_A],
  );
  co.serviceItemId = si[0]!.id;
});

after(async () => {
  /*
   * Dọn theo đúng thứ tự khoá ngoại. Sáu vai mỗi vai một lời gọi nên mỗi lượt
   * chạy để lại tối đa sáu báo giá và vài khách hàng — không dọn thì sau một
   * tuần bảng `quotation` toàn dữ liệu của test này.
   */
  const dons = await pool.query<{ id: string }>(
    `SELECT id FROM repair_order WHERE code LIKE $1`,
    [`RO-HR-${uniq}%`],
  );
  for (const d of dons.rows) {
    /*
     * Đưa báo giá về DRAFT trước khi xoá dòng.
     *
     * Kịch bản `quotation:send` đã GỬI báo giá cho khách, và `INV-Q-05` chặn
     * xoá dòng khỏi một báo giá đã gửi — kể cả bằng kết nối quản trị. Đó là
     * điều đúng: bớt một dòng khỏi thứ khách đã nhìn thấy là đổi nội dung một
     * lời chào giá đã đưa ra.
     *
     * Dọn dẹp trong test cũng phải đi qua cùng cái cửa đó, không có lối tắt
     * riêng. Cùng cách đã làm ở kiem-ke.spec.ts và huy-don.spec.ts.
     */
    /*
     * Phát sinh do kịch bản `supplement:report` tạo ra trỏ về đơn này. Xoá đơn
     * mà quên chúng thì khoá ngoại chặn — và đó là khoá ngoại làm đúng việc,
     * cùng lập luận với danh sách TRUNCATE không dùng CASCADE ở `infra/seed.ts`:
     * quên một bảng thì phải ỒN ÀO, không im lặng.
     */
    /*
     * Bốn kịch bản để lại dữ liệu con trên đơn này: báo giá (`quotation:write`),
     * phát sinh (`supplement:report`), hồ sơ bảo hiểm (`insurance:manage`) và
     * hoá đơn nháp (`invoice:write`) — mỗi thứ nhân sáu vai.
     */
    await pool.query(`DELETE FROM invoice_line WHERE invoice_id IN
       (SELECT id FROM invoice WHERE repair_order_id = $1)`, [d.id]);
    await pool.query(`DELETE FROM invoice WHERE repair_order_id = $1`, [d.id]);
    await pool.query(`DELETE FROM insurance_claim WHERE repair_order_id = $1`, [d.id]);
    await pool.query(`DELETE FROM supplement_block WHERE supplement_request_id IN
       (SELECT id FROM supplement_request WHERE repair_order_id = $1)`, [d.id]);
    await pool.query(`DELETE FROM supplement_request WHERE repair_order_id = $1`, [d.id]);
    await pool.query(`UPDATE quotation SET status = 'DRAFT' WHERE repair_order_id = $1`, [d.id]);
    await pool.query(
      `DELETE FROM quotation_line WHERE quotation_id IN
         (SELECT id FROM quotation WHERE repair_order_id = $1)`,
      [d.id],
    );
    await pool.query(`DELETE FROM quotation WHERE repair_order_id = $1`, [d.id]);
    /*
     * Ảnh hiện trạng: kịch bản `repairOrder:photoWrite` tạo hàng thật cho những
     * vai ĐƯỢC phép, và khoá ngoại của nó chặn việc xoá đơn.
     *
     * 💡 Đây là cái giá của một hàng rào tốt: mỗi quyền mới đều bị ép phải có
     *    kịch bản, và mỗi kịch bản ghi dữ liệu đều phải tự dọn. Rẻ hơn nhiều so
     *    với một quyền không ai thử.
     */
    await pool.query(`DELETE FROM repair_order_photo WHERE repair_order_id = $1`, [d.id]);
    await pool.query(`DELETE FROM repair_order WHERE id = $1`, [d.id]);
  }
  // Tạo xe qua API sinh kèm bản ghi sang tên chủ (`vehicle_ownership`) — lịch
  // sử sở hữu là bảng chỉ-thêm nên nó không tự biến mất theo xe.
  await pool.query(
    `DELETE FROM vehicle_ownership WHERE vehicle_id IN
       (SELECT id FROM vehicle WHERE plate_number LIKE $1)`,
    [`21%${uniq}%`],
  );
  await pool.query(`DELETE FROM vehicle WHERE plate_number LIKE $1`, [`21%${uniq}%`]);
  await pool.query(`DELETE FROM customer WHERE phone LIKE $1`, [`03%${uniq}%`]);
  await pool.end();
});

describe('🔒 Hàng rào: MỌI quyền khai báo đều phải có kịch bản', () => {
  test('không quyền nào trong ACTION_ROLES bị bỏ quên', () => {
    /*
     * Bài quan trọng nhất của file này, và nó không gọi API lần nào.
     *
     * Thêm một quyền vào `ACTION_ROLES` mà quên viết kịch bản thì test đỏ ngay
     * — chứ không phải "xanh vì không ai nghĩ tới nó".
     */
    const daKhai = Object.keys(ACTION_ROLES) as PermissionAction[];
    const daThu = new Set(KICH_BAN.map((k) => k.quyen));
    const thieu = daKhai.filter((q) => !daThu.has(q));

    assert.deepEqual(
      thieu,
      [],
      'Quyền khai báo mà chưa có kịch bản kiểm — thêm vào KICH_BAN của test này',
    );
  });

  test('không kịch bản nào thử một quyền đã bị xoá', () => {
    // Chiều ngược lại: gỡ một quyền khỏi ma trận mà quên gỡ kịch bản thì bài
    // kiểm sẽ thử một thứ không còn tồn tại, và luôn xanh một cách vô nghĩa.
    const daKhai = new Set(Object.keys(ACTION_ROLES));
    const thua = KICH_BAN.filter((k) => !daKhai.has(k.quyen)).map((k) => k.quyen);
    assert.deepEqual(thua, [], 'Kịch bản thử một quyền không còn trong ACTION_ROLES');
  });

  test('mỗi quyền chỉ có MỘT kịch bản', () => {
    const dem = new Map<string, number>();
    for (const k of KICH_BAN) dem.set(k.quyen, (dem.get(k.quyen) ?? 0) + 1);
    const trung = [...dem.entries()].filter(([, n]) => n > 1).map(([q]) => q);
    assert.deepEqual(trung, [], 'Một quyền có nhiều kịch bản — dễ lệch nhau về sau');
  });

  test('kịch bản kiểu "luoc" phải nói rõ nó được kiểm ở đâu', () => {
    /*
     * Ba quyền không kiểm được bằng mã trạng thái: chúng là điều kiện TRÊN GIÁ
     * TRỊ (chiết khấu vượt ngưỡng, cho nợ vượt hạn mức) hoặc LƯỢC TRƯỜNG (giá
     * bán, giá vốn) chứ không phải chặn cả endpoint.
     *
     * Chấp nhận được — nhưng phải NÓI RA nó được kiểm ở đâu. "Không kiểm được
     * bằng cách này" mà không kèm "đã kiểm bằng cách kia" là một lỗ hổng đội lốt
     * một ngoại lệ hợp lý.
     */
    const thieuLyDo = KICH_BAN.filter(
      (k) => k.kieu === 'luoc' && (k.kiemODau ?? '').length < 30,
    ).map((k) => k.quyen);
    assert.deepEqual(thieuLyDo, [], 'Kịch bản "luoc" thiếu ghi chú nơi kiểm thật');

    const thieuGoi = KICH_BAN.filter((k) => k.kieu !== 'luoc' && k.goi === undefined).map(
      (k) => k.quyen,
    );
    assert.deepEqual(thieuGoi, [], 'Kịch bản thường thiếu lời gọi');
  });
});

describe('🔒 Ma trận quyền — hành vi khớp với ACTION_ROLES', () => {
  for (const kb of KICH_BAN.filter((k) => k.kieu !== 'luoc')) {
    const duocPhep = ACTION_ROLES[kb.quyen] as readonly string[];
    const biCam = MOI_VAI.filter((v) => !duocPhep.includes(v));

    test(`${kb.ten} — ${biCam.length} vai bị cấm nhận 403`, async () => {
      const sai: string[] = [];
      for (const vai of biCam) {
        const status = await kb.goi!(vai);
        if (status !== 403) {
          sai.push(`${vai} nhận ${status} thay vì 403`);
        }
      }
      assert.deepEqual(
        sai,
        [],
        `🔒 "${kb.ten}" (${kb.quyen}) — vai không có quyền vẫn đi qua:\n  ${sai.join('\n  ')}`,
      );
    });

    test(`${kb.ten} — ĐỐI CHỨNG: ${duocPhep.length} vai được phép KHÔNG bị 403`, async () => {
      /*
       * Không có vế này thì bài trên chỉ chứng minh "có gì đó chặn". Một
       * endpoint hỏng trả 403 cho mọi người cũng làm bài kia xanh — trong khi
       * cả xưởng không dùng được tính năng đó.
       *
       * Chỉ đòi KHÁC 403: 404/409/400 đều là bằng chứng quyền đã cho qua và
       * lời gọi đã tới được tầng nghiệp vụ.
       */
      const sai: string[] = [];
      for (const vai of duocPhep as Vai[]) {
        if (!MOI_VAI.includes(vai)) continue;
        const status = await kb.goi!(vai);
        if (status === 403) sai.push(`${vai} bị 403 dù ma trận cho phép`);
      }
      assert.deepEqual(
        sai,
        [],
        `"${kb.ten}" (${kb.quyen}) — chặn nhầm vai được phép:\n  ${sai.join('\n  ')}`,
      );
    });
  }
});
