import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { TenantAwareDb } from '@garageos/db';
import { AppModule } from './app.module';
import { APP_POOL } from './db/db.module';
import { ErrorFilter } from './common/errors';
import { assertSchemaUpToDate, assertSecretsUsable } from './common/startup-checks';

async function bootstrap(): Promise<void> {
  // 🔒 Kiểm tra bí mật TRƯỚC khi dựng app: không cần kết nối gì để biết cấu
  //    hình sai, và hỏng sớm thì thông báo lỗi sạch hơn.
  assertSecretsUsable();

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  /*
   * 🔒 Tin `X-Forwarded-For` đúng số hop của hạ tầng đứng trước — LS-002.
   *
   * Landing công khai chạy sau edge/CDN. Không có cấu hình này, `req.ip` là IP
   * của edge và giống hệt nhau cho MỌI khách: giới hạn tần suất form lead trở
   * thành một hạn mức dùng chung cho toàn bộ người dùng của toàn bộ tenant.
   * Đó không phải "chặn chưa đủ chặt" — đó là tự chặn mình ở đúng điểm chuyển
   * đổi duy nhất của trang.
   *
   * ⚠️ KHÔNG đặt `true`. `trust proxy: true` tin toàn bộ chuỗi
   * `X-Forwarded-For`, nên client tự khai một IP bất kỳ ở đầu chuỗi là thoát
   * mọi giới hạn — đổi một hạn mức chung lấy một hạn mức không tồn tại.
   * `TRUST_PROXY_HOPS` phải bằng số proxy THẬT (một CDN = 1, CDN + load
   * balancer = 2). Mặc định 0: chạy trần, dùng IP của kết nối.
   */
  const soHop = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number.isFinite(soHop) && soHop > 0 ? soHop : false);

  /*
   * 🔒 Chế độ `signed` mà thiếu bí mật thì mọi chữ ký đều sai và toàn bộ
   * landing trả 404 — fail-closed, đúng hướng, nhưng triệu chứng ("trang trắng
   * ở staging") không hề gợi ra nguyên nhân. Nói thẳng ra lúc khởi động.
   */
  if (
    (process.env.EDGE_HOST_TRUST ?? 'signed') !== 'host' &&
    (process.env.EDGE_SIGNING_SECRET ?? '') === ''
  ) {
    new Logger('bootstrap').warn(
      'EDGE_HOST_TRUST=signed nhưng EDGE_SIGNING_SECRET rỗng — mọi request landing ' +
        'sẽ trả 404. Đặt bí mật, hoặc đặt EDGE_HOST_TRUST=host trên máy phát triển.',
    );
  }

  // 🔒 Chốt chặn cuối: từ chối khởi động nếu role DB có đặc quyền bỏ qua RLS.
  //    Superuser bỏ qua Row-Level Security kể cả khi bảng đã bật FORCE, khiến
  //    cô lập tenant vô hiệu ÂM THẦM. Thà không chạy còn hơn chạy sai.
  await app.get(TenantAwareDb).assertNotPrivileged();

  // 🔒 Và schema phải theo kịp code. Đặt SAU `assertNotPrivileged` vì quyền DB
  //    sai là vấn đề nghiêm trọng hơn, nên nó phải là câu báo đầu tiên.
  await assertSchemaUpToDate(app.get(APP_POOL));

  // requestId xuyên suốt web/mobile -> api -> db (docs/13-nfr.md mục 4)
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  app.useGlobalFilters(new ErrorFilter());
  /*
   * CORS — danh sách nguồn được phép, KHÔNG phải `origin: true`.
   *
   * Từ Phase 4 có hai giao diện gọi API: web nhân viên và bản web của app thợ
   * (Expo chạy ở cổng khác). Mở `origin: true` cho tiện là cho phép MỌI trang
   * web gọi API kèm cookie của người dùng — token đang ở `localStorage` nên
   * chưa bị lợi dụng ngay, nhưng khi chuyển sang cookie HttpOnly (nợ kỹ thuật
   * đã ghi) thì đó thành lỗ hổng CSRF thật.
   *
   * ⚠️ App thợ chạy trên THIẾT BỊ THẬT không đi qua CORS — React Native không
   * phải trình duyệt. Danh sách này chỉ phục vụ bản web dùng để phát triển và
   * chạy test.
   */
  const nguonChoPhep = (
    process.env.WEB_ORIGIN ??
    'http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004'
  )
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  app.enableCors({ origin: nguonChoPhep, credentials: true });

  // Railway và phần lớn PaaS cấp cổng qua `PORT`; máy local vẫn dùng API_PORT.
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('bootstrap').log(`API chạy tại http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Khởi động thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
