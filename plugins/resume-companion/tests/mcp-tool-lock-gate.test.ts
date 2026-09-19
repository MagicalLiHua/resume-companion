import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { McpToolLockGate } from '../src/mcp-tool-lock-gate.js';

function message(id: number, method: string): Buffer {
  return Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id, method, params: method === 'tools/call' ? { name: 'list_pages', arguments: {} } : {} })}\n`);
}

describe('lazy MCP tool lock gate', () => {
  test('forwards discovery without a lock and acquires once on the first tool call', async () => {
    const upstream = new PassThrough();
    const clientOutput = new PassThrough();
    const forwarded: Buffer[] = [];
    upstream.on('data', chunk => forwarded.push(chunk));
    let acquisitions = 0;
    const gate = new McpToolLockGate(upstream, clientOutput, async () => { acquisitions += 1; });

    gate.push(Buffer.concat([message(1, 'initialize'), message(2, 'tools/list')]));
    await gate.flush();
    expect(acquisitions).toBe(0);
    expect(Buffer.concat(forwarded).toString()).toContain('tools/list');

    gate.push(message(3, 'tools/call'));
    gate.push(message(4, 'tools/call'));
    await gate.flush();
    expect(acquisitions).toBe(1);
    expect(Buffer.concat(forwarded).toString()).toContain('"id":3');
    expect(Buffer.concat(forwarded).toString()).toContain('"id":4');
  });

  test('returns a retryable error without forwarding when another task owns the profile', async () => {
    const upstream = new PassThrough();
    const clientOutput = new PassThrough();
    const forwarded: Buffer[] = [];
    const responses: Buffer[] = [];
    upstream.on('data', chunk => forwarded.push(chunk));
    clientOutput.on('data', chunk => responses.push(chunk));
    let acquisitions = 0;
    const gate = new McpToolLockGate(upstream, clientOutput, async () => {
      acquisitions += 1;
      if (acquisitions === 1) throw new Error('profile_in_use: Resume Companion 专用 Chrome 正由另一个任务使用；请关闭那个任务后重试');
    });

    gate.push(message(7, 'tools/call'));
    await gate.flush();
    expect(Buffer.concat(forwarded).length).toBe(0);
    expect(Buffer.concat(responses).toString()).toContain('profile_in_use');
    expect(Buffer.concat(responses).toString()).toContain('"id":7');

    gate.push(message(8, 'tools/call'));
    await gate.flush();
    expect(acquisitions).toBe(2);
    expect(Buffer.concat(forwarded).toString()).toContain('"id":8');
  });

  test('does not expose an unexpected filesystem error to the MCP client', async () => {
    const upstream = new PassThrough();
    const clientOutput = new PassThrough();
    const responses: Buffer[] = [];
    clientOutput.on('data', chunk => responses.push(chunk));
    const gate = new McpToolLockGate(upstream, clientOutput, async () => {
      throw new Error('EACCES /Users/example/Library/Application Support/Google/Chrome/Cookies');
    });

    gate.push(message(9, 'tools/call'));
    await gate.flush();
    const response = Buffer.concat(responses).toString();
    expect(response).toContain('profile_lock_failed');
    expect(response).not.toContain('/Users/example');
    expect(response).not.toContain('Cookies');
  });
});
