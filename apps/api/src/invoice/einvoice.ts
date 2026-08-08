import type { PoolClient } from 'pg';

/**
 * Adapter hoá đơn điện tử — [ADR-0005](../../../../docs/adr/0005-einvoice-adapter.md).
 *
 * 🔒 Điều quan trọng nhất của tầng này nằm ở chỗ nó KHÔNG làm: nó không chặn
 *    được gì cả.
 *
 * BC-07 mục 6.3 — nhà cung cấp treo thì hoá đơn nội bộ VẪN `ISSUED`. Khách đang
 * đứng ở quầy với chìa khoá trong tay, và họ không quan tâm máy chủ của ai đang
 * hỏng. Để lỗi bên thứ ba chặn việc bàn giao xe là biến một sự cố của người
 * khác thành sự cố của mình.
 *
 * ⚠️ Giai đoạn 1 chỉ có bản giả lập — mỗi khách hàng thật dùng một nhà cung cấp
 *    khác nhau (VNPT, Viettel, MISA…), nên viết tích hợp trước khi biết khách
 *    dùng cái nào là viết bỏ đi.
 */

export interface EInvoiceRequest {
  invoiceCode: string;
  customerSnapshot: unknown;
  totalAmount: number;
  lines: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
}

export interface EInvoiceResult {
  ok: boolean;
  providerInvoiceNo?: string;
  taxAuthorityCode?: string;
  errorMessage?: string;
  raw: unknown;
}

export interface EInvoiceProvider {
  readonly name: string;
  phatHanh(req: EInvoiceRequest): Promise<EInvoiceResult>;
}

/**
 * Bản giả lập.
 *
 * Cố ý CÓ đường thất bại, điều khiển bằng nội dung dữ liệu chứ không bằng ngẫu
 * nhiên: một adapter luôn thành công thì nhánh xử lý lỗi không bao giờ chạy, và
 * nó sẽ hỏng đúng lúc gặp nhà cung cấp thật.
 *
 * Quy ước: mã hoá đơn chứa `LOI` thì giả lập lỗi. Test dùng được, và không lần
 * chạy nào phụ thuộc may rủi.
 */
export class MockEInvoiceProvider implements EInvoiceProvider {
  readonly name = 'mock';

  phatHanh(req: EInvoiceRequest): Promise<EInvoiceResult> {
    if (req.invoiceCode.includes('LOI')) {
      return Promise.resolve({
        ok: false,
        errorMessage: 'Nhà cung cấp từ chối: mã số thuế người mua không hợp lệ',
        raw: { simulated: true },
      });
    }
    return Promise.resolve({
      ok: true,
      providerInvoiceNo: `MOCK-${req.invoiceCode.replace(/[^0-9]/g, '').slice(-8)}`,
      taxAuthorityCode: `M${req.invoiceCode.replace(/[^0-9]/g, '').slice(-6)}CQT`,
      raw: { simulated: true, receivedAt: 'mock' },
    });
  }
}

export function chonEInvoiceProvider(): EInvoiceProvider {
  return new MockEInvoiceProvider();
}

/**
 * Đọc dữ liệu hoá đơn để dựng yêu cầu gửi nhà cung cấp.
 *
 * 🔒 Tách khỏi lời gọi mạng CÓ CHỦ Ý — xem `guiHoaDonDienTu` bên dưới.
 */
export async function docYeuCauHoaDonDienTu(
  tx: PoolClient,
  invoiceId: string,
): Promise<EInvoiceRequest | null> {
  const { rows: hd } = await tx.query<{
    code: string;
    customer_snapshot: unknown;
    total_amount: string;
  }>(`SELECT code, customer_snapshot, total_amount FROM invoice WHERE id = $1`, [invoiceId]);
  const inv = hd[0];
  if (inv === undefined) return null;

  const { rows: lines } = await tx.query<{
    description: string;
    quantity: string;
    unit_price: string;
    line_total: string;
  }>(
    `SELECT description, quantity, unit_price, line_total FROM invoice_line
      WHERE invoice_id = $1 ORDER BY seq`,
    [invoiceId],
  );

  return {
    invoiceCode: inv.code,
    customerSnapshot: inv.customer_snapshot,
    totalAmount: Number(inv.total_amount),
    lines: lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      lineTotal: Number(l.line_total),
    })),
  };
}

