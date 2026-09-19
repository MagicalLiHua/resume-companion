import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = resolve(process.argv[2] ?? '');
const environment = Object.fromEntries(Object.entries(process.env).filter((item) => typeof item[1] === 'string'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  cwd: resolve(entry, '..'),
  env: environment,
  stderr: 'pipe',
});
const client = new Client({ name: 'resume-companion-live-profile-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const result = await client.callTool({ name: 'list_pages', arguments: {} });
  assert(!result.isError, 'Installed launcher did not list pages');
  console.log('Installed launcher opened the persistent Resume Companion Chrome profile and listed pages: OK');
} finally {
  await client.close().catch(() => undefined);
}
