import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/**
 * Storage adapter cho media public — SRS Phase 1 mục 6.7/13.
 *
 * Public storage key content-addressed, immutable. Phase 1 demo dùng local FS;
 * production thay bằng object storage (S3-compatible) qua cùng interface.
 * Key `demo/…` là placeholder sinh động cho seed/demo, KHÔNG dùng ở production.
 */
export interface PublicMediaFile {
  data: Buffer;
  contentType: string;
  cacheControl: string;
  /** SHA-256 của nội dung — lấy từ chính storage key (content-addressed) */
  contentHash: string;
}

@Injectable()
export class MediaStorage {
  private readonly log = new Logger('MediaStorage');

  async readPublic(key: string): Promise<PublicMediaFile> {
    if (key.startsWith('demo/')) {
      return this.demoPlaceholder(key);
    }

    const root = resolve(process.env['MEDIA_ROOT'] ?? join(process.cwd(), 'media', 'public'));
    // 🔒 Chặn path traversal: key đã normalize, không chứa '..', không ra ngoài root
    const safeKey = key.replace(/\\/g, '/').replace(/\.\.\//g, '');
    const filePath = resolve(join(root, safeKey));
    if (!filePath.startsWith(root.endsWith(sep) ? root : root + sep)) {
      throw new NotFoundException();
    }

    try {
      const data = await readFile(filePath);
      return {
        data,
        contentType: contentTypeOf(key),
        cacheControl: 'public,max-age=31536000,immutable',
        contentHash: contentHashOf(key),
      };
    } catch {
      this.log.warn(`Không tìm thấy media: ${key}`);
      throw new NotFoundException();
    }
  }

  /** Placeholder SVG cho seed/demo — xác định theo key, không đọc đĩa. */
  private demoPlaceholder(key: string): PublicMediaFile {
    const hue = [...key].reduce((a, c) => a + c.charCodeAt(0) * 31, 0) % 360;
    const label = key.split('/').pop() ?? 'media';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><rect width="1200" height="750" fill="hsl(${hue} 42% 82%)"/><rect width="1200" height="750" fill="none" stroke="hsl(${hue} 45% 55%)" stroke-width="8"/><text x="600" y="380" font-family="sans-serif" font-size="42" text-anchor="middle" fill="hsl(${hue} 50% 28%)">${label}</text></svg>`;
    return {
      data: Buffer.from(svg, 'utf8'),
      contentType: 'image/svg+xml',
      cacheControl: 'public,max-age=31536000,immutable',
      contentHash: createHash('sha256').update(svg, 'utf8').digest('hex'),
    };
  }
}

/**
 * Hash nội dung lấy từ chính storage key.
 *
 * Key public là content-addressed (`<tenant>/<sha256>.<ext>`), nên hash đã nằm
 * sẵn ở đó — không phải đọc lại file để tính. Key không theo dạng đó là dữ liệu
 * ngoài quy ước; trả chuỗi rỗng để tầng trên bỏ ETag thay vì phát một giá trị
 * sai, vì một ETag sai còn tệ hơn không có: trình duyệt sẽ cache nhầm nội dung.
 */
function contentHashOf(key: string): string {
  const ten = key.split('/').pop() ?? '';
  const hash = ten.split('.')[0] ?? '';
  return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function contentTypeOf(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'mp4': return 'video/mp4';
    case 'mp3': return 'audio/mpeg';
    default: return 'application/octet-stream';
  }
}
