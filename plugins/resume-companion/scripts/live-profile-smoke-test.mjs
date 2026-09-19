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
let diagnostic = '';
transport.stderr?.setEncoding('utf8');
transport.stderr?.on('data', chunk => { diagnostic = `${diagnostic}${chunk}`.slice(-4_000); });
const client = new Client({ name: 'resume-companion-live-profile-smoke', version: '1.0.0' });

function textOf(result) {
  return Array.isArray(result?.content)
    ? result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
    : '';
}

try {
  await client.connect(transport);
  const result = await client.callTool({ name: 'list_pages', arguments: {} });
  assert(!result.isError, `Installed launcher did not list pages: ${textOf(result)}\n${diagnostic}`);
  const pageId = Number(textOf(result).match(/^(\d+):/m)?.[1]);
  assert(Number.isInteger(pageId) && pageId > 0, `Unable to identify a page from: ${textOf(result)}`);
  const observed = await client.callTool({ name: 'form_observe', arguments: { page_id: pageId, mode: 'overview', max_bytes: 5_000 } });
  assert(!observed.isError, `Installed launcher could not perform a semantic overview: ${textOf(observed)}`);
  const overview = JSON.parse(textOf(observed));
  assert.equal(overview.page_id, pageId);
  assert(overview.metrics && typeof overview.metrics.response_bytes === 'number');
  console.log(`Installed 0.15 launcher opened the persistent profile, listed pages and returned a bounded semantic overview (${overview.metrics.observed_fields} fields): OK`);
} finally {
  await client.close().catch(() => undefined);
}
