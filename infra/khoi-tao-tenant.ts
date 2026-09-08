/**
 * Khởi tạo MỘT garage trên database production — chạy đúng một lần, lúc mới
 * dựng hệ thống.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Vì sao script này tồn tại
 *
 * Sau `pnpm db:migrate`, database production có đủ 83 bảng và **không có một
 * dòng dữ liệu nào**. Không tenant, không chi nhánh, không người dùng — nghĩa
 * là không ai đăng nhập được, và không có đường nào tạo tài khoản đầu tiên qua
 * giao diện (mọi màn quản trị đều sau `JwtGuard`).
 *
 * 🔒 `pnpm db:seed` KHÔNG dùng được ở đây, và khoảng cách giữa hai script này là
 *    lý do phải có hai script:
 *
 *      · `seed.ts` mở đầu bằng `TRUNCATE` toàn bộ bảng. Trên máy dev đó là tính
 *        năng — mỗi lượt seed cho một trạng thái đã biết. Trên production đó là
 *        xoá sạch dữ liệu khách hàng.
 *      · `seed.ts` tạo 13 tài khoản demo với mật khẩu mặc định `demo1234`, kèm
 *        xe mẫu, đơn mẫu, bài viết mẫu.
 *
 *    Script này ngược lại: KHÔNG xoá gì, KHÔNG tạo dữ liệu mẫu, và từ chối chạy
 *    nếu database đã có tenant.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Dùng
 *
 *   DATABASE_ADMIN_URL=postgresql://... \
 *   TENANT_NAME="Garage Thành Công" \
 *   TENANT_TAX_CODE=0101234567 \
 *   BRANCH_CODE=HN01 \
 *   BRANCH_NAME="Chi nhánh Hà Nội" \
 *   OWNER_PHONE=0901234567 \
 *   OWNER_NAME="Nguyễn Văn A" \
 *   OWNER_PASSWORD='<mật khẩu mạnh>' \
 *   pnpm khoi-tao:tenant
 *
 * Thêm `--thu` để chạy thử: kiểm mọi thứ, in ra sẽ tạo gì, rồi rollback.
 *
 * ⚠️ Chạy bằng `DATABASE_ADMIN_URL` (chủ schema) chứ không phải role ứng dụng.
 *    Role ứng dụng bị RLS chặn: nó chỉ ghi được vào tenant hiện tại, mà lúc này
 *    chưa có tenant nào để làm "hiện tại".
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { bamMatKhau } from '../packages/domain/src/mat-khau.ts';

const ADMIN_URL = process.env.DATABASE_ADMIN_URL;

/** Mật khẩu ngắn hơn ngần này thì từ chối — đây là tài khoản CHỦ CHUỖI. */
const DAI_MAT_KHAU_TOI_THIEU = 12;

interface ThamSo {
  tenTenant: string;
  maSoThue: string | null;
  giaGioNoiBo: number;
  maChiNhanh: string;
  tenChiNhanh: string;
  soDienThoai: string;
  hoTen: string;
  matKhau: string;
}

function batBuoc(ten: string): string {
  const v = process.env[ten];
  if (v === undefined || v.trim() === '') {
    throw new Error(`Thiếu biến môi trường ${ten}`);
  }
  return v.trim();
}

/**
 * Số điện thoại phải khớp đúng thứ mà màn đăng nhập gửi lên.
 *
 * 🔒 `auth.service.ts` tra người dùng bằng phép so bằng chính xác trên cột
 *    `phone`. Lưu `+84901234567` rồi gõ `0901234567` là hai chuỗi khác nhau —
 *    tài khoản chủ chuỗi tồn tại mà không đăng nhập được, và thông báo hiện ra
 *    là "sai số điện thoại hoặc mật khẩu". Chuẩn hoá ngay tại cửa vào.
 */
export function chuanHoaSoDienThoai(raw: string): string {
  const so = raw.replace(/[\s.-]/g, '');
  const noiDia = so.startsWith('+84') ? `0${so.slice(3)}` : so.startsWith('84') ? `0${so.slice(2)}` : so;
  if (!/^0\d{9}$/.test(noiDia)) {
    throw new Error(`Số điện thoại không hợp lệ: "${raw}" — cần 10 số bắt đầu bằng 0`);
  }
  return noiDia;
}

