/**
 * API integration tests gọi HTTP thật. Runner này khởi động một API cô lập ở
 * cổng khác để không đụng phiên dev, đồng thời nới rate-limit chỉ cho tiến
 * trình test. Database phải được migrate/seed trước khi chạy.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(repoRoot, 'apps', 'api');
const port = Number(process.env.API_TEST_PORT ?? 3011);
const origin = `http://127.0.0.1:${port}`;
let logs = '';

/*
 * 🔒 Test chạy với ranh giới tin cậy của PRODUCTION, không phải của máy dev.
 *
 * `EDGE_HOST_TRUST=signed` là mặc định thật của hệ thống; để runner chạy ở chế
 * độ `host` cho tiện sẽ làm mọi bài kiểm "người lạ không chọn được tenant"
 * thành vô nghĩa — chúng sẽ xanh vì đang kiểm một cấu hình không ai deploy.
 *
 * Gán vào `process.env` của chính runner (không chỉ vào env của tiến trình API)
 * để bộ test cũng ký được host bằng cùng bí mật.
 */
process.env.EDGE_HOST_TRUST = 'signed';
process.env.EDGE_SIGNING_SECRET = process.env.EDGE_SIGNING_SECRET ?? 'test-edge-secret';
/* Một hop: bài kiểm giới hạn tần suất gửi `X-Forwarded-For` như edge thật. */
process.env.TRUST_PROXY_HOPS = '1';

/*
 * ⚠️ `--env-file-if-exists`, KHÔNG phải `--env-file`.
 *
 * Máy dev có `.env`; CI truyền cấu hình bằng biến môi trường và không có file
 * nào. `--env-file` của Node NÉM LỖI khi thiếu file, nên trên CI runner chết
 * trước cả khi API kịp khởi động:
 *
 *     API test đã dừng sớm.
 *     node: /home/runner/work/GarageOS/GarageOS/.env: not found
 *
 * Cùng một lỗi có ở `db:migrate`, `db:seed`, `media:import` và
 * `site-domain:apply`. Bốn chỗ kia nằm trong `package.json` nên sửa cùng lượt;
 * chỗ này sót lại đúng vì nó KHÔNG nằm ở đó — và một lượt CI nữa mới lộ ra.
 */
const api = spawn(process.execPath, [tsxCli, `--env-file-if-exists=${join(repoRoot, '.env')}`, 'src/main.ts'], {
  cwd: apiRoot,
  env: {
    ...process.env,
    API_PORT: String(port),
    LOGIN_RATE_LIMIT_MAX: '10000',
    LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
    OTP_DEV_ECHO: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const stream of [api.stdout, api.stderr]) {
  stream.on('data', (chunk) => {
    logs = `${logs}${chunk}`.slice(-16_000);
  });
}

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`API test đã dừng sớm.\n${logs}`);
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {
      // API vẫn đang boot.
    }
    await delay(250);
  }
  throw new Error(`API test không sẵn sàng tại ${origin}.\n${logs}`);
}

function runTests() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['../../infra/run-tests.mjs', 'test'], {
      cwd: apiRoot,
      env: { ...process.env, API_URL: origin },
      stdio: 'inherit',
    });
    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', () => resolve(1));
  });
}

try {
  await waitForApi();
  process.exitCode = await runTests();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  api.kill();
}
