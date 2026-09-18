import { describe, expect, test } from 'vitest';
import { normalizeBrowserError } from '../src/browser/errors.js';

describe('browser error normalization', () => {
  test('follows the cause chain for ActivePort permission failures', () => {
    const cause = Object.assign(new Error("EPERM: operation not permitted, open '/Users/test/Library/Application Support/Google/Chrome/DevToolsActivePort'"), { code: 'EPERM' });
    const outer = new Error('Could not connect to Chrome', { cause });
    expect(normalizeBrowserError(outer)).toMatchObject({ code: 'devtools_active_port_permission_denied' });
  });

  test('distinguishes approval from a genuine transport disconnect', () => {
    expect(normalizeBrowserError(new Error('Please approve the connection by clicking Allow'), { endpointReady: true })).toMatchObject({ code: 'browser_approval_required' });
    expect(normalizeBrowserError(new Error('WebSocket transport closed'), { endpointReady: true })).toMatchObject({ code: 'browser_disconnected' });
  });

  test('does not expose unclassified browser or form data', () => {
    const secret = 'Cookie=session-secret value=private-resume-field https://jobs.example/private';
    const normalized = normalizeBrowserError(new Error(secret));
    expect(normalized.code).toBe('driver_unavailable');
    expect(normalized.message).not.toContain('session-secret');
    expect(normalized.message).not.toContain('private-resume-field');
    expect(normalized.message).not.toContain('jobs.example');
  });
});
