import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  type ActorContext,
  type FinancingProgramInput,
  type OnroadFeeScheduleInput,
  type OnroadPriceBreakdown,
  type Powertrain,
  type PriceChangeInput,
  type VehicleAvailabilityInput,
  type ProductMediaInput,
  type ProductMediaRow,
  type VehicleColorInput,
  type VehiclePromotionInput,
} from '@garageos/contracts';
import {
  bieuPhiHieuLuc,
  nhanKhaNangGiao,
  tinhGiaLanBanh,
  tinhTraGop,
  trangThaiUuDai,
  type BieuPhiLanBanh,
  type KetQuaTraGop,
} from '@garageos/domain';
import { BusinessError } from '../common/errors';
import { urlMediaCongKhai } from '../common/media-url';

/**
 * Catalog thương mại — SRS-LS-EXP-001 §4.
 *
 * 🔒 Service này **không tính toán gì cả**. Mọi phép tính nằm ở
 *    `packages/domain` dưới dạng hàm thuần, có test riêng, không import
 *    framework (`CLAUDE.md` nguyên tắc 5). Ở đây chỉ có: đọc dữ liệu, gọi hàm,
 *    ghi vết. Nếu một công thức xuất hiện trong file này thì đó là bản sao thứ
 *    hai, và hai công thức thì sớm muộn cũng lệch nhau.
 */

const AUDIT = {
  FEE_SCHEDULE_WRITTEN: 'SHOWROOM_FEE_SCHEDULE_WRITTEN',
  PRICE_CHANGED: 'SHOWROOM_PRICE_CHANGED',
  PROMOTION_TOGGLED: 'SHOWROOM_PROMOTION_TOGGLED',
  AVAILABILITY_UPDATED: 'SHOWROOM_AVAILABILITY_UPDATED',
} as const;

export interface FeeScheduleRow {
  id: string;
  provinceCode: string;
  provinceName: string;
  powertrain: Powertrain;
  registrationFeeRateBp: number;
  plateFeeAmount: string;
  inspectionFeeAmount: string;
  roadMaintenanceFeeAmount: string;
  civilInsuranceFeeAmount: string;
  materialInsuranceRateBp: number;
  dealerFeeAmount: string;
  dealerFeeLabel: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

@Injectable()
export class ShowroomService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /* ======================== Biểu phí lăn bánh (§4.1) ======================= */

  async listFeeSchedules(actor: ActorContext, provinceCode?: string): Promise<FeeScheduleRow[]> {
    return this.db.withTenant(actor, async (tx) => this.readFeeSchedules(tx, provinceCode));
  }

  private async readFeeSchedules(tx: PoolClient, provinceCode?: string): Promise<FeeScheduleRow[]> {
    const { rows } = await tx.query<FeeScheduleRow>(
      `SELECT id, province_code AS "provinceCode", province_name AS "provinceName", powertrain,
              registration_fee_rate_bp AS "registrationFeeRateBp",
              plate_fee_amount::text AS "plateFeeAmount",
              inspection_fee_amount::text AS "inspectionFeeAmount",
              road_maintenance_fee_amount::text AS "roadMaintenanceFeeAmount",
              civil_insurance_fee_amount::text AS "civilInsuranceFeeAmount",
              material_insurance_rate_bp AS "materialInsuranceRateBp",
              dealer_fee_amount::text AS "dealerFeeAmount",
              dealer_fee_label AS "dealerFeeLabel",
              to_char(effective_from,'YYYY-MM-DD') AS "effectiveFrom",
              to_char(effective_to,'YYYY-MM-DD') AS "effectiveTo"
         FROM onroad_fee_schedule
        WHERE ($1::text IS NULL OR province_code = $1)
        ORDER BY province_name, powertrain, effective_from DESC`,
      [provinceCode ?? null],
    );
    return rows;
  }

