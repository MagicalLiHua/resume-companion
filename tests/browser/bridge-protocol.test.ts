import { describe, expect, test } from 'vitest';
import { BRIDGE_MAX_MESSAGE_BYTES, BRIDGE_PROTOCOL_VERSION, assertBridgeMessage, publicBridgeError } from '../../shared/browser-bridge.js';

describe('browser bridge wire protocol', () => {
  test('accepts bounded typed requests and rejects oversized payloads', () => {
    expect(() => assertBridgeMessage({ kind: 'request', protocol: BRIDGE_PROTOCOL_VERSION, id: '1', method: 'tabs', params: {}, deadline: Date.now() + 1_000 })).not.toThrow();
    expect(() => assertBridgeMessage({ kind: 'request', protocol: BRIDGE_PROTOCOL_VERSION, id: '1', method: 'tabs', params: { value: 'x'.repeat(BRIDGE_MAX_MESSAGE_BYTES) }, deadline: 1 })).toThrow('512 KiB');
  });

  test('publishes only a bounded code and message from extension errors', () => {
    const result = publicBridgeError(new Error('blocked: 最终提交由用户完成'));
    expect(result).toEqual({ code: 'blocked', message: '最终提交由用户完成' });
    expect(JSON.stringify(result)).not.toContain('Cookie');
  });
});
