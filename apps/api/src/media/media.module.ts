import { Module } from '@nestjs/common';
import { MediaStorage } from './media-storage';
import { MediaController } from './media.controller';
import { MarketingMediaController } from './marketing-media.controller';
import { STORAGE_PROVIDER, dungStorageProvider } from './storage-provider';

/**
 * 🔒 Provider dựng bằng factory ĐỌC CẤU HÌNH LÚC KHỞI ĐỘNG.
 *
 * `STORAGE_DRIVER=s3` mà thiếu bí mật thì `dungStorageProvider` ném lỗi ngay ở
 * đây — API từ chối khởi động, cùng khuôn với `assertSecretsUsable()`. Rơi về
 * local trong im lặng nghĩa là ảnh hiện trạng nằm trên đĩa của một container sẽ
 * bị xoá, và không ai biết cho tới đúng lúc cần tới bằng chứng đó.
 */
@Module({
  providers: [
    { provide: STORAGE_PROVIDER, useFactory: () => dungStorageProvider() },
    MediaStorage,
  ],
  controllers: [MediaController, MarketingMediaController],
  exports: [MediaStorage],
})
export class MediaModule {}
