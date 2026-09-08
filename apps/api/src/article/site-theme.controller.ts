import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  ErrorCode,
  SiteThemeInput,
  type ActorContext,
  type SiteThemeView,
} from '@garageos/contracts';
import { TenantAwareDb } from '@garageos/db';
import { BANG_MAU_MAC_DINH, loiBangMau } from '@garageos/domain';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';

/** Bo góc mặc định — trùng `--r-sm` đang có trong bảng token của landing. */
const BO_GOC_MAC_DINH = 4;

interface Dong {
  nenChinh: string;
  nenNoi: string;
  thuongHieu: string;
  nutChinh: string;
  boGoc: number;
  version: number;
}

/**
 * Bảng màu của trang công khai.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 CỔNG AA Ở ĐÂY, KHÔNG PHẢI Ở NÚT LƯU.
 *
 * Màn *Giao diện* khoá nút Lưu khi còn cặp màu trượt AA, và chú thích trong đó
 * viết "kiểm tra mà không chặn thì chỉ là trang trí". Đúng — nhưng một nút bị
 * khoá cũng chỉ là trang trí, theo nguyên tắc 1 của dự án: **UI không bao giờ
 * tính là enforce**. `curl` không thấy nút nào cả.
 *
 * Nên cùng một hàm `loiBangMau()` chạy lại ở đây, và bài kiểm tương ứng gọi
 * thẳng API với một bảng màu trượt chuẩn để chứng minh nó bị từ chối.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Controller('api/v1/marketing')
@UseGuards(JwtGuard)
export class SiteThemeController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Bảng màu đang áp dụng.
   *
   * ⚠️ Tenant chưa lưu lần nào thì trả MẶC ĐỊNH kèm `daLuu: false`, không trả
   *    404. Màn Giao diện cần bốn ô nhập có sẵn giá trị để so sánh khi người
   *    dùng đổi màu; bắt nó tự đoán mặc định là chép bảng màu sang chỗ thứ hai.
   */
  @Get('site-theme')
  async get(@Actor() actor: ActorContext): Promise<SiteThemeView> {
    assertCan(actor, 'marketing:experienceRead');
    return this.db.withTenant(actor, async (tx) => {
      const dong = await this.doc(tx);
      return dong === null
        ? { ...BANG_MAU_MAC_DINH, boGoc: BO_GOC_MAC_DINH, version: 0, daLuu: false }
        : { ...dong, daLuu: true };
    });
  }

  @Put('site-theme')
  async put(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(SiteThemeInput)) input: SiteThemeInput,
  ): Promise<SiteThemeView> {
    assertCan(actor, 'marketing:experienceWrite');

    const { version, boGoc, ...mau } = input;
    const loi = loiBangMau(mau, boGoc);
    if (loi.length > 0) {
      /*
       * 🔒 Trả về ĐỦ danh sách lỗi, không dừng ở lỗi đầu.
       *
       * Người sửa một bảng màu bốn ô sẽ đổi cả bốn; báo từng lỗi một biến việc
       * đó thành bốn lượt gửi và bốn lần đọc lại. Và người gọi qua API không có
       * màn hình nào để tự đo — thông điệp này là tất cả những gì họ có.
       */
      throw new BusinessError(
        ErrorCode.THEME_NOT_APPLICABLE,
        `Bảng màu không dùng được: ${loi.map((l) => l.thongDiep).join(' ')}`,
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const hienTai = await this.doc(tx);

      if (hienTai === null) {
        /*
         * `version: 0` là hợp đồng cho lần lưu đầu — xem `SiteThemeInput`. Gửi
         * số khác nghĩa là client đang cầm một dòng mà tenant này không có.
         */
        if (version !== 0) {
          throw new BusinessError(ErrorCode.STALE_VERSION, 'Tenant chưa có bảng màu nào để sửa');
        }
        /*
         * `ON CONFLICT DO NOTHING` cho ca hai người cùng lưu LẦN ĐẦU.
         *
         * Cả hai đọc thấy "chưa có bảng màu nào" rồi cùng `INSERT`; người thứ
         * hai đụng `UNIQUE (tenant_id)`. Không bắt ở đây thì đó là một lỗi
         * 23505 lọt ra thành 500 — người dùng nhận "lỗi hệ thống" cho một tình
         * huống hoàn toàn bình thường, và bảng màu họ vừa gõ thì mất.
         */
        const them = await tx.query(
          `INSERT INTO site_theme
             (tenant_id, nen_chinh, nen_noi, thuong_hieu, nut_chinh, bo_goc, created_by, updated_by)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (tenant_id) DO NOTHING`,
          [mau.nenChinh, mau.nenNoi, mau.thuongHieu, mau.nutChinh, boGoc, actor.userId],
        );
        if (them.rowCount === 0) {
          throw new BusinessError(
            ErrorCode.STALE_VERSION,
            'Bảng màu vừa được người khác lưu. Tải lại để xem bản mới nhất.',
          );
        }
      } else {
        const r = await tx.query(
          `UPDATE site_theme
              SET nen_chinh=$1, nen_noi=$2, thuong_hieu=$3, nut_chinh=$4, bo_goc=$5, updated_by=$6
            WHERE version = $7`,
          [mau.nenChinh, mau.nenNoi, mau.thuongHieu, mau.nutChinh, boGoc, actor.userId, version],
        );
        /*
         * Một dòng mỗi tenant, và RLS đã giới hạn ở tenant hiện tại — nên không
         * cần `WHERE id`. Không dòng nào đổi = ai đó đã lưu trước, và bảng màu
         * người này đang nhìn không còn là bảng màu đang chạy.
         */
        if (r.rowCount === 0) {
          throw new BusinessError(
            ErrorCode.STALE_VERSION,
            'Bảng màu đã được người khác lưu. Tải lại để xem bản mới nhất.',
          );
        }
      }

      const sau = await this.doc(tx);
      if (sau === null) throw new BusinessError(ErrorCode.RESOURCE_CONFLICT, 'Không đọc lại được bảng màu vừa lưu');
      return { ...sau, daLuu: true };
    });
  }

  private async doc(tx: PoolClient): Promise<Dong | null> {
    const { rows } = await tx.query<Dong>(
      `SELECT nen_chinh AS "nenChinh", nen_noi AS "nenNoi", thuong_hieu AS "thuongHieu",
              nut_chinh AS "nutChinh", bo_goc AS "boGoc", version::int AS version
         FROM site_theme LIMIT 1`,
    );
    return rows[0] ?? null;
  }
}
