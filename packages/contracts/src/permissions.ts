import type { Role } from './roles.js';

/**
 * 🔒 Ai được làm gì — `docs/02-actors-and-permissions.md` mục 3 (ma trận quyền).
 *
 * Vì sao bảng này tồn tại, viết ra để lần sau không ai gỡ nó đi:
 *
 * Trước bảng này, dự án có hàm `hasRole()` trong `actor.ts` mà **không nơi nào
 * gọi**, và kiểm tra vai chỉ được cài ở đúng MỘT endpoint (`changeStatus`, sau
 * codex-review GARAGEOS-REV-002). Kết quả đo được bằng thực nghiệm: một
 * `TECHNICIAN` đăng nhập rồi gọi thẳng API là tạo được khách hàng, tạo được xe,
 * tiếp nhận được đơn, lập được báo giá, và đẩy đơn qua hai bước máy trạng thái —
 * trong khi cùng người đó bị chặn 403 ở endpoint đổi trạng thái. Một cửa khoá,
 * năm cửa mở.
 *
 * Bài học: kiểm tra quyền rải rác theo từng service thì chỗ nào có người review
 * kỹ mới có. Khai báo tập trung thì thiếu sót nhìn thấy được.
 *
 * Đây là DANH SÁCH CHO PHÉP: vai không có tên thì không làm được. Thêm vai mới
 * mà quên khai báo sẽ bị chặn, chứ không phải được thả.
 */
