import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  FinancingProgramInput,
  OnroadFeeScheduleInput,
  PriceChangeInput,
  VehicleAvailabilityInput,
  ProductMediaInput,
  VehicleColorInput,
  VehiclePromotionInput,
  type ActorContext,
} from '@garageos/contracts';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';
import { ShowroomService } from './showroom.service';

const ColorList = z.array(VehicleColorInput).max(30);
const MediaList = z.array(ProductMediaInput).max(60);
const PromotionList = z.array(VehiclePromotionInput).max(30);
const FinancingList = z.array(FinancingProgramInput).max(10);

const OnroadQuery = z.object({
  variantId: z.string().uuid(),
  provinceCode: z.string().regex(/^[0-9]{2,3}$/),
  colorId: z.string().uuid().optional(),
  onDate: z.string().date().optional(),
});

const FinancingQuery = z.object({
  programId: z.string().uuid(),
  basePrice: z.coerce.bigint().positive(),
  downPaymentBp: z.coerce.number().int().min(0).max(9999),
  termMonths: z.coerce.number().int().min(6).max(120),
});

/**
 * Catalog thương mại — bề mặt quản trị.
 *
 * 🔒 Không có endpoint nào ở đây nhận tiền, tạo hồ sơ vay hay cam kết lãi suất.
 *    Ranh giới đã chốt: **hiển thị ≠ giao dịch** (SRS-LS-EXP-001 §2.1). Ranh
 *    giới này kiểm được bằng test, không chỉ bằng lời hứa.
 */
@Controller('api/v1/showroom')
@UseGuards(JwtGuard)
export class ShowroomController {
  constructor(
    // 🔒 `@Inject()` tường minh, kể cả khi kiểu đã đủ để suy ra: esbuild/tsx
    //    KHÔNG sinh `design:paramtypes`, nên tham số không có decorator được
    //    Nest tiêm `undefined` — im lặng, và chỉ lộ ra thành 500 ở lần gọi đầu.
    //    Bẫy này đã ghi ở CLAUDE.md và STATUS.md; nó vẫn bắt được tôi lần này.
    @Inject(ShowroomService) private readonly service: ShowroomService,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  /* ---------------------------- Biểu phí ---------------------------------- */

  @Get('fee-schedules')
  async feeSchedules(@Actor() actor: ActorContext, @Query('provinceCode') provinceCode?: string) {
    assertCan(actor, 'showroom:feeScheduleRead');
    return { items: await this.service.listFeeSchedules(actor, provinceCode) };
  }

  @Put('fee-schedules')
  async upsertFeeSchedule(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(OnroadFeeScheduleInput)) input: OnroadFeeScheduleInput,
  ) {
    assertCan(actor, 'showroom:feeScheduleWrite');
    return this.service.upsertFeeSchedule(actor, input);
  }

  /* ------------------------- Bóc giá lăn bánh ----------------------------- */

