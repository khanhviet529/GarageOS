import { Inject, Injectable } from '@nestjs/common';
import { TenantAwareDb } from '@garageos/db';
import {
  type ActorContext,
  type OnTimeReport,
  type ProfitReport,
  type ReportRange,
  type StockReportLine,
  type TechnicianProductivity,
  type VarianceByReason,
  type WaitTimeReport,
} from '@garageos/contracts';
import { appendBranchScope, appendSelfScope, assertCan } from '../common/permissions';

/**
 * Báo cáo — `docs/09-reports.md`.
 *
 * 🔒 Service này KHÔNG có một câu INSERT/UPDATE/DELETE nào, và không thể có:
 *    mọi nguồn dữ liệu của nó là VIEW hoặc HÀM chỉ-đọc, được cấp đúng quyền
 *    SELECT ở migration 0040. Nguyên tắc "báo cáo không bao giờ sửa dữ liệu"
 *    được bảo đảm bằng quyền, không bằng lời hứa.
 *
 * 🔒 Công thức nằm ở database, không ở đây. Service chỉ chọn phạm vi, đổi tên
 *    cột sang camelCase và tính vài tỉ số. Lý do: cùng một công thức sẽ được
 *    màn hình, bản xuất Excel và (Phase 8) công cụ cho AI agent cùng hỏi — ba
 *    bản cài đặt thì sớm muộn có một bản lệch.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * R-F-02 — Lãi/lỗ theo đơn.
   *
   * 🔒 Quyền `quotation:read`: báo cáo này toàn là tiền và giá vốn. Thợ không
   *    đọc được, thu ngân đọc được (họ vốn đã thấy số tiền phải thu).
   */
  async profit(actor: ActorContext, range: ReportRange): Promise<ProfitReport> {
    assertCan(actor, 'quotation:read');
    const { from, to } = this.khoangThoiGian(range);

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [from, to];
      const scope = appendBranchScope(actor, params, 'p');

      const { rows } = await tx.query<{
        repair_order_id: string;
        code: string;
        plate_number: string;
        powertrain: string;
        status: string;
        delivered_at: Date | null;
        doanh_thu_du_kien: string;
        doanh_thu_thuc: string;
        da_phat_hanh_hoa_don: boolean;
        gia_von_phu_tung: string;
        chi_phi_cong: string;
        chi_phi_rework: string;
        chi_phi_bao_hanh: string;
        la_don_bao_hanh: boolean;
      }>(
        `SELECT p.repair_order_id, p.code, p.plate_number, p.powertrain::text AS powertrain,
                p.status::text AS status, p.delivered_at, p.doanh_thu_du_kien,
                p.doanh_thu_thuc, p.da_phat_hanh_hoa_don,
                p.gia_von_phu_tung, p.chi_phi_cong, p.chi_phi_rework, p.chi_phi_bao_hanh,
                p.la_don_bao_hanh
           FROM lai_lo_theo_don p
          WHERE p.received_at >= $1 AND p.received_at < $2
            -- ⚠️ Loại trừ tường minh, và danh sách loại trừ được TRẢ VỀ cùng
            --    kết quả để người đọc biết mình đang nhìn cái gì.
            AND NOT p.la_xe_bo_quen
            AND NOT p.la_khach_noi_bo
            ${scope}
          ORDER BY p.received_at DESC`,
        params,
      );

      const orders = rows.map((r) => {
        /*
         * 🔒 Đơn ĐÃ có hoá đơn phát hành -> doanh thu THẬT.
         *    Đơn chưa có -> vẫn là dự kiến, từ dòng báo giá đã duyệt.
         *
         * Đây là chỗ ADR-0008 hẹn nối lại khi Phase 3 xong. Không gộp hai
         * nguồn thành một cột duy nhất: một bảng trộn lẫn "khách đã đồng ý
         * trả" với "đã phát hành hoá đơn" là một bảng không đối chiếu được
         * với sổ thuế.
         */
        const doanhThu = r.da_phat_hanh_hoa_don
          ? Math.round(Number(r.doanh_thu_thuc))
          : Math.round(Number(r.doanh_thu_du_kien));
        const chiPhi =
          Math.round(Number(r.gia_von_phu_tung)) +
          Math.round(Number(r.chi_phi_cong)) +
          Math.round(Number(r.chi_phi_rework)) +
          Math.round(Number(r.chi_phi_bao_hanh));
        const lai = doanhThu - chiPhi;
        return {
          repairOrderId: r.repair_order_id,
          code: r.code,
          plateNumber: r.plate_number,
          powertrain: r.powertrain,
          status: r.status,
          deliveredAt: r.delivered_at === null ? null : r.delivered_at.toISOString(),
          doanhThuDuKien: doanhThu,
          giaVonPhuTung: Math.round(Number(r.gia_von_phu_tung)),
          chiPhiCong: Math.round(Number(r.chi_phi_cong)),
          chiPhiRework: Math.round(Number(r.chi_phi_rework)),
          chiPhiBaoHanh: Math.round(Number(r.chi_phi_bao_hanh)),
          lai,
          // 🔒 Đơn bảo hành có doanh thu 0đ — chia ra thì Infinity. null nói
          //    đúng điều đang biết: biên lợi nhuận KHÔNG ÁP DỤNG, không phải 0.
          bienLoi: doanhThu === 0 ? null : Math.round((lai / doanhThu) * 1000) / 1000,
          laDonBaoHanh: r.la_don_bao_hanh,
        };
      });

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        orders,
        tongDoanhThu: orders.reduce((t, o) => t + o.doanhThuDuKien, 0),
        tongChiPhi: orders.reduce(
          (t, o) => t + o.giaVonPhuTung + o.chiPhiCong + o.chiPhiRework + o.chiPhiBaoHanh,
          0,
        ),
        tongLai: orders.reduce((t, o) => t + o.lai, 0),
        daLoaiTru: [
          'Đơn đã huỷ',
          'Xe bỏ quên (abandonment_status ≠ NONE) — BC-15',
          'Khách nội bộ',
        ],
      };
    });
  }

  /**
   * R-O-01 — Thời gian chờ theo bộ phận.
   *
   * Quyền `assignment:read` chứ không `quotation:read`: báo cáo này không có
   * đồng nào, và nó là thứ quản lý xưởng cần nhìn hằng ngày.
   */
  async waitTime(actor: ActorContext, range: ReportRange): Promise<WaitTimeReport> {
    assertCan(actor, 'assignment:read');
    const { from, to } = this.khoangThoiGian(range);

    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{
        trang_thai: string;
        bo_phan: string;
        so_luot: string;
        trung_vi_gio: string;
        p90_gio: string;
        tong_gio: string;
      }>(`SELECT * FROM thoi_gian_cho_theo_bo_phan($1, $2, $3)`, [actor.tenantId, from, to]);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        stages: rows.map((r) => ({
          trangThai: r.trang_thai,
          boPhan: r.bo_phan,
          soLuot: Number(r.so_luot),
          trungViGio: Number(r.trung_vi_gio),
          p90Gio: Number(r.p90_gio),
          tongGio: Number(r.tong_gio),
        })),
        daLoaiTru: [
          'Xe bỏ quên — một xe nằm sáu tháng làm hỏng con số của cả xưởng',
          'Lần chuyển trạng thái cuối cùng (chưa có lần kế tiếp để đo)',
        ],
      };
    });
  }

  /**
   * R-O-03 — Năng suất thợ, kèm tỉ lệ làm lại.
   *
   * 🔒 Thợ CHỈ xem được của chính mình — `docs/09-reports.md` mục 5 ghi rõ
   *    "⚠️ không xem của người khác". Dùng lại `appendSelfScope` đã viết ở 4.5;
   *    quản lý và chủ vẫn thấy cả xưởng.
   */
  async productivity(actor: ActorContext): Promise<TechnicianProductivity[]> {
    assertCan(actor, 'assignment:read');

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendSelfScope(actor, params, 'n.technician_id');

      const { rows } = await tx.query<{
        technician_id: string;
        technician_name: string;
        so_viec_xong: string;
        gio_dinh_muc: string | null;
        gio_thuc_te: string | null;
        nang_suat: string | null;
        so_lan_qc_truot: string;
        so_viec_lam_lai: string;
        ti_le_rework: string | null;
        chi_phi_lam_lai: string;
      }>(
        `SELECT * FROM nang_suat_tho n WHERE true ${scope} ORDER BY n.technician_name`,
        params,
      );

      const xemTien = this.xemDuocTien(actor);

      return rows.map((r) => ({
        technicianId: r.technician_id,
        technicianName: r.technician_name,
        soViecXong: Number(r.so_viec_xong),
        gioDinhMuc: r.gio_dinh_muc === null ? null : Number(r.gio_dinh_muc),
        gioThucTe: r.gio_thuc_te === null ? null : Number(r.gio_thuc_te),
        nangSuat: r.nang_suat === null ? null : Number(r.nang_suat),
        soLanQcTruot: Number(r.so_lan_qc_truot),
        soViecLamLai: Number(r.so_viec_lam_lai),
        tiLeRework: r.ti_le_rework === null ? null : Number(r.ti_le_rework),
        // 🔒 Chi phí làm lại là TIỀN — thợ thấy số việc phải làm lại của mình,
        //    không thấy nó tốn của garage bao nhiêu.
        chiPhiLamLai: xemTien ? Number(r.chi_phi_lam_lai) : 0,
      }));
    });
  }

  /** R-S-01 / R-S-02 — tồn kho, cảnh báo dưới mức tối thiểu, vòng quay */
  async stock(actor: ActorContext): Promise<StockReportLine[]> {
    assertCan(actor, 'stock:read');

    return this.db.withTenant(actor, async (tx) => {
      /*
       * 🔒 Kho thuộc chi nhánh. Không lọc thì thủ kho Hà Nội thấy tồn và giá
       * vốn của kho Sài Gòn — đo được ở vòng review: báo cáo liệt kê cả hai kho.
       */
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'w');
      const { rows } = await tx.query<{
        warehouse_id: string;
        warehouse_name: string;
        part_id: string;
        sku: string;
        part_name: string;
        category: string | null;
        on_hand: string;
        reserved: string;
        available: string;
        min_stock_level: string;
        gia_tri_ton: string;
        duoi_muc_toi_thieu: boolean;
        gia_von_xuat_365n: string;
      }>(
        `SELECT t.* FROM ton_kho_canh_bao t
           JOIN warehouse w ON w.id = t.warehouse_id
          WHERE true ${scope}
          ORDER BY t.duoi_muc_toi_thieu DESC, t.gia_tri_ton DESC`,
        params,
      );

      const xemGiaVon = this.xemDuocGiaVon(actor);

      return rows.map((r) => {
        const giaTriTon = Number(r.gia_tri_ton);
        const xuat = Number(r.gia_von_xuat_365n);
        /*
         * Vòng quay = giá vốn xuất trong kỳ / giá trị tồn.
         *
         * Tồn 0 thì KHÔNG có vòng quay — null, không phải vô cực và cũng không
         * phải 0. Một mã hàng bán hết sạch không phải "quay chậm".
         */
        const vongQuay = giaTriTon === 0 ? null : Math.round((xuat / giaTriTon) * 1000) / 1000;
        const soNgayTon =
          vongQuay === null || vongQuay === 0 ? null : Math.round(365 / vongQuay);

        return {
          warehouseId: r.warehouse_id,
          warehouseName: r.warehouse_name,
          partId: r.part_id,
          sku: r.sku,
          partName: r.part_name,
          category: r.category,
          onHand: Number(r.on_hand),
          reserved: Number(r.reserved),
          available: Number(r.available),
          minStockLevel: Number(r.min_stock_level),
          giaTriTon: xemGiaVon ? giaTriTon : 0,
          duoiMucToiThieu: r.duoi_muc_toi_thieu,
          vongQuay: xemGiaVon ? vongQuay : null,
          soNgayTon: xemGiaVon ? soNgayTon : null,
          /*
           * 💡 Vốn chết: còn tồn nhưng 365 ngày không xuất đồng nào. Đây là con
           * số để garage quyết định thanh lý, không chỉ để biết.
           *
           * Tính bằng `xuat === 0` chứ không bằng `soNgayTon > 365`: khi vòng
           * quay bằng 0 thì `soNgayTon` là null và phép so sánh im lặng trả
           * false — đúng những mã hàng tệ nhất lại lọt lưới.
           */
          laVonChet: giaTriTon > 0 && xuat === 0,
        };
      });
    });
  }

  /** R-S-03 — chênh lệch kiểm kê theo lý do */
  async stockVariance(actor: ActorContext): Promise<VarianceByReason[]> {
    assertCan(actor, 'stock:readCost');

    return this.db.withTenant(actor, async (tx) => {
      const paramsCl: unknown[] = [];
      const scopeCl = appendBranchScope(actor, paramsCl, 'w');
      const { rows } = await tx.query<{
        reason: string;
        so_dong: string;
        gia_tri_tuyet_doi: string;
        gia_tri_rong: string;
      }>(
        `SELECT c.reason::text AS reason, sum(c.so_dong) AS so_dong,
                sum(c.gia_tri_tuyet_doi) AS gia_tri_tuyet_doi,
                sum(c.gia_tri_rong) AS gia_tri_rong
           FROM chenh_lech_kiem_ke c
           JOIN warehouse w ON w.id = c.warehouse_id
          WHERE true ${scopeCl}
          GROUP BY c.reason
          ORDER BY sum(c.gia_tri_tuyet_doi) DESC`,
        paramsCl,
      );
      return rows.map((r) => ({
        reason: r.reason,
        soDong: Number(r.so_dong),
        giaTriTuyetDoi: Number(r.gia_tri_tuyet_doi),
        giaTriRong: Number(r.gia_tri_rong),
      }));
    });
  }

  /** R-O-02 — tỉ lệ đúng hẹn, LUÔN kèm số lần dời hẹn */
  async onTime(actor: ActorContext, range: ReportRange): Promise<OnTimeReport> {
    assertCan(actor, 'assignment:read');
    const { from, to } = this.khoangThoiGian(range);

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [from, to];
      const scope = appendBranchScope(actor, params, 'd');

      const { rows } = await tx.query<{
        tong: string;
        dung_hen: string;
        tong_doi_hen: string;
        co_doi_hen: string;
      }>(
        `SELECT count(*) AS tong,
                count(*) FILTER (WHERE d.dung_hen) AS dung_hen,
                COALESCE(sum(d.so_lan_doi_hen), 0) AS tong_doi_hen,
                count(*) FILTER (WHERE d.so_lan_doi_hen > 0) AS co_doi_hen
           FROM dung_hen_theo_don d
          WHERE d.delivered_at >= $1 AND d.delivered_at < $2 ${scope}`,
        params,
      );
      const r = rows[0]!;
      const tong = Number(r.tong);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        soDonBanGiao: tong,
        soDonDungHen: Number(r.dung_hen),
        tiLeDungHen: tong === 0 ? null : Math.round((Number(r.dung_hen) / tong) * 1000) / 1000,
        // 💡 Trả kèm, luôn: 95% đúng hẹn mà mỗi đơn dời hẹn ba lần thì con số
        //    kia vô giá trị, và người đọc phải thấy cả hai cùng lúc.
        tongSoLanDoiHen: Number(r.tong_doi_hen),
        soDonCoDoiHen: Number(r.co_doi_hen),
        daLoaiTru: ['Đơn không có ngày hẹn', 'Xe bỏ quên'],
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mặc định 30 ngày gần nhất.
   *
   * 🔒 Mọi báo cáo đều TRẢ VỀ khoảng thời gian nó đã dùng, kể cả khi người gọi
   *    không truyền gì. Nguyên tắc 3 của tài liệu: mỗi báo cáo ghi rõ mốc thời
   *    gian — một bảng số không kèm kỳ là một bảng số không so sánh được với
   *    bất cứ thứ gì.
   */
  private khoangThoiGian(range: ReportRange): { from: Date; to: Date } {
    const to = range.to === undefined ? new Date() : new Date(range.to);
    const from =
      range.from === undefined
        ? new Date(to.getTime() - 30 * 24 * 3600 * 1000)
        : new Date(range.from);
    return { from, to };
  }

  private xemDuocTien(actor: ActorContext): boolean {
    return actor.roles.some((r) =>
      ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'].includes(r),
    );
  }

  private xemDuocGiaVon(actor: ActorContext): boolean {
    return actor.roles.some((r) => ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'].includes(r));
  }
}
