import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { canonicalizeRichTextDocument, RichTextDocumentV1 } from '@garageos/contracts';

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
