import { createConnection, type Socket } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, RESUME_COMPANION_EXTENSION_ID } from '../../../shared/browser-bridge.js';
import { NativeBridgeServer } from '../src/browser/native-bridge-server.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()?.(); });

describe('Native Messaging IPC bridge', () => {
  test('requires a private descriptor and authenticated extension origin before forwarding requests', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'resume-native-bridge-'));
    const bridge = new NativeBridgeServer(dataDir, 1_000);
    cleanups.push(async () => { await bridge.close(); await rm(dataDir, { recursive: true, force: true }); });
    await bridge.ensureStarted();
    const descriptor = JSON.parse(await readFile(join(dataDir, 'bridge', 'active.json'), 'utf8')) as Record<string, unknown>;
    expect((await stat(join(dataDir, 'bridge', 'active.json'))).mode & 0o077).toBe(0);
    const socket = await connect(String(descriptor.socket_path));
    cleanups.push(async () => { socket.destroy(); });
    socket.write(`${JSON.stringify({ kind: 'hello', protocol: BRIDGE_PROTOCOL_VERSION, token: descriptor.token, extension_origin: `chrome-extension://${RESUME_COMPANION_EXTENSION_ID}/`, extension_version: '0.1.0', host_pid: 123 })}\n`);
    expect(await readLine(socket)).toEqual({ kind: 'bridge_ready', protocol: BRIDGE_PROTOCOL_VERSION });
    expect(bridge.state()).toMatchObject({ connected: true, extension_version: '0.1.0' });

    const resultPromise = bridge.request('tabs', { current_window_only: true });
    const request = await readLine(socket) as Record<string, unknown>;
    expect(request).toMatchObject({ kind: 'request', protocol: BRIDGE_PROTOCOL_VERSION, method: 'tabs', params: { current_window_only: true } });
    socket.write(`${JSON.stringify({ kind: 'response', protocol: BRIDGE_PROTOCOL_VERSION, id: request.id, ok: true, result: { tabs: [{ tabId: 7 }] } })}\n`);
    await expect(resultPromise).resolves.toEqual({ tabs: [{ tabId: 7 }] });
  });

  test('clears the connection and creates a fresh request after transport loss', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'resume-native-reconnect-'));
    const bridge = new NativeBridgeServer(dataDir, 250);
    cleanups.push(async () => { await bridge.close(); await rm(dataDir, { recursive: true, force: true }); });
    await bridge.ensureStarted();
    const descriptor = JSON.parse(await readFile(join(dataDir, 'bridge', 'active.json'), 'utf8')) as Record<string, unknown>;
    const authenticate = async (): Promise<Socket> => {
      const socket = await connect(String(descriptor.socket_path));
      socket.write(`${JSON.stringify({ kind: 'hello', protocol: BRIDGE_PROTOCOL_VERSION, token: descriptor.token, extension_origin: `chrome-extension://${RESUME_COMPANION_EXTENSION_ID}/`, extension_version: '0.1.0', host_pid: 123 })}\n`);
      await readLine(socket);
      return socket;
    };
    const first = await authenticate();
    first.destroy();
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(bridge.request('tabs', {})).rejects.toMatchObject({ code: 'bridge_disconnected' });
    const second = await authenticate();
    cleanups.push(async () => { second.destroy(); });
    const retry = bridge.request('tabs', {});
    const request = await readLine(second) as Record<string, unknown>;
    second.write(`${JSON.stringify({ kind: 'response', protocol: BRIDGE_PROTOCOL_VERSION, id: request.id, ok: true, result: { tabs: [] } })}\n`);
    await expect(retry).resolves.toEqual({ tabs: [] });
  });

  test('closing an older task does not remove a newer task descriptor', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'resume-native-ownership-'));
    const first = new NativeBridgeServer(dataDir, 250);
    const second = new NativeBridgeServer(dataDir, 250);
    cleanups.push(async () => { await first.close(); await second.close(); await rm(dataDir, { recursive: true, force: true }); });
    await first.ensureStarted();
    await second.ensureStarted();
    const before = JSON.parse(await readFile(join(dataDir, 'bridge', 'active.json'), 'utf8')) as Record<string, unknown>;
    await first.close();
    const after = JSON.parse(await readFile(join(dataDir, 'bridge', 'active.json'), 'utf8')) as Record<string, unknown>;
    expect(after).toEqual(before);
    expect(await stat(String(after.socket_path))).toBeTruthy();
  });
});

function connect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path, () => resolve(socket));
    socket.once('error', reject);
  });
}

function readLine(socket: Socket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const data = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const index = buffer.indexOf('\n');
      if (index < 0) return;
      cleanup();
      resolve(JSON.parse(buffer.slice(0, index)));
    };
    const error = (cause: Error): void => { cleanup(); reject(cause); };
    const cleanup = (): void => { socket.off('data', data); socket.off('error', error); };
    socket.on('data', data);
    socket.on('error', error);
  });
}