  @Get('onroad-quote')
  async onroadQuote(@Actor() actor: ActorContext, @Query(new ZodPipe(OnroadQuery)) q: z.infer<typeof OnroadQuery>) {
    assertCan(actor, 'marketing:catalogRead');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ listPrice: string | null; powertrain: 'ICE' | 'HYBRID' | 'BEV' }>(
        `SELECT display_price_amount::text AS "listPrice", powertrain
           FROM vehicle_variant_revision WHERE variant_id = $1
          ORDER BY updated_at DESC LIMIT 1`,
        [q.variantId],
      );
      const variant = rows[0];
      if (variant === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiên bản xe.');
      if (variant.listPrice === null) {
        // Giá "Liên hệ" thì không có gì để bóc. Trả về rỗng thay vì bịa số 0.
        return { quote: null, reason: 'PRICE_ON_REQUEST' as const };
      }

      let colorSurcharge = 0n;
      if (q.colorId !== undefined) {
        const { rows: c } = await tx.query<{ surcharge: string }>(
          'SELECT surcharge_amount::text AS surcharge FROM vehicle_color WHERE id = $1',
          [q.colorId],
        );
        colorSurcharge = BigInt(c[0]?.surcharge ?? '0');
      }

      const quote = await this.service.quoteOnroad(tx, {
        listPrice: BigInt(variant.listPrice),
        colorSurcharge,
        powertrain: variant.powertrain,
        provinceCode: q.provinceCode,
        onDate: q.onDate ?? new Date().toISOString().slice(0, 10),
      });
      if (quote === null) return { quote: null, reason: 'NO_FEE_SCHEDULE' as const };
      return { quote: serialize(quote), reason: null };
    });
  }

  @Get('financing-quote')
  async financingQuote(@Actor() actor: ActorContext, @Query(new ZodPipe(FinancingQuery)) q: z.infer<typeof FinancingQuery>) {
    assertCan(actor, 'marketing:catalogRead');
    return this.db.withTenant(actor, async (tx) => ({
      quote: serialize(await this.service.quoteFinancing(tx, q.programId, q)),
    }));
  }

  /* ------------------------------- Giá ------------------------------------ */

  @Post('products/:productId/price')
  async changePrice(
    @Actor() actor: ActorContext,
    @Param('productId') productId: string,
    @Body(new ZodPipe(PriceChangeInput)) input: PriceChangeInput,
  ) {
    assertCan(actor, 'showroom:priceWrite');
    return this.service.changePrice(actor, productId, input);
  }

  @Get('products/:productId/price-log')
  async priceLog(@Actor() actor: ActorContext, @Param('productId') productId: string) {
    assertCan(actor, 'showroom:priceWrite');
    return { items: await this.service.priceLog(actor, productId) };
  }

  /* ------------------- Màu, ưu đãi, trả góp (theo revision) --------------- */

  @Get('revisions/:revisionId/colors')
  async listColors(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string) {
    assertCan(actor, 'showroom:commerceWrite');
    return { items: await this.service.listColors(actor, revisionId) };
  }

  @Put('revisions/:revisionId/colors')
  async colors(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string, @Body(new ZodPipe(ColorList)) input: z.infer<typeof ColorList>) {
    assertCan(actor, 'showroom:commerceWrite');
    return this.service.replaceColors(actor, revisionId, input);
  }

  /**
   * Ảnh gắn cho một bản sửa — tab *Ảnh & 360°* trong màn Sửa xe.
   *
   * Đọc dùng `commerceWrite` chứ không phải một quyền đọc riêng: danh sách này
   * chỉ có nghĩa trong màn SỬA, và ai mở màn sửa thì đã có quyền ghi.
   */
  @Get('revisions/:revisionId/media')
  async listMedia(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string) {
    assertCan(actor, 'showroom:commerceWrite');
    return { items: await this.service.listMedia(actor, revisionId) };
  }

  @Put('revisions/:revisionId/media')
  async media(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string, @Body(new ZodPipe(MediaList)) input: z.infer<typeof MediaList>) {
    assertCan(actor, 'showroom:commerceWrite');
    return this.service.replaceMedia(actor, revisionId, input);
  }

  @Put('revisions/:revisionId/promotions')
  async promotions(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string, @Body(new ZodPipe(PromotionList)) input: z.infer<typeof PromotionList>) {
    assertCan(actor, 'showroom:commerceWrite');
    return this.service.replacePromotions(actor, revisionId, input);
  }

  @Get('revisions/:revisionId/promotions')
  async listPromotions(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string) {
    assertCan(actor, 'marketing:catalogRead');
    return this.db.withTenant(actor, async (tx) => ({
      items: await this.service.promotionsOfRevision(tx, revisionId, new Date()),
    }));
  }

  @Put('revisions/:revisionId/financing')
  async financing(@Actor() actor: ActorContext, @Param('revisionId') revisionId: string, @Body(new ZodPipe(FinancingList)) input: z.infer<typeof FinancingList>) {
    assertCan(actor, 'showroom:commerceWrite');
    return this.service.replaceFinancing(actor, revisionId, input);
  }

  /* --------------------------- Tồn và giao xe ----------------------------- */

  @Get('products/:productId/availability')
  async availability(@Actor() actor: ActorContext, @Param('productId') productId: string) {
    assertCan(actor, 'marketing:catalogRead');
    return { items: await this.service.availabilityOfProduct(actor, productId) };
  }

  @Put('products/:productId/availability')
  async setAvailability(
    @Actor() actor: ActorContext,
    @Param('productId') productId: string,
    @Body(new ZodPipe(VehicleAvailabilityInput)) input: VehicleAvailabilityInput,
  ) {
    assertCan(actor, 'showroom:availabilityWrite');
    return this.service.updateAvailability(actor, productId, input);
  }
}

/** `bigint` không đi qua `JSON.stringify` — đổi sang chuỗi, không sang `number`. */
function serialize<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
