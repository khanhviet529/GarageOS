import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { TenantAwareDb } from '@garageos/db';
import { normalizeHostname } from '@garageos/domain';

/**
 * Tenant resolution cho request public — SRS Phase 1 mục 7.
 *
 * 🔒 INV-LS-01: public request KHÔNG tự chọn tenant. Tenant chỉ đến từ hostname
 * đã được trusted edge ký/xác thực, rồi qua `resolve_site_domain()` — hàm
 * SECURITY DEFINER hẹp (xem migration 0055).
 *
 * 🔒 Cache key ở tầng trên (landing/CDN) gồm domain/tenant; ở đây chỉ resolve.
 */
export interface PublicTenantContext {
  tenantId: string;
  domainId: string;
  isPrimary: boolean;
  primaryHostname: string;
}

export interface TenantResolution {
  /** null = không có site hợp lệ → trả 404 chung, không tiết lộ tenant */
  context: PublicTenantContext | null;
  /** alias ACTIVE → 308 một bước về primary, giữ path/query đã sanitize */
  redirectTo: string | null;
}

@Injectable()
export class TenantContextService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async resolvePublic(req: Request): Promise<TenantResolution> {
    const host = this.trustedHost(req);
    const normalized = host === null ? null : normalizeHostname(host);
    if (normalized === null) return { context: null, redirectTo: null };

    const rows = await this.db.queryWithoutTenant<
      { tenant_id: string; domain_id: string; status: string; is_primary: boolean; primary_hostname: string }
    >('SELECT * FROM resolve_site_domain($1)', [normalized]);
    const d = rows[0];

    // Không có, DISABLED hoặc chưa ACTIVE → cùng một 404 chung (FR-TEN-003)
    if (d === undefined || d.status !== 'ACTIVE') {
      return { context: null, redirectTo: null };
    }

    /*
     * 🔒 Lớp cuối chặn `null` chảy ra ngoài — LS-003.
     *
     * `resolve_site_domain()` COALESCE về chính hostname đang hỏi (migration
     * 0059), nên tới đây `primary_hostname` không được phép rỗng. Nếu nó vẫn
     * rỗng thì dữ liệu đã ở trạng thái không thể xảy ra, và cách xử lý đúng là
     * trả 404 chung — KHÔNG phải dựng chuỗi từ một giá trị rỗng.
     *
     * Bản trước dựng thẳng `https://${d.primary_hostname}`; khi giá trị đó là
     * NULL, JavaScript nội suy nó thành chuỗi "null" mà không báo lỗi. Kết quả
     * là redirect 308 tới `https://null/...` và canonical `https://null` trên
     * mọi trang của tenant — hỏng toàn bộ SEO, âm thầm.
     */
    const primaryHostname = d.primary_hostname ?? '';
    if (primaryHostname === '') {
      return { context: null, redirectTo: null };
    }

    const context: PublicTenantContext = {
      tenantId: d.tenant_id,
      domainId: d.domain_id,
      isPrimary: d.is_primary,
      primaryHostname,
    };

    // Alias ACTIVE: redirect 308 về primary TRƯỚC khi query/render content
    if (!d.is_primary && primaryHostname !== normalized) {
      return { context, redirectTo: `${this.scheme()}://${primaryHostname}` };
    }
    return { context, redirectTo: null };
  }

  /**
   * Host đáng tin — SRS mục 7.1 bước 1–2.
   *
   * 🔒 Ranh giới tin cậy do `EDGE_HOST_TRUST` quyết định, KHÔNG do `NODE_ENV`
   * (LS-001):
   *
   * · `signed` (mặc định) — chỉ tin `X-GarageOS-Original-Host` khi kèm chữ ký
   *   HMAC hợp lệ. Header không ký, chữ ký sai, hoặc không có header đều trả
   *   404 chung. Đây là chế độ cho staging, preview và production.
   * · `host` — thêm hai lối vào: header không ký, và fallback về `Host`. CHỈ
   *   dành cho máy phát triển, nơi trình duyệt gọi thẳng API và không có edge
   *   nào để ký.
   *
   * Vì sao không dùng `NODE_ENV`: nó là cờ của công cụ build, mô tả cách đóng
   * gói mã nguồn chứ không mô tả ai đứng trước dịch vụ. Preview deploy và
   * staging hầu như luôn chạy với `NODE_ENV` khác `production` — và ở bản
   * trước, điều đó có nghĩa là một header duy nhất đủ để chọn tenant bất kỳ và
   * ghi lead vào đó (xem `LS-T04`).
   */
  private trustedHost(req: Request): string | null {
    const original = req.get('x-garageos-original-host');
    const tinHostThuong = (process.env['EDGE_HOST_TRUST'] ?? 'signed') === 'host';

    if (original !== undefined) {
      const signature = req.get('x-garageos-original-host-signature');
      if (signature !== undefined && this.validSignature(original, signature)) {
        return original;
      }
      return tinHostThuong ? original : null;
    }

    return tinHostThuong ? (req.get('host') ?? null) : null;
  }

  private validSignature(host: string, signature: string): boolean {
    const secret = process.env['EDGE_SIGNING_SECRET'] ?? '';
    if (secret === '') return false;
    const expected = createHmac('sha256', secret).update(host, 'utf8').digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Scheme dùng cho canonical/redirect của domain.
   *
   * Gắn với `EDGE_HOST_TRUST` chứ không với `NODE_ENV`, cùng lý do như
   * `trustedHost()`: chỉ chế độ `host` (máy phát triển) mới không có TLS.
   * Staging chạy sau edge có chứng chỉ thật, và canonical của nó phải là
   * `https` dù `NODE_ENV` là gì.
   */
  scheme(): string {
    return (process.env['EDGE_HOST_TRUST'] ?? 'signed') === 'host' ? 'http' : 'https';
  }
}
