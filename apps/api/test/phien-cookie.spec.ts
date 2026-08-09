/**
 * 🔒 Phiên đăng nhập: cookie HttpOnly, xoay vòng refresh token, chống CSRF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bộ này tồn tại
 *
 * Trước thay đổi này, token nằm trong `localStorage` — đọc được bằng
 * JavaScript. Một lỗ XSS ở bất kỳ đâu là kẻ tấn công mang được token ra khỏi
 * trình duyệt và dùng nó ở máy của họ.
 *
 * Chuyển sang cookie `HttpOnly` đóng đường đó lại, nhưng MỞ ra một đường khác:
 * trình duyệt tự gửi cookie theo request do trang khác kích hoạt — CSRF. Nên
 * bộ test này kiểm CẢ HAI VẾ. Một bộ chỉ kiểm "đăng nhập vẫn chạy" sẽ xanh
 * ngay cả khi ta vừa đánh đổi một lỗ hổng lấy một lỗ hổng khác.
 *
 * `docs/13-nfr.md` chốt ba điều, và mỗi điều có bài riêng ở đây:
 *   · access token sống 15 phút, refresh 30 ngày
 *   · refresh XOAY VÒNG
 *   · 🔒 dùng lại token đã thu hồi → thu hồi TOÀN BỘ phiên
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const NGUON = 'http://localhost:3000';

let pool: Pool;
let nguoiThu = '';

interface PhanHoi {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
}

async function goi(
  duongDan: string,
  opts: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string | null;
    bearer?: string;
    cheDoToken?: boolean;
  } = {},
): Promise<PhanHoi> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.cookie !== undefined) headers['Cookie'] = opts.cookie;
  if (opts.origin !== null) headers['Origin'] = opts.origin ?? NGUON;
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`;
  if (opts.cheDoToken === true) headers['X-Auth-Mode'] = 'token';

  const res = await fetch(`${API}${duongDan}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, cookies: res.headers.getSetCookie() };
}

/** Ghép các cookie vừa nhận thành header `Cookie` cho lượt gọi sau */
function gomCookie(dat: string[]): string {
  return dat
    .map((c) => c.split(';')[0]!)
    .filter((c) => !c.endsWith('='))
    .join('; ');
}

function timCookie(dat: string[], ten: string): string | undefined {
  return dat.find((c) => c.startsWith(`${ten}=`));
}

async function dangNhapCookie(): Promise<PhanHoi> {
  return goi('/api/v1/auth/login', {
    method: 'POST',
    body: { phone: '0901000003', password: 'demo1234' },
  });
}

