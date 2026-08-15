import { z } from 'zod';

/**
 * Contracts cho module sales (lead/activity) — SRS Phase 1 mục 6.9/6.10, 9.
 *
 * State machine Phase 1: NEW → CONTACTED → QUALIFIED, mỗi trạng thái mở đều có
 * thể sang LOST (kèm lostReason). TEST_DRIVE/NEGOTIATING/DEPOSIT_PAID/WON thêm
 * ở Phase 2.
 */

export const LeadStatus = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'LOST']);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadIntent = z.enum(['REQUEST_QUOTE', 'TEST_DRIVE', 'GENERAL_CONTACT']);
export type LeadIntent = z.infer<typeof LeadIntent>;

/** Phase 1 chỉ có nguồn LANDING; MANUAL thêm cùng UI tạo tay ở Phase 4. */
export const LeadSource = z.enum(['LANDING']);
export type LeadSource = z.infer<typeof LeadSource>;

export const LeadActivityType = z.enum([
  'CREATED',
  'ASSIGNED',
  'STATUS_CHANGED',
  'NOTE',
  'CONTACT_ATTEMPT',
]);
export type LeadActivityType = z.infer<typeof LeadActivityType>;

/**
 * Lý do mất lead — BẮT BUỘC chọn từ allow-list (FR-SALE-001). Danh sách này là
 * quyết định thiết kế Phase 1, có thể mở rộng bằng migration khi có dữ liệu
 * thực tế; gõ tự do không thống kê được.
 */
export const LostReason = z.enum([
  'NOT_INTERESTED',
  'BOUGHT_ELSEWHERE',
  'UNREACHABLE',
  'BUDGET_MISMATCH',
  'TIMING',
  'OTHER',
]);
export type LostReason = z.infer<typeof LostReason>;

/** Nhãn lý do mất cho giao diện — đặt cạnh enum như ROLE_LABEL/ACTION_LABEL. */
export const LOST_REASON_LABEL: Record<LostReason, string> = {
  NOT_INTERESTED: 'Không còn nhu cầu',
  BOUGHT_ELSEWHERE: 'Mua ở nơi khác',
  UNREACHABLE: 'Không liên hệ được',
  BUDGET_MISMATCH: 'Không hợp ngân sách',
  TIMING: 'Chưa đúng thời điểm',
  OTHER: 'Lý do khác',
};

export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['LOST'],
  LOST: [],
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  LOST: 'Mất',
};

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from].includes(to);
}

/**
 * Lựa chọn trải nghiệm khách gửi kèm lead — P1-LND-016. Chỉ nhận stable key,
 * revision/content hash và option keys; KHÔNG nhận label/giá/tenant/free-form.
 */
export const ExperienceSelection = z.object({
  experienceStableKey: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  contentHash: z.string().min(1).max(128),
  optionKeys: z.array(z.string().max(200)).optional(),
});
export type ExperienceSelection = z.infer<typeof ExperienceSelection>;

export const LeadCreateInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(15).regex(/^[0-9+]+$/, 'Số điện thoại không hợp lệ'),
  email: z.string().trim().max(254).optional(),
  branchId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  intent: LeadIntent,
  message: z.string().trim().max(2000).optional(),
  consentAccepted: z.literal(true),
  utmSource: z.string().trim().max(100).optional(),
  utmMedium: z.string().trim().max(100).optional(),
  utmCampaign: z.string().trim().max(100).optional(),
  experienceSelection: ExperienceSelection.optional(),
  /** Path relative của trang landing nơi khách gửi form — server normalize. */
  landingPath: z.string().trim().max(2000).optional(),
  /** Honeypot chống bot — service xử lý: khác rỗng coi như spam, không tiết lộ rule. */
  honeypot: z.string().optional(),
});
export type LeadCreateInput = z.infer<typeof LeadCreateInput>;

export const LeadCreateResult = z.object({
  reference: z.string(),
  duplicateSuspected: z.boolean(),
});
export type LeadCreateResult = z.infer<typeof LeadCreateResult>;

export const LeadTransitionInput = z.object({
  to: LeadStatus,
  version: z.number().int().nonnegative(),
  lostReason: LostReason.optional(),
  note: z.string().trim().max(2000).optional(),
});
export type LeadTransitionInput = z.infer<typeof LeadTransitionInput>;

export const LeadAssignInput = z.object({
  assigneeId: z.string().uuid(),
  version: z.number().int().nonnegative(),
});
export type LeadAssignInput = z.infer<typeof LeadAssignInput>;

export const LeadAddActivityInput = z.object({
  type: z.enum(['NOTE', 'CONTACT_ATTEMPT']),
  note: z.string().trim().min(1).max(2000),
});
export type LeadAddActivityInput = z.infer<typeof LeadAddActivityInput>;

/**
 * 🔒 Lý do xoá dữ liệu cá nhân là ENUM, không phải ô nhập tự do.
 *
 * Một trường text ở đây sẽ được người vận hành điền bằng đúng thứ vừa bị xoá
 * ("chị Lan 0912… yêu cầu gỡ") — PII quay lại bảng qua chính cái trường ghi
 * nhận việc xoá PII. Ba lý do dưới đây phủ hết các trường hợp có thật, và
 * không cái nào cần nhắc tới một con người cụ thể.
 */
export const LeadRedactReason = z.enum([
  /** Chủ thể dữ liệu rút đồng ý hoặc yêu cầu xoá (NĐ 13/2023) */
  'SUBJECT_REQUEST',
  /** Job dọn theo thời hạn lưu trữ — 24 tháng cho lead không chuyển đổi */
  'RETENTION_EXPIRED',
  /** Dữ liệu rác/spam lọt qua honeypot */
  'INVALID_DATA',
]);
export type LeadRedactReason = z.infer<typeof LeadRedactReason>;

export const LeadRedactInput = z.object({
  reason: LeadRedactReason,
});
export type LeadRedactInput = z.infer<typeof LeadRedactInput>;

export const LeadRedactResult = z.object({
  redactedAt: z.string(),
  /** true khi lead đã được redact từ trước — thao tác là idempotent */
  daRedactTruocDo: z.boolean(),
});
export type LeadRedactResult = z.infer<typeof LeadRedactResult>;

export const LeadActivityView = z.object({
  id: z.string().uuid(),
  type: LeadActivityType,
  actorUserId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  fromStatus: LeadStatus.nullable(),
  toStatus: LeadStatus.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type LeadActivityView = z.infer<typeof LeadActivityView>;

export const LeadView = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  branchId: z.string().uuid(),
  fullName: z.string(),
  phoneNormalized: z.string(),
  email: z.string().nullable(),
  intent: LeadIntent,
  message: z.string().nullable(),
  status: LeadStatus,
  assignedTo: z.string().uuid().nullable(),
  assigneeName: z.string().nullable(),
  productName: z.string().nullable(),
  variantName: z.string().nullable(),
  source: LeadSource,
  landingPath: z.string().nullable(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  nextActionAt: z.string().nullable(),
  duplicateOfId: z.string().uuid().nullable(),
  /** Khác null = PII đã bị ghi đè; `fullName`/`phoneNormalized` là tombstone */
  redactedAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LeadView = z.infer<typeof LeadView>;
