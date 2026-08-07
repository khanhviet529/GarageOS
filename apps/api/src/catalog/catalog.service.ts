import { Inject, Injectable } from '@nestjs/common';
import { TenantAwareDb } from '@garageos/db';
import { parseAmountFromDb } from '@garageos/domain';
import {
  ErrorCode,
  canDo,
  type ActorContext,
  type CatalogForVehicle,
  type PartItem,
  type Powertrain,
  type ServiceItem,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { resolveActivePriceList } from '../common/price-list';

@Injectable()
export class CatalogService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Danh mục áp dụng được cho MỘT chiếc xe cụ thể — 🔒 INV-V-01.
   *
   * Điểm mấu chốt: API này KHÔNG nhận `powertrain` từ client. Nó đọc từ hồ sơ
   * xe trong database. Nếu để client gửi lên, một request cố ý khai `ICE` cho
   * xe điện sẽ lấy được đúng danh sách hạng mục sai — và bộ lọc trở thành trang
   * trí thay vì ràng buộc.
   *
   * BC-11 mục 2.1 nói enforce ở HAI tầng: đây là tầng danh sách (trải nghiệm),
   * tầng bảo vệ thật nằm ở lúc thêm dòng báo giá (Phase 1.4).
   */
  async forVehicle(actor: ActorContext, vehicleId: string): Promise<CatalogForVehicle> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows: vRows } = await tx.query<{ powertrain: Powertrain }>(
        `SELECT powertrain FROM vehicle WHERE id = $1 AND deleted_at IS NULL`,
        [vehicleId],
      );
      const vehicle = vRows[0];
      if (vehicle === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy xe');
      }

      // Danh mục là màn tra cứu, chưa gắn với một đơn cụ thể -> dùng chi nhánh
      // đầu tiên của người dùng. Lúc lập báo giá thì bảng giá được chọn theo
      // chi nhánh của chính cái đơn đó (xem quotation.service.ts).
      const priceList = await resolveActivePriceList(tx, actor.branchIds[0] ?? null);

      const { rows: services } = await tx.query<Record<string, unknown>>(
        `SELECT id, code, name, category, standard_hours,
                applicable_powertrains::text[] AS applicable_powertrains,
                required_certifications, warranty_months
           FROM service_item
          WHERE is_active
            AND $1 = ANY(applicable_powertrains)
          ORDER BY category, name`,
        [vehicle.powertrain],
      );

      const { rows: parts } = await tx.query<Record<string, unknown>>(
        `SELECT p.id, p.sku, p.name, p.unit, p.category, p.is_high_voltage,
                p.warranty_months, p.warranty_kilometers,
                pli.sell_price, pli.tax_rate_percent
           FROM part p
           LEFT JOIN price_list_item pli
             ON pli.part_id = p.id AND pli.price_list_id = $1
          WHERE p.is_active
          ORDER BY p.category NULLS LAST, p.name`,
        [priceList.id],
      );

      /*
       * 🔒 Lược bỏ MỌI số tiền với vai không được xem giá bán — docs/02 ma
       * trận, hàng "Xem giá bán".
       *
       * Thợ VẪN cần danh mục này để báo phát sinh (BC-03 mục 4 bước 2: chọn
       * hạng mục đề xuất). Chặn cả endpoint sẽ làm hỏng luồng đó, nên lược
       * trường thay vì trả 403.
       *
       * Lược ở SERVICE, không ở giao diện: ẩn một cột trên màn hình không làm
       * nó biến mất khỏi response JSON, và app thợ chạy trên điện thoại của
       * người dùng — ai cũng xem được response bằng một proxy.
       *
       * Đây là lỗ hổng thứ ba mà lát cắt 4.5 tìm ra bằng cách QUÉT toàn bộ
       * endpoint với token thợ.
       */
      const xemGia = canDo(actor.roles, 'catalog:readPrice');

      return {
        powertrain: vehicle.powertrain,
        laborRatePerHour: xemGia ? priceList.laborRatePerHour : 0,
        priceListName: priceList.name,
        serviceItems: services.map((s) => {
          const item = this.toServiceItem(s, priceList.laborRatePerHour);
          return xemGia ? item : { ...item, laborAmount: 0 };
        }),
        parts: parts.map((p) => {
          const item = toPartItem(p);
          return xemGia ? item : { ...item, sellPrice: null, taxRatePercent: null };
        }),
      };
    });
  }

  private toServiceItem(s: Record<string, unknown>, ratePerHour: number): ServiceItem {
    const hours = Number(s.standard_hours);
    return {
      id: s.id as string,
      code: s.code as string,
      name: s.name as string,
      category: s.category as ServiceItem['category'],
      standardHours: hours,
      applicablePowertrains: s.applicable_powertrains as Powertrain[],
      requiredCertifications: s.required_certifications as string[],
      warrantyMonths: Number(s.warranty_months),
      // 🔒 INV-M-01: tiền là số nguyên đồng. Giờ định mức có thể lẻ (1,5 giờ)
      //    nên phải làm tròn Ở ĐÂY, không để số lẻ trôi xuống phép tính sau.
      laborAmount: Math.round(hours * ratePerHour),
    };
  }
}

function toPartItem(p: Record<string, unknown>): PartItem {
  return {
    id: p.id as string,
    sku: p.sku as string,
    name: p.name as string,
    unit: p.unit as string,
    category: (p.category ?? null) as string | null,
    isHighVoltage: p.is_high_voltage as boolean,
    warrantyMonths: Number(p.warranty_months),
    warrantyKilometers: p.warranty_kilometers === null ? null : Number(p.warranty_kilometers),
    sellPrice:
      p.sell_price === null || p.sell_price === undefined
        ? null
        : parseAmountFromDb(p.sell_price, `sellPrice(${String(p.sku)})`),
    taxRatePercent:
      p.tax_rate_percent === null || p.tax_rate_percent === undefined
        ? null
        : Number(p.tax_rate_percent),
  };
}