describe('🔒 Phiên đăng nhập bằng cookie HttpOnly', () => {
  before(async () => {
    pool = new Pool({ connectionString: ADMIN_URL });
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM app_user WHERE phone = '0901000003'`,
    );
    nguoiThu = rows[0]!.id;
  });

  /**
   * Thu hồi mọi token của người dùng thử.
   *
   * 🔒 Cần vì các bài trong file này đều đăng nhập bằng CÙNG một tài khoản, và
   *    mỗi lần đăng nhập để lại một token còn sống. Đếm "token còn sống" mà
   *    không dọn trước thì đếm cả di sản của những bài trước — bài từng báo
   *    "8 token còn sống" trong khi cuộc đua chỉ sinh ra nhiều nhất 2.
   */
  async function donSachToken(): Promise<void> {
    await pool.query(
      `UPDATE refresh_token SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [nguoiThu],
    );
  }
  after(async () => {
    await pool.end();
  });

  test('đăng nhập KHÔNG trả token trong thân — web không có gì để đem cất', async () => {
    const r = await dangNhapCookie();
    assert.equal(r.status, 201, JSON.stringify(r.body));

    /*
     * Đây là bài quan trọng nhất của cả bộ.
     *
     * Mọi thứ khác — cờ HttpOnly, SameSite, xoay vòng — đều vô nghĩa nếu thân
     * phản hồi vẫn kèm token: một dòng `localStorage.setItem` ở đâu đó là đủ
     * để quay lại đúng chỗ cũ. Cách chắc chắn duy nhất là **không đưa token
     * cho web**.
     */
    assert.equal(r.body.accessToken, undefined, 'thân phản hồi vẫn kèm access token');
    assert.equal(r.body.refreshToken, undefined, 'thân phản hồi vẫn kèm refresh token');
    assert.ok(r.body.user, 'phải trả thông tin người dùng để giao diện hiển thị');
  });

  test('cookie phiên phải HttpOnly, SameSite, và refresh có Path hẹp', async () => {
    const r = await dangNhapCookie();
    const at = timCookie(r.cookies, 'gos_at');
    const rt = timCookie(r.cookies, 'gos_rt');
    assert.ok(at, 'thiếu cookie access token');
    assert.ok(rt, 'thiếu cookie refresh token');

    for (const [ten, c] of [
      ['access', at],
      ['refresh', rt],
    ] as const) {
      assert.match(c, /HttpOnly/, `cookie ${ten} thiếu HttpOnly — JavaScript đọc được`);
      assert.match(c, /SameSite=Lax/, `cookie ${ten} thiếu SameSite — hở CSRF`);
    }

    /*
     * 🔒 Refresh token chỉ cần đi tới nhóm endpoint `auth`. Để `Path=/` thì mọi
     *    request nghiệp vụ đều mang nó theo — bề mặt lộ ra rộng ra vô ích.
     */
    assert.match(rt, /Path=\/api\/v1\/auth/, 'refresh token không giới hạn đường đi');
  });

  test('gọi endpoint nghiệp vụ chỉ bằng cookie — không cần Authorization', async () => {
    const dn = await dangNhapCookie();
    const r = await goi('/api/v1/auth/me', { cookie: gomCookie(dn.cookies) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.tenantId, 'không dựng được ngữ cảnh từ cookie');
  });

  test('app thợ xin token bằng X-Auth-Mode và vẫn dùng Bearer được', async () => {
    const r = await goi('/api/v1/auth/login', {
      method: 'POST',
      body: { phone: '0901000004', password: 'demo1234' },
      cheDoToken: true,
    });
    assert.equal(typeof r.body.accessToken, 'string', 'app thợ không nhận được token');

    // Bearer KHÔNG bị đòi Origin — trình duyệt không gắn header đó được, nên
    // đường này miễn nhiễm CSRF theo bản chất
    const me = await goi('/api/v1/auth/me', {
      bearer: r.body.accessToken as string,
      origin: null,
    });
    assert.equal(me.status, 200, JSON.stringify(me.body));
  });

  describe('🔒 CSRF — cái giá của việc dùng cookie', () => {
    test('thao tác GHI bằng cookie từ nguồn LẠ bị chặn', async () => {
      const dn = await dangNhapCookie();
      const r = await goi('/api/v1/auth/refresh', {
        method: 'POST',
        cookie: gomCookie(dn.cookies),
        origin: 'https://trang-doc-hai.example',
      });
      assert.ok(
        r.status === 403 || r.status === 401,
        `nguồn lạ vẫn xoay vòng được phiên của người dùng — HTTP ${r.status}`,
      );
    });

    test('thao tác GHI bằng cookie KHÔNG có Origin cũng bị chặn', async () => {
      /*
       * Thiếu `Origin` phải TỪ CHỐI, không phải cho qua.
       *
       * Mọi trình duyệt hiện đại đều gửi `Origin` với request ghi cross-origin.
       * Một request ghi không có `Origin` mà lại mang cookie phiên là thứ đáng
       * chặn — cho qua là để lại đúng cái cửa mà bài trên vừa đóng.
       */
      const dn = await dangNhapCookie();
      const r = await goi('/api/v1/auth/refresh', {
        method: 'POST',
        cookie: gomCookie(dn.cookies),
        origin: null,
      });
      assert.ok(r.status === 403 || r.status === 401, `HTTP ${r.status} — lẽ ra phải chặn`);
    });

    test('ĐỌC bằng cookie từ nguồn lạ vẫn cho qua — CORS lo phần đó', async () => {
      /*
       * Không chặn GET: trình duyệt cho phép gửi request đọc cross-origin
       * nhưng KHÔNG cho trang tấn công đọc phản hồi (CORS). Chặn thêm ở đây
       * không thêm an toàn, mà làm hỏng những đường đọc hợp lệ như tra cứu
       * công khai.
       */
      const dn = await dangNhapCookie();
      const r = await goi('/api/v1/auth/me', {
        cookie: gomCookie(dn.cookies),
        origin: 'https://trang-la.example',
      });
      assert.equal(r.status, 200);
    });
  });

  describe('🔒 Xoay vòng refresh token', () => {
    test('mỗi lần gia hạn sinh token MỚI và thu hồi token cũ', async () => {
      const dn = await dangNhapCookie();
      const rt1 = timCookie(dn.cookies, 'gos_rt')!;

      const r = await goi('/api/v1/auth/refresh', {
        method: 'POST',
        cookie: gomCookie(dn.cookies),
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const rt2 = timCookie(r.cookies, 'gos_rt');
      assert.ok(rt2, 'gia hạn không phát refresh token mới');
      assert.notEqual(
        rt2.split(';')[0],
        rt1.split(';')[0],
        'refresh token không đổi — không có xoay vòng nào cả',
      );

      // Và cái cũ phải được đánh dấu thu hồi kèm con trỏ sang cái mới
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM refresh_token
          WHERE revoked_at IS NOT NULL AND replaced_by_id IS NOT NULL`,
      );
      assert.ok(Number(rows[0]!.n) > 0, 'không bản ghi nào ghi lại việc xoay vòng');
    });

    test('🔒 hai request ĐỒNG THỜI cùng một token — chỉ MỘT được', async () => {
      /*
       * Codex AUTH-001: đọc trạng thái token rồi mới xoay vòng là check-then-act.
       * Hai request song song cùng thấy `revoked_at IS NULL`, cả hai cùng phát
       * token mới — và kết quả là HAI token con cùng sống.
       *
       * 🔒 Hậu quả không chỉ là một bản ghi thừa: cả cơ chế phát hiện token bị
       *    đánh cắp dựa trên "mỗi token dùng đúng MỘT lần". Nếu dùng hai lần mà
       *    không ai báo động, thì kẻ tấn công cầm token cũ cứ thế gia hạn song
       *    song với người dùng thật, vô thời hạn, không để lại dấu vết nào.
       *
       * Hàng đợi một-lần-gia-hạn ở web KHÔNG tính là chặn: nó là mã của client,
       * mà kẻ tấn công thì không chạy client của ta.
       */
      /*
       * Chạy NĂM lượt, không phải một.
       *
       * Cửa sổ đua ở đây rất hẹp: nó chỉ mở nếu request thứ hai ĐỌC trạng thái
       * token trước khi request thứ nhất kịp ghi. Một lượt xanh không chứng
       * minh được gì — nó chỉ nói "lần này hai request không rơi vào đúng cửa
       * sổ đó". Lặp lại làm xác suất bắt được tăng lên, và quan trọng hơn: làm
       * rõ rằng bài này đo một cuộc đua chứ không đo một đường thẳng.
       */
      for (let lan = 1; lan <= 5; lan += 1) {
        await donSachToken();
        const dn = await dangNhapCookie();
        const cookie = gomCookie(dn.cookies);

        const kq = await Promise.allSettled([
          goi('/api/v1/auth/refresh', { method: 'POST', cookie }),
          goi('/api/v1/auth/refresh', { method: 'POST', cookie }),
        ]);
        const thanhCong = kq.filter(
          (r) => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300,
        );
        assert.equal(
          thanhCong.length,
          1,
          `lượt ${lan}: phải đúng 1 request thắng, có ${thanhCong.length}`,
        );

        /*
         * 🔒 Bằng chứng quyết định: một người dùng chỉ được có MỘT token còn
         *    sống sau khi xoay vòng.
         *
         * Đếm "token bị thay thế mà chưa thu hồi" là đếm nhầm — token CON luôn
         * có `replaced_by_id` rỗng, nên câu đó không bao giờ tìm thấy gì và bài
         * test sẽ xanh kể cả khi lỗi có thật.
         */
        const { rows } = await pool.query<{ n: string }>(
          `SELECT count(*) AS n FROM refresh_token
            WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
          [nguoiThu],
        );
        assert.equal(
          Number(rows[0]!.n),
          1,
          `lượt ${lan}: người dùng có ${rows[0]!.n} token còn sống — xoay vòng đã nhân đôi phiên`,
        );
      }
    });

    test('🔒 dùng lại token ĐÃ THU HỒI → thu hồi TOÀN BỘ phiên của người đó', async () => {
      /*
       * Vế đáng giá nhất của cả cơ chế.
       *
       * Token xoay vòng nghĩa là mỗi cái chỉ dùng được một lần. Nếu một cái ĐÃ
       * bị thay thế lại xuất hiện, thì có hai bên đang giữ cùng một token —
       * hoặc kẻ tấn công dùng bản cũ, hoặc người dùng thật dùng bản mà kẻ tấn
       * công đã xoay. Không phân biệt được ai là ai, nên đá cả hai ra.
       */
      await donSachToken();
      const dn = await dangNhapCookie();
      const cookieCu = gomCookie(dn.cookies);

      const lan1 = await goi('/api/v1/auth/refresh', { method: 'POST', cookie: cookieCu });
      assert.equal(lan1.status, 201);
      const cookieMoi = gomCookie(lan1.cookies);

      /*
       * 🔒 Lùi thời điểm thu hồi ra NGOÀI cửa sổ ân hạn.
       *
       * Không có bước này thì bài đo nhầm: dùng lại token trong vài giây kể từ
       * lúc xoay vòng được coi là "thua một cuộc đua" (hai tab, một cú bấm
       * đúp) và cố ý KHÔNG kích hoạt thu hồi toàn bộ. Đó là hành vi đúng, và
       * một bài test đo nhầm nó sẽ ép người sau gỡ bỏ chính lớp bảo vệ ấy.
       *
       * Lùi `revoked_at` một tiếng biến nó thành thứ mà bài này muốn đo: một
       * token cũ, đã bị thay thế từ lâu, nay xuất hiện trở lại — dấu hiệu kinh
       * điển của token bị đánh cắp.
       */
      await pool.query(
        `UPDATE refresh_token SET revoked_at = now() - interval '1 hour'
          WHERE user_id = $1 AND replaced_by_id IS NOT NULL`,
        [nguoiThu],
      );

      // Dùng LẠI cookie cũ — đúng hành vi của một token bị đánh cắp
      const lan2 = await goi('/api/v1/auth/refresh', { method: 'POST', cookie: cookieCu });
      assert.equal(lan2.status, 401, 'token đã thu hồi vẫn dùng được');

      // Và phiên HỢP LỆ cũng phải chết theo — đó là toàn bộ ý nghĩa của luật này
      const lan3 = await goi('/api/v1/auth/refresh', { method: 'POST', cookie: cookieMoi });
      assert.equal(
        lan3.status,
        401,
        'phát hiện dùng lại nhưng KHÔNG thu hồi các phiên còn lại — kẻ tấn công vẫn ở trong',
      );
    });
  });

  test('🔒 thua cuộc đua KHÔNG được đá người dùng ra khỏi hệ thống', async () => {
    /*
     * Vế còn lại của bài đua ở trên, và là lý do cửa sổ ân hạn tồn tại.
     *
     * Hai request gia hạn cùng lúc: một thắng, một thua. Kẻ thua dùng đúng một
     * token vừa bị thay thế — nếu ta coi đó là "token bị đánh cắp" thì phản ứng
     * là thu hồi TOÀN BỘ phiên, và cái bị thu hồi gồm cả token mà kẻ thắng vừa
     * cấp. Kết quả: một cú bấm đúp đăng xuất người dùng.
     *
     * Đó KHÔNG phải giả thuyết — bản đầu của thay đổi này hành xử đúng như vậy,
     * và bài đua ở trên bắt được nó với thông điệp "người dùng có 0 token sống".
     */
    await donSachToken();
    const dn = await dangNhapCookie();
    const cookie = gomCookie(dn.cookies);

    const kq = await Promise.allSettled([
      goi('/api/v1/auth/refresh', { method: 'POST', cookie }),
      goi('/api/v1/auth/refresh', { method: 'POST', cookie }),
    ]);
    const thang = kq.find(
      (r) => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300,
    );
    assert.ok(thang, 'không request nào thắng');

    // Phiên của kẻ thắng phải còn dùng được — đó là toàn bộ điểm của bài này
    const cookieThang = gomCookie(
      (thang as PromiseFulfilledResult<PhanHoi>).value.cookies,
    );
    const me = await goi('/api/v1/auth/me', { cookie: cookieThang });
    assert.equal(me.status, 200, 'phiên vừa cấp đã chết — kẻ thua đá cả kẻ thắng ra');
  });

  test('đăng xuất thu hồi token ở DATABASE, không chỉ xoá cookie', async () => {
    /*
     * Xoá cookie chỉ dọn phía trình duyệt. Nếu refresh token vẫn sống ở
     * database thì bản sao nào đã lọt ra ngoài dùng được thêm 30 ngày — và
     * người vừa bấm "đăng xuất" tin rằng mình đã an toàn.
     */
    const dn = await dangNhapCookie();
    const cookie = gomCookie(dn.cookies);

    const out = await goi('/api/v1/auth/logout', { method: 'POST', cookie });
    assert.equal(out.status, 201, JSON.stringify(out.body));
    assert.ok(
      out.cookies.some((c) => c.startsWith('gos_at=') && /Max-Age=0/.test(c)),
      'không xoá cookie access token',
    );

    const lai = await goi('/api/v1/auth/refresh', { method: 'POST', cookie });
    assert.equal(lai.status, 401, 'refresh token vẫn sống sau khi đăng xuất');
  });
});