  async upsertFeeSchedule(actor: ActorContext, input: OnroadFeeScheduleInput): Promise<{ id: string }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO onroad_fee_schedule
           (tenant_id, province_code, province_name, powertrain, registration_fee_rate_bp,
            plate_fee_amount, inspection_fee_amount, road_maintenance_fee_amount,
            civil_insurance_fee_amount, material_insurance_rate_bp,
            dealer_fee_amount, dealer_fee_label, effective_from, effective_to,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4::powertrain,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,$15,$15)
         ON CONFLICT (tenant_id, province_code, powertrain, effective_from) DO UPDATE SET
           province_name = EXCLUDED.province_name,
           registration_fee_rate_bp = EXCLUDED.registration_fee_rate_bp,
           plate_fee_amount = EXCLUDED.plate_fee_amount,
           inspection_fee_amount = EXCLUDED.inspection_fee_amount,
           road_maintenance_fee_amount = EXCLUDED.road_maintenance_fee_amount,
           civil_insurance_fee_amount = EXCLUDED.civil_insurance_fee_amount,
           material_insurance_rate_bp = EXCLUDED.material_insurance_rate_bp,
           dealer_fee_amount = EXCLUDED.dealer_fee_amount,
           dealer_fee_label = EXCLUDED.dealer_fee_label,
           effective_to = EXCLUDED.effective_to,
           updated_by = EXCLUDED.updated_by
         RETURNING id`,
        [
          actor.tenantId, input.provinceCode, input.provinceName, input.powertrain,
          input.registrationFeeRateBp, String(input.plateFeeAmount), String(input.inspectionFeeAmount),
          String(input.roadMaintenanceFeeAmount), String(input.civilInsuranceFeeAmount),
          input.materialInsuranceRateBp, String(input.dealerFeeAmount), input.dealerFeeLabel ?? null,
          input.effectiveFrom, input.effectiveTo ?? null, actor.userId,
        ],
      );
      const id = rows[0]!.id;
      await ghiNhatKy(tx, actor, AUDIT.FEE_SCHEDULE_WRITTEN, 'onroad_fee_schedule', id, null);
      return { id };
    });
  }

  /* ===================== Giá lăn bánh cho một phiên bản ==================== */

  /**
   * 🔒 Không có biểu phí cho tỉnh khách chọn thì trả `null`, **không** rơi về
   *    một tỉnh khác và không đoán. Bề mặt phải đổi sang trạng thái "Chưa có
   *    biểu phí cho tỉnh này" và chỉ hiện giá niêm yết. Thà thiếu một con số
   *    còn hơn hiện con số của tỉnh khác — khách mang nó đi nộp thuế thật.
   */
  async quoteOnroad(
    tx: PoolClient,
    input: { listPrice: bigint; colorSurcharge?: bigint; powertrain: Powertrain; provinceCode: string; onDate: string },
  ): Promise<OnroadPriceBreakdown | null> {
    const rows = await this.readFeeSchedules(tx, input.provinceCode);
    const cungLoaiDongCo = rows.filter((r) => r.powertrain === input.powertrain);
    const hieuLuc = bieuPhiHieuLuc(cungLoaiDongCo, input.onDate);
    if (hieuLuc === null) return null;

    const bieuPhi: BieuPhiLanBanh = {
      provinceName: hieuLuc.provinceName,
      powertrain: hieuLuc.powertrain,
      registrationFeeRateBp: hieuLuc.registrationFeeRateBp,
      plateFeeAmount: BigInt(hieuLuc.plateFeeAmount),
      inspectionFeeAmount: BigInt(hieuLuc.inspectionFeeAmount),
      roadMaintenanceFeeAmount: BigInt(hieuLuc.roadMaintenanceFeeAmount),
      civilInsuranceFeeAmount: BigInt(hieuLuc.civilInsuranceFeeAmount),
      materialInsuranceRateBp: hieuLuc.materialInsuranceRateBp,
      dealerFeeAmount: BigInt(hieuLuc.dealerFeeAmount),
      dealerFeeLabel: hieuLuc.dealerFeeLabel,
      effectiveFrom: hieuLuc.effectiveFrom,
    };
    return tinhGiaLanBanh({ listPrice: input.listPrice, colorSurcharge: input.colorSurcharge }, bieuPhi);
  }

  /* ============================ Đổi giá (§4.6) ============================= */

  /**
   * 🔒 `INV-LS-20`: đổi giá công bố và ghi vết là **một transaction**.
   *
   * Tách ra hai lệnh nghĩa là có một trạng thái trung gian trong đó giá đã đổi
   * mà nhật ký chưa có dòng — và đó chính là trạng thái sẽ tồn tại vĩnh viễn
   * nếu lệnh thứ hai lỗi. Nhật ký có lỗ hổng còn tệ hơn không có nhật ký, vì
   * người ta tin nó.
   */
  async changePrice(actor: ActorContext, productId: string, input: PriceChangeInput): Promise<{ logged: boolean }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ revisionId: string; oldAmount: string | null; status: string }>(
        `SELECT vvr.id AS "revisionId", vvr.display_price_amount::text AS "oldAmount", r.status
           FROM vehicle_variant_revision vvr
           JOIN vehicle_product_revision r ON r.id = vvr.product_revision_id
           JOIN vehicle_product p ON p.draft_revision_id = r.id
          WHERE vvr.variant_id = $1 AND p.id = $2`,
        [input.variantId, productId],
      );
      const draft = rows[0];
      if (draft === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản nháp của phiên bản này để đổi giá.');
      }

      const oldAmount = draft.oldAmount === null ? null : BigInt(draft.oldAmount);
      if (oldAmount === input.newAmount) {
        // Không đổi gì thì không ghi vết. Một dòng nhật ký không nói lên thay
        // đổi nào chỉ làm loãng những dòng có ý nghĩa.
        return { logged: false };
      }

      await tx.query(
        `UPDATE vehicle_variant_revision SET display_price_amount = $2 WHERE id = $1`,
        [draft.revisionId, input.newAmount === null ? null : String(input.newAmount)],
      );
      await tx.query(
        `INSERT INTO vehicle_price_log
           (tenant_id, product_id, variant_id, old_amount, new_amount, reason, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          actor.tenantId, productId, input.variantId,
          oldAmount === null ? null : String(oldAmount),
          input.newAmount === null ? null : String(input.newAmount),
          input.reason, actor.userId,
        ],
      );
      await ghiNhatKy(tx, actor, AUDIT.PRICE_CHANGED, 'vehicle_variant', input.variantId, input.reason);
      return { logged: true };
    });
  }

  async priceLog(actor: ActorContext, productId: string): Promise<Record<string, unknown>[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT l.id, l.variant_id AS "variantId", v.stable_key AS "variantKey",
                l.old_amount::text AS "oldAmount", l.new_amount::text AS "newAmount",
                l.reason, l.changed_at AS "changedAt", u.full_name AS "changedBy"
           FROM vehicle_price_log l
           JOIN vehicle_variant v ON v.id = l.variant_id
           LEFT JOIN app_user u ON u.id = l.changed_by
          WHERE l.product_id = $1
          ORDER BY l.changed_at DESC, l.id DESC
          LIMIT 200`,
        [productId],
      );
      return rows;
    });
  }

  /* ========================= Ưu đãi và trả góp ============================= */

  /**
   * 🔒 Màu được GHI ĐÈ THEO TÊN, không xoá sạch rồi chèn lại.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ Bản trước `DELETE` toàn bộ màu của revision rồi `INSERT` lại. Mỗi lần
   *    biên tập viên bấm Lưu, mọi màu nhận `id` MỚI — kể cả màu không ai đụng
   *    vào. Và `vehicle_product_media.color_id` trỏ tới `id` đó qua khoá ngoại
   *    `ON DELETE SET NULL` (0072):
   *
   *        vehicle_product_media -> vehicle_color   ON DELETE SET NULL
   *
   *    Nên sửa một chữ trong tên màu thứ tư là **toàn bộ ảnh của cả mẫu xe rời
   *    khỏi màu của chúng**. Không lỗi, không cảnh báo, không dòng nhật ký.
   *    Người dùng thấy Lưu thành công; ảnh thì về "không thuộc màu nào", và
   *    phải gán tay lại từng tấm — nếu họ kịp nhận ra.
   *
   * 💡 `ON DELETE SET NULL` không sai. Nó đúng cho việc XOÁ một màu thật. Cái
   *    sai là gọi một thao tác SỬA bằng cách xoá.
   *
   * `UNIQUE (tenant_id, product_revision_id, name)` cho sẵn một khoá tự nhiên,
   * nên `ON CONFLICT … DO UPDATE` giữ nguyên `id` của mọi màu còn ở lại. Chỉ
   * màu THẬT SỰ biến mất khỏi danh sách mới bị xoá — và lúc đó `SET NULL` là
   * đúng ý.
   *
   * ⚠️ ĐỔI TÊN màu vẫn cắt liên kết ảnh: theo khoá tự nhiên thì đổi tên là xoá
   *    một màu và thêm một màu khác. Muốn giữ qua lần đổi tên thì `VehicleColorInput`
   *    phải mang theo `id` — đó là đổi hợp đồng và đổi cả màn quản trị, nên
   *    chưa làm ở đây. Đã ghi vào STATUS.md.
   *
   * Ưu đãi và trả góp vẫn xoá-rồi-chèn, và đó là chủ ý: không bảng nào trỏ tới
   * hai bảng đó (kiểm bằng `pg_constraint`), nên `id` của chúng không mang ý
   * nghĩa gì ra ngoài.
   */
  async listColors(
    actor: ActorContext,
    revisionId: string,
  ): Promise<(VehicleColorInput & { id: string })[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT id, name, hex_code, kind, surcharge_amount, display_order
           FROM vehicle_color WHERE product_revision_id = $1
          ORDER BY display_order, name`,
        [revisionId],
      );
      return rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        hexCode: r.hex_code as string,
        kind: r.kind as VehicleColorInput['kind'],
        /*
         * 🔒 Phụ thu là TIỀN, và nó về đây dưới dạng chuỗi từ `bigint`.
         *    `Number()` ở đây an toàn vì phụ thu màu là con số tám chữ số, nhưng
         *    hợp đồng khai `amount` nên vẫn đi qua đúng cửa đó chứ không tự chế
         *    một quy tắc riêng cho một cột.
         */
        surchargeAmount: Number(r.surcharge_amount),
        displayOrder: Number(r.display_order),
      }));
    });
  }

  /* ============================ Ảnh của bản sửa ============================ */

  async listMedia(actor: ActorContext, revisionId: string): Promise<ProductMediaRow[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT m.id, m.media_asset_id, m.role, m.alt_text, m.sort_order, m.is_cover, m.color_id,
                pub.public_storage_key
           FROM vehicle_product_media m
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key
               FROM media_rendition rn
               JOIN media_publication mp ON mp.rendition_id = rn.id AND mp.status = 'READY'
              WHERE rn.asset_id = m.media_asset_id
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) pub ON true
          WHERE m.product_revision_id = $1
          ORDER BY m.is_cover DESC, m.sort_order, m.id`,
        [revisionId],
      );
      return rows.map((r) => ({
        id: r.id as string,
        mediaAssetId: r.media_asset_id as string,
        role: r.role as ProductMediaRow['role'],
        altText: (r.alt_text ?? '') as string,
        sortOrder: Number(r.sort_order),
        isCover: r.is_cover as boolean,
        colorId: (r.color_id ?? null) as string | null,
        previewUrl: r.public_storage_key === null || r.public_storage_key === undefined
          ? null
          : urlMediaCongKhai(r.public_storage_key as string),
      }));
    });
  }

  /**
   * Đặt lại TOÀN BỘ danh sách ảnh của một bản sửa.
   *
   * 🔒 Xoá-rồi-chèn ở đây an toàn, khác với màu xe (xem `replaceColors`): không
   *    bảng nào trỏ tới `vehicle_product_media`, nên không có `id` nào để mất.
   *    Chiều phụ thuộc đi ngược lại — chính bảng này trỏ tới `vehicle_color`.
   *
   * 🔒 Chỉ ghi được vào bản NHÁP. Trigger `trg_vehicle_product_media_chi_sua_ban_nhap`
   *    (0082) canh điều đó ở database; kiểm ở đây chỉ để trả về một câu tiếng
   *    Việt thay vì một lỗi Postgres.
   */
  async replaceMedia(
    actor: ActorContext,
    revisionId: string,
    items: ProductMediaInput[],
  ): Promise<{ count: number }> {
    /*
     * ⚠️ Nhiều hơn một ảnh bìa là một trạng thái không có nghĩa: chỗ bìa có một.
     *    Chặn ở đây thay vì để "ảnh nào cũng được" rồi mỗi truy vấn tự chọn một
     *    ảnh khác nhau.
     */
    if (items.filter((m) => m.isCover).length > 1) {
      throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Chỉ một ảnh được đặt làm ảnh bìa.');
    }
    return this.db.withTenant(actor, async (tx) => {
      const { rows: tt } = await tx.query<{ status: string }>(
        'SELECT status FROM vehicle_product_revision WHERE id = $1',
        [revisionId],
      );
      if (tt[0] === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản sửa.');
      if (tt[0].status !== 'DRAFT') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ sửa ảnh của bản NHÁP. Bản đã xuất bản là bất biến — tạo bản nháp mới trước.',
        );
      }

      await tx.query('DELETE FROM vehicle_product_media WHERE product_revision_id = $1', [revisionId]);
      for (const m of items) {
        await tx.query(
          `INSERT INTO vehicle_product_media
             (tenant_id, product_revision_id, media_asset_id, role, alt_text, sort_order, is_cover, color_id)
           VALUES ($1,$2,$3,$4::product_media_role,$5,$6,$7,$8)`,
          [actor.tenantId, revisionId, m.mediaAssetId, m.role, m.altText, m.sortOrder,
            m.isCover, m.colorId ?? null],
        );
      }
      return { count: items.length };
    });
  }

  async replaceColors(actor: ActorContext, revisionId: string, colors: VehicleColorInput[]): Promise<{ count: number }> {
    return this.db.withTenant(actor, async (tx) => {
      /*
       * Xoá TRƯỚC, và chỉ xoá những tên không còn trong danh sách gửi lên.
       * Danh sách rỗng thì `<> ALL('{}')` đúng với mọi hàng — xoá sạch, đúng ý.
       */
      await tx.query(
        `DELETE FROM vehicle_color
          WHERE product_revision_id = $1 AND name <> ALL($2::text[])`,
        [revisionId, colors.map((c) => c.name)],
      );
      for (const c of colors) {
        await tx.query(
          `INSERT INTO vehicle_color (tenant_id, product_revision_id, name, hex_code, kind, surcharge_amount, display_order)
           VALUES ($1,$2,$3,$4,$5::vehicle_color_kind,$6,$7)
           ON CONFLICT (tenant_id, product_revision_id, name) DO UPDATE
              SET hex_code = EXCLUDED.hex_code,
                  kind = EXCLUDED.kind,
                  surcharge_amount = EXCLUDED.surcharge_amount,
                  display_order = EXCLUDED.display_order`,
          [actor.tenantId, revisionId, c.name, c.hexCode, c.kind, String(c.surchargeAmount), c.displayOrder],
        );
      }
      return { count: colors.length };
    });
  }

  async replacePromotions(actor: ActorContext, revisionId: string, promos: VehiclePromotionInput[]): Promise<{ count: number }> {
    return this.db.withTenant(actor, async (tx) => {
      await tx.query('DELETE FROM vehicle_promotion WHERE product_revision_id = $1', [revisionId]);
      for (const p of promos) {
        await tx.query(
          `INSERT INTO vehicle_promotion
             (tenant_id, product_revision_id, variant_id, kind, title, condition_text,
              value_amount, is_enabled, starts_at, ends_at, display_order)
           VALUES ($1,$2,$3,$4::vehicle_promotion_kind,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11)`,
          [
            actor.tenantId, revisionId, p.variantId ?? null, p.kind, p.title, p.conditionText ?? null,
            p.valueAmount === null || p.valueAmount === undefined ? null : String(p.valueAmount),
            p.isEnabled, p.startsAt, p.endsAt ?? null, p.displayOrder,
          ],
        );
      }
      return { count: promos.length };
    });
  }

  async replaceFinancing(actor: ActorContext, revisionId: string, programs: FinancingProgramInput[]): Promise<{ count: number }> {
    return this.db.withTenant(actor, async (tx) => {
      await tx.query('DELETE FROM financing_program WHERE product_revision_id = $1', [revisionId]);
      for (const f of programs) {
        await tx.query(
          `INSERT INTO financing_program
             (tenant_id, product_revision_id, bank_name, bank_logo_media_id, min_down_payment_bp,
              promo_rate_bp, promo_months, standard_rate_bp, allowed_terms_months,
              down_payment_options_bp, rate_updated_at, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::int[],$10::int[],$11::date,$12)`,
          [
            actor.tenantId, revisionId, f.bankName, f.bankLogoMediaId ?? null, f.minDownPaymentBp,
            f.promoRateBp, f.promoMonths, f.standardRateBp, f.allowedTermsMonths,
            f.downPaymentOptionsBp, f.rateUpdatedAt, f.displayOrder,
          ],
        );
      }
      return { count: programs.length };
    });
  }

  /**
   * Bảng trả góp cho MỘT chương trình và MỘT kỳ hạn.
   *
   * 🔒 Kỳ hạn phải nằm trong `allowed_terms_months` đã khai. Nhận kỳ hạn tuỳ ý
   *    từ client là để client tự bịa ra một sản phẩm tài chính không tồn tại,
   *    rồi khách in ra mang tới ngân hàng.
   */
  async quoteFinancing(
    tx: PoolClient,
    programId: string,
    input: { basePrice: bigint; downPaymentBp: number; termMonths: number },
  ): Promise<KetQuaTraGop> {
    const { rows } = await tx.query<{
      minDownPaymentBp: number; promoRateBp: number; promoMonths: number;
      standardRateBp: number; allowedTermsMonths: number[]; downPaymentOptionsBp: number[];
    }>(
      `SELECT min_down_payment_bp AS "minDownPaymentBp", promo_rate_bp AS "promoRateBp",
              promo_months AS "promoMonths", standard_rate_bp AS "standardRateBp",
              allowed_terms_months AS "allowedTermsMonths",
              down_payment_options_bp AS "downPaymentOptionsBp"
         FROM financing_program WHERE id = $1`,
      [programId],
    );
    const ct = rows[0];
    if (ct === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy chương trình trả góp.');
    if (!ct.allowedTermsMonths.includes(input.termMonths)) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        `Kỳ hạn ${input.termMonths} tháng không nằm trong các kỳ hạn ngân hàng đã khai.`,
      );
    }
    if (input.downPaymentBp < ct.minDownPaymentBp) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        `Trả trước tối thiểu là ${ct.minDownPaymentBp / 100} %.`,
      );
    }
    return tinhTraGop({
      giaXe: input.basePrice,
      tyLeTraTruocBp: input.downPaymentBp,
      soKy: input.termMonths,
      laiSuatUuDaiBp: ct.promoRateBp,
      soThangUuDai: ct.promoMonths,
      laiSuatSauUuDaiBp: ct.standardRateBp,
    });
  }

  /* ======================= Tồn và giao xe (§4.5) =========================== */

  async availabilityOfProduct(actor: ActorContext, productId: string): Promise<Record<string, unknown>[]> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT a.id, a.branch_id AS "branchId", b.name AS "branchName", a.status,
                a.lead_time_days_min AS "leadTimeDaysMin", a.lead_time_days_max AS "leadTimeDaysMax",
                a.available_variant_ids AS "availableVariantIds",
                a.available_color_ids AS "availableColorIds",
                a.note, a.updated_at AS "updatedAt", u.full_name AS "updatedBy", a.version
           FROM vehicle_availability a
           JOIN branch b ON b.id = a.branch_id
           LEFT JOIN app_user u ON u.id = a.updated_by
          WHERE a.product_id = $1
          ORDER BY b.name`,
        [productId],
      );
      return rows;
    });
  }

  /**
   * 🔒 Nhân viên chi nhánh chỉ sửa được chi nhánh của mình.
   *
   * Kiểm ở đây chứ không ở giao diện: một `SALES_ADVISOR` gọi thẳng API là
   * chuyện đã xảy ra trong dự án này (xem `permissions.ts` — một cửa khoá, năm
   * cửa mở). `OWNER` và `SALES_MANAGER` có phạm vi rộng hơn nên đi qua.
   */
  async updateAvailability(
    actor: ActorContext,
    productId: string,
    input: VehicleAvailabilityInput,
  ): Promise<{ id: string }> {
    const toanChuoi = actor.roles.includes('OWNER') || actor.roles.includes('SALES_MANAGER');
    if (!toanChuoi && !actor.branchIds.includes(input.branchId)) {
      throw new BusinessError(
        ErrorCode.BRANCH_OUT_OF_SCOPE,
        'Bạn chỉ cập nhật được khả năng giao xe của chi nhánh mình.',
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO vehicle_availability
           (tenant_id, product_id, branch_id, status, lead_time_days_min, lead_time_days_max,
            available_variant_ids, available_color_ids, note, updated_by)
         VALUES ($1,$2,$3,$4::vehicle_availability_status,$5,$6,$7::uuid[],$8::uuid[],$9,$10)
         ON CONFLICT (tenant_id, product_id, branch_id) DO UPDATE SET
           status = EXCLUDED.status,
           lead_time_days_min = EXCLUDED.lead_time_days_min,
           lead_time_days_max = EXCLUDED.lead_time_days_max,
           available_variant_ids = EXCLUDED.available_variant_ids,
           available_color_ids = EXCLUDED.available_color_ids,
           note = EXCLUDED.note,
           updated_by = EXCLUDED.updated_by
         RETURNING id`,
        [
          actor.tenantId, productId, input.branchId, input.status,
          input.leadTimeDaysMin ?? null, input.leadTimeDaysMax ?? null,
          input.availableVariantIds, input.availableColorIds, input.note ?? null, actor.userId,
        ],
      );
      const id = rows[0]!.id;
      // Lịch sử sửa tồn xe dùng `audit_log` chung — §4.5, không thêm bảng thứ hai.
      await ghiNhatKy(tx, actor, AUDIT.AVAILABILITY_UPDATED, 'vehicle_availability', id, input.note ?? null);
      return { id };
    });
  }

  /** Nhãn gộp cho thẻ xe — luôn nêu phạm vi (`INV-LS-17`). */
  async availabilityBadge(tx: PoolClient, productId: string): Promise<ReturnType<typeof nhanKhaNangGiao>> {
    const { rows } = await tx.query<{
      branchId: string; branchName: string; status: 'SAN_XE' | 'SAP_VE' | 'DAT_HANG' | 'TAM_NGUNG';
      leadTimeDaysMin: number | null; leadTimeDaysMax: number | null;
    }>(
      `SELECT a.branch_id AS "branchId", b.name AS "branchName", a.status,
              a.lead_time_days_min AS "leadTimeDaysMin", a.lead_time_days_max AS "leadTimeDaysMax"
         FROM vehicle_availability a JOIN branch b ON b.id = a.branch_id
        WHERE a.product_id = $1 AND b.is_active`,
      [productId],
    );
    return nhanKhaNangGiao(rows);
  }

  /** Ưu đãi kèm trạng thái suy ra — admin thấy đủ bốn, landing chỉ thấy `DANG_CHAY`. */
  async promotionsOfRevision(tx: PoolClient, revisionId: string, bayGio: Date) {
    const { rows } = await tx.query<{
      id: string; kind: string; title: string; conditionText: string | null;
      valueAmount: string | null; isEnabled: boolean; startsAt: Date; endsAt: Date | null; displayOrder: number;
    }>(
      `SELECT id, kind, title, condition_text AS "conditionText", value_amount::text AS "valueAmount",
              is_enabled AS "isEnabled", starts_at AS "startsAt", ends_at AS "endsAt",
              display_order AS "displayOrder"
         FROM vehicle_promotion WHERE product_revision_id = $1 ORDER BY display_order, title`,
      [revisionId],
    );
    return rows.map((r) => ({ ...r, state: trangThaiUuDai(r, bayGio) }));
  }
}

async function ghiNhatKy(
  tx: PoolClient,
  actor: ActorContext,
  action: string,
  entityType: string,
  entityId: string,
  reason: string | null,
): Promise<void> {
  await tx.query(
    `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor.tenantId, actor.userId, action, entityType, entityId, reason],
  );
}
