import type { LeadIntent, LeadSource, LeadStatus } from '@garageos/contracts';

/*
 * Nhãn tiếng Việt cho hai enum mà `packages/contracts` chưa kèm bảng nhãn
 * (`LEAD_STATUS_LABEL` thì đã có sẵn ở contracts và dùng thẳng từ đó).
 *
 * 🔒 Đặt ở tầng hiển thị vì đây là CHỮ CHO NGƯỜI ĐỌC, không phải dữ liệu. Nếu
 *    về sau contracts bổ sung `LEAD_INTENT_LABEL`, xoá file này và dùng của
 *    contracts — đừng để hai bảng nhãn cùng tồn tại rồi lệch dần.
 */
export const LEAD_INTENT_LABEL: Record<LeadIntent, string> = {
  REQUEST_QUOTE: 'Xin báo giá',
  TEST_DRIVE: 'Hẹn lái thử',
  GENERAL_CONTACT: 'Liên hệ chung',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  LANDING: 'Landing',
};

export const LEAD_STATUS_TONE: Record<LeadStatus, 'ok' | 'warn' | 'danger' | 'brand' | 'neutral'> = {
  NEW: 'brand',
  CONTACTED: 'ok',
  QUALIFIED: 'ok',
  LOST: 'neutral',
};

export const LEAD_ACTIVITY_LABEL: Record<
  'CREATED' | 'ASSIGNED' | 'STATUS_CHANGED' | 'NOTE' | 'CONTACT_ATTEMPT',
  string
> = {
  CREATED: 'Lead được tạo',
  ASSIGNED: 'Gán người phụ trách',
  STATUS_CHANGED: 'Đổi trạng thái',
  NOTE: 'Ghi chú',
  CONTACT_ATTEMPT: 'Lần liên hệ',
};
