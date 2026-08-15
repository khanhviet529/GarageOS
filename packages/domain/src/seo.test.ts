import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPageTitle, shouldNoIndex, canonicalUrl } from './seo.js';

describe('SEO-META-002 — buildPageTitle', () => {
  test('template {pageTitle} | {brandName}', () => {
    assert.equal(buildPageTitle('VinFast VF 3', 'Garage Thành Công'), 'VinFast VF 3 | Garage Thành Công');
  });
  test('không có suffix thì giữ title', () => {
    assert.equal(buildPageTitle('Trang chủ', ''), 'Trang chủ');
  });
});

describe('SEO-META-006 — shouldNoIndex', () => {
  test('môi trường khác production thì noindex', () => {
    assert.equal(shouldNoIndex('development'), true);
    assert.equal(shouldNoIndex('test'), true);
    assert.equal(shouldNoIndex('production'), false);
  });
});

describe('SEO-URL-001 — canonicalUrl', () => {
  test('ghép origin + path tuyệt đối, bỏ slash thừa', () => {
    assert.equal(canonicalUrl('https://garage.vn/', '/xe/vinfast-vf-3'), 'https://garage.vn/xe/vinfast-vf-3');
    assert.equal(canonicalUrl('https://garage.vn', '/xe'), 'https://garage.vn/xe');
  });
});
