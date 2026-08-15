import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Role, ROLE_LABEL, SCOPE_OF_ROLE, canDo, ACTION_ROLES,
} from '@garageos/contracts';

describe('P1-UT-004 — permission matrix (SRS 5.1/5.2)', () => {
  test('mọi vai đều có SCOPE và LABEL (exhaustiveness)', () => {
    for (const role of Role.options) {
      assert.ok(role in SCOPE_OF_ROLE, `thiếu scope cho ${role}`);
      assert.ok(role in ROLE_LABEL, `thiếu label cho ${role}`);
    }
  });

  test('marketing:catalogRead — editor/publisher/advisor/manager/owner', () => {
    assert.equal(canDo(['MARKETING_EDITOR'], 'marketing:catalogRead'), true);
    assert.equal(canDo(['SALES_ADVISOR'], 'marketing:catalogRead'), true);
    assert.equal(canDo(['TECHNICIAN'], 'marketing:catalogRead'), false);
  });

  test('marketing:catalogPublish — chỉ publisher/manager/owner', () => {
    assert.equal(canDo(['MARKETING_EDITOR'], 'marketing:catalogPublish'), false);
    assert.equal(canDo(['MARKETING_PUBLISHER'], 'marketing:catalogPublish'), true);
    assert.equal(canDo(['SALES_MANAGER'], 'marketing:catalogPublish'), true);
  });

  test('sales:leadAssign — chỉ manager/owner; advisor KHÔNG được tự gán', () => {
    assert.equal(canDo(['SALES_ADVISOR'], 'sales:leadAssign'), false);
    assert.equal(canDo(['SALES_MANAGER'], 'sales:leadAssign'), true);
  });

  test('sales:leadTransition/leadRead — advisor được', () => {
    assert.equal(canDo(['SALES_ADVISOR'], 'sales:leadTransition'), true);
    assert.equal(canDo(['SALES_ADVISOR'], 'sales:leadRead'), true);
    assert.equal(canDo(['TECHNICIAN'], 'sales:leadRead'), false);
  });

  test('vai mới KHÔNG tự có quyền GarageOS cũ', () => {
    assert.equal(canDo(['MARKETING_EDITOR'], 'repairOrder:create'), false);
    assert.equal(canDo(['MARKETING_EDITOR'], 'quotation:read'), false);
    assert.equal(canDo(['SALES_MANAGER'], 'stock:issue'), false);
    assert.equal(canDo(['SALES_ADVISOR'], 'invoice:read'), false);
  });

  test('OWNER có quyền marketing/sales tường minh', () => {
    assert.equal(canDo(['OWNER'], 'marketing:catalogPublish'), true);
    assert.equal(canDo(['OWNER'], 'marketing:seoPublish'), true);
    assert.equal(canDo(['OWNER'], 'sales:leadAssign'), true);
  });

  test('mọi action mới phải có label cho thông báo lỗi', async () => {
    const { ACTION_LABEL } = await import('@garageos/contracts');
    for (const action of Object.keys(ACTION_ROLES)) {
      assert.ok(action in ACTION_LABEL, `thiếu label cho action ${action}`);
    }
  });
});
