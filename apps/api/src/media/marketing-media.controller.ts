import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { TenantAwareDb } from '@garageos/db';
import type { ActorContext } from '@garageos/contracts';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { assertCan } from '../common/permissions';

/** Read-only V1 media library. Ingestion remains the existing validated import pipeline. */
@Controller('api/v1/marketing/media')
@UseGuards(JwtGuard)
export class MarketingMediaController {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Get()
  async list(@Actor() actor: ActorContext): Promise<{ items: { id: string; stableKey: string; kind: string; status: string; width: number | null; height: number | null }[] }> {
    assertCan(actor, 'marketing:mediaRead');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string; stable_key: string; kind: string; status: string; width: number | null; height: number | null }>(
        'SELECT id,stable_key,kind,status,width,height FROM media_asset ORDER BY created_at DESC LIMIT 200',
      );
      return { items: rows.map((row) => ({ id: row.id, stableKey: row.stable_key, kind: row.kind, status: row.status, width: row.width, height: row.height })) };
    });
  }
}