export const ACTION_ROLES = {
  /** Tạo hồ sơ khách hàng — biển số và hồ sơ khách là khoá của toàn bộ lịch sử xe */
  'customer:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  'vehicle:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /** Tiếp nhận xe — docs/02 mục 3, hàng "Đơn sửa chữa / Tạo" */
  'repairOrder:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /** Lập và sửa báo giá — hàng "Báo giá / Lập-sửa (bản nháp)" */
  'quotation:write': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  /** Gửi báo giá cho khách — hàng "Báo giá / Gửi cho khách" */
  'quotation:send': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 ĐỌC báo giá — tức là thấy TIỀN.
   *
   * Tách khỏi `quotation:write` vì thu ngân phải thấy số tiền để thu, nhưng
   * không được lập báo giá. Và quan trọng hơn: THỢ không có quyền này.
   *
   * docs/02 mục 2.3 nói thẳng thợ "không được thấy bất kỳ số tiền nào". Trước
   * lát cắt 4.5, `QuotationService.getById` và `listForOrder` KHÔNG có kiểm tra
   * vai nào cả — một tài khoản thợ đọc được đơn giá từng dòng, tổng tiền, và
   * đơn giá giờ công của cả xưởng.
   *
   * Đây là đúng hình dạng lỗ hổng mà vòng rà soát Phase 1 đã ghi lại: kiểm tra
   * quyền rải rác theo từng phương thức thì chỗ nào không được review kỹ là chỗ
   * đó thiếu.
   */
  'quotation:read': ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Xem GIÁ BÁN trong danh mục — docs/02 ma trận, hàng "Xem giá bán".
   *
   * Thợ VẪN cần danh mục để báo phát sinh (chọn hạng mục đề xuất, BC-03 mục 4
   * bước 2), nên không chặn cả endpoint — chỉ lược bỏ các trường tiền. Chặn
   * hẳn sẽ làm hỏng luồng báo phát sinh trên app thợ.
   *
   * Thủ kho cũng ❌ ở đây: họ xem GIÁ VỐN (`stock:readCost`), không xem giá bán.
   */
  'catalog:readPrice': ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Áp chiết khấu vượt ngưỡng của tenant — PR-03.
   * Cố vấn áp được chiết khấu trong ngưỡng; vượt ngưỡng cần quản lý duyệt.
   */
  'quotation:discountOverThreshold': ['BRANCH_MANAGER', 'OWNER'],

  /*
   * Kho — docs/02 mục 3, nhóm hàng "Kho".
   *
   * Cố vấn dịch vụ KHÔNG có mặt ở đây, kể cả ở `stock:read`: ma trận cho cố vấn
   * dấu 👁 (xem tồn) chứ không phải ✅. Phase 2.1 chưa có endpoint chỉ-đọc-hạn-chế
   * nên để cố vấn ngoài; mở đúng lúc làm màn "kiểm tra còn hàng không" ở 2.2,
   * đi kèm test — chứ không mở sẵn.
   *
   * 🔒 `stock:readCost` tách riêng khỏi `stock:read` vì giá vốn là bí mật kinh
   * doanh: nó cho biết xưởng lãi bao nhiêu trên mỗi phụ tùng. docs/02 mục 2.4
   * cho thủ kho xem giá vốn, mục 2.3 cấm thợ thấy MỌI số tiền.
   */
  'stock:read': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],
  'stock:readCost': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],
  'stock:receive': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Điều chỉnh tồn — KHÔNG cho thủ kho.
   *
   * Ma trận docs/02 để thủ kho ✅ ở "Kiểm kê" nhưng ❌ ở "Duyệt điều chỉnh >
   * ngưỡng", và mục 2.4 ghi rõ thủ kho không được "điều chỉnh tồn vượt ngưỡng
   * giá trị mà không có duyệt của quản lý".
   *
   * Điều chỉnh trực tiếp (khác với kiểm kê có quy trình ở 5.4) là đường duy
   * nhất để một dòng tồn đổi mà không có chứng từ mua bán nào — tức là đường
   * che một mất mát. Người đếm hàng và người duyệt chênh lệch phải là hai
   * người; ngưỡng giá trị sẽ thêm ở 5.4 cùng luồng kiểm kê.
   */
  'stock:adjust': ['BRANCH_MANAGER', 'OWNER'],

  /**
   * Xuất kho cho đơn và trả hàng về — docs/02 ma trận, hàng "Xuất kho" và
   * "Trả hàng về kho": thủ kho ✅, kèm điều kiện "đơn phải có báo giá duyệt".
   * Điều kiện đó enforce ở DB (INV-S-04, trigger ở 0029), không ở đây.
   */
  'stock:issue': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],

  /*
   * Phân công — docs/02 mục 3, nhóm "Phân công & thi công".
   *
   * Ma trận để cố vấn dịch vụ 🔶 "đề xuất" chứ không ✅ "xếp": xếp khoang và
   * thợ là quyết định điều phối, cần nhìn cả xưởng. Phase 2.3 chưa làm luồng
   * ĐỀ XUẤT riêng nên cố vấn đứng ngoài — mở khi có luồng đó, kèm test, chứ
   * không mở sẵn.
   */
  'assignment:read': ['TECHNICIAN', 'SERVICE_ADVISOR', 'STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],
  'assignment:write': ['BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Kiểm tra chất lượng — KHÔNG cho thợ ở đây.
   *
   * Ma trận để thợ 🔶 "không phải người đã làm", tức là thợ khác được QC. Ràng
   * buộc "khác người" đã enforce ở DB (`qc_by_different_person`, 0028), nên
   * chỗ này chỉ cần chặn vai không liên quan. Thợ vẫn QC được cho nhau, và
   * database bảo đảm không ai tự QC việc của chính mình.
   */
  'assignment:qc': ['TECHNICIAN', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 BR-02-2 — thợ ĐỀ XUẤT phát sinh, cố vấn mới lập báo giá.
   *
   * Hai quyền tách hẳn nhau và đó là toàn bộ nội dung của quy tắc: người phát
   * hiện vấn đề không phải người định giá. Gộp lại thì thợ vừa báo vừa chào
   * giá, và không còn ai kiểm tra xem phát sinh có thật hay không.
   *
   * docs/02 ma trận, hàng "Đề xuất phát sinh": thợ ✅, cố vấn ✅.
   */
  'supplement:report': ['TECHNICIAN', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  /** Quyết định sau khi khách từ chối — BC-03 mục 5.1/5.2, việc của cố vấn */
  'supplement:resolve': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * Bấm giờ công — docs/02 ma trận, hàng "Bấm giờ công": thợ 🔶 "của mình",
   * quản lý 🔶 "sửa hộ, có log", chủ ✅. Cố vấn và thu ngân ❌.
   *
   * 🔒 Điều kiện "của mình" KHÔNG enforce được ở đây — bảng phân quyền chỉ biết
   * vai, không biết phân công nào thuộc ai. Nó enforce ở trigger
   * `kiem_tra_bam_gio()` (0030): `time_log.technician_id` phải bằng
   * `work_assignment.technician_id`. Không có nó thì một thợ bấm giờ hộ việc
   * của người khác, và `INV-W-06` không bắt được vì nó chỉ kiểm theo người của
   * DÒNG GIỜ — giờ của người làm thật bị thiếu, của người bấm hộ thì thừa.
   */
  'timeLog:write': ['TECHNICIAN', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Nhập hộ một đoạn giờ đã xảy ra — KHÔNG cho thợ.
   *
   * Đây là đường duy nhất ghi được giờ công với mốc thời gian trong quá khứ,
   * tức là đường duy nhất tự khai giờ làm. PR-09 của docs/02 cho phép quản lý
   * làm, kèm nhật ký bắt buộc.
   */
  'timeLog:enterForOther': ['BRANCH_MANAGER', 'OWNER'],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionAction = keyof typeof ACTION_ROLES;

export function canDo(roles: readonly string[], action: PermissionAction): boolean {
  return roles.some((r) => (ACTION_ROLES[action] as readonly string[]).includes(r));
}

/** Nhãn tiếng Việt cho thông báo lỗi — người dùng không đọc mã hành động */
export const ACTION_LABEL: Record<PermissionAction, string> = {
  'customer:create': 'tạo hồ sơ khách hàng',
  'vehicle:create': 'tạo hồ sơ xe',
  'repairOrder:create': 'tiếp nhận xe',
  'quotation:write': 'lập hoặc sửa báo giá',
  'quotation:send': 'gửi báo giá cho khách',
  'quotation:read': 'xem báo giá',
  'catalog:readPrice': 'xem giá bán trong danh mục',
  'quotation:discountOverThreshold': 'áp chiết khấu vượt ngưỡng',
  'stock:read': 'xem tồn kho',
  'stock:readCost': 'xem giá vốn',
  'stock:receive': 'nhập kho',
  'stock:adjust': 'điều chỉnh tồn kho',
  'stock:issue': 'xuất kho và trả hàng về kho',
  'assignment:read': 'xem lịch xưởng',
  'assignment:write': 'xếp khoang và thợ',
  'assignment:qc': 'kiểm tra chất lượng',
  'supplement:report': 'báo phát sinh',
  'supplement:resolve': 'quyết định phát sinh bị từ chối',
  'timeLog:write': 'bấm giờ công',
  'timeLog:enterForOther': 'nhập hộ giờ công',
};
