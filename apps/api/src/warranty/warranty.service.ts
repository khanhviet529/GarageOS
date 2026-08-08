import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { parseAmountFromDb } from '@garageos/domain';
import {
  ErrorCode,
  type ActorContext,
  type CoverageType,
  type IssueWarrantyInput,
  type OpenWarrantyClaimInput,
  type RecordSupplierRecoveryInput,
  type WarrantyCostAttribution,
  type WarrantyCoverage,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';

/**
 * Bảo hành — Phase 5.1 và 5.2 (BC-09).
 *
 * Bốn câu hỏi mà case này phải trả lời, và cả bốn đều khó vì lý do khác nhau:
 *
 *  1. Còn bảo hành không?      -> hạn kép tháng/km, mốc nào đến TRƯỚC
 *  2. Bảo hành phần nào?       -> phụ tùng và công thợ là HAI suất riêng
 *  3. Ai chịu chi phí?         -> garage, hoặc đòi lại được từ nhà cung cấp
 *  4. Ảnh hưởng lãi đơn gốc?   -> quy chi phí về đơn gốc, không sửa chứng từ cũ
 */
@Injectable()
export class WarrantyService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Sinh bảo hành khi bàn giao xe — 🔒 INV-B-01.
   *
   * Một dòng hạng mục sinh HAI suất: phụ tùng và công thợ có hạn khác nhau
   * (BC-09 mục 1). Gộp làm một thì hoặc khách mất quyền lợi phụ tùng, hoặc
   * garage phải bảo hành công thợ dài gấp sáu lần chính sách.
   *
   * 🔒 Hạn được SNAPSHOT từ chính sách lúc bàn giao. Garage sau này rút bảo
   * hành từ 6 xuống 3 tháng thì xe đã bàn giao vẫn giữ 6 tháng — cùng lập luận
   * với `quotation.price_list_id` ở 0022.
   */
  async issueOnDelivery(
    actor: ActorContext,
    input: IssueWarrantyInput,
  ): Promise<{ daSinh: number }> {
    assertCan(actor, 'warranty:claim');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [input.repairOrderId];
      const scope = appendBranchScope(actor, params, 'ro');
      const { rows: don } = await tx.query<{
        delivered_at: Date | null;
        odometer_out: number | null;
      }>(
        `SELECT delivered_at, odometer_out FROM repair_order ro
          WHERE ro.id = $1${scope}`,
        params,
      );
      const ro = don[0];
      if (ro === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
      }
      if (ro.delivered_at === null) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ sinh bảo hành khi xe đã bàn giao — INV-B-01.',
        );
      }
      if (ro.odometer_out === null) {
        /*
         * Không có số km ra thì hạn km không tính được.
         *
         * KHÔNG lặng lẽ bỏ hạn km: bảo hành "không giới hạn km" là một lời hứa
         * đắt hơn hẳn, và nó sẽ ra đời chỉ vì người tiếp nhận quên nhập một con
         * số. Chặn và bắt sửa.
         */
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Đơn chưa có số km lúc giao xe — không tính được hạn bảo hành theo km.',
        );
      }

      /*
       * 🔒 Chỉ dòng ĐÃ ĐƯỢC DUYỆT mới sinh bảo hành, và dòng BẢO HÀNH thì
       * KHÔNG sinh tiếp.
       *
       * Dòng bảo hành đã miễn phí; cho nó sinh suất mới là tạo ra một chuỗi bảo
       * hành vô tận từ một lần bán hàng duy nhất. Phụ tùng thay trong đơn bảo
       * hành có bảo hành riêng — nhưng đó là bảo hành của LẦN THAY MỚI, và nó
       * đến từ dòng phụ tùng của chính đơn đó, không phải từ dòng miễn phí.
       */
      const { rows } = await tx.query<{ n: string }>(
        `WITH nguon AS (
           SELECT ql.id,
                  ql.line_type,
                  COALESCE(si.warranty_months, p.warranty_months, 0) AS thang,
                  CASE WHEN ql.line_type = 'PART' THEN p.warranty_kilometers END AS km
             FROM quotation_line ql
             JOIN quotation q ON q.id = ql.quotation_id
             LEFT JOIN service_item si ON si.id = ql.service_item_id
             LEFT JOIN part p          ON p.id = ql.part_id
            WHERE q.repair_order_id = $1
              AND ql.status = 'APPROVED'
              AND ql.is_warranty = false
         ),
         them AS (
           INSERT INTO warranty_coverage (
             tenant_id, quotation_line_id, repair_order_id, coverage_type,
             started_at, start_odometer, expires_at, expires_at_odometer)
           SELECT $2, n.id, $1,
                  CASE WHEN n.line_type = 'PART' THEN 'PART' ELSE 'LABOR' END::coverage_type,
                  $3::timestamptz, $4::int,
                  $3::timestamptz + (n.thang || ' months')::interval,
                  CASE WHEN n.km IS NULL THEN NULL ELSE $4::int + n.km END
             FROM nguon n
            WHERE n.thang > 0
           ON CONFLICT (quotation_line_id, coverage_type) DO NOTHING
           RETURNING id
         )
         SELECT count(*)::text AS n FROM them`,
        [input.repairOrderId, actor.tenantId, ro.delivered_at.toISOString(), ro.odometer_out],
      );

      /*
       * Nối suất bảo hành với dòng HOÁ ĐƠN, nếu đơn đã có hoá đơn phát hành.
       *
       * 🔒 Cột `invoice_line_id` nullable CÓ CHỦ Ý — xem ADR-0008. Bàn giao xe
       *    có thể xảy ra TRƯỚC khi phát hành hoá đơn (khách nợ, khách doanh
       *    nghiệp trả theo kỳ), nên bắt buộc phải có hoá đơn mới sinh được bảo
       *    hành là ràng buộc sai với thực tế.
       *
       * Chạy sau, không gộp vào câu trên: suất bảo hành phải sinh được kể cả
       * khi chưa có hoá đơn, và một JOIN trong câu INSERT sẽ lặng lẽ bỏ qua
       * đúng những dòng đó.
       */
      await tx.query(
        `UPDATE warranty_coverage wc
            SET invoice_line_id = l.id
           FROM invoice_line l
           JOIN invoice i ON i.id = l.invoice_id
          WHERE l.source_quotation_line_id = wc.quotation_line_id
            AND wc.repair_order_id = $1
            AND wc.invoice_line_id IS NULL
            AND i.status <> 'DRAFT'`,
        [input.repairOrderId],
      );

      return { daSinh: Number(rows[0]!.n) };
    });
  }

  /**
   * Bảo hành còn hiệu lực của một chiếc xe — BC-09 mục 3 bước 2.
   *
   * Trả về CẢ suất đã hết hạn kèm lý do, không lọc bỏ. Cố vấn cần giải thích
   * được cho khách vì sao không được bảo hành — "hệ thống không thấy" là câu
   * trả lời làm mất khách.
   */
  async coveragesForVehicle(
    actor: ActorContext,
    vehicleId: string,
    odometer?: number,
  ): Promise<WarrantyCoverage[]> {
    assertCan(actor, 'warranty:read');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [vehicleId, odometer ?? null];
      const scope = appendBranchScope(actor, params, 'ro');
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT wc.id, wc.quotation_line_id, ql.description, wc.coverage_type,
                wc.repair_order_id, ro.code, wc.started_at, wc.start_odometer,
                wc.expires_at, wc.expires_at_odometer, wc.claimed_by_repair_order_id,
                bao_hanh_con_hieu_luc(wc.id, $2::int) AS con_hieu_luc
           FROM warranty_coverage wc
           JOIN repair_order ro    ON ro.id = wc.repair_order_id
           JOIN quotation_line ql  ON ql.id = wc.quotation_line_id
          WHERE ro.vehicle_id = $1${scope}
          ORDER BY wc.expires_at DESC`,
        params,
      );

      const bayGio = Date.now();
      return rows.map((r) => {
        const hetHan = (r.expires_at as Date).getTime() < bayGio;
        const hanKm = r.expires_at_odometer === null ? null : Number(r.expires_at_odometer);
        const vuotKm = odometer !== undefined && hanKm !== null && odometer > hanKm;
        const daDung = r.claimed_by_repair_order_id !== null;

        return {
          id: r.id as string,
          quotationLineId: r.quotation_line_id as string,
          description: r.description as string,
          coverageType: r.coverage_type as CoverageType,
          repairOrderId: r.repair_order_id as string,
          repairOrderCode: r.code as string,
          startedAt: (r.started_at as Date).toISOString(),
          startOdometer: Number(r.start_odometer),
          expiresAt: (r.expires_at as Date).toISOString(),
          expiresAtOdometer: hanKm,
          claimedByRepairOrderId: (r.claimed_by_repair_order_id ?? null) as string | null,
          conHieuLuc: r.con_hieu_luc as boolean,
          // Nói RÕ mốc nào bị vượt. "Hết hạn" chung chung khiến khách nghĩ
          // garage tìm cớ; nói "đã chạy 51.800km, hạn 47.200km" thì không.
          lyDoHetHieuLuc: daDung
            ? 'Đã dùng cho một đơn bảo hành trước đó'
            : hetHan
              ? `Quá hạn thời gian (hết ${(r.expires_at as Date).toLocaleDateString('vi-VN')})`
              : vuotKm
                ? `Quá hạn số km (hạn ${hanKm?.toLocaleString('vi-VN')}km)`
                : null,
        };
      });
    });
  }

  /**
   * Mở một đơn bảo hành — BC-09 mục 3 bước 4–5, và mục 4.
   *
   * 🔒 Ba việc trong cùng một giao dịch: nối đơn về đơn gốc, đánh dấu các suất
   * bảo hành đã dùng, và mở bản ghi quy chi phí. Tách ra thì có trạng thái
   * "đơn bảo hành đã mở nhưng chi phí không quy về đâu cả" — và chi phí đó biến
   * mất khỏi báo cáo lãi/lỗ mà không ai biết.
   */
  async openClaim(
    actor: ActorContext,
    input: OpenWarrantyClaimInput,
  ): Promise<{ soSuatDaDung: number }> {
    assertCan(actor, 'warranty:claim');
    return this.db.withTenant(actor, async (tx) => {
      await this.assertOrderInScope(tx, actor, input.repairOrderId);
      await this.assertOrderInScope(tx, actor, input.originalRepairOrderId);

      /*
       * Kiểm hiệu lực NGAY TRƯỚC khi dùng, bằng chính hàm của database.
       *
       * Không tin kết quả tra cứu ở bước trước: giữa lúc cố vấn xem màn hình và
       * lúc bấm nút có thể đã qua nửa đêm, hoặc một đơn bảo hành khác vừa dùng
       * mất suất đó.
       */
      const { rows: khongHopLe } = await tx.query<{ id: string }>(
        `SELECT id FROM warranty_coverage
          WHERE id = ANY($1::uuid[]) AND NOT bao_hanh_con_hieu_luc(id)`,
        [input.coverageIds],
      );
      if (khongHopLe.length > 0) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `${khongHopLe.length} suất bảo hành đã hết hiệu lực hoặc vừa được dùng cho đơn khác.`,
        );
      }

      await tx.query(
        `UPDATE repair_order SET warranty_claim_of_id = $2 WHERE id = $1`,
        [input.repairOrderId, input.originalRepairOrderId],
      );

      const { rowCount } = await tx.query(
        `UPDATE warranty_coverage
            SET claimed_by_repair_order_id = $2, claimed_at = now()
          WHERE id = ANY($1::uuid[])`,
        [input.coverageIds, input.repairOrderId],
      );

      // Bản ghi quy chi phí mở với số 0 — chi phí thật được cộng vào khi đơn
      // bảo hành xuất kho và ghi giờ công, xem `tinhLaiChiPhi`.
      await tx.query(
        `INSERT INTO warranty_cost_attribution (
           tenant_id, original_repair_order_id, warranty_repair_order_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (warranty_repair_order_id) DO NOTHING`,
        [actor.tenantId, input.originalRepairOrderId, input.repairOrderId],
      );

      return { soSuatDaDung: rowCount ?? 0 };
    });
  }

  /**
   * Tính lại chi phí thật của một đơn bảo hành — BC-09 mục 4.
   *
   * Đơn bảo hành có doanh thu 0đ nhưng chi phí THẬT: phụ tùng đã xuất kho và
   * giờ công đã bấm. Hai con số đó lấy từ sổ kho và bảng giờ công, không nhập
   * tay — nhập tay là mở đường cho một con số làm đẹp báo cáo.
   */
  async recalculateCost(
    actor: ActorContext,
    warrantyRepairOrderId: string,
  ): Promise<WarrantyCostAttribution> {
    assertCan(actor, 'warranty:claim');
    return this.db.withTenant(actor, async (tx) => {
      await this.assertOrderInScope(tx, actor, warrantyRepairOrderId);

      const { rowCount } = await tx.query(
        `UPDATE warranty_cost_attribution wca
            SET part_cost_amount = COALESCE((
                  -- Giá vốn phụ tùng đã xuất cho đơn này. Cột quantity của
                  -- ISSUE mang dấu âm nên phải đảo dấu.
                  SELECT round(sum(-sm.quantity * sm.unit_cost))
                    FROM stock_movement sm
                   WHERE sm.ref_type = 'REPAIR_ORDER'
                     AND sm.ref_id = wca.warranty_repair_order_id
                     AND sm.type = 'ISSUE'), 0),
                labor_cost_amount = COALESCE((
                  -- Giờ công thật × chi phí giờ NỘI BỘ, không phải đơn giá bán.
                  -- Cột internal_labor_cost_per_hour có từ 0001 và tới lát cắt
                  -- này chưa dòng code nào đọc.
                  SELECT round(sum(gio_thuc_te(wa.id)) * t.internal_labor_cost_per_hour)
                    FROM work_assignment wa
                   WHERE wa.repair_order_id = wca.warranty_repair_order_id), 0),
                -- Bảng tenant cũng có cột version, nên phải nêu rõ bảng nào
                version = wca.version + 1
           FROM tenant t
          WHERE wca.warranty_repair_order_id = $1 AND t.id = wca.tenant_id`,
        [warrantyRepairOrderId],
      );
      if (rowCount === 0) {
        throw new BusinessError(
          ErrorCode.NOT_FOUND,
          'Đơn này chưa được mở như một đơn bảo hành.',
        );
      }
      return this.docQuyChiPhi(tx, warrantyRepairOrderId);
    });
  }

  /** Ghi nhận đòi lại được từ nhà cung cấp — BC-09 mục 4 */
  async recordSupplierRecovery(
    actor: ActorContext,
    warrantyRepairOrderId: string,
    input: RecordSupplierRecoveryInput,
  ): Promise<WarrantyCostAttribution> {
    assertCan(actor, 'warranty:recover');
    return this.db.withTenant(actor, async (tx) => {
      await this.assertOrderInScope(tx, actor, warrantyRepairOrderId);
      try {
        const { rowCount } = await tx.query(
          `UPDATE warranty_cost_attribution
              SET recovered_from_supplier_amount = $2,
                  note = $3,
                  version = version + 1
            WHERE warranty_repair_order_id = $1`,
          [warrantyRepairOrderId, input.amount, input.note],
        );
        if (rowCount === 0) {
          throw new BusinessError(
            ErrorCode.NOT_FOUND,
            'Đơn này chưa được mở như một đơn bảo hành.',
          );
        }
      } catch (err) {
        const e = err as { code?: string; constraint?: string };
        if (e.code === '23514' && e.constraint === 'doi_lai_khong_vuot_chi_phi') {
          throw new BusinessError(
            ErrorCode.VALIDATION_FAILED,
            'Số đòi lại được không vượt quá chi phí đã bỏ ra. Chạy lại tính chi phí trước.',
          );
        }
        throw err;
      }
      return this.docQuyChiPhi(tx, warrantyRepairOrderId);
    });
  }

  /**
   * Chi phí bảo hành đã quy về một đơn GỐC.
   *
   * Đây là con số mà chủ garage thực sự cần: "đơn hôm 10/03 tưởng lãi 2 triệu,
   * bảo hành ăn mất 1 triệu, thực ra chỉ lãi 1 triệu."
   */
  async costsForOriginalOrder(
    actor: ActorContext,
    originalRepairOrderId: string,
  ): Promise<WarrantyCostAttribution[]> {
    assertCan(actor, 'warranty:read');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [originalRepairOrderId];
      const scope = appendBranchScope(actor, params, 'goc');
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT wca.*, goc.code AS ma_goc, bh.code AS ma_bao_hanh
           FROM warranty_cost_attribution wca
           JOIN repair_order goc ON goc.id = wca.original_repair_order_id
           JOIN repair_order bh  ON bh.id = wca.warranty_repair_order_id
          WHERE wca.original_repair_order_id = $1${scope}
          ORDER BY wca.created_at`,
        params,
      );
      return rows.map(toQuyChiPhi);
    });
  }

  // ---------------------------------------------------------------------------

  private async docQuyChiPhi(
    tx: PoolClient,
    warrantyRepairOrderId: string,
  ): Promise<WarrantyCostAttribution> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT wca.*, goc.code AS ma_goc, bh.code AS ma_bao_hanh
         FROM warranty_cost_attribution wca
         JOIN repair_order goc ON goc.id = wca.original_repair_order_id
         JOIN repair_order bh  ON bh.id = wca.warranty_repair_order_id
        WHERE wca.warranty_repair_order_id = $1`,
      [warrantyRepairOrderId],
    );
    return toQuyChiPhi(rows[0]!);
  }

  private async assertOrderInScope(
    tx: PoolClient,
    actor: ActorContext,
    repairOrderId: string,
  ): Promise<void> {
    const params: unknown[] = [repairOrderId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query(
      `SELECT 1 FROM repair_order ro WHERE ro.id = $1${scope}`,
      params,
    );
    if (rows.length === 0) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
    }
  }
}

function toQuyChiPhi(r: Record<string, unknown>): WarrantyCostAttribution {
  return {
    id: r.id as string,
    originalRepairOrderId: r.original_repair_order_id as string,
    originalRepairOrderCode: r.ma_goc as string,
    warrantyRepairOrderId: r.warranty_repair_order_id as string,
    warrantyRepairOrderCode: r.ma_bao_hanh as string,
    partCostAmount: parseAmountFromDb(r.part_cost_amount, 'partCost'),
    laborCostAmount: parseAmountFromDb(r.labor_cost_amount, 'laborCost'),
    recoveredFromSupplierAmount: parseAmountFromDb(
      r.recovered_from_supplier_amount,
      'recovered',
    ),
    netCostAmount: parseAmountFromDb(r.net_cost_amount, 'netCost'),
    note: (r.note ?? null) as string | null,
  };
}
