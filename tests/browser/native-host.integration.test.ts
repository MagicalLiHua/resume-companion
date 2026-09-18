import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, RESUME_COMPANION_EXTENSION_ID } from '../../shared/browser-bridge.js';
import { NativeBridgeServer } from '../../plugins/resume-companion/src/browser/native-bridge-server.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()?.(); });

describe('native host end-to-end relay', () => {
  test('relays authenticated MCP requests through Chrome framing in both directions', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'resume-native-host-'));
    const bridge = new NativeBridgeServer(dataDir, 2_000);
    await bridge.ensureStarted();
    const host = spawn(process.execPath, [resolve('native-host/host.bundle.mjs'), `chrome-extension://${RESUME_COMPANION_EXTENSION_ID}/`], { env: { ...process.env, RESUME_COMPANION_DATA_DIR: dataDir }, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
    cleanup.push(async () => { host.kill('SIGTERM'); await bridge.close(); await rm(dataDir, { recursive: true, force: true }); });
    writeNative(host, { kind: 'extension_hello', protocol: BRIDGE_PROTOCOL_VERSION, extension_version: '0.1.0' });
    expect(await readNative(host)).toEqual({ kind: 'bridge_ready', protocol: BRIDGE_PROTOCOL_VERSION });
    expect(bridge.state()).toMatchObject({ connected: true, extension_version: '0.1.0' });
    const result = bridge.request('tabs', { current_window_only: false });
    const request = await readNative(host) as Record<string, unknown>;
    expect(request).toMatchObject({ kind: 'request', method: 'tabs', params: { current_window_only: false } });
    writeNative(host, { kind: 'response', protocol: BRIDGE_PROTOCOL_VERSION, id: request.id, ok: true, result: { tabs: [{ tabId: 19, url: 'https://jobs.example/' }] } });
    await expect(result).resolves.toEqual({ tabs: [{ tabId: 19, url: 'https://jobs.example/' }] });
    expect((await readFile(join(dataDir, 'bridge', 'active.json'), 'utf8'))).not.toContain('jobs.example');
  });
});

function writeNative(host: ChildProcessWithoutNullStreams, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.byteLength, 0);
  host.stdin.write(Buffer.concat([header, body]));
}

function readNative(host: ChildProcessWithoutNullStreams): Promise<unknown> {
  return new Promise((resolveValue, reject) => {
    let buffer = Buffer.alloc(0);
    const data = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.byteLength < 4) return;
      const length = buffer.readUInt32LE(0);
      if (buffer.byteLength < length + 4) return;
      cleanupListeners();
      resolveValue(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
    };
    const error = (cause: Error): void => { cleanupListeners(); reject(cause); };
    const cleanupListeners = (): void => { host.stdout.off('data', data); host.off('error', error); };
    host.stdout.on('data', data);
    host.on('error', error);
  });
}
