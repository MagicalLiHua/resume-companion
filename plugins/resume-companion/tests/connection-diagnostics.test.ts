import { describe, expect, test, vi } from 'vitest';
import { probeAutoConnect, probeBrowserUrl, sanitizeDiagnosticText } from '../src/browser/connection-diagnostics.js';

function fileError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('Chrome connection diagnostics', () => {
  test('detects the permission proxy when HTTP discovery returns 404', async () => {
    const result = await probeAutoConnect({
      platform: 'darwin',
      homeDir: '/Users/test',
      readText: async () => { throw fileError('ENOENT'); },
      fetch: async () => ({ ok: false, status: 404 }),
    });
    expect(result).toMatchObject({ code: 'permission_proxy_unsupported', permission_state: 'blocked' });
  });

  test('distinguishes a missing ActivePort from disabled remote debugging', async () => {
    const missing = await probeAutoConnect({
      platform: 'darwin',
      homeDir: '/Users/test',
      readText: async () => { throw fileError('ENOENT'); },
      fetch: async () => ({ ok: true, status: 200 }),
    });
    const disabled = await probeAutoConnect({
      platform: 'darwin',
      homeDir: '/Users/test',
      readText: async () => { throw fileError('ENOENT'); },
      fetch: async () => { throw new Error('ECONNREFUSED'); },
    });
    expect(missing.code).toBe('devtools_active_port_missing');
    expect(disabled.code).toBe('remote_debugging_disabled');
  });

  test.each(['EACCES', 'EPERM'])('reports %s as an ActivePort permission failure', async code => {
    const result = await probeAutoConnect({
      platform: 'darwin',
      homeDir: '/Users/test',
      readText: async () => { throw fileError(code); },
      fetch: vi.fn(),
    });
    expect(result).toMatchObject({ code: 'devtools_active_port_permission_denied', permission_state: 'blocked' });
  });

  test('rejects malformed ActivePort without returning its contents', async () => {
    const result = await probeAutoConnect({
      platform: 'darwin',
      homeDir: '/Users/test',
      readText: async () => 'secret-cookie-and-form-value',
    });
    expect(result.code).toBe('devtools_active_port_invalid');
    expect(JSON.stringify(result)).not.toContain('secret-cookie');
  });

  test('detects a permission proxy used as an explicit browser URL', async () => {
    const result = await probeBrowserUrl('http://127.0.0.1:9222', {
      fetch: async () => ({ ok: false, status: 404 }),
    });
    expect(result.code).toBe('permission_proxy_unsupported');
  });

  test('redacts endpoints, headers, cookies and form values from diagnostics', () => {
    const raw = 'ws://127.0.0.1:9222/devtools/browser/private-token Cookie=session-secret Authorization=Bearer-secret value=resume-secret';
    const sanitized = sanitizeDiagnosticText(raw);
    expect(sanitized).not.toContain('private-token');
    expect(sanitized).not.toContain('session-secret');
    expect(sanitized).not.toContain('Bearer-secret');
    expect(sanitized).not.toContain('resume-secret');
  });
});