function docThamSo(): ThamSo {
  const matKhau = batBuoc('OWNER_PASSWORD');
  if (matKhau.length < DAI_MAT_KHAU_TOI_THIEU) {
    throw new Error(
      `OWNER_PASSWORD quá ngắn (${matKhau.length} ký tự, cần ≥ ${DAI_MAT_KHAU_TOI_THIEU}). ` +
        'Đây là tài khoản thấy được toàn bộ dữ liệu của chuỗi.',
    );
  }
  /*
   * 🔒 Chặn thẳng mật khẩu demo. Nghe thừa — nhưng đường đi tự nhiên nhất của
   *    người deploy là chép lệnh trong tài liệu rồi đổi vài chỗ, và `demo1234`
   *    là chuỗi công khai trong repo.
   */
  if (/^demo/i.test(matKhau)) {
    throw new Error('OWNER_PASSWORD không được bắt đầu bằng "demo" — đó là mật khẩu của dữ liệu mẫu.');
  }

  const gia = Number(process.env.TENANT_LABOR_COST ?? '120000');
  if (!Number.isInteger(gia) || gia <= 0) {
    throw new Error('TENANT_LABOR_COST phải là số nguyên dương (đồng/giờ)');
  }

  return {
    tenTenant: batBuoc('TENANT_NAME'),
    maSoThue: process.env.TENANT_TAX_CODE?.trim() ?? null,
    giaGioNoiBo: gia,
    maChiNhanh: batBuoc('BRANCH_CODE').toUpperCase(),
    tenChiNhanh: batBuoc('BRANCH_NAME'),
    soDienThoai: chuanHoaSoDienThoai(batBuoc('OWNER_PHONE')),
    hoTen: batBuoc('OWNER_NAME'),
    matKhau,
  };
}

