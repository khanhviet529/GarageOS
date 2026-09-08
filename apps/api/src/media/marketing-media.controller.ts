import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { TenantAwareDb } from '@garageos/db';
import type { ActorContext } from '@garageos/contracts';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { assertCan } from '../common/permissions';
import { urlMediaCongKhai } from '../common/media-url';

/** Read-only V1 media library. Ingestion remains the existing validated import pipeline. */
@Controller('api/v1/marketing/media')
@UseGuards(JwtGuard)
export class MarketingMediaController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Get()
  async list(@Actor() actor: ActorContext): Promise<{ items: { id: string; stableKey: string; kind: string; status: string; width: number | null; height: number | null; previewUrl: string | null }[] }> {
    assertCan(actor, 'marketing:mediaRead');
    return this.db.withTenant(actor, async (tx) => {
      /*
       * `previewUrl` thêm 2026-09-08 cho màn chọn ảnh của mẫu xe.
       *
       * ⚠️ Trước đó danh sách chỉ có `stableKey` — một chuỗi. Thư viện ảnh vì
       *    thế là một bảng CHỮ, và chỗ chọn ảnh cho mẫu xe sẽ bắt biên tập viên
       *    nhận ra tấm ảnh qua tên tệp. Không ai làm được việc đó.
       *
       * `null` khi bản dựng chưa publish xong: ảnh đang xử lý mà hiện ra là một
       * ô vỡ — thà nói rõ là chưa sẵn sàng.
       */
      const { rows } = await tx.query<{ id: string; stable_key: string; kind: string; status: string; width: number | null; height: number | null; public_storage_key: string | null }>(
        `SELECT a.id, a.stable_key, a.kind, a.status, a.width, a.height,
                pub.public_storage_key
           FROM media_asset a
           LEFT JOIN LATERAL (
             SELECT mp.public_storage_key
               FROM media_rendition rn
               JOIN media_publication mp ON mp.rendition_id = rn.id AND mp.status = 'READY'
              WHERE rn.asset_id = a.id
              ORDER BY CASE rn.profile WHEN 'POSTER' THEN 0 WHEN 'GALLERY' THEN 1 ELSE 2 END
              LIMIT 1
           ) pub ON true
          ORDER BY a.created_at DESC LIMIT 200`,
      );
      return {
        items: rows.map((row) => ({
          id: row.id,
          stableKey: row.stable_key,
          kind: row.kind,
          status: row.status,
          width: row.width,
          height: row.height,
          previewUrl: row.public_storage_key === null ? null : urlMediaCongKhai(row.public_storage_key),
        })),
      };
    });
  }
}
