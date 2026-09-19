import { describe, expect, test } from 'vitest';
import { maskSensitiveValue } from '../src/browser/form-engine.js';
import { redactBrowserText } from '../src/browser/privacy.js';

describe('Resume Browser privacy serialization', () => {
  test('masks common personal identifiers before they can enter tool output', () => {
    expect(maskSensitiveValue('手机号', '13800001234')).toBe('138****1234');
    expect(maskSensitiveValue('电子邮箱', 'semantic@example.test')).toBe('se******@example.test');
    expect(maskSensitiveValue('身份证号', '110101200001011234')).toBe('110***********1234');
    expect(maskSensitiveValue('家庭地址', '杭州市西湖区示例路 1 号')).toBe('杭州市西湖区示例路 1 号'.slice(0, 2) + '***' + '杭州市西湖区示例路 1 号'.slice(-2));
  });

  test('does not expose short sensitive values', () => {
    expect(maskSensitiveValue('账号', '1234')).toBe('<masked>');
  });

  test('redacts identifiers and birth dates from raw accessibility snapshots', () => {
    const snapshot = [
      'textbox "手机号" disabled value="13800001234"',
      'textbox "身份证号码" readonly value="11010120000101123X"',
      'textbox "电子邮箱" value="person@example.com"',
      'textbox "出生日期" disabled value="2000-01-02"',
      'textbox "银行卡" value="6222021234567890123"',
    ].join('\n');
    const redacted = redactBrowserText(snapshot);
    expect(redacted).toContain('138****1234');
    expect(redacted).toContain('110***********123X');
    expect(redacted).toContain('pe******@example.com');
    expect(redacted).toContain('出生日期" disabled value="<masked>"');
    expect(redacted).not.toContain('6222021234567890123');
    expect(redacted).not.toContain('11010120000101123X');
  });
});
