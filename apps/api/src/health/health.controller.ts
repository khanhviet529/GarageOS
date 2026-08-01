import { Controller, Get, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { APP_POOL } from '../db/db.module';

@Controller()
export class HealthController {
  constructor(@Inject(APP_POOL) private readonly pool: Pool) {}

  @Get('health')
  async health(): Promise<{ status: string; db: string; role: string }> {
    const { rows } = await this.pool.query<{ role: string }>(
      'SELECT current_user AS role',
    );
    return { status: 'ok', db: 'ok', role: rows[0]?.role ?? 'unknown' };
  }
}
