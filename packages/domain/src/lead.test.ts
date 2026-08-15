import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVnPhone,
  validateLeadTransition,
  isLeadClosed,
} from './lead.js';
import type { LeadStatus } from '@garageos/contracts';

describe('P1-UT-001 — normalizeVnPhone', () => {
  test('chuẩn hoá 84/+84 về 0', () => {
    assert.equal(normalizeVnPhone('0901234567'), '0901234567');
    assert.equal(normalizeVnPhone('+84 90 123 4567'), '0901234567');
    assert.equal(normalizeVnPhone('84901234567'), '0901234567');
  });
  test('từ chối số không hợp lệ', () => {
    assert.equal(normalizeVnPhone('12345'), null);
    assert.equal(normalizeVnPhone('abc'), null);
  });
});

describe('P1-UT-002 — lead transition matrix (SRS 9)', () => {
  test('NEW → CONTACTED / LOST hợp lệ', () => {
    assert.equal(validateLeadTransition('NEW', { to: 'CONTACTED', version: 1 }), null);
    assert.equal(
      validateLeadTransition('NEW', { to: 'LOST', version: 1, lostReason: 'OTHER' }),
      null,
    );
  });
  test('CONTACTED → QUALIFIED / LOST hợp lệ', () => {
    assert.equal(validateLeadTransition('CONTACTED', { to: 'QUALIFIED', version: 1 }), null);
  });
  test('LOST bắt buộc có lý do', () => {
    assert.match(
      validateLeadTransition('NEW', { to: 'LOST', version: 1 }) ?? '',
      /bắt buộc chọn lý do/,
    );
  });
  test('chuyển ngược không hợp lệ', () => {
    assert.notEqual(validateLeadTransition('QUALIFIED', { to: 'NEW', version: 1 }), null);
    assert.notEqual(validateLeadTransition('LOST', { to: 'NEW', version: 1 }), null);
  });
  test('lý do mất không áp dụng cho transition khác LOST', () => {
    assert.notEqual(
      validateLeadTransition('NEW', { to: 'CONTACTED', version: 1, lostReason: 'OTHER' }),
      null,
    );
  });
});

describe('isLeadClosed', () => {
  test('LOST là trạng thái đóng', () => {
    assert.equal(isLeadClosed('LOST'), true);
    assert.equal(isLeadClosed('NEW' as LeadStatus), false);
  });
});
