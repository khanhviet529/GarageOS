import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { STORAGE_PROVIDER, type StorageProvider } from './storage-provider';

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

  constructor(@Inject(STORAGE_PROVIDER) private readonly noiLuu: StorageProvider) {}

  /**
   * 🔒 Việc chặn path traversal chuyển hẳn xuống `LocalStorage`.
   *
   * ⚠️ Bản trước làm sạch key bằng `.replace(/\.\.\//g, '')` — bộ lọc kiểu danh
   *    sách đen, và loại đó luôn thua: `....//` sau khi xoá `../` còn lại đúng
   *    `../`. Nó vô hại ở đây vì có phép so `startsWith(root + sep)` phía sau
   *    đỡ — nhưng hai lớp bảo vệ mà một lớp sai thì lớp còn lại đang gánh một
   *    mình, và không ai biết điều đó.
   *
   * 💡 Chỉ nên có MỘT chỗ trả lời "key này có nằm trong gốc không", và chỗ đó
   *    phải là nơi biết gốc nằm ở đâu. Với S3 thì câu hỏi ấy thậm chí không tồn
   *    tại — thêm một lý do để nó không nằm ở đây.
   */
  async readPublic(key: string): Promise<PublicMediaFile> {
    if (key.startsWith('demo/')) {
      return this.demoPlaceholder(key);
    }

    let data: Buffer | null;
    try {
      data = await this.noiLuu.get(key);
    } catch (e) {
      this.log.warn(`Key media không hợp lệ: ${key} — ${(e as Error).message}`);
      throw new NotFoundException();
    }
    if (data === null) {
      this.log.warn(`Không tìm thấy media: ${key}`);
      throw new NotFoundException();
    }

    return {
      data,
      contentType: contentTypeOf(key),
      cacheControl: 'public,max-age=31536000,immutable',
      contentHash: contentHashOf(key),
    };
  }

  /** Ghi nội dung mới. Key content-addressed nên ghi lại cùng nội dung là vô hại. */
  async writePublic(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.noiLuu.put(key, data, contentType);
  }

  /**
   * Placeholder SVG cho seed/demo — xác định theo key, không đọc đĩa.
   *
   * ⚠️ Bản trước sinh nền `hsl(hue 42% 82%)` — pastel rất sáng, kèm tên file in
   *    giữa. Trên landing tông tối, chúng nổi lên thành những mảng hồng/xanh
   *    chói giữa một trang đen, và mắt người xem bị kéo về đúng chỗ KHÔNG có nội
   *    dung.
   *
   * 💡 Một placeholder tốt phải nói được hai điều cùng lúc: "chỗ này là ảnh" và
   *    "ảnh chưa có". Nó không được tranh sự chú ý với ảnh thật bên cạnh. Nên
   *    giờ nó tối, khớp `--surface-2`, và chỉ có một khung mảnh cùng tên file ở
   *    mức tương phản vừa đủ đọc.
   */
  private demoPlaceholder(key: string): PublicMediaFile {
    // Sắc độ vẫn suy từ key để mỗi ảnh khác nhau một chút — nhưng ở độ sáng
    // thấp, nên khác biệt là tinh tế chứ không loè loẹt.
    const hue = [...key].reduce((a, c) => a + c.charCodeAt(0) * 31, 0) % 360;
    const label = key.split('/').pop() ?? 'media';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 24% 16%)"/><stop offset="1" stop-color="hsl(${hue} 20% 9%)"/></linearGradient></defs><rect width="1200" height="750" fill="url(#g)"/><rect x="1" y="1" width="1198" height="748" fill="none" stroke="hsl(${hue} 22% 30%)" stroke-width="2"/><text x="600" y="392" font-family="sans-serif" font-size="34" text-anchor="middle" fill="hsl(${hue} 16% 52%)">${label}</text></svg>`;
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
