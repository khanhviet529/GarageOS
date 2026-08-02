import { z } from 'zod';

/**
 * Dữ liệu khách nhìn thấy trên trang tra cứu công khai.
 *
 * 🔒 Cố ý HẸP. Trang này ai cầm link cũng mở được, nên nó chỉ chứa những gì
 * khách cần để theo dõi và quyết định — không có id nội bộ, không có tên nhân
 * viên, không có giá vốn, không có thông tin của khách khác.
 */
export const PublicTrackingView = z.object({
  garageName: z.string(),
  orderCode: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  receivedAt: z.string(),
  promisedAt: z.string().nullable(),
  vehicle: z.object({
    plateNumber: z.string(),
    makeName: z.string().nullable(),
    modelName: z.string().nullable(),
  }),
  customerComplaint: z.string(),
  /** Số điện thoại nhận OTP, đã che bớt — đủ để khách nhận ra máy của mình */
  approverPhoneMasked: z.string().nullable(),
  quotation: z
    .object({
      id: z.string().uuid(),
      seq: z.number().int(),
      status: z.string(),
      statusLabel: z.string(),
      validUntil: z.string().nullable(),
      expired: z.boolean(),
      /** Còn duyệt được không — gộp sẵn mọi điều kiện để giao diện khỏi tự suy */
      canRespond: z.boolean(),
      subtotalAmount: z.number().int(),
      taxAmount: z.number().int(),
      totalAmount: z.number().int(),
      /** Tổng của riêng các hạng mục đã được duyệt */
      approvedAmount: z.number().int(),
      groups: z.array(
        z.object({
          lineId: z.string().uuid(),
          description: z.string(),
          quantity: z.number(),
          amount: z.number().int(),
          status: z.string(),
          isWarranty: z.boolean(),
          /** Phụ tùng đi kèm — 🔒 INV-Q-02: không duyệt riêng được */
          parts: z.array(
            z.object({
              description: z.string(),
              quantity: z.number(),
              amount: z.number().int(),
            }),
          ),
        }),
      ),
    })
    .nullable(),
});
export type PublicTrackingView = z.infer<typeof PublicTrackingView>;

export const RequestOtpInput = z.object({
  quotationId: z.string().uuid(),
});
export type RequestOtpInput = z.infer<typeof RequestOtpInput>;

/**
 * Phản hồi của khách — 🔒 chỉ quyết định trên dòng CÔNG.
 *
 * BC-02 mục 5.3: khách không duyệt riêng phụ tùng được, vì phụ tùng luôn kế
 * thừa dòng công cha (INV-Q-02). Hợp đồng API phản ánh đúng điều đó thay vì
 * nhận vào rồi từ chối sau.
 */
export const RespondQuotationInput = z.object({
  quotationId: z.string().uuid(),
  otp: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số'),
  decisions: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        approved: z.boolean(),
      }),
    )
    .min(1),
});
export type RespondQuotationInput = z.infer<typeof RespondQuotationInput>;

export const RespondQuotationResult = z.object({
  quotationStatus: z.string(),
  approvedAmount: z.number().int(),
  rejectedAmount: z.number().int(),
});
export type RespondQuotationResult = z.infer<typeof RespondQuotationResult>;
