import { describe, expect, test } from 'vitest';
import { configuredDriver } from '../src/browser/driver-factory.js';

describe('browser driver selection', () => {
  test('uses DevTools by default and validates explicit values', () => {
    expect(configuredDriver(undefined)).toBe('devtools');
    expect(configuredDriver('extension')).toBe('extension');
    expect(configuredDriver('auto')).toBe('auto');
    expect(() => configuredDriver('other')).toThrow(/devtools/);
  });
});
