import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Nơi cất và lấy nội dung nhị phân, tách khỏi việc AI được xem gì.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao interface này tồn tại
 *
 * `media-storage.ts` ghi ở đầu file: "Phase 1 demo dùng local FS; production
 * thay bằng object storage (S3-compatible) qua cùng interface."
 *
 * ⚠️ Interface đó chưa bao giờ tồn tại. Chỉ có một lớp cụ thể đọc thẳng đĩa, và
 *    "qua cùng interface" là một lời hứa không có gì đỡ. Đây là lần thứ SÁU
 *    trong dự án một chú thích mô tả thứ code không làm — và loại này nguy hiểm
 *    riêng: nó khiến người đọc sau tin rằng việc thay thế đã được chuẩn bị sẵn.
 *
 * 💡 Ranh giới đúng nằm ở "byte vào, byte ra". Mọi thứ khác — key
 *    content-addressed, ETag, cache header, chặn `demo/…` — là quy tắc của
 *    GarageOS chứ không phải của nơi lưu, nên chúng ở lại `MediaStorage`.
 *
 * Chọn driver bằng `STORAGE_DRIVER`. Mặc định `local` để `pnpm dev` chạy được
 * mà không cần dựng gì thêm; `docker compose up` đã có sẵn MinIO cho ai muốn
 * chạy đúng đường production.
 */
export interface StorageProvider {
  /** Ghi nội dung. Key content-addressed nên ghi đè cùng key là ghi đè cùng nội dung. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Đọc nội dung, hoặc `null` nếu không có. KHÔNG ném lỗi cho trường hợp thiếu. */
  get(key: string): Promise<Buffer | null>;
}

export const STORAGE_PROVIDER = Symbol('StorageProvider');

/**
 * Thư mục media mặc định — neo vào GỐC MONOREPO, không vào `process.cwd()`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Bản trước dùng `join(process.cwd(), 'media', 'public')`, và `cwd` khác nhau
 *    tuỳ ai gọi:
 *
 *      pnpm db:seed                    -> cwd = <gốc>            -> <gốc>/media/public
 *      pnpm --filter @garageos/api dev -> cwd = <gốc>/apps/api   -> apps/api/media/public
 *
 *    Nghĩa là seed ghi ảnh vào một chỗ, còn API đọc ở chỗ khác. Triệu chứng
 *    không hề trỏ về nguyên nhân: ảnh "đã nhập thành công" nhưng `/media/:key`
 *    trả 404, và người xem sẽ đi tìm lỗi ở tầng khoá hoặc tầng quyền.
 *
 * 💡 `cwd` là thuộc tính của LỜI GỌI, không phải của dự án. Mọi giá trị mặc định
 *    suy ra từ nó đều đổi theo người gọi — thứ cuối cùng ta muốn ở một đường dẫn
 *    lưu trữ.
 *
 * Tìm gốc bằng `pnpm-workspace.yaml` — cùng dấu mốc mà pnpm và turbo dùng, nên
 * nó đúng ở mọi chỗ mà hai công cụ đó chạy được.
 */
function thuMucMediaMacDinh(): string {
  let thu = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(thu, 'pnpm-workspace.yaml'))) return join(thu, 'media', 'public');
    const cha = resolve(thu, '..');
    if (cha === thu) break;
    thu = cha;
  }
  // Không tìm thấy gốc (bản build đóng gói lẻ) — quay về hành vi cũ, và nói ra.
  console.warn(
    'Không tìm thấy gốc monorepo để đặt MEDIA_ROOT. Dùng cwd — hãy đặt MEDIA_ROOT tường minh.',
  );
  return join(process.cwd(), 'media', 'public');
}

/** Tên file content-addressed: `<tenant>/<sha256>.<ext>` — SRS mục 6.7. */
export function khoaTheoNoiDung(tenantId: string, data: Buffer, duoi: string): string {
  const sha = createHash('sha256').update(data).digest('hex');
  return `${tenantId}/${sha}.${duoi}`;
}

/**
 * Lưu trên đĩa của chính máy chạy API.
 *
 * ⚠️ Chỉ dùng cho máy dev và bản demo một máy. Chạy nhiều instance thì mỗi
 *    instance có một thư mục riêng, và ảnh tải lên ở instance này trả 404 ở
 *    instance kia — hỏng theo kiểu ngắt quãng, khó nhìn ra nhất.
 */
