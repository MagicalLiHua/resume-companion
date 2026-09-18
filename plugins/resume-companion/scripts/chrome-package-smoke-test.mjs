import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = resolve(process.argv[2] ?? '');
const profileDir = await mkdtemp(join(tmpdir(), 'resume-companion-chrome-package-'));
const environment = Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === 'string'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  cwd: dirname(entry),
  env: { ...environment, RESUME_COMPANION_CHROME_DATA_DIR: profileDir, RESUME_COMPANION_CHROME_HEADLESS: '1' },
  stderr: 'pipe',
});
const client = new Client({ name: 'resume-companion-chrome-package-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map(tool => tool.name);
  for (const required of ['list_pages', 'take_snapshot', 'fill_form', 'list_network_requests', 'evaluate_script']) assert(names.includes(required), `Missing ${required}`);
  assert(!names.includes('click_at'), 'Experimental vision tool must remain disabled');
  console.log('Packaged Chrome launcher starts the pinned official MCP tool catalog: OK');
} finally {
  await client.close().catch(() => undefined);
  await rm(profileDir, { recursive: true, force: true });
}
