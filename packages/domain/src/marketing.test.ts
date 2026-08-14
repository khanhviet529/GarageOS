import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostname, normalizeSlug, scopeForAction } from './marketing.js';
import type { ActorContext } from '@garageos/contracts';

describe('P1-UT-001 — normalizeHostname (SRS 7.1 bước 3)', () => {
  test('lowercase, bỏ port và dấu chấm cuối', () => {
    assert.equal(normalizeHostname('WWW.Garage.VN:443'), 'www.garage.vn');
    assert.equal(normalizeHostname('garage.vn.'), 'garage.vn');
    assert.equal(normalizeHostname('  Garage.VN  '), 'garage.vn');
  });

  test('từ chối ký tự ngoài ASCII/punycode và label rỗng', () => {
    assert.equal(normalizeHostname('garage.vn/xe'), null);
    assert.equal(normalizeHostname('gàrage.vn'), null);
    assert.equal(normalizeHostname('-bad.vn'), null);
    assert.equal(normalizeHostname(''), null);
    assert.equal(normalizeHostname('a..b'), null);
  });
});

describe('normalizeSlug', () => {
  test('chuẩn hoá tiếng Việt về kebab-case ASCII', () => {
    assert.equal(normalizeSlug('VinFast VF 3'), 'vinfast-vf-3');
    assert.equal(normalizeSlug('  Xe   Điện  '), 'xe-dien');
  });
  test('từ chối slug rỗng sau chuẩn hoá', () => {
    assert.equal(normalizeSlug('!!!'), null);
  });
});

describe('P1-UT-007 — scopeForAction (SRS 5.1)', () => {
  const actor = (roles: string[]): ActorContext => ({
    tenantId: '11111111-1111-1111-1111-111111111111',
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    roles: roles as ActorContext['roles'],
    branchIds: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
  });

  test('OWNER → TENANT', () => {
    assert.equal(scopeForAction(actor(['OWNER']), 'sales:leadRead'), 'TENANT');
  });
  test('SALES_MANAGER → BRANCH', () => {
    assert.equal(scopeForAction(actor(['SALES_MANAGER']), 'sales:leadRead'), 'BRANCH');
  });
  test('SALES_ADVISOR → SELF', () => {
    assert.equal(scopeForAction(actor(['SALES_ADVISOR']), 'sales:leadRead'), 'SELF');
  });
  test('MARKETING_EDITOR + SALES_ADVISOR vẫn SELF — marketing không nâng scope sales', () => {
    assert.equal(
      scopeForAction(actor(['MARKETING_EDITOR', 'SALES_ADVISOR']), 'sales:leadRead'),
      'SELF',
    );
  });
  test('MARKETING_EDITOR + SALES_MANAGER → BRANCH', () => {
    assert.equal(
      scopeForAction(actor(['MARKETING_EDITOR', 'SALES_MANAGER']), 'sales:leadRead'),
      'BRANCH',
    );
  });
  test('action marketing luôn TENANT (tenant-wide catalog)', () => {
    assert.equal(scopeForAction(actor(['SALES_ADVISOR']), 'marketing:catalogRead'), 'TENANT');
  });

  test('🔒 action không nhận ra rơi về SELF, không phải TENANT', () => {
    /*
     * Fail-closed. Bản trước trả TENANT cho mọi thứ không bắt đầu bằng
     * `sales:` — nên một lỗi gõ phím ở tên action mở toàn bộ lead của tenant
     * cho một tư vấn bán hàng.
     *
     * Kiểu `ScopedAction` chặn được ở thời điểm biên dịch; bài này canh hành vi
     * lúc chạy, cho trường hợp giá trị đến từ nơi TypeScript không nhìn thấy
     * (cấu hình, JSON, một lời gọi ép kiểu).
     */
    assert.equal(
      scopeForAction(actor(['SALES_ADVISOR']), 'sale:leadRead' as never),
      'SELF',
      'action gõ sai lại được phạm vi rộng nhất',
    );
    assert.equal(scopeForAction(actor(['OWNER']), 'khong-biet:gi' as never), 'SELF');
  });
});
