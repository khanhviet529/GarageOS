import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { parseAmountFromDb } from '@garageos/domain';
import {
  ErrorCode,
  REPAIR_ORDER_STATUS_LABEL,
  QUOTATION_STATUS_LABEL,
  type PublicTrackingView,
  type RespondQuotationInput,
  type RespondQuotationResult,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
/** Số lần xin mã trong một giờ cho cùng một báo giá */
const OTP_MAX_PER_HOUR = 5;

interface TokenScope {
  tenantId: string;
  repairOrderId: string;
}

@Injectable()
export class PublicTrackingService {
  private readonly log = new Logger('PublicTracking');

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Giải token thành (tenant, đơn).
   *
   * 🔒 Đây là chỗ DUY NHẤT chạy ngoài ngữ cảnh tenant, qua một hàm
   * SECURITY DEFINER cố ý rất hẹp. Mọi truy vấn nghiệp vụ sau đó đều nằm trong
   * `withTenantId` và vẫn đi qua RLS.
   */
  private async resolveToken(token: string): Promise<TokenScope> {
    // Token do `randomBytes(32).toString('base64url')` sinh ra -> 43 ký tự.
    // Chặn sớm chuỗi rác để không phải chạy truy vấn cho mọi lần dò.
    if (token.length < 32 || token.length > 128) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Link tra cứu không hợp lệ');
    }

    const rows = await this.db.queryWithoutTenant<{
      tenant_id: string;
      repair_order_id: string;
    }>('SELECT * FROM public_resolve_tracking_token($1)', [token]);

    const found = rows[0];
    if (found === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Link tra cứu không hợp lệ hoặc đã hết hiệu lực');
    }
    return { tenantId: found.tenant_id, repairOrderId: found.repair_order_id };
  }

  async view(token: string): Promise<PublicTrackingView> {
    const scope = await this.resolveToken(token);

    return this.db.withTenantId(scope.tenantId, null, async (tx) => {
      const { rows: orderRows } = await tx.query<Record<string, unknown>>(
        `SELECT ro.code, ro.status, ro.customer_complaint, ro.received_at, ro.promised_at,
                v.plate_number, v.make_name, v.model_name,
                c.phone, c.approver_phone,
                t.name AS garage_name
           FROM repair_order ro
           JOIN vehicle  v ON v.id = ro.vehicle_id
           JOIN customer c ON c.id = ro.customer_id
           JOIN tenant   t ON t.id = ro.tenant_id
          WHERE ro.id = $1`,
        [scope.repairOrderId],
      );
      const o = orderRows[0];
      if (o === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
      }

      const quotation = await this.latestQuotation(tx, scope.repairOrderId);
      const status = o.status as string;

      return {
        garageName: o.garage_name as string,
        orderCode: o.code as string,
        status,
        statusLabel: REPAIR_ORDER_STATUS_LABEL[status as never] ?? status,
        receivedAt: (o.received_at as Date).toISOString(),
        promisedAt: o.promised_at === null ? null : (o.promised_at as Date).toISOString(),
        vehicle: {
          plateNumber: o.plate_number as string,
          makeName: (o.make_name ?? null) as string | null,
          modelName: (o.model_name ?? null) as string | null,
        },
        customerComplaint: o.customer_complaint as string,
        approverPhoneMasked: maskPhone(
          ((o.approver_phone ?? o.phone) ?? null) as string | null,
        ),
        quotation,
      };
    });
  }

  /**
   * Báo giá mới nhất, gom theo dòng công.
   *
   * 🔒 INV-Q-02 hiện ngay ở cấu trúc dữ liệu: phụ tùng nằm BÊN TRONG dòng công,
   * không phải một danh sách ngang hàng. Giao diện không thể vẽ ra công tắc
   * duyệt riêng cho phụ tùng kể cả khi ai đó muốn.
   */
  private async latestQuotation(
    tx: PoolClient,
    repairOrderId: string,
  ): Promise<PublicTrackingView['quotation']> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT id, seq, status, valid_until, subtotal_amount, tax_amount, total_amount
         FROM quotation
        WHERE repair_order_id = $1 AND status <> 'DRAFT'
        ORDER BY seq DESC LIMIT 1`,
      [repairOrderId],
    );
    const q = rows[0];
    if (q === undefined) return null;

    const { rows: lines } = await tx.query<Record<string, unknown>>(
      `SELECT id, seq, line_type, parent_line_id, description, quantity, line_total,
              status, is_warranty
         FROM quotation_line WHERE quotation_id = $1 ORDER BY seq`,
      [q.id as string],
    );

    const groups: NonNullable<PublicTrackingView['quotation']>['groups'] = [];
    const byId = new Map<string, (typeof groups)[number]>();

    for (const l of lines) {
      if (l.line_type !== 'LABOR') continue;
      const g = {
        lineId: l.id as string,
        description: l.description as string,
        quantity: Number(l.quantity),
        amount: parseAmountFromDb(l.line_total, 'lineTotal'),
        status: l.status as string,
        isWarranty: l.is_warranty as boolean,
        parts: [] as { description: string; quantity: number; amount: number }[],
      };
      groups.push(g);
      byId.set(g.lineId, g);
    }
    for (const l of lines) {
      if (l.line_type !== 'PART') continue;
      const parent = l.parent_line_id === null ? undefined : byId.get(l.parent_line_id as string);
      const part = {
        description: l.description as string,
        quantity: Number(l.quantity),
        amount: parseAmountFromDb(l.line_total, 'lineTotal'),
      };
      if (parent !== undefined) {
        parent.parts.push(part);
      } else {
        // Phụ tùng bán rời chưa gắn hạng mục công: hiện thành một nhóm riêng
        // thay vì giấu đi — giấu tiền của khách là cách nhanh nhất mất niềm tin.
        groups.push({
          lineId: l.id as string,
          description: part.description,
          quantity: part.quantity,
          amount: part.amount,
          status: l.status as string,
          isWarranty: l.is_warranty as boolean,
          parts: [],
        });
      }
    }

    const validUntil = q.valid_until === null ? null : (q.valid_until as Date);
    const expired = validUntil !== null && validUntil.getTime() <= Date.now();
    const status = q.status as string;

    return {
      id: q.id as string,
      seq: Number(q.seq),
      status,
      statusLabel: QUOTATION_STATUS_LABEL[status as never] ?? status,
      validUntil: validUntil === null ? null : validUntil.toISOString(),
      expired,
      // 🔒 INV-Q-07 gộp sẵn vào một cờ: giao diện không phải tự suy ra điều kiện
      canRespond: status === 'SENT' && !expired,
      subtotalAmount: parseAmountFromDb(q.subtotal_amount, 'subtotal'),
      taxAmount: parseAmountFromDb(q.tax_amount, 'tax'),
      totalAmount: parseAmountFromDb(q.total_amount, 'total'),
      approvedAmount: groups
        .filter((g) => g.status === 'APPROVED')
        .reduce((sum, g) => sum + g.amount + g.parts.reduce((s, p) => s + p.amount, 0), 0),
      groups,
    };
  }

  /**
   * Phát mã xác thực.
   *
   * Mã gửi về số điện thoại đã ghi trên hồ sơ KHÁCH, không phải số người mang
   * xe đến — BC-01 mục 3.6: tài xế mang xe đi sửa không phải người quyết định
   * chi tiền.
   */
  async requestOtp(
    token: string,
    quotationId: string,
    ip: string | null,
  ): Promise<{ phoneMasked: string; devCode?: string }> {
    const scope = await this.resolveToken(token);

    return this.db.withTenantId(scope.tenantId, null, async (tx) => {
      /*
       * 🔒 GARAGEOS-002: khoá dòng báo giá TRƯỚC khi đếm.
       *
       * `SELECT count(*)` rồi `INSERT` là hai bước tách rời: hai request xin mã
       * cùng lúc đều đọc thấy 4 và đều ghi, thành 6 mã trong một giờ. Kẻ tấn
       * công lặp lại việc đó để có nhiều mã sống song song, tức là mở rộng bề
       * mặt dò mã đúng theo cấp số nhân của số lần bắn song song.
       *
       * `FOR UPDATE` ở đây bắt mọi request cho CÙNG một báo giá phải xếp hàng;
       * báo giá khác nhau vẫn chạy song song bình thường.
       */
      const { rows } = await tx.query<{ status: string; valid_until: Date | null; phone: string }>(
        `SELECT q.status, q.valid_until, COALESCE(c.approver_phone, c.phone) AS phone
           FROM quotation q
           JOIN repair_order ro ON ro.id = q.repair_order_id
           JOIN customer c ON c.id = ro.customer_id
          WHERE q.id = $1 AND q.repair_order_id = $2
          FOR UPDATE OF q`,
        [quotationId, scope.repairOrderId],
      );
      const q = rows[0];
      if (q === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy báo giá');
      }
      assertRespondable(q.status, q.valid_until);

      // Chống dội mã: giới hạn theo BÁO GIÁ, không theo IP — khách dùng 4G thì
      // IP đổi liên tục, còn kẻ dò mã thì cứ một báo giá mà nhắm vào.
      const { rows: recent } = await tx.query<{ n: string }>(
        `SELECT count(*) AS n FROM otp_challenge
          WHERE quotation_id = $1 AND created_at > now() - interval '1 hour'`,
        [quotationId],
      );
      if (Number(recent[0]!.n) >= OTP_MAX_PER_HOUR) {
        throw new BusinessError(
          ErrorCode.RATE_LIMITED,
          'Đã xin mã quá nhiều lần. Vui lòng thử lại sau một giờ hoặc gọi cho garage.',
        );
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.query(
        `INSERT INTO otp_challenge (tenant_id, repair_order_id, quotation_id, code_hash,
                                    phone, expires_at, created_ip)
         VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' minutes')::interval, $7)`,
        [
          scope.tenantId,
          scope.repairOrderId,
          quotationId,
          hashCode(code),
          q.phone,
          String(OTP_TTL_MINUTES),
          ip,
        ],
      );

      /*
       * ⚠️ Chưa tích hợp SMS/Zalo thật — đó là dịch vụ ngoài, thuộc Phase 6.
       * Ở môi trường phát triển và CI, mã được trả về trong response để luồng
       * chạy được đầu-cuối. Biến môi trường phải BẬT TƯỜNG MINH, và tên của nó
       * nói rõ đây là thứ không được có ở production.
       */
      const echo = process.env.OTP_DEV_ECHO === 'true';
      if (echo) {
        this.log.warn(`OTP_DEV_ECHO đang bật — mã cho báo giá ${quotationId}: ${code}`);
      }
      return {
        phoneMasked: maskPhone(q.phone) ?? '',
        ...(echo ? { devCode: code } : {}),
      };
    });
  }

  /**
   * Khách trả lời báo giá — duyệt từng phần (BC-02).
   */
  async respond(
    token: string,
    input: RespondQuotationInput,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<RespondQuotationResult> {
    const scope = await this.resolveToken(token);

    try {
      return await this.respondInTransaction(scope, input, meta);
    } catch (err) {
      /*
       * 🔒 Bộ đếm số lần nhập sai phải SỐNG SÓT qua rollback.
       *
       * Ném lỗi bên trong transaction làm PostgreSQL huỷ luôn lệnh
       * `attempts = attempts + 1` — nghĩa là giới hạn 5 lần trở thành vô hạn,
       * và mã 6 chữ số bị dò ra trong vài phút. Vì vậy phải ghi lại bằng một
       * transaction RIÊNG sau khi transaction chính đã rollback.
       */
      if (err instanceof OtpMismatchError) {
        await this.db.withTenantId(scope.tenantId, null, (tx) =>
          tx.query('UPDATE otp_challenge SET attempts = attempts + 1 WHERE id = $1', [
            err.challengeId,
          ]),
        );
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          err.remaining > 0
            ? `Mã xác thực không đúng. Còn ${err.remaining} lần thử.`
            : 'Mã xác thực không đúng. Vui lòng xin mã mới.',
        );
      }
      throw err;
    }
  }

  private async respondInTransaction(
    scope: TokenScope,
    input: RespondQuotationInput,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<RespondQuotationResult> {
    return this.db.withTenantId(scope.tenantId, null, async (tx) => {
      const { rows: qRows } = await tx.query<{ status: string; valid_until: Date | null }>(
        `SELECT status, valid_until FROM quotation
          WHERE id = $1 AND repair_order_id = $2 FOR UPDATE`,
        [input.quotationId, scope.repairOrderId],
      );
      const quotation = qRows[0];
      if (quotation === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy báo giá');
      }
      assertRespondable(quotation.status, quotation.valid_until);

      const challengeId = await this.consumeOtp(tx, input.quotationId, input.otp);

      // Chỉ nhận quyết định cho dòng CÔNG của đúng báo giá này
      const { rows: laborLines } = await tx.query<{ id: string; is_warranty: boolean }>(
        `SELECT id, is_warranty FROM quotation_line
          WHERE quotation_id = $1 AND line_type = 'LABOR'`,
        [input.quotationId],
      );
      const validIds = new Set(laborLines.map((l) => l.id));

      /*
       * 🔒 GARAGEOS-001: phải kiểm TẬP HỢP, không kiểm số lượng.
       *
       * Bản đầu chỉ so `decisions.length === laborLines.length`. Gửi hai quyết
       * định cho CÙNG một hạng mục là qua được: số lượng khớp, nhưng hạng mục
       * còn lại vẫn PENDING trong khi báo giá đã bị chốt là PARTIALLY_APPROVED
       * và đơn đã chuyển sang đang sửa. Khách chưa bao giờ trả lời hạng mục đó.
       */
      const decidedIds = new Set(input.decisions.map((d) => d.lineId));
      if (decidedIds.size !== input.decisions.length) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Có hạng mục được trả lời hai lần',
        );
      }
      for (const d of input.decisions) {
        if (!validIds.has(d.lineId)) {
          throw new BusinessError(
            ErrorCode.VALIDATION_FAILED,
            'Có hạng mục không thuộc báo giá này',
          );
        }
      }
      if (decidedIds.size !== validIds.size) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Phải trả lời tất cả hạng mục trước khi xác nhận',
        );
      }

      // 🔒 Thứ tự quan trọng: DUYỆT trước, TỪ CHỐI sau.
      //    Trigger rang_buoc_trang_thai_dong_con bắt dòng phụ tùng luôn cùng
      //    trạng thái với cha; cập nhật cha trước rồi để trigger lan xuống.
      for (const d of input.decisions) {
        // Lý do tính ở TypeScript chứ không dùng CASE trong SQL: tham số $2 khi
        // đó vừa phải là enum `quotation_line_status` vừa phải so sánh với chuỗi,
        // và PostgreSQL từ chối ("inconsistent types deduced for parameter").
        await tx.query(
          `UPDATE quotation_line
              SET status = $2, reject_reason = $3, approval_source = 'CUSTOMER'
            WHERE id = $1`,
          [
            d.lineId,
            d.approved ? 'APPROVED' : 'REJECTED',
            d.approved ? null : 'Khách không đồng ý hạng mục này',
          ],
        );
      }

      /*
       * 🔒 Trạng thái và số tiền đọc LẠI TỪ DATABASE sau khi ghi, không suy từ
       * mảng `decisions` gửi lên.
       *
       * Hai lý do:
       *  - GARAGEOS-001: dữ liệu vào có thể không phủ hết hạng mục; nguồn chân
       *    lý phải là những gì thật sự nằm trong bảng.
       *  - Trigger lan trạng thái xuống dòng phụ tùng chạy SAU lệnh UPDATE, nên
       *    chỉ đọc lại mới thấy kết quả cuối cùng.
       */
      const { rows: after } = await tx.query<{ status: string; total: string | null }>(
        `SELECT status, sum(line_total)::text AS total FROM quotation_line
          WHERE quotation_id = $1 GROUP BY status`,
        [input.quotationId],
      );
      // 🔒 GARAGEOS-004: tổng của bigint cũng là bigint và cũng vượt 2^53 được.
      //    `Number()` mù ở đây làm hỏng đúng con số khách vừa đồng ý trả.
      const totals = new Map(
        after.map((r) => [r.status, parseAmountFromDb(r.total ?? 0, `total(${r.status})`)]),
      );
      const approvedAmount = totals.get('APPROVED') ?? 0;
      const rejectedAmount = totals.get('REJECTED') ?? 0;

      const { rows: laborAfter } = await tx.query<{ status: string; n: string }>(
        `SELECT status, count(*)::text AS n FROM quotation_line
          WHERE quotation_id = $1 AND line_type = 'LABOR' GROUP BY status`,
        [input.quotationId],
      );
      const laborByStatus = new Map(laborAfter.map((r) => [r.status, Number(r.n)]));
      const newStatus = deriveQuotationStatus(
        laborByStatus.get('APPROVED') ?? 0,
        laborByStatus.get('REJECTED') ?? 0,
        laborByStatus.get('PENDING') ?? 0,
      );

      /*
       * 🔒 BC-02 mục 5.6 — hai người cùng duyệt một báo giá.
       *
       * Điều kiện `status = 'SENT'` nằm TRONG câu UPDATE. Khách bấm trên điện
       * thoại đúng lúc cố vấn ghi nhận hộ ở quầy thì chỉ một bên thắng, và bên
       * kia nhận được câu trả lời rõ ràng thay vì ghi đè âm thầm.
       */
      const { rows: updated } = await tx.query<{ id: string }>(
        `UPDATE quotation
            SET status = $2,
                responded_at = now(),
                approval_channel = 'LINK_OTP',
                approval_evidence = $3
          WHERE id = $1 AND status = 'SENT'
          RETURNING id`,
        [
          input.quotationId,
          newStatus,
          JSON.stringify({
            otpChallengeId: challengeId,
            ip: meta.ip,
            userAgent: meta.userAgent,
            respondedAt: new Date().toISOString(),
          }),
        ],
      );
      if (updated.length === 0) {
        throw new BusinessError(
          ErrorCode.QUOTATION_ALREADY_RESPONDED,
          'Báo giá này vừa được trả lời bằng một kênh khác.',
        );
      }

      // Đơn chuyển tiếp: có hạng mục được duyệt thì vào việc, không thì chờ giao xe
      await tx.query(
        `UPDATE repair_order SET status = $2
          WHERE id = $1 AND status NOT IN ('DELIVERED','CANCELLED')`,
        [scope.repairOrderId, approvedAmount > 0 ? 'IN_PROGRESS' : 'AWAITING_DELIVERY'],
      );

      return { quotationStatus: newStatus, approvedAmount, rejectedAmount };
    });
  }

  /**
   * Kiểm tra và tiêu mã xác thực.
   *
   * 🔒 So sánh bằng `timingSafeEqual`: so sánh chuỗi thông thường thoát sớm ở
   * ký tự khác đầu tiên, và thời gian đó đủ để dò từng chữ số một.
   */
  private async consumeOtp(tx: PoolClient, quotationId: string, code: string): Promise<string> {
    const { rows } = await tx.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_challenge
        WHERE quotation_id = $1 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [quotationId],
    );
    const challenge = rows[0];
    if (challenge === undefined) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        'Mã xác thực đã hết hạn. Vui lòng xin mã mới.',
      );
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BusinessError(
        ErrorCode.RATE_LIMITED,
        'Nhập sai quá nhiều lần. Vui lòng xin mã mới.',
      );
    }

    if (!verifyCode(code, challenge.code_hash)) {
      // Không tăng bộ đếm ở đây: transaction sắp rollback nên lệnh UPDATE cũng
      // biến mất. `respond()` bắt lỗi này và ghi lại bằng transaction riêng.
      throw new OtpMismatchError(challenge.id, OTP_MAX_ATTEMPTS - challenge.attempts - 1);
    }

    await tx.query('UPDATE otp_challenge SET consumed_at = now() WHERE id = $1', [challenge.id]);
    return challenge.id;
  }
}

/**
 * Lỗi nhập sai mã — mang theo id thử thách và số lần còn lại.
 *
 * Tách thành lớp riêng vì bộ đếm phải được ghi lại kể cả khi transaction chính
 * đã rollback; xem `respond()`.
 */
export class OtpMismatchError extends Error {
  constructor(
    readonly challengeId: string,
    readonly remaining: number,
  ) {
    super('Mã xác thực không đúng');
  }
}

/** 🔒 INV-Q-07 — chỉ báo giá đang chờ và còn hạn mới trả lời được */
function assertRespondable(status: string, validUntil: Date | null): void {
  if (status !== 'SENT') {
    throw new BusinessError(
      ErrorCode.QUOTATION_ALREADY_RESPONDED,
      'Báo giá này đã được trả lời hoặc không còn hiệu lực.',
    );
  }
  if (validUntil !== null && validUntil.getTime() <= Date.now()) {
    throw new BusinessError(
      ErrorCode.QUOTATION_EXPIRED,
      'Báo giá đã hết hạn. Vui lòng liên hệ garage để nhận báo giá mới.',
    );
  }
}

/**
 * 🔒 `Quotation.status` là giá trị SUY RA từ trạng thái thật của các dòng,
 * không phải người dùng đặt — BC-02 mục 3.
 *
 * Nhận vào số dòng theo TỪNG trạng thái thay vì "tổng và số đã duyệt": còn dòng
 * nào chưa quyết thì báo giá vẫn đang chờ, và cách ký hiệu cũ không diễn đạt
 * được tình huống đó.
 */
export function deriveQuotationStatus(
  approved: number,
  rejected: number,
  pending: number,
): string {
  if (pending > 0) return 'SENT';
  if (approved === 0) return 'REJECTED';
  if (rejected === 0) return 'APPROVED';
  return 'PARTIALLY_APPROVED';
}

/** `0912345678` -> `091****678` — đủ để khách nhận ra máy của mình, không đủ để người lạ dùng */
export function maskPhone(phone: string | null): string | null {
  if (phone === null || phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(code, salt, 32).toString('hex')}`;
}

function verifyCode(code: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || salt === undefined || hash === undefined) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(code, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