export class LocalStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  /**
   * 🔒 Đường dẫn phải nằm TRONG thư mục gốc — so bằng `relative()`, không phải
   *    `startsWith()`.
   *
   * ⚠️ `startsWith` so sánh CHUỖI: với gốc `/data/media`, đường dẫn
   *    `/data/media-cu/bi-mat` bắt đầu bằng đúng chuỗi đó nên đi lọt. Cùng lỗi
   *    đã tìm thấy ở `infra/media-import.ts` và đã sửa ở `00cf3c8`; chép lại
   *    khuôn cũ là chép cả lỗ hổng của nó.
   */
  private duongDan(key: string): string {
    const goc = resolve(this.root);
    const dich = resolve(join(goc, key));
    const buoc = relative(goc, dich);
    if (buoc === '' || buoc.startsWith('..') || isAbsolute(buoc)) {
      throw new Error(`Storage key thoát khỏi thư mục gốc: ${key}`);
    }
    return dich;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.duongDan(key);
    mkdirSync(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Buffer | null> {
    const p = this.duongDan(key);
    if (!existsSync(p)) return null;
    return readFile(p);
  }
}

/**
 * Object storage tương thích S3 — MinIO ở máy dev, S3/R2 ở production.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Ký request bằng AWS Signature V4 viết tay, không kéo `@aws-sdk/client-s3`.
 *
 * 💡 Lý do không phải "tránh dependency cho nhẹ". SDK của AWS mang theo hàng
 *    trăm gói con và một mô hình credential provider tự đi tìm cấu hình ở biến
 *    môi trường, file `~/.aws`, IMDS của EC2… Với một dịch vụ chỉ cần GET/PUT
 *    vào một bucket, phần "tự đi tìm" đó là bề mặt bất ngờ chứ không phải tiện
 *    ích: nó có thể lấy credential từ một chỗ mà không ai trong đội biết.
 *
 * SigV4 cho hai động từ này gọn hơn nhiều so với vẻ ngoài của nó — và nó nằm
 * trong kho, đọc được, có bài kiểm chạy trên MinIO thật.
 */
export class S3Storage implements StorageProvider {
  constructor(
    private readonly cauHinh: {
      endpoint: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      region: string;
    },
  ) {}

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const res = await this.goi('PUT', key, data, contentType);
    if (!res.ok) {
      throw new Error(`S3 PUT ${key} thất bại: ${res.status} ${await res.text()}`);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.goi('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`S3 GET ${key} thất bại: ${res.status} ${await res.text()}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async goi(
    method: 'GET' | 'PUT',
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const url = new URL(`${this.cauHinh.endpoint.replace(/\/+$/, '')}/${this.cauHinh.bucket}/${key}`);
    const noiDung = body ?? Buffer.alloc(0);
    const hashNoiDung = createHash('sha256').update(noiDung).digest('hex');

    const now = new Date();
    const amz = `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
    const ngay = amz.slice(0, 8);

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': hashNoiDung,
      'x-amz-date': amz,
      ...(contentType === undefined ? {} : { 'content-type': contentType }),
    };
    const tenHeader = Object.keys(headers).sort();
    const signedHeaders = tenHeader.join(';');
    const canonicalHeaders = tenHeader.map((h) => `${h}:${headers[h]}\n`).join('');

    const canonical = [
      method,
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      hashNoiDung,
    ].join('\n');

    const scope = `${ngay}/${this.cauHinh.region}/s3/aws4_request`;
    const toSign = [
      'AWS4-HMAC-SHA256',
      amz,
      scope,
      createHash('sha256').update(canonical).digest('hex'),
    ].join('\n');

    const { createHmac } = await import('node:crypto');
    const hmac = (k: Buffer | string, d: string): Buffer =>
      createHmac('sha256', k).update(d).digest();
    const kNgay = hmac(`AWS4${this.cauHinh.secretKey}`, ngay);
    const kVung = hmac(kNgay, this.cauHinh.region);
    const kDichVu = hmac(kVung, 's3');
    const kKy = hmac(kDichVu, 'aws4_request');
    const chuKy = createHmac('sha256', kKy).update(toSign).digest('hex');

    return fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization:
          `AWS4-HMAC-SHA256 Credential=${this.cauHinh.accessKey}/${scope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${chuKy}`,
      },
      ...(method === 'PUT' ? { body: new Uint8Array(noiDung) } : {}),
    });
  }
}

/**
 * Dựng provider theo cấu hình.
 *
 * 🔒 `s3` mà thiếu bí mật thì NÉM LỖI lúc khởi động, không âm thầm về `local`.
 *    Rơi về local trong im lặng nghĩa là ảnh khách tải lên nằm trên đĩa của một
 *    container sẽ bị xoá — mất bằng chứng hiện trạng xe, đúng thứ mà tính năng
 *    này sinh ra để giữ.
 */
export function dungStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  const driver = env['STORAGE_DRIVER'] ?? 'local';
  if (driver === 'local') {
    /*
     * ⚠️ Chuỗi RỖNG cũng là "chưa đặt". `.env` khai `MEDIA_ROOT=` để nói "dùng
     *    mặc định", nhưng `??` chỉ rơi về mặc định với `null`/`undefined` — nên
     *    chuỗi rỗng đi thẳng qua và mọi đường dẫn thành tương đối.
     */
    const goc = env['MEDIA_ROOT'] ?? '';
    return new LocalStorage(goc === '' ? thuMucMediaMacDinh() : goc);
  }
  if (driver !== 's3') {
    throw new Error(`STORAGE_DRIVER không hợp lệ: ${driver} (chỉ nhận 'local' hoặc 's3')`);
  }

  const thieu = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'].filter(
    (t) => (env[t] ?? '') === '',
  );
  if (thieu.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 nhưng thiếu: ${thieu.join(', ')}. ` +
        'Không tự rơi về local — ảnh hiện trạng là bằng chứng, không được nằm trên đĩa tạm.',
    );
  }
  return new S3Storage({
    endpoint: env['S3_ENDPOINT']!,
    bucket: env['S3_BUCKET']!,
    accessKey: env['S3_ACCESS_KEY']!,
    secretKey: env['S3_SECRET_KEY']!,
    region: env['S3_REGION'] ?? 'us-east-1',
  });
}
