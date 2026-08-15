/**
 * 🔒 Adapter S3 chạy trên MinIO THẬT, không phải mock.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao không mock
 *
 * Cả giá trị của adapter này nằm ở chỗ nó ký request đúng chuẩn AWS Signature
 * V4. Một mock sẽ kiểm rằng ta gọi `put()` với đúng tham số — điều đã hiển
 * nhiên từ khi đọc code — mà bỏ qua đúng phần duy nhất có thể sai: chữ ký.
 *
 * `docker compose up` đã dựng sẵn MinIO ở cổng 9002. Bài này bỏ qua CÓ BÁO nếu
 * không thấy nó, chứ không im lặng xanh: một bài "đạt" vì thiếu môi trường là
 * một bài nói dối.
 *
 * 💡 Đây cũng là lý do `packages/db` bắt buộc Postgres thật thay vì SQLite —
 *    cùng một nguyên tắc, áp cho một tầng khác.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { S3Storage, dungStorageProvider, khoaTheoNoiDung } from '../src/media/storage-provider';

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9002';
const BUCKET = process.env.S3_BUCKET ?? 'garageos-media';

let coMinio = false;
let kho: S3Storage;

before(async () => {
  try {
    const res = await fetch(`${ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    coMinio = res.ok;
  } catch {
    coMinio = false;
  }
  kho = new S3Storage({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    accessKey: process.env.S3_ACCESS_KEY ?? 'garageos',
    secretKey: process.env.S3_SECRET_KEY ?? 'garageos_dev',
    region: process.env.S3_REGION ?? 'us-east-1',
  });
});

describe('🔒 Lưu trữ đối tượng tương thích S3', () => {
  test('S3-T01 — ghi rồi đọc lại đúng byte đã ghi', async (t) => {
    if (!coMinio) {
      t.skip(`không thấy MinIO ở ${ENDPOINT} — chạy \`docker compose up -d minio\``);
      return;
    }
    const noiDung = randomBytes(2048);
    const key = khoaTheoNoiDung('11111111-1111-1111-1111-111111111111', noiDung, 'bin');

    await kho.put(key, noiDung, 'application/octet-stream');
    const lay = await kho.get(key);

    assert.ok(lay !== null, 'ghi xong nhưng đọc lại không thấy');
    assert.ok(lay.equals(noiDung), 'nội dung đọc về khác nội dung đã ghi');
  });

  test('S3-T02 — key không tồn tại trả null, KHÔNG ném lỗi', async (t) => {
    if (!coMinio) {
      t.skip('không thấy MinIO');
      return;
    }
    /*
     * Phân biệt "không có" với "hỏng" là việc của tầng lưu trữ. Ném lỗi cho
     * trường hợp thiếu buộc mọi nơi gọi phải bọc try/catch, và ở đó một lỗi
     * mạng thật sẽ bị nuốt cùng với trường hợp thiếu file.
     */
    const lay = await kho.get('khong-ton-tai/0000.bin');
    assert.equal(lay, null);
  });

  test('S3-T03 — bí mật sai thì NÉM LỖI, không trả null im lặng', async (t) => {
    if (!coMinio) {
      t.skip('không thấy MinIO');
      return;
    }
    const sai = new S3Storage({
      endpoint: ENDPOINT,
      bucket: BUCKET,
      accessKey: 'garageos',
      secretKey: 'bi-mat-sai-hoan-toan',
      region: 'us-east-1',
    });
    await assert.rejects(
      () => sai.put('thu/sai-bi-mat.bin', Buffer.from('x'), 'application/octet-stream'),
      /S3 PUT .* thất bại/,
      'ký sai mà vẫn coi như thành công — bằng chứng sẽ biến mất trong im lặng',
    );
  });

  test('S3-T04 — STORAGE_DRIVER=s3 mà thiếu bí mật thì TỪ CHỐI khởi động', () => {
    /*
     * 🔒 Không tự rơi về `local`.
     *
     * Rơi về local trong im lặng nghĩa là ảnh hiện trạng nằm trên đĩa của một
     * container sẽ bị xoá — mất bằng chứng về tình trạng chiếc xe lúc nhận, và
     * không ai biết cho tới đúng lúc cần tới nó.
     */
    assert.throws(
      () => dungStorageProvider({ STORAGE_DRIVER: 's3' } as NodeJS.ProcessEnv),
      /thiếu: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY/,
    );
  });

  test('S3-T05 — driver lạ bị từ chối, không đoán ý', () => {
    assert.throws(
      () => dungStorageProvider({ STORAGE_DRIVER: 'gcs' } as NodeJS.ProcessEnv),
      /không hợp lệ/,
    );
  });
});
