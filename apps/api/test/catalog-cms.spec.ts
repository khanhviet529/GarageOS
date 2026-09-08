import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { canonicalizeRichTextDocument, FaqSurface, RichTextDocumentV1 } from '@garageos/contracts';

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? 'postgresql://garageos:garageos_dev@localhost:5433/garageos';
const APP_URL = process.env.DATABASE_URL ?? 'postgresql://garageos_app:garageos_app_dev@localhost:5433/garageos';
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const uniq = `${Date.now()}-${process.pid}`;
let admin: Pool; let app: Pool; let editor = ''; let publisher = ''; let ownerB = ''; let categoryId = ''; let testimonialId = '';

async function login(phone: string): Promise<string> {
  const response = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' }, body: JSON.stringify({ phone, password: 'demo1234' }) });
  const body = await response.json() as { accessToken?: string };
  assert.ok(body.accessToken); return body.accessToken;
}
async function api(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
function hostSignature(host: string): string { return createHmac('sha256', process.env.EDGE_SIGNING_SECRET ?? 'test-edge-secret').update(host).digest('hex'); }

before(async () => { admin = new Pool({ connectionString: ADMIN_URL }); app = new Pool({ connectionString: APP_URL }); [editor, publisher, ownerB] = await Promise.all([login('0901000010'), login('0901000011'), login('0902000001')]); });
after(async () => { await admin.query('DELETE FROM testimonial WHERE display_name LIKE $1', [`CMS test ${uniq}%`]); await admin.query('DELETE FROM vehicle_product_category WHERE slug LIKE $1', [`cms-test-${uniq}%`]); await admin.end(); await app.end(); });

describe('Catalog CMS — tenant, lifecycle and FK guards', () => {
  test('rich-text canonical serialization is deterministic and rejects unsafe markup', () => {
    const a = RichTextDocumentV1.parse({ type: 'doc', schemaVersion: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ổn định', marks: [{ type: 'link', attrs: { href: 'https://garageos.vn' } }] }] }] });
    const b = { schemaVersion: 1, content: [{ content: [{ marks: [{ attrs: { href: 'https://garageos.vn' }, type: 'link' }], text: 'Ổn định', type: 'text' }], type: 'paragraph' }], type: 'doc' };
    assert.equal(canonicalizeRichTextDocument(a), canonicalizeRichTextDocument(RichTextDocumentV1.parse(b)));
    assert.throws(() => RichTextDocumentV1.parse({ type: 'doc', schemaVersion: 1, content: [{ type: 'script' }] }));
  });

  test('category CRUD is tenant-scoped and deletion is restricted by product FK', async () => {
    const create = await api('POST', '/api/v1/marketing/categories', editor, { name: `CMS test ${uniq}`, slug: `cms-test-${uniq}`, status: 'ACTIVE', sortOrder: 0 });
    assert.equal(create.status, 201); categoryId = create.body.id as string;
    const listed = await api('GET', '/api/v1/marketing/categories', editor); assert.equal(listed.status, 200); assert.ok(listed.body.items.some((item: { id: string }) => item.id === categoryId));
    const other = await api('PATCH', `/api/v1/marketing/categories/${categoryId}`, ownerB, { name: 'Other tenant', slug: 'other-tenant', status: 'ACTIVE', sortOrder: 0, version: 0 });
    assert.equal(other.status, 409, 'cross-tenant category must not be visible or writable');
    const product = await admin.query<{ id: string }>('SELECT id FROM vehicle_product WHERE tenant_id=$1 LIMIT 1', [TENANT_A]);
    await admin.query('UPDATE vehicle_product SET category_id=$1 WHERE id=$2', [categoryId, product.rows[0]!.id]);
    const blocked = await api('DELETE', `/api/v1/marketing/categories/${categoryId}`, editor); assert.equal(blocked.status, 409);
    await admin.query('UPDATE vehicle_product SET category_id=NULL WHERE id=$1', [product.rows[0]!.id]);
    const removed = await api('DELETE', `/api/v1/marketing/categories/${categoryId}`, editor); assert.equal(removed.status, 200);
  });

  test('testimonial lifecycle is enforced and public API exposes only PUBLISHED', async () => {
    const create = await api('POST', '/api/v1/marketing/testimonials', editor, { displayName: `CMS test ${uniq}`, content: 'Nội dung testimonial kiểm thử', rating: 5, featured: true, sortOrder: 0 });
    assert.equal(create.status, 201); testimonialId = create.body.id as string;
    const draftPublic = await fetch(`${API}/api/v1/public/testimonials`, { headers: { 'x-garageos-original-host': 'localhost', 'x-garageos-original-host-signature': hostSignature('localhost') } });
    assert.equal(draftPublic.status, 200); assert.equal((await draftPublic.json() as { items: { id: string }[] }).items.some((item) => item.id === testimonialId), false);
    const publish = await api('POST', `/api/v1/marketing/testimonials/${testimonialId}/publish`, publisher); assert.equal(publish.status, 201);
    const publishedPublic = await fetch(`${API}/api/v1/public/testimonials`, { headers: { 'x-garageos-original-host': 'localhost', 'x-garageos-original-host-signature': hostSignature('localhost') } });
    assert.equal((await publishedPublic.json() as { items: { id: string }[] }).items.some((item) => item.id === testimonialId), true);
    const repeat = await api('POST', `/api/v1/marketing/testimonials/${testimonialId}/publish`, publisher); assert.equal(repeat.status, 409);
    const hide = await api('POST', `/api/v1/marketing/testimonials/${testimonialId}/hide`, publisher); assert.equal(hide.status, 201);
  });

  test('RLS prevents app role from reading another tenant', async () => {
    const client = await app.connect();
    try { await client.query('BEGIN'); await client.query("SELECT set_config('app.tenant_id',$1,true)", [TENANT_B]); const rows = await client.query('SELECT id FROM testimonial WHERE tenant_id=$1', [TENANT_A]); assert.equal(rows.rowCount, 0); } finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
  });
});

describe('🔒 Câu hỏi thường gặp — công bố và bề mặt là HAI cửa khác nhau', () => {
  /*
   * Khối FAQ trên landing lọc bằng hai điều kiện độc lập: `status='PUBLISHED'`
   * và `faq_placement.enabled` cho đúng bề mặt. Bỏ sót một trong hai là đẩy nội
   * dung chưa duyệt ra trang công khai.
   *
   * Seed dựng sẵn hai ca đối chứng, và chúng KHÁC LOẠI nhau:
   *   · "Xe điện sạc ở đâu?"        — gắn CONTACT nhưng còn DRAFT
   *   · "Pin xe điện bảo hành..."   — đã PUBLISHED nhưng chỉ gắn VEHICLE
   * Một bài kiểm chỉ có một trong hai sẽ xanh dù thiếu hẳn một điều kiện lọc.
   */
  async function congKhai(duong: string): Promise<{ status: number; body: any }> {
    const r = await fetch(`${API}${duong}`, {
      headers: {
        'x-garageos-original-host': 'localhost',
        'x-garageos-original-host-signature': hostSignature('localhost'),
      },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  test('landing chỉ nhận câu ĐÃ CÔNG BỐ và ĐÚNG bề mặt', async () => {
    const r = await congKhai('/api/v1/public/faq?surface=CONTACT');
    assert.equal(r.status, 200);
    const hoi = (r.body.items as { question: string }[]).map((c) => c.question);

    assert.ok(hoi.includes('Lái thử có mất phí không?'), 'câu đã công bố ở CONTACT phải hiện');
    assert.equal(
      hoi.includes('Xe điện sạc ở đâu?'),
      false,
      'câu còn NHÁP lọt ra trang công khai — thiếu điều kiện status',
    );
    assert.equal(
      hoi.includes('Pin xe điện bảo hành bao lâu?'),
      false,
      'câu chỉ gắn bề mặt VEHICLE lọt vào CONTACT — thiếu điều kiện surface',
    );
  });

  test('cùng một câu, bề mặt khác thì kết quả khác', async () => {
    const xe = await congKhai('/api/v1/public/faq?surface=VEHICLE');
    assert.equal(xe.status, 200);
    const hoi = (xe.body.items as { question: string }[]).map((c) => c.question);
    assert.ok(hoi.includes('Pin xe điện bảo hành bao lâu?'));
    assert.equal(hoi.includes('Mua xe ở đây có bắt buộc bảo dưỡng ở đây không?'), false);
  });

  test('🔒 thiếu hoặc sai `surface` bị từ chối, không âm thầm trả cả thư viện', async () => {
    assert.equal((await congKhai('/api/v1/public/faq')).status, 400);
    assert.equal((await congKhai('/api/v1/public/faq?surface=FAQ')).status, 400,
      'bề mặt FAQ KHÔNG tồn tại — không có trang FAQ riêng (SRS §4.10)');
  });

  test('biên tập viên tạo, sửa và gắn bề mặt; công bố là quyền KHÁC', async () => {
    const tao = await api('POST', '/api/v1/marketing/faq-items', editor, {
      question: `Câu thử ${uniq}?`,
      answer: 'Trả lời thử.',
      topic: 'Thử',
      displayOrder: 90,
      surfaces: ['CONTACT'],
    });
    assert.equal(tao.status, 201, JSON.stringify(tao.body));
    const id = tao.body.id as string;

    // Chưa công bố thì landing không thấy
    const truoc = await congKhai('/api/v1/public/faq?surface=CONTACT');
    assert.equal((truoc.body.items as { id: string }[]).some((c) => c.id === id), false);

    // 🔒 Biên tập viên KHÔNG công bố được
    const camCongBo = await api('POST', `/api/v1/marketing/faq-items/${id}/publish`, editor);
    assert.equal(camCongBo.status, 403, 'biên tập viên không được tự công bố');

    const congBo = await api('POST', `/api/v1/marketing/faq-items/${id}/publish`, publisher);
    assert.equal(congBo.status, 201, JSON.stringify(congBo.body));

    const sau = await congKhai('/api/v1/public/faq?surface=CONTACT');
    assert.ok((sau.body.items as { id: string }[]).some((c) => c.id === id));

    /*
     * 🔒 Sửa được KHI ĐANG PUBLISHED — khác testimonial, và có lý do.
     * Testimonial là lời của người khác; câu hỏi thường gặp là lời của chính
     * xưởng, và một câu trả lời SAI đang hiện trên trang thì thứ cần nhất là
     * sửa được ngay.
     */
    const sua = await api('PATCH', `/api/v1/marketing/faq-items/${id}`, editor, {
      question: `Câu thử ${uniq}?`,
      answer: 'Trả lời đã sửa.',
      topic: 'Thử',
      displayOrder: 90,
      surfaces: ['CONTACT'],
      version: 1,
    });
    assert.equal(sua.status, 200, JSON.stringify(sua.body));
    const daSua = await congKhai('/api/v1/public/faq?surface=CONTACT');
    assert.equal(
      (daSua.body.items as { id: string; answer: string }[]).find((c) => c.id === id)?.answer,
      'Trả lời đã sửa.',
    );

    // Bỏ hết bề mặt thì biến khỏi trang, dù vẫn PUBLISHED
    const goBeMat = await api('PATCH', `/api/v1/marketing/faq-items/${id}`, editor, {
      question: `Câu thử ${uniq}?`,
      answer: 'Trả lời đã sửa.',
      topic: 'Thử',
      displayOrder: 90,
      surfaces: [],
      version: 2,
    });
    assert.equal(goBeMat.status, 200, JSON.stringify(goBeMat.body));
    const cuoi = await congKhai('/api/v1/public/faq?surface=CONTACT');
    assert.equal((cuoi.body.items as { id: string }[]).some((c) => c.id === id), false);

    assert.equal((await api('DELETE', `/api/v1/marketing/faq-items/${id}`, editor)).status, 200);
  });

  test('🔒 tenant khác không đọc và không sửa được câu hỏi của tenant này', async () => {
    const cua = await api('GET', '/api/v1/marketing/faq-items', publisher);
    const idA = (cua.body.items as { id: string }[])[0]!.id;
    const cuaB = await api('GET', '/api/v1/marketing/faq-items', ownerB);
    assert.equal(
      (cuaB.body.items as { id: string }[]).some((c) => c.id === idA),
      false,
      'RLS phải chặn — INV-T-01',
    );
    const sua = await api('PATCH', `/api/v1/marketing/faq-items/${idA}`, ownerB, {
      question: 'Chiếm', answer: 'Chiếm', topic: null, displayOrder: 0, surfaces: [], version: 0,
    });
    assert.equal(sua.status, 409);
  });

  test('🔒 enum bề mặt ở TypeScript khớp enum ở database', async () => {
    /*
     * Hai bản của cùng một danh sách: `FaqSurface` trong contracts và
     * `faq_surface` trong migration 0076. Lệch nhau thì một giá trị hợp lệ ở
     * tầng này bị từ chối ở tầng kia — và lỗi hiện ra dưới dạng 500 chứ không
     * phải một câu nói được điều gì sai.
     */
    const { rows } = await admin.query<{ v: string }>(
      `SELECT unnest(enum_range(NULL::faq_surface))::text AS v`,
    );
    assert.deepEqual(rows.map((r) => r.v).sort(), [...FaqSurface.options].sort());
  });
});

describe('🔒 Bài viết — nháp không lọt ra, và chỉ MỘT bài nổi bật', () => {
  async function congKhai(duong: string): Promise<{ status: number; body: any }> {
    const r = await fetch(`${API}${duong}`, {
      headers: {
        'x-garageos-original-host': 'localhost',
        'x-garageos-original-host-signature': hostSignature('localhost'),
      },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  test('landing chỉ thấy bài ĐÃ ĐĂNG, bài nổi bật đứng đầu', async () => {
    const r = await congKhai('/api/v1/public/articles');
    assert.equal(r.status, 200);
    const slugs = (r.body.items as { slug: string; featured: boolean }[]);

    assert.ok(slugs.some((b) => b.slug === 'chi-phi-thuc-te-khi-nuoi-mot-chiec-xe-dien'));
    assert.equal(
      slugs.some((b) => b.slug === 'bao-duong-mua-mua'),
      false,
      'bài chỉ có bản NHÁP lọt ra landing — nội dung chưa duyệt trên trang thật',
    );
    assert.equal(slugs[0]?.featured, true, 'bài nổi bật phải đứng đầu danh sách');
  });

  test('🔒 truy cập THẲNG bài chưa đăng trả 404, không trả nội dung nháp', async () => {
    const r = await congKhai('/api/v1/public/articles/bao-duong-mua-mua');
    assert.equal(r.status, 404, 'slug của bài nháp không được trả nội dung');
  });

  test('🔒 đúng MỘT bài nổi bật — đặt bài thứ hai thì bài thứ nhất tự nhường', async () => {
    /*
     * `uq_article_one_featured` là partial unique index (0077): hai dòng
     * `featured = true` cùng tenant là lỗi ở tầng database. Service gỡ bài cũ
     * TRƯỚC trong cùng transaction, nên thao tác "đổi bài nổi bật" làm được bằng
     * một lần bấm thay vì hai.
     */
    const ds = await api('GET', '/api/v1/marketing/articles', publisher);
    assert.equal(ds.status, 200, JSON.stringify(ds.body));
    const items = ds.body.items as { id: string; slug: string; featured: boolean }[];
    const cu = items.find((a) => a.featured);
    const khac = items.find((a) => !a.featured && a.slug === 'sau-dieu-can-kiem-truoc-khi-nhan-xe');
    assert.ok(cu !== undefined && khac !== undefined, 'seed phải có một bài nổi bật và một bài thường');

    const doi = await api('POST', `/api/v1/marketing/articles/${khac.id}/featured?on=true`, publisher);
    assert.equal(doi.status, 201, JSON.stringify(doi.body));

    const sau = await api('GET', '/api/v1/marketing/articles', publisher);
    const noiBat = (sau.body.items as { id: string; featured: boolean }[]).filter((a) => a.featured);
    assert.deepEqual(noiBat.map((a) => a.id), [khac.id], 'phải còn đúng một bài nổi bật, và là bài mới');

    // Trả seed về trạng thái cũ để bài kiểm khác không phụ thuộc thứ tự chạy
    await api('POST', `/api/v1/marketing/articles/${cu.id}/featured?on=true`, publisher);
  });

  test('vòng soạn → đăng: biên tập viên soạn, chỉ người có quyền mới đăng', async () => {
    const slug = `bai-thu-${uniq}`.replace(/[^a-z0-9-]/g, '-');
    const tao = await api('POST', '/api/v1/marketing/articles', editor, {
      slug,
      title: 'Bài thử tự động',
    });
    assert.equal(tao.status, 201, JSON.stringify(tao.body));
    const id = tao.body.id as string;

    // Bài mới LUÔN có sẵn một bản nháp — không có trạng thái "bài không sửa được"
    const nhap = await api('GET', `/api/v1/marketing/articles/${id}/draft`, editor);
    assert.equal(nhap.status, 200, JSON.stringify(nhap.body));
    assert.equal(nhap.body.revisionNumber, 1);

    const sua = await api('PATCH', `/api/v1/marketing/articles/${id}/draft`, editor, {
      title: 'Bài thử tự động',
      excerpt: 'Tóm tắt thử.',
      bodyDocument: {
        type: 'doc',
        schemaVersion: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nội dung thử.' }] }],
      },
      tags: ['thử'],
      version: nhap.body.version,
    });
    assert.equal(sua.status, 200, JSON.stringify(sua.body));

    // Chưa đăng thì landing không thấy
    assert.equal((await congKhai(`/api/v1/public/articles/${slug}`)).status, 404);

    // 🔒 Biên tập viên KHÔNG đăng được
    assert.equal(
      (await api('POST', `/api/v1/marketing/articles/${id}/publish`, editor)).status,
      403,
      'biên tập viên không được tự đăng bài',
    );

    assert.equal((await api('POST', `/api/v1/marketing/articles/${id}/publish`, publisher)).status, 201);
    const daDang = await congKhai(`/api/v1/public/articles/${slug}`);
    assert.equal(daDang.status, 200);
    assert.equal(daDang.body.excerpt, 'Tóm tắt thử.');
    assert.deepEqual(daDang.body.tags, ['thử']);

    /*
     * 🔒 Sửa bài ĐÃ ĐĂNG không đổi thứ khách đang đọc, cho tới khi đăng lại.
     *
     * Mở bản nháp lần này CHÉP từ bản đang hiện — đó là chỗ dễ sai nhất của mọi
     * vòng nháp/duyệt: chép nhầm hoặc trỏ nhầm con trỏ là bản nháp ghi đè thẳng
     * lên bản công khai.
     */
    const nhap2 = await api('GET', `/api/v1/marketing/articles/${id}/draft`, editor);
    assert.equal(nhap2.body.revisionNumber, 2, 'phải tạo bản sửa số 2 từ bản đã đăng');
    await api('PATCH', `/api/v1/marketing/articles/${id}/draft`, editor, {
      title: 'Bài thử tự động',
      excerpt: 'Tóm tắt ĐÃ SỬA.',
      bodyDocument: nhap2.body.bodyDocument,
      tags: ['thử'],
      version: nhap2.body.version,
    });
    const vanCu = await congKhai(`/api/v1/public/articles/${slug}`);
    assert.equal(vanCu.body.excerpt, 'Tóm tắt thử.', 'bản nháp đã ghi đè lên bản công khai');

    await api('POST', `/api/v1/marketing/articles/${id}/publish`, publisher);
    const moi = await congKhai(`/api/v1/public/articles/${slug}`);
    assert.equal(moi.body.excerpt, 'Tóm tắt ĐÃ SỬA.');
  });

  test('🔒 INV-LS-10 — khối ngoài danh sách bị từ chối trước khi chạm database', async () => {
    const ds = await api('GET', '/api/v1/marketing/articles', editor);
    const id = (ds.body.items as { id: string }[])[0]!.id;
    const nhap = await api('GET', `/api/v1/marketing/articles/${id}/draft`, editor);
    const xau = await api('PATCH', `/api/v1/marketing/articles/${id}/draft`, editor, {
      title: 'Thử chèn mã',
      bodyDocument: {
        type: 'doc',
        schemaVersion: 1,
        content: [{ type: 'html', html: '<script>alert(1)</script>' }],
      },
      tags: [],
      version: nhap.body.version,
    });
    assert.equal(xau.status, 400, 'khối `html` phải bị Zod từ chối');
  });

  test('🔒 tenant khác không thấy bài của tenant này', async () => {
    const cuaB = await api('GET', '/api/v1/marketing/articles', ownerB);
    const slugs = (cuaB.body.items as { slug: string }[]).map((a) => a.slug);
    assert.equal(slugs.includes('sau-dieu-can-kiem-truoc-khi-nhan-xe'), false, 'RLS phải chặn — INV-T-01');
  });
});

describe('🔒 Điều hướng — mục trỏ tới trang không có thật phải TỰ ẩn', () => {
  async function congKhai(duong: string): Promise<{ status: number; body: any }> {
    const r = await fetch(`${API}${duong}`, {
      headers: {
        'x-garageos-original-host': 'localhost',
        'x-garageos-original-host-signature': hostSignature('localhost'),
      },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  test('menu đầu trang lấy từ dữ liệu, đúng thứ tự đã khai', async () => {
    const r = await congKhai('/api/v1/public/navigation?placement=HEADER');
    assert.equal(r.status, 200);
    const nhan = (r.body.items as { label: string }[]).map((m) => m.label);
    assert.deepEqual(nhan, ['Xe đang bán', 'Giá lăn bánh', 'Tin tức', 'Liên hệ']);
  });

  test('🔒 mục trỏ tới trang chưa có KHÔNG lọt ra landing', async () => {
    /*
     * SRS-LS-EXP-001 §4.10: "Menu trỏ tới trang chưa publish phải tự ẩn, không
     * chờ người sửa nhớ tắt — link gãy trên trang bán hàng đắt hơn một mục menu
     * thiếu."
     *
     * Đây là hàng rào của HỆ THỐNG, khác với cờ `visible` là chốt của NGƯỜI
     * DÙNG. Bài này thử đúng hàng rào hệ thống: mục `visible = true`, trỏ tới
     * một đường dẫn không có route nào.
     */
    const tao = await api('POST', '/api/v1/marketing/navigation', publisher, {
      placement: 'HEADER',
      columnIndex: 0,
      label: `Trang ma ${uniq}`,
      path: '/khong-ton-tai',
      displayOrder: 900,
      visible: true,
    });
    assert.equal(tao.status, 201, JSON.stringify(tao.body));

    const cong = await congKhai('/api/v1/public/navigation?placement=HEADER');
    assert.equal(
      (cong.body.items as { label: string }[]).some((m) => m.label === `Trang ma ${uniq}`),
      false,
      'mục trỏ tới trang không có thật đã lọt ra menu công khai',
    );

    // Nhưng admin VẪN thấy nó — nếu không, người nhập sẽ tưởng hệ thống nuốt mất
    const admin = await api('GET', '/api/v1/marketing/navigation', publisher);
    assert.ok((admin.body.items as { label: string }[]).some((m) => m.label === `Trang ma ${uniq}`));

    const id = (admin.body.items as { id: string; label: string }[]).find(
      (m) => m.label === `Trang ma ${uniq}`,
    )!.id;
    await api('DELETE', `/api/v1/marketing/navigation/${id}`, publisher);
  });

  test('🔒 mỗi mục đúng MỘT đích — không có đích, hoặc cả hai, đều bị từ chối', async () => {
    const khong = await api('POST', '/api/v1/marketing/navigation', publisher, {
      placement: 'HEADER', columnIndex: 0, label: 'Không đích', displayOrder: 0, visible: true,
    });
    assert.equal(khong.status, 400, 'mục không có đích là một chữ không bấm được');

    const caHai = await api('POST', '/api/v1/marketing/navigation', publisher, {
      placement: 'HEADER', columnIndex: 0, label: 'Hai đích', path: '/xe',
      externalUrl: 'https://vidu.vn', displayOrder: 0, visible: true,
    });
    assert.equal(caHai.status, 400, 'hai đích thì mỗi chỗ render sẽ chọn khác nhau');
  });

  test('chuyển hướng tra được, và vòng lặp bị chặn', async () => {
    const co = await congKhai('/api/v1/public/redirect?path=/tin-tuc-cu');
    assert.equal(co.status, 200);
    assert.equal(co.body.to, '/tin-tuc');
    assert.equal(co.body.statusCode, 301);

    // Không có chuyển hướng thì 200 kèm `to: null`, KHÔNG phải 404 — middleware
    // cần phân biệt "không có" với "hệ thống hỏng".
    const khong = await congKhai('/api/v1/public/redirect?path=/khong-co-gi');
    assert.equal(khong.status, 200);
    assert.equal(khong.body.to, null);

    /*
     * 🔒 Vòng HAI BƯỚC. Ràng buộc `redirect_khong_tu_tro` ở database chỉ bắt
     *    được `/a → /a`; vòng dài hơn cho ra đúng cùng một kết quả trên trình
     *    duyệt (ERR_TOO_MANY_REDIRECTS) nên nó phải bị chặn ở tầng service.
     */
    const a = `/vong-a-${uniq}`;
    const b = `/vong-b-${uniq}`;
    const buoc1 = await api('POST', '/api/v1/marketing/redirects', publisher, { fromPath: a, toPath: b });
    assert.equal(buoc1.status, 201, JSON.stringify(buoc1.body));
    const buoc2 = await api('POST', '/api/v1/marketing/redirects', publisher, { fromPath: b, toPath: a });
    assert.equal(buoc2.status, 409, 'vòng lặp hai bước phải bị chặn');

    await api('DELETE', `/api/v1/marketing/redirects/${buoc1.body.id}`, publisher);
  });

  test('🔒 biên tập viên KHÔNG sửa được menu — quyền ghi hẹp hơn quyền soạn nội dung', async () => {
    const r = await api('POST', '/api/v1/marketing/navigation', editor, {
      placement: 'HEADER', columnIndex: 0, label: 'Thử', path: '/xe', displayOrder: 0, visible: true,
    });
    assert.equal(r.status, 403);
  });
});

describe('🔒 Biểu mẫu — câu đồng ý là BẰNG CHỨNG, không phải một dòng chữ giao diện', () => {
  async function congKhai(duong: string): Promise<{ status: number; body: any }> {
    const r = await fetch(`${API}${duong}`, {
      headers: {
        'x-garageos-original-host': 'localhost',
        'x-garageos-original-host-signature': hostSignature('localhost'),
      },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  test('landing lấy câu đồng ý từ dữ liệu, không từ chuỗi trong mã', async () => {
    const r = await congKhai('/api/v1/public/lead-form');
    assert.equal(r.status, 200);
    assert.equal(r.body.consentBody, 'Tôi đồng ý để showroom liên hệ tư vấn theo thông tin đã cung cấp');
    assert.equal(r.body.showMessageField, true);
  });

  test('🔒 phiên bản câu đồng ý KHÔNG sửa và KHÔNG xoá được, kể cả bằng quyền app', async () => {
    /*
     * `lead_form_consent_version` là bảng CHỈ-THÊM (0079) — cùng khuôn với
     * `audit_log` và `vehicle_price_log` (INV-S-03).
     *
     * Kiểm bằng chính role của ứng dụng, không qua API: một endpoint không tồn
     * tại chỉ chứng minh controller chưa có đường vào, không chứng minh dữ liệu
     * được bảo vệ. Trigger ở database là thứ canh điều đó.
     */
    const { rows } = await admin.query<{ id: string }>(
      `SELECT v.id FROM lead_form_consent_version v LIMIT 1`,
    );
    const id = rows[0]!.id;
    const tx = await app.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await assert.rejects(
        tx.query('UPDATE lead_form_consent_version SET body = $2 WHERE id = $1', [id, 'Sửa trộm']),
        /bằng chứng|permission denied/i,
      );
      await tx.query('ROLLBACK');

      await tx.query('BEGIN');
      await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await assert.rejects(
        tx.query('DELETE FROM lead_form_consent_version WHERE id = $1', [id]),
        /bằng chứng|permission denied/i,
      );
      await tx.query('ROLLBACK');
    } finally {
      tx.release();
    }
  });

  test('🔒 lead ghi phiên bản câu đồng ý ĐANG HIỆU LỰC, không phải hằng số trong mã', async () => {
    /*
     * Trước 0079, `sales_lead.consent_version` luôn là `'2026-08-1'` — một hằng
     * số trong `sales.service.ts`. Đổi câu chữ mà quên đổi hằng số thì lead cũ
     * và lead mới cùng mang một nhãn cho hai nội dung khác nhau.
     *
     * Bài này thêm một phiên bản mới rồi gửi lead thật, và đòi lead mang nhãn
     * MỚI. Nếu ai đó khôi phục lại hằng số, bài đỏ.
     */
    const pb = `thu-${uniq}`;
    const them = await api('POST', '/api/v1/marketing/lead-form/consent-versions', publisher, {
      version: pb,
      body: `Câu đồng ý thử ${uniq}`,
    });
    assert.equal(them.status, 201, JSON.stringify(them.body));

    // Landing thấy ngay câu mới
    const cong = await congKhai('/api/v1/public/lead-form');
    assert.equal(cong.body.consentBody, `Câu đồng ý thử ${uniq}`);

    const { rows: br } = await admin.query<{ id: string }>(
      `SELECT id FROM branch WHERE tenant_id = $1 ORDER BY code LIMIT 1`,
      [TENANT_A],
    );
    const ten = `Khách consent ${uniq}`;
    const gui = await fetch(`${API}/api/v1/public/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-garageos-original-host': 'localhost',
        'x-garageos-original-host-signature': hostSignature('localhost'),
      },
      body: JSON.stringify({
        fullName: ten,
        // `uniq` có dấu gạch nối — số điện thoại phải là CHỮ SỐ, lấy riêng.
        phone: `096${Date.now().toString().slice(-7)}`,
        branchId: br[0]!.id,
        intent: 'TEST_DRIVE',
        consentAccepted: true,
      }),
    });
    assert.equal(gui.status, 201, await gui.text());

    const { rows: lead } = await admin.query<{ consent_version: string }>(
      'SELECT consent_version FROM sales_lead WHERE full_name = $1',
      [ten],
    );
    assert.equal(
      lead[0]?.consent_version,
      pb,
      'lead vẫn ghi hằng số trong mã thay vì phiên bản đang hiệu lực',
    );

    await admin.query('DELETE FROM lead_activity WHERE lead_id IN (SELECT id FROM sales_lead WHERE full_name=$1)', [ten]);
    await admin.query('DELETE FROM sales_lead WHERE full_name = $1', [ten]);

    /*
     * Dọn phiên bản vừa thêm, bằng role `garageos` chứ không phải role ứng dụng.
     *
     * 🔒 Bảng chặn SỬA/XOÁ với `garageos_app` — đó là điều bài kiểm phía trên
     *    chứng minh. Chủ schema thì vẫn xoá được, và phải thế: migration và bài
     *    kiểm cần dọn được dữ liệu của chính chúng. Không dọn thì bài kiểm kế
     *    tiếp thấy một câu đồng ý khác câu seed và đỏ vì lý do không liên quan.
     */
    await admin.query('DELETE FROM lead_form_consent_version WHERE version = $1', [pb]);
  });

  test('🔒 trùng nhãn phiên bản bị từ chối kèm lời giải thích', async () => {
    const r = await api('POST', '/api/v1/marketing/lead-form/consent-versions', publisher, {
      version: '2026-08-1',
      body: 'Câu khác cho cùng một nhãn',
    });
    assert.equal(r.status, 409);
    assert.match(String(r.body.error.message), /không sửa được|đã tồn tại/i);
  });

  test('🔒 biên tập viên đọc được nhưng KHÔNG sửa được câu đồng ý', async () => {
    assert.equal((await api('GET', '/api/v1/marketing/lead-form', editor)).status, 200);
    const sua = await api('PUT', '/api/v1/marketing/lead-form', editor, {
      successTitle: 'Thử', successBody: '', showMessageField: true, showBranchField: true,
    });
    assert.equal(sua.status, 403, 'câu đồng ý là văn bản pháp lý — sửa nó không giống sửa một tiêu đề');
  });
});
