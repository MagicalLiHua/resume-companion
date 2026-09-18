import { describe, expect, test } from 'vitest';
import { evaluateSafety, inferEffect } from '../src/browser/safety-policy.js';

describe('shared safety policy', () => {
  test.each([
    ['确认并提交申请', 'button', 'final_submit'],
    ['立即投递', 'button', 'final_submit'],
    ['我同意隐私条款', 'checkbox', 'declaration'],
    ['短信验证码', 'textbox', 'verification'],
    ['登录密码', 'textbox', 'password'],
    ['上传简历附件', 'button', 'upload'],
    ['删除工作经历', 'button', 'deletion'],
  ])('blocks %s', (name, role, reason) => {
    const decision = evaluateSafety({ name, role });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toContain(reason);
  });

  test('keeps ordinary saves and next steps available', () => {
    expect(evaluateSafety({ name: '保存教育经历', role: 'button' })).toMatchObject({ blocked: false, effect: 'save_record' });
    expect(evaluateSafety({ name: '下一步', role: 'button' })).toMatchObject({ blocked: false, effect: 'advance_step' });
    expect(inferEffect('保存草稿')).toBe('save_draft');
  });

  test('declared final submit cannot be disguised by a harmless label', () => {
    expect(evaluateSafety({ name: '继续', role: 'button', effect: 'final_submit' }).blocked).toBe(true);
  });

  test('blocks a next button when it is inside the final review context', () => {
    expect(evaluateSafety({ name: '下一步', role: 'button', context: '最终核对申请 / 星河银行' })).toMatchObject({
      blocked: true,
      effect: 'final_submit',
    });
  });
});
