import { describe, expect, test } from 'vitest';
import { maskSensitiveValue } from '../src/browser/form-engine.js';

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
});
