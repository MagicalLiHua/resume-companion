import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { BrowserDebugBridge } from '../src/browser/debug-bridge.js';

const cleanups: string[] = [];
afterEach(async () => {
  while (cleanups.length) await rm(cleanups.pop()!, { recursive: true, force: true });
});

describe('read-only browser debug bridge', () => {
  test.skipIf(process.platform === 'win32')('serves one bounded local JSON request without acquiring another profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'resume-debug-'));
    cleanups.push(root);
    const bridge = new BrowserDebugBridge(join(root, 'chrome-profile'), async request => ({ echoed: request.command }));
    await bridge.start();
    const response = await new Promise<string>((resolveResponse, reject) => {
      const socket = createConnection(bridge.endpoint);
      let output = '';
      socket.setEncoding('utf8');
      socket.once('connect', () => socket.write(`${JSON.stringify({ command: 'status' })}\n`));
      socket.on('data', chunk => { output += chunk; });
      socket.once('end', () => resolveResponse(output));
      socket.once('error', reject);
    });
    expect(JSON.parse(response)).toEqual({ ok: true, result: { echoed: 'status' } });
    await bridge.close();
  });
});