/**
 * Gọi nhà cung cấp. KHÔNG chạm database, KHÔNG ném ngoại lệ.
 *
 * 🔒 Đây là hàm DUY NHẤT làm việc với mạng, và nó cố ý không nhận `tx`.
 *
 * Bản đầu gói cả ba việc (đọc DB → gọi mạng → ghi DB) trong một giao dịch. Với
 * adapter giả lập thì không thấy gì; với nhà cung cấp thật thì một lần treo 30
 * giây là một giao dịch giữ khoá trên `invoice` suốt 30 giây đó — và mọi thu
 * ngân khác đứng chờ.
 *
 * 💡 Comment cũ nói "không để lỗi bên thứ ba chặn việc bàn giao xe". Đúng với
 *    LỖI, sai với TREO. Một lời gọi thất bại nhanh thì vô hại; một lời gọi
 *    không trả lời mới là thứ làm nghẽn hệ thống, và nó không đi qua nhánh
 *    catch nào cả.
 */
export async function goiNhaCungCap(
  provider: EInvoiceProvider,
  req: EInvoiceRequest,
): Promise<EInvoiceResult> {
  try {
    return await provider.phatHanh(req);
  } catch (e) {
    // Treo, timeout, DNS hỏng — mọi thứ đều thành một dòng FAILED
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message.slice(0, 500) : 'Không gọi được nhà cung cấp',
      raw: null,
    };
  }
}

/** Ghi kết quả trả về của nhà cung cấp — giao dịch NGẮN, không có mạng bên trong */
export async function ghiKetQuaHoaDonDienTu(
  tx: PoolClient,
  tenantId: string,
  invoiceId: string,
  providerName: string,
  req: EInvoiceRequest,
  kq: EInvoiceResult,
): Promise<{ status: string; providerInvoiceNo: string | null; errorMessage: string | null }> {

  /*
   * UPSERT: gửi lại lần hai không tạo bản ghi thứ hai. `attempt_count` tăng dần
   * để biết khi nào nên dừng tự động thử lại — một hoá đơn thất bại 20 lần
   * không phải sự cố mạng, mà là dữ liệu sai.
   */
  await tx.query(
    `INSERT INTO e_invoice (tenant_id, invoice_id, provider, status, request_payload,
                            response_payload, provider_invoice_no, tax_authority_code,
                            error_message, attempt_count, issued_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,1,$10)
     ON CONFLICT (tenant_id, invoice_id) DO UPDATE
        SET status = EXCLUDED.status,
            response_payload = EXCLUDED.response_payload,
            provider_invoice_no = COALESCE(EXCLUDED.provider_invoice_no, e_invoice.provider_invoice_no),
            tax_authority_code = COALESCE(EXCLUDED.tax_authority_code, e_invoice.tax_authority_code),
            error_message = EXCLUDED.error_message,
            attempt_count = e_invoice.attempt_count + 1,
            issued_at = COALESCE(EXCLUDED.issued_at, e_invoice.issued_at),
            version = e_invoice.version + 1`,
    [
      tenantId,
      invoiceId,
      providerName,
      kq.ok ? 'ISSUED' : 'FAILED',
      JSON.stringify(req),
      JSON.stringify(kq.raw),
      kq.providerInvoiceNo ?? null,
      kq.taxAuthorityCode ?? null,
      kq.errorMessage ?? null,
      kq.ok ? new Date() : null,
    ],
  );

  return {
    status: kq.ok ? 'ISSUED' : 'FAILED',
    providerInvoiceNo: kq.providerInvoiceNo ?? null,
    errorMessage: kq.errorMessage ?? null,
  };
}