async function main(): Promise<void> {
  const thu = process.argv.includes('--thu');

  if (ADMIN_URL === undefined || ADMIN_URL === '') {
    throw new Error('Thiếu DATABASE_ADMIN_URL — script này cần quyền chủ schema, xem chú thích đầu file');
  }
  const ts = docThamSo();

  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();

  try {
    await db.query('BEGIN');

    /*
     * ⚠️ TẮT `FORCE ROW LEVEL SECURITY` trên `tenant` trong đúng giao dịch này.
     *
     * Trên Docker ở máy dev, chủ schema là SUPERUSER nên RLS không đụng tới nó
     * và không ai thấy vấn đề. Trên Postgres quản lý (Neon, Supabase, RDS)
     * không ai là superuser, nên `FORCE` áp lên cả chủ bảng — và script này
     * hỏng theo HAI cách, chỉ một cách là nhìn thấy được:
     *
     *   · lượt `INSERT` bị chặn: "new row violates row-level security policy"
     *   · 🔒 nguy hiểm hơn: phép đếm ở dưới đi qua RLS nên LUÔN trả 0, và hàng
     *     rào "database đã có tenant" mất tác dụng trong im lặng — đúng loại
     *     hỏng mà cả script này được viết ra để chống.
     *
     * DDL trong PostgreSQL có tính giao dịch, nên `ROLLBACK` (kể cả khi lỗi,
     * kể cả `--thu`) tự khôi phục `FORCE`. Không có đường nào rời hàm này mà
     * để bảng ở trạng thái yếu hơn.
     */
    await db.query('ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY');

    /*
     * 🔒 Từ chối khi database đã có tenant.
     *
     * Chạy lại script này trên một hệ thống đang hoạt động sẽ tạo thêm một
     * doanh nghiệp thứ hai — cô lập hoàn toàn, không ai nhìn thấy nó, và cũng
     * không có màn hình nào để xoá đi. Thà không chạy còn hơn.
     *
     * Đếm trong cùng giao dịch: hai lượt chạy song song thì lượt sau thấy lượt
     * trước chưa commit và cả hai cùng tạo — nên còn một chốt nữa ở dưới.
     */
    const { rows: dem } = await db.query<{ n: string }>('SELECT count(*) AS n FROM tenant');
    if (Number(dem[0]?.n ?? 0) > 0) {
      const { rows: co } = await db.query<{ name: string }>('SELECT name FROM tenant ORDER BY created_at');
      throw new Error(
        `Database đã có ${dem[0]?.n} tenant (${co.map((t) => t.name).join(', ')}). ` +
          'Script này chỉ dùng cho database mới migrate xong. ' +
          'Thêm chi nhánh và người dùng cho tenant đang có thì làm bằng giao diện quản trị.',
      );
    }

    /*
     * Sinh id ở đây thay vì để `DEFAULT gen_random_uuid()` làm, để đặt được
     * `app.tenant_id` TRƯỚC khi ghi. Ba bảng còn lại (`branch`, `app_user`,
     * `user_branch`) đều có policy `tenant_id = current_setting('app.tenant_id')`
     * và vẫn FORCE — không có biến này thì cả ba lượt ghi đều bị chặn.
     *
     * 🔒 Truyền bằng THAM SỐ, không nội suy chuỗi (CLAUDE.md, quy tắc tenant).
     */
    const tenantId = randomUUID();
    await db.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

    await db.query(
      `INSERT INTO tenant (id, name, tax_code, internal_labor_cost_per_hour)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, ts.tenTenant, ts.maSoThue, ts.giaGioNoiBo],
    );

    const { rows: branch } = await db.query<{ id: string }>(
      `INSERT INTO branch (tenant_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, ts.maChiNhanh, ts.tenChiNhanh],
    );
    const branchId = branch[0]!.id;

    const { rows: user } = await db.query<{ id: string }>(
      `INSERT INTO app_user (tenant_id, phone, password_hash, full_name, roles)
       VALUES ($1, $2, $3, $4, ARRAY['OWNER']::user_role[]) RETURNING id`,
      [tenantId, ts.soDienThoai, bamMatKhau(ts.matKhau), ts.hoTen],
    );
    const userId = user[0]!.id;

    /*
     * ⚠️ `OWNER` có phạm vi TENANT, nhưng vẫn phải có dòng `user_branch`.
     *
     * Nhiều truy vấn vận hành lọc theo chi nhánh mà người dùng được gán, kể cả
     * với vai toàn tenant. Thiếu dòng này thì chủ chuỗi đăng nhập được và thấy
     * một hệ thống trống rỗng — hỏng theo kiểu khó lần nhất, vì không có lỗi.
     */
    await db.query(
      'INSERT INTO user_branch (tenant_id, user_id, branch_id) VALUES ($1, $2, $3)',
      [tenantId, userId, branchId],
    );

    /* Chốt thứ hai cho hai lượt chạy song song — xem chú thích ở phép đếm trên. */
    const { rows: lai } = await db.query<{ n: string }>('SELECT count(*) AS n FROM tenant');
    if (Number(lai[0]?.n ?? 0) !== 1) {
      throw new Error('Có lượt chạy khác cùng lúc đã tạo tenant — đã huỷ lượt này.');
    }

    await db.query('ALTER TABLE tenant FORCE ROW LEVEL SECURITY');

    if (thu) {
      await db.query('ROLLBACK');
      console.log('\n  --thu: đã kiểm mọi thứ rồi HUỶ, không ghi gì vào database.\n');
    } else {
      await db.query('COMMIT');
    }

    console.log(`  Doanh nghiệp : ${ts.tenTenant}${ts.maSoThue === null ? '' : ` (MST ${ts.maSoThue})`}`);
    console.log(`  Chi nhánh    : ${ts.maChiNhanh} — ${ts.tenChiNhanh}`);
    console.log(`  Chủ chuỗi    : ${ts.hoTen} · đăng nhập bằng ${ts.soDienThoai}`);
    console.log(`  Giá giờ nội bộ: ${ts.giaGioNoiBo.toLocaleString('vi-VN')} đ/giờ`);
    if (!thu) {
      console.log('\n  Xong. Đăng nhập vào web xưởng bằng số điện thoại trên và mật khẩu bạn đã đặt.');
      console.log('  Các chi nhánh và nhân viên còn lại: thêm bằng giao diện, không chạy lại script này.\n');
    }
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await db.end();
  }
}

/*
 * 🔒 Chỉ chạy `main()` khi file được gọi TRỰC TIẾP.
 *
 * Bài kiểm cần import `chuanHoaSoDienThoai` để thử từng dạng số một cách nhanh
 * và chính xác. Không có cửa này thì mỗi lượt import là một lượt chạy script
 * khởi tạo — đúng thứ mà `infra/seed.ts` đang mắc, và là lý do bài kiểm của nó
 * phải gọi qua tiến trình con.
 *
 * So bằng URL thật thay vì so đuôi đường dẫn: cho một câu trả lời trên cả
 * Windows lẫn POSIX, và không phải né dấu gạch chéo ngược.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
