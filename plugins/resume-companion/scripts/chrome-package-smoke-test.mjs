import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = resolve(process.argv[2] ?? '');
const profileRoot = await mkdtemp(join(tmpdir(), 'resume-companion-chrome-package-'));
const profileDir = join(profileRoot, 'chrome-profile');
const lockPath = join(profileRoot, 'chrome-mcp.lock');
const environment = Object.fromEntries(Object.entries(process.env).filter((item) => typeof item[1] === 'string'));

function textOf(result) {
  return Array.isArray(result?.content)
    ? result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
    : '';
}

function createClient(name) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd: dirname(entry),
    env: { ...environment, RESUME_COMPANION_CHROME_DATA_DIR: profileDir, RESUME_COMPANION_CHROME_HEADLESS: '1' },
    stderr: 'pipe',
  });
  let diagnostic = '';
  transport.stderr?.setEncoding('utf8');
  transport.stderr?.on('data', chunk => { diagnostic = `${diagnostic}${chunk}`.slice(-4000); });
  return { transport, client: new Client({ name, version: '1.0.0' }), diagnostic: () => diagnostic.trim() };
}

async function lockExists() {
  try { await access(lockPath); return true; } catch { return false; }
}

async function waitForUnlocked() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await lockExists())) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error('Chrome profile lock was not released');
}

async function callPagesWithRetry(client) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const result = await client.callTool({ name: 'list_pages', arguments: {} });
      if (!result.isError) return result;
      lastError = new Error(textOf(result));
      if (!textOf(result).includes('profile_in_use')) return result;
    } catch (error) {
      lastError = error;
      if (!String(error).includes('profile_in_use')) throw error;
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw lastError;
}

const first = createClient('resume-companion-chrome-package-smoke-first');
const second = createClient('resume-companion-chrome-package-smoke-second');
let firstClosed = false;

try {
  await first.client.connect(first.transport);
  await second.client.connect(second.transport);
  const firstNames = (await first.client.listTools()).tools.map(tool => tool.name);
  const secondNames = (await second.client.listTools()).tools.map(tool => tool.name);
  for (const required of ['list_pages', 'form_observe', 'form_fill_fields', 'form_select_option', 'form_select_path', 'form_set_date', 'form_activate', 'take_snapshot', 'fill_form', 'list_network_requests', 'evaluate_script']) {
    assert(firstNames.includes(required), `First client missing ${required}`);
    assert(secondNames.includes(required), `Second client missing ${required}`);
  }
  assert(!firstNames.includes('click_at'), 'Experimental vision tool must remain disabled');
  assert.equal(await lockExists(), false, 'Tool discovery must not reserve the Chrome profile');

  const firstPages = await first.client.callTool({ name: 'list_pages', arguments: {} });
  assert(!firstPages.isError, `First real browser tool call must start Chrome: ${textOf(firstPages)}\n${first.diagnostic()}`);
  assert.equal(await lockExists(), true, 'First browser call must reserve the profile');
  const blocked = await second.client.callTool({ name: 'list_pages', arguments: {} });
  assert(blocked.isError && textOf(blocked).includes('profile_in_use'), `Second client must be blocked while the first owns the profile:\n${textOf(blocked)}`);

  await first.client.close();
  firstClosed = true;
  await waitForUnlocked();
  const secondPages = await callPagesWithRetry(second.client);
  assert(!secondPages.isError, `Second client must take over without restarting after the first releases the profile: ${textOf(secondPages)}\n${second.diagnostic()}`);
  assert.equal(await lockExists(), true, 'Second client must own the lock after retry');
  console.log('Two packaged clients discover tools without locking; first use is exclusive and retryable takeover succeeds: OK');
} finally {
  if (!firstClosed) await first.client.close().catch(() => undefined);
  await second.client.close().catch(() => undefined);
  await rm(profileRoot, { recursive: true, force: true });
}
