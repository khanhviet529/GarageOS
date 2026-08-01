import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { TenantAwareDb, createAppPool } from '@garageos/db';

export const APP_POOL = Symbol('APP_POOL');

@Global()
@Module({
  providers: [
    { provide: APP_POOL, useFactory: (): Pool => createAppPool() },
    {
      provide: TenantAwareDb,
      inject: [APP_POOL],
      useFactory: (pool: Pool): TenantAwareDb => new TenantAwareDb(pool),
    },
  ],
  exports: [TenantAwareDb, APP_POOL],
})
export class DbModule {}
