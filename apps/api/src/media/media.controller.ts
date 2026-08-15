import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MediaStorage } from './media-storage';

/**
 * Serve media public — SRS Phase 1 mục 13: MIME đúng, nosniff, ETag content-hash,
 * Cache-Control immutable. Key content-addressed (tenant namespace + hash).
 */
@Controller('media')
export class MediaController {
  constructor(@Inject(MediaStorage) private readonly storage: MediaStorage) {}

  @Get(':key')
  async get(
    @Param('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.storage.readPublic(key);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', file.cacheControl);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    /*
     * 🔒 ETag theo CONTENT HASH — SRS Phase 1 mục 13.
     *
     * Storage key đã là content-addressed (`<tenant>/<sha256>.<ext>`), nên hash
     * nằm sẵn trong key: không phải đọc lại file để tính. Đây cũng là lý do
     * `Cache-Control: immutable` an toàn — nội dung đổi thì key đổi theo.
     *
     * Không có ETag thì mỗi lần trình duyệt revalidate là một lần truyền lại
     * toàn bộ ảnh; với trang bán xe đầy ảnh lớn, đó là phần lớn băng thông.
     */
    if (file.contentHash !== '') {
      res.setHeader('ETag', `"${file.contentHash}"`);
      if (req.headers['if-none-match'] === `"${file.contentHash}"`) {
        res.status(304).end();
        return;
      }
    }

    res.send(file.data);
  }
}
