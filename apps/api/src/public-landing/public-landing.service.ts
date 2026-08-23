import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { parseAmountFromDb, tinhChiPhiSoHuu, type HangMucBaoDuong } from '@garageos/domain';
import {
  ErrorCode,
  type ExperienceManifest,
  type ExperienceSummary,
  type PublicProductDetail,
  type PublicProductSummary,
  type PublicTestimonial,
  type PublicSiteView,
  type ChiPhiSoHuuView,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import type { PublicTenantContext } from './tenant-context.service';

/**
 * Dữ liệu public của landing — SRS Phase 1 mục 11.1.
 *
 * 🔒 Chỉ đọc current immutable publication: mọi truy vấn đi qua
 * `published_revision_id`/`published_version_id`/status PUBLISHED, trong
 * transaction đã đặt `app.tenant_id` — RLS FORCE là chốt chặn tenant.
 */
@Injectable()
export class PublicLandingService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async testimonials(ctx: PublicTenantContext): Promise<PublicTestimonial[]> {
    return this.db.withTenantId(ctx.tenantId, null, async (tx) => (await tx.query<PublicTestimonial>(
      `SELECT id, display_name AS "displayName", content, rating, featured, vehicle_id AS "vehicleId"
         FROM testimonial WHERE status = 'PUBLISHED' ORDER BY featured DESC, sort_order, created_at DESC`,
    )).rows);
  }

  async site(ctx: PublicTenantContext, scheme: string): Promise<PublicSiteView> {
    return this.db.withTenantId(ctx.tenantId, null, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT sp.brand_name, sp.legal_name, sp.default_title_suffix,
                sp.default_description, mp.public_storage_key AS hero_key
           FROM site_profile sp
           LEFT JOIN LATERAL (
             SELECT p.public_storage_key
               FROM media_rendition r
               JOIN media_publication p ON p.rendition_id = r.id AND p.status = 'READY'
              WHERE r.asset_id = sp.hero_media_id
              ORDER BY CASE r.profile WHEN 'POSTER' THEN 0 ELSE 1 END
              LIMIT 1
           ) mp ON true
          WHERE sp.status = 'PUBLISHED'
          LIMIT 1`,
      );
      const p = rows[0];
      if (p === undefined) {
        throw new BusinessError(ErrorCode.SITE_NOT_FOUND, 'Không tìm thấy trang');
      }

      const { rows: branches } = await tx.query<Record<string, unknown>>(
        `SELECT bpp.branch_id AS id, bpp.stable_key, bpp.public_name AS name,
                bpp.public_phone AS phone, bpp.public_address AS address
           FROM branch_public_profile bpp
           JOIN branch b ON b.id = bpp.branch_id AND b.is_active
          WHERE bpp.status = 'PUBLISHED'
          ORDER BY bpp.public_name`,
      );

      return {
        brandName: p.brand_name as string,
        legalName: (p.legal_name ?? null) as string | null,
        defaultTitleSuffix: p.default_title_suffix as string,
        primaryOrigin: `${scheme}://${ctx.primaryHostname}`,
        heroUrl:
          p.hero_key === null || p.hero_key === undefined
            ? null
            : this.publicUrl(p.hero_key as string),
        publicBranches: branches.map((b) => ({
          id: b.id as string,
          stableKey: b.stable_key as string,
          name: b.name as string,
          phone: (b.phone ?? null) as string | null,
          address: (b.address ?? null) as string | null,
        })),
      };
    });
  }

  async listProducts(
    ctx: PublicTenantContext,
    opts: { cursor?: string; limit: number; powertrain?: string },
  ): Promise<{ items: PublicProductSummary[]; nextCursor: string | null }> {
    /*
     * 🔒 Giá VÀ loại động cơ trên thẻ xe phải đến từ CÙNG một phiên bản.
     *
     * ⚠️ Bản trước lấy `MIN(display_price_amount)` và `MIN(powertrain::text)`
     *    trong cùng một khối tổng hợp — hai phép MIN độc lập, trên hai cột khác
     *    nhau, nên chúng chỉ trỏ về cùng một chiếc xe khi may mắn. MIN trên text
     *    xếp theo bảng chữ cái: BEV < HYBRID < ICE.
     *
     *    Một mẫu xe có bản điện 2 tỷ và bản xăng 500 triệu hiện lên thẻ là
     *    "Xe điện · từ 500.000.000 ₫" — một chiếc xe không tồn tại, ở một mức
     *    giá không tồn tại.
     *
     * 💡 "Từ X đồng" là một lời hứa về giá. Nó phải gắn với chiếc xe thật sự bán
     *    ở giá đó, nếu không thì đó là quảng cáo sai — và đây là trang bán xe.
     *
     * `sales.service.ts` chọn biến thể theo ĐÚNG thứ tự này khi ghi snapshot
     * lead, để con số tư vấn đọc lại đúng bằng con số khách đã nhìn thấy.
     */
    const limit = Math.min(Math.max(opts.limit, 1), 50);
    const moc = phanTichCursor(opts.cursor);
    return this.db.withTenantId(ctx.tenantId, null, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT p.id, p.slug, r.name, r.make_name, r.model_name, r.summary,
                p.created_at,
                v.powertrain, v.display_price_amount,
                cover.public_storage_key AS cover_key, cover.alt_text AS cover_alt
           FROM vehicle_product p
           JOIN vehicle_product_revision r ON r.id = p.published_revision_id
           -- Giá VÀ loại động cơ lấy từ CÙNG một hàng (xem chú thích phía trên).
           -- NULLS LAST: bản "liên hệ để biết giá" không cướp chỗ giá có thật.
           JOIN LATERAL (
             SELECT vvr.display_price_amount, vvr.powertrain
               FROM vehicle_variant_revision vvr
              WHERE vvr.product_revision_id = r.id
                AND vvr.inclusion_status = 'ACTIVE'
              ORDER BY vvr.display_price_amount ASC NULLS LAST, vvr.sort_order
              LIMIT 1
           ) v ON true
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key, vpm.alt_text
               FROM vehicle_product_media vpm
               JOIN media_asset a ON a.id = vpm.media_asset_id
               JOIN media_rendition rn ON rn.asset_id = a.id
               JOIN media_publication mp ON mp.rendition_id = rn.id
                  AND mp.status = 'READY'
              WHERE vpm.product_revision_id = r.id AND vpm.is_cover
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) cover ON true
          WHERE p.lifecycle_status = 'ACTIVE'
            AND EXISTS (
                  SELECT 1 FROM vehicle_variant_revision vvr2
                   WHERE vvr2.product_revision_id = r.id
                     AND vvr2.inclusion_status = 'ACTIVE'
                )
            AND ($1::text IS NULL OR EXISTS (
                  SELECT 1 FROM vehicle_variant_revision vvr2
                   WHERE vvr2.product_revision_id = r.id
                     AND vvr2.inclusion_status = 'ACTIVE'
                     AND vvr2.powertrain::text = $1
                ))
            -- Keyset khớp từng chiều với ORDER BY: created_at giảm, id tăng.
            -- Viết gộp (created_at, id) < (...) là SAI — so sánh bộ giá trị của
            -- SQL dùng cùng một chiều cho mọi thành phần.
            AND ($3::timestamptz IS NULL OR (
                  p.created_at < $3::timestamptz
                  OR (p.created_at = $3::timestamptz AND p.id > $4::uuid)
                ))
          ORDER BY p.created_at DESC, p.id
          LIMIT $2 + 1`,
        [opts.powertrain ?? null, limit, moc?.createdAt ?? null, moc?.id ?? null],
      );

      /*
       * 🔒 Con trỏ trỏ vào bản ghi CUỐI CÙNG ĐÃ TRẢ, không phải bản ghi kế tiếp.
       *
       * ⚠️ Bản trước lấy hàng ĐẦU TIÊN BỊ LOẠI làm con trỏ, rồi trang sau lọc
       *    bằng phép so sánh NGẶT. Hai điều đó cộng lại bỏ rơi đúng một xe ở mỗi
       *    ranh giới trang — âm thầm, vì mỗi trang vẫn đủ số lượng đã yêu cầu.
       *
       *    `PT-T01` bắt được ngay lượt chạy đầu: ba xe, `limit=1`, đi hết phân
       *    trang chỉ thấy hai. Chiếc ở giữa không xuất hiện ở BẤT KỲ trang nào.
       *
       * 💡 "Cho tôi thứ đứng SAU cái cuối cùng tôi đã thấy" là câu hỏi mà phép
       *    so sánh ngặt trả lời đúng. Con trỏ vì thế phải là cái cuối cùng ĐÃ
       *    thấy, không phải cái đầu tiên CHƯA thấy.
       */
      const conNua = rows.length > limit;
      const items: PublicProductSummary[] = [];
      let nextCursor: string | null = null;
      for (const row of rows) {
        if (items.length === limit) break;
        if (conNua && items.length === limit - 1) {
          nextCursor = `${(row.created_at as Date).toISOString()}_${row.id as string}`;
        }
        items.push({
          id: row.id as string,
          slug: row.slug as string,
          name: row.name as string,
          makeName: row.make_name as string,
          modelName: row.model_name as string,
          summary: row.summary as string,
          powertrain: row.powertrain as PublicProductSummary['powertrain'],
          displayPrice:
            row.display_price_amount === null
              ? null
              : parseAmountFromDb(row.display_price_amount, 'displayPrice'),
          coverUrl:
            row.cover_key === null || row.cover_key === undefined
              ? null
              : this.publicUrl(row.cover_key as string),
          coverAlt: (row.cover_alt ?? null) as string | null,
        });
      }
      return { items, nextCursor };
    });
  }

  /**
   * Chi tiết xe theo slug — P1-API-003.
   * 410 khi từng publish rồi archive; 404 khi chưa từng publish/không tồn tại.
   */
  async productDetail(ctx: PublicTenantContext, slug: string): Promise<PublicProductDetail> {
    return this.db.withTenantId(ctx.tenantId, null, async (tx) => {
      const { rows: prodRows } = await tx.query<Record<string, unknown>>(
        `SELECT p.id, p.lifecycle_status, p.first_published_at
           FROM vehicle_product p
          WHERE p.slug = $1`,
        [slug],
      );
      const prod = prodRows[0];
      if (prod === undefined) {
        throw new BusinessError(ErrorCode.CONTENT_NOT_PUBLISHED, 'Không tìm thấy xe');
      }
      if ((prod.lifecycle_status as string) === 'ARCHIVED') {
        throw new BusinessError(ErrorCode.CONTENT_GONE, 'Xe đã ngừng giới thiệu');
      }

      const { rows: revRows } = await tx.query<Record<string, unknown>>(
        `SELECT r.id, r.name, r.make_name, r.model_name, r.summary, r.description,
                r.seo_title, r.seo_description, r.revision_number, r.content_hash
           FROM vehicle_product_revision r
          WHERE r.id = (
            SELECT published_revision_id FROM vehicle_product WHERE id = $1
          )`,
        [prod.id as string],
      );
      const rev = revRows[0];
      if (rev === undefined) {
        throw new BusinessError(ErrorCode.CONTENT_NOT_PUBLISHED, 'Xe chưa được giới thiệu');
      }

      const variants = await this.variantsOf(tx, rev.id as string);
      const media = await this.mediaOf(tx, rev.id as string);
      const experiences = await this.experiencesOf(tx, prod.id as string);

      return {
        id: prod.id as string,
        slug,
        name: rev.name as string,
        makeName: rev.make_name as string,
        modelName: rev.model_name as string,
        summary: rev.summary as string,
        description: rev.description as string,
        seoTitle: (rev.seo_title ?? null) as string | null,
        seoDescription: (rev.seo_description ?? null) as string | null,
        revision: Number(rev.revision_number),
        contentHash: rev.content_hash as string,
        variants,
        media,
        experiences,
      };
    });
  }

  /**
   * Chi phí bảo dưỡng N năm cho một mẫu xe.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 🔒 Con số đến từ BẢNG GIÁ ĐANG ÁP DỤNG của chính xưởng này — cùng bảng giá
   *    dùng để xuất hoá đơn cho khách khác. Đó là toàn bộ giá trị của tính năng:
   *    khách cầm bảng này tới xưởng đối chiếu được.
   *
   * ⚠️ Vì thế endpoint KHÔNG được nhận giá từ client, và KHÔNG được dùng một
   *    bảng giá riêng cho quảng cáo. Nếu sau này cần tách, phải tách tường minh
   *    và nói rõ trên giao diện — chứ không lặng lẽ đổi nguồn số.
   *
   * 💡 Xe điện rẻ hơn là KẾT QUẢ, không phải thông điệp được cài sẵn: lọc hạng
   *    mục theo `applicable_powertrains` rồi để phép cộng tự nói. Không có dòng
   *    nào trong hàm này biết "điện" hay "xăng" nghĩa là gì.
   */
  async chiPhiSoHuu(
    ctx: PublicTenantContext,
    slug: string,
    opts: { kmMoiNam: number; soNam: number },
  ): Promise<ChiPhiSoHuuView> {
    /*
     * Chặn trên để một truy vấn công khai không biến thành phép tính vô hạn —
     * đây là endpoint không cần đăng nhập.
     */
    const kmMoiNam = Math.min(Math.max(Math.round(opts.kmMoiNam), 0), 200_000);
    const soNam = Math.min(Math.max(Math.round(opts.soNam), 1), 10);

    return this.db.withTenantId(ctx.tenantId, null, async (tx) => {
      const { rows: prodRows } = await tx.query<{ id: string }>(
        `SELECT p.id FROM vehicle_product p
          WHERE p.slug = $1 AND p.lifecycle_status = 'ACTIVE'
            AND p.published_revision_id IS NOT NULL`,
        [slug],
      );
      const prod = prodRows[0];
      if (prod === undefined) {
        throw new BusinessError(ErrorCode.CONTENT_NOT_PUBLISHED, 'Không tìm thấy xe');
      }

      /*
       * Loại động cơ lấy từ CÁC BIẾN THỂ ĐANG PUBLISH, không từ một cột trên
       * sản phẩm — một mẫu xe có thể vừa có bản xăng vừa có bản điện, và chi phí
       * của hai bản đó khác hẳn nhau.
       *
       * MVP lấy loại của biến thể RẺ NHẤT: đó cũng là biến thể mà giá "từ…" trên
       * thẻ xe đang nói tới, nên hai con số kể cùng một câu chuyện.
       */
      const { rows: ptRows } = await tx.query<{ powertrain: string }>(
        `SELECT vvr.powertrain
           FROM vehicle_variant_revision vvr
           JOIN vehicle_product p ON p.published_revision_id = vvr.product_revision_id
          WHERE p.id = $1 AND vvr.inclusion_status = 'ACTIVE'
          ORDER BY vvr.display_price_amount ASC NULLS LAST, vvr.sort_order
          LIMIT 1`,
        [prod.id],
      );
      const powertrain = ptRows[0]?.powertrain ?? 'ICE';

      const { rows: giaRows } = await tx.query<{
        id: string; name: string; labor_rate_per_hour: string; effective_from: Date;
      }>(
        `SELECT id, name, labor_rate_per_hour, effective_from
           FROM price_list
          WHERE effective_from <= now()
            AND (effective_to IS NULL OR effective_to > now())
          ORDER BY effective_from DESC
          LIMIT 1`,
      );
      const bangGia = giaRows[0];
      if (bangGia === undefined) {
        throw new BusinessError(
          ErrorCode.NOT_FOUND,
          'Chưa có bảng giá dịch vụ đang hiệu lực',
        );
      }

      /*
       * Một truy vấn lấy hạng mục + chu kỳ + vật tư. Gộp vật tư bằng
       * `json_agg` thay vì N+1: đây là endpoint công khai, và số lần gọi database
       * cho mỗi lượt xem trang là thứ nhìn thấy được trên hoá đơn hạ tầng.
       */
      const { rows: hmRows } = await tx.query<{
        ma: string; ten: string; gio: string;
        chu_ky_km: number | null; chu_ky_thang: number | null;
        vat_tu: { ten: string; gia: string; sl: string }[] | null;
      }>(
        `SELECT si.code AS ma, si.name AS ten, si.standard_hours AS gio,
                mpi.interval_km AS chu_ky_km, mpi.interval_months AS chu_ky_thang,
                (SELECT json_agg(json_build_object(
                          'ten', pt.name,
                          'gia', pli.sell_price::text,
                          'sl',  mpp.quantity::text))
                   FROM maintenance_plan_part mpp
                   JOIN part pt ON pt.id = mpp.part_id
                   LEFT JOIN price_list_item pli
                     ON pli.part_id = pt.id AND pli.price_list_id = $2
                  WHERE mpp.plan_item_id = mpi.id) AS vat_tu
           FROM maintenance_plan_item mpi
           JOIN service_item si ON si.id = mpi.service_item_id
          WHERE si.is_active
            AND $1::powertrain = ANY(si.applicable_powertrains)
          ORDER BY si.code`,
        [powertrain, bangGia.id],
      );

      const dungHangMuc = (rows: typeof hmRows): HangMucBaoDuong[] => rows.map((r) => ({
        ma: r.ma,
        ten: r.ten,
        gioDinhMuc: Number(r.gio),
        chuKyKm: r.chu_ky_km,
        chuKyThang: r.chu_ky_thang,
        vatTu: (r.vat_tu ?? [])
          // Vật tư chưa có trong bảng giá thì BỎ QUA, không tính 0 đồng: một
          // con số thiếu thà thiếu rõ ràng còn hơn sai mà trông đầy đủ.
          .filter((v) => v.gia !== null && v.gia !== undefined)
          .map((v) => ({ ten: v.ten, giaBan: BigInt(v.gia), soLuong: Number(v.sl) })),
      }));

      const tinh = (rows: typeof hmRows) =>
        tinhChiPhiSoHuu({
          hangMuc: dungHangMuc(rows),
          giaCongMoiGio: BigInt(bangGia.labor_rate_per_hour),
          kmMoiNam,
          soNam,
        });

      const kq = tinh(hmRows);

      /*
       * 🔒 Mốc so sánh với xe xăng — tính bằng CHÍNH bảng giá và CHÍNH lịch bảo
       *    dưỡng đó, chỉ đổi bộ lọc loại động cơ.
       *
       * 💡 Đây là điều làm cho câu "xe điện rẻ hơn" trở thành một PHÉP ĐO thay
       *    vì một khẩu hiệu. Không có hằng số nào, không có tỉ lệ phần trăm nào
       *    được gõ tay: cùng một xưởng, cùng một bảng giá, cùng một quãng đường
       *    — khác nhau duy nhất ở chỗ xe xăng phải thay dầu, bugi và curoa cam.
       *
       * ⚠️ Chỉ trả về khi xe KHÔNG phải xe xăng. So sánh xe xăng với xe xăng là
       *    một dòng vô nghĩa, và một con số vô nghĩa trên trang bán hàng sẽ bị
       *    đọc thành một con số có nghĩa.
       */
      let soSanhXeXang: number | null = null;
      if (powertrain !== 'ICE') {
        const { rows: iceRows } = await tx.query<(typeof hmRows)[number]>(
          `SELECT si.code AS ma, si.name AS ten, si.standard_hours AS gio,
                  mpi.interval_km AS chu_ky_km, mpi.interval_months AS chu_ky_thang,
                  (SELECT json_agg(json_build_object(
                            'ten', pt.name,
                            'gia', pli.sell_price::text,
                            'sl',  mpp.quantity::text))
                     FROM maintenance_plan_part mpp
                     JOIN part pt ON pt.id = mpp.part_id
                     LEFT JOIN price_list_item pli
                       ON pli.part_id = pt.id AND pli.price_list_id = $1
                    WHERE mpp.plan_item_id = mpi.id) AS vat_tu
             FROM maintenance_plan_item mpi
             JOIN service_item si ON si.id = mpi.service_item_id
            WHERE si.is_active AND 'ICE'::powertrain = ANY(si.applicable_powertrains)
            ORDER BY si.code`,
          [bangGia.id],
        );
        soSanhXeXang = Number(tinh(iceRows).tong);
      }

      return {
        kmMoiNam,
        soNam,
        theoNam: kq.theoNam.map((n) => ({
          nam: n.nam,
          tienCong: Number(n.tienCong),
          tienVatTu: Number(n.tienVatTu),
          tong: Number(n.tong),
          hangMuc: n.hangMuc,
        })),
        tong: Number(kq.tong),
        soSanhXeXang,
        soNamKhongTon: kq.soNamKhongTon,
        giaCongMoiGio: Number(bangGia.labor_rate_per_hour),
        tenBangGia: bangGia.name,
        ápDụngTừ: bangGia.effective_from.toISOString(),
      };
    });
  }

  /** Manifest deferred — P1-API-005; chỉ trả published asset/config đúng tenant. */
  async experienceManifest(
    ctx: PublicTenantContext,
    slug: string,
    stableKey: string,
  ): Promise<ExperienceManifest> {
    return this.db.withTenantId(ctx.tenantId, null, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT v.id, v.schema_version, v.label, v.revision_number, v.content_hash,
                v.config, v.poster_media_id
           FROM vehicle_experience e
           JOIN vehicle_experience_version v ON v.id = e.published_version_id
           JOIN vehicle_product p ON p.id = e.product_id
          WHERE p.slug = $1
            AND p.lifecycle_status = 'ACTIVE'
            AND e.stable_key = $2
            AND e.lifecycle_status = 'ACTIVE'`,
        [slug, stableKey],
      );
      const exp = rows[0];
      if (exp === undefined) {
        throw new BusinessError(ErrorCode.EXPERIENCE_NOT_FOUND, 'Không tìm thấy trải nghiệm xe');
      }

      const posterUrl = await this.assetUrl(tx, exp.poster_media_id as string | null);

      const { rows: bindings } = await tx.query<Record<string, unknown>>(
        `SELECT vm.binding_key, vm.role, vm.scene_key, vm.logical_yaw, vm.quality_tier,
                vm.accessible_label, vm.description, vm.language, vm.sort_order,
                rn.profile, rn.mime, rn.byte_size, mp.public_storage_key
           FROM vehicle_experience_version_media vm
           LEFT JOIN LATERAL (
             SELECT mr.profile, mr.mime, mr.byte_size, mr.id
               FROM media_rendition mr
              WHERE mr.asset_id = vm.media_asset_id
                AND (vm.quality_tier IS NULL OR mr.quality_tier = vm.quality_tier)
              ORDER BY (mr.quality_tier IS NULL), mr.byte_size
              LIMIT 1
           ) rn ON true
           LEFT JOIN media_publication mp
             ON mp.rendition_id = rn.id AND mp.status = 'READY'
          WHERE vm.experience_version_id = $1
          ORDER BY vm.sort_order`,
        [exp.id as string],
      );

      return {
        schemaVersion: Number(exp.schema_version),
        stableKey,
        kind: stableKeyKind(exp.config as Record<string, unknown>),
        label: exp.label as string,
        revision: Number(exp.revision_number),
        contentHash: exp.content_hash as string,
        posterUrl,
        config: {
          ...(exp.config as Record<string, unknown>),
          bindings: bindings.map((b) => ({
            bindingKey: b.binding_key,
            role: b.role,
            sceneKey: b.scene_key ?? null,
            logicalYaw: b.logical_yaw === null ? null : Number(b.logical_yaw),
            qualityTier: b.quality_tier ?? null,
            accessibleLabel: b.accessible_label ?? null,
            description: b.description ?? null,
            language: b.language,
            url:
              b.public_storage_key === null || b.public_storage_key === undefined
                ? null
                : this.publicUrl(b.public_storage_key as string),
            mime: b.mime ?? null,
            byteSize: b.byte_size === null ? null : Number(b.byte_size),
          })),
        },
      };
    });
  }

  private async variantsOf(
    tx: PoolClient,
    revisionId: string,
  ): Promise<PublicProductDetail['variants']> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT vvr.id, vv.stable_key, vvr.name, vvr.sku, vvr.powertrain, vvr.model_year,
              vvr.display_price_amount, vvr.specifications, vvr.is_featured, vvr.sort_order
         FROM vehicle_variant_revision vvr
         JOIN vehicle_variant vv ON vv.id = vvr.variant_id
        WHERE vvr.product_revision_id = $1 AND vvr.inclusion_status = 'ACTIVE'
        ORDER BY vvr.sort_order, vvr.name`,
      [revisionId],
    );
    return rows.map((v) => ({
      id: v.id as string,
      stableKey: v.stable_key as string,
      name: v.name as string,
      sku: (v.sku ?? null) as string | null,
      powertrain: v.powertrain as PublicProductDetail['variants'][number]['powertrain'],
      modelYear: Number(v.model_year),
      displayPrice:
        v.display_price_amount === null
          ? null
          : parseAmountFromDb(v.display_price_amount, 'displayPrice'),
      specifications: (v.specifications ?? {}) as Record<string, unknown>,
      isFeatured: v.is_featured as boolean,
      sortOrder: Number(v.sort_order),
    }));
  }

  private async mediaOf(
    tx: PoolClient,
    revisionId: string,
  ): Promise<PublicProductDetail['media']> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT vpm.id, vpm.role, vpm.alt_text, vpm.sort_order, vpm.is_cover,
              mp.public_storage_key
         FROM vehicle_product_media vpm
         JOIN media_asset a ON a.id = vpm.media_asset_id
         LEFT JOIN LATERAL (
           SELECT mr.id
             FROM media_rendition mr
            WHERE mr.asset_id = a.id
            ORDER BY CASE mr.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
            LIMIT 1
         ) rn ON true
         LEFT JOIN media_publication mp
           ON mp.rendition_id = rn.id AND mp.status = 'READY'
        WHERE vpm.product_revision_id = $1
        ORDER BY vpm.sort_order`,
      [revisionId],
    );
    return rows.map((m) => ({
      id: m.id as string,
      role: m.role as PublicProductDetail['media'][number]['role'],
      url:
        m.public_storage_key === null || m.public_storage_key === undefined
          ? ''
          : this.publicUrl(m.public_storage_key as string),
      alt: m.alt_text as string,
      sortOrder: Number(m.sort_order),
      isCover: m.is_cover as boolean,
    }));
  }

  private async experiencesOf(
    tx: PoolClient,
    productId: string,
  ): Promise<ExperienceSummary[]> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT e.stable_key, e.kind, v.label, v.revision_number, v.content_hash,
              v.poster_media_id, v.id AS version_id
         FROM vehicle_experience e
         JOIN vehicle_experience_version v ON v.id = e.published_version_id
        WHERE e.product_id = $1 AND e.lifecycle_status = 'ACTIVE'
        ORDER BY e.stable_key`,
      [productId],
    );
    const result: ExperienceSummary[] = [];
    for (const e of rows) {
      const posterUrl = await this.assetUrl(tx, (e.poster_media_id ?? null) as string | null);
      const { rows: sizeRows } = await tx.query<{ total: string }>(
        `SELECT COALESCE(SUM(mr.byte_size), 0)::text AS total
           FROM vehicle_experience_version_media vm
           JOIN media_rendition mr ON mr.asset_id = vm.media_asset_id
          WHERE vm.experience_version_id = $1`,
        [e.version_id as string],
      );
      result.push({
        stableKey: e.stable_key as string,
        kind: e.kind as ExperienceSummary['kind'],
        label: e.label as string,
        posterUrl,
        revision: Number(e.revision_number),
        contentHash: e.content_hash as string,
        estimatedBytes: Number(sizeRows[0]?.total ?? 0),
      });
    }
    return result;
  }

  private async assetUrl(tx: PoolClient, assetId: string | null): Promise<string | null> {
    if (assetId === null) return null;
    const { rows } = await tx.query<{ key: string }>(
      `SELECT mp.public_storage_key AS key
         FROM media_rendition mr
         JOIN media_publication mp ON mp.rendition_id = mr.id AND mp.status = 'READY'
        WHERE mr.asset_id = $1
        ORDER BY CASE mr.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
        LIMIT 1`,
      [assetId],
    );
    const row = rows[0];
    return row === undefined ? null : this.publicUrl(row.key);
  }

  private publicUrl(storageKey: string): string {
    const origin = (process.env['PUBLIC_MEDIA_ORIGIN'] ?? 'http://localhost:3001/media')
      .replace(/\/+$/, '');
    return `${origin}/${storageKey}`;
  }
}

/**
 * Tách `nextCursor` thành mốc keyset, hoặc `null` nếu không dùng được.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Trước bản sửa, `opts.cursor` được nhận ở controller, truyền xuống service,
 *    rồi KHÔNG BAO GIỜ đi vào câu SQL — truy vấn chỉ có hai tham số
 *    (`powertrain`, `limit`). Mọi trang đều là trang một.
 *
 *    Hai hệ quả, cả hai đều im lặng:
 *
 *      · Khách bấm "Xem thêm" và nhận lại đúng những chiếc xe vừa xem.
 *      · `apps/landing/src/app/sitemap.ts` đi theo `nextCursor` trong vòng lặp.
 *        Vòng lặp đó chỉ dừng nhờ trần `TRAN_URL` — trước khi có trần, nó lặp
 *        vô hạn trên cùng 50 chiếc xe.
 *
 * 💡 Một tham số được nhận nhưng không dùng thì tệ hơn một tham số không tồn
 *    tại: API trả về `nextCursor`, tức là NÓI RẰNG phân trang hoạt động.
 *
 * Cursor sai định dạng thì coi như không có — dữ liệu này đến từ URL công khai,
 * và một chuỗi hỏng không đáng để đổ lỗi 500 vào mặt khách.
 */
function phanTichCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (cursor === undefined || cursor === '') return null;
  const cat = cursor.lastIndexOf('_');
  if (cat <= 0) return null;
  const createdAt = new Date(cursor.slice(0, cat));
  const id = cursor.slice(cat + 1);
  if (Number.isNaN(createdAt.getTime())) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { createdAt, id };
}

/** kind đi kèm version — lấy từ config (schema versioned) để tránh enum drift */
function stableKeyKind(config: Record<string, unknown>): ExperienceManifest['kind'] {
  const kind = config['kind'];
  return kind === 'EXTERIOR_SPIN' || kind === 'INTERIOR_PANORAMA'
    ? kind
    : 'EXTERIOR_SPIN';
}
