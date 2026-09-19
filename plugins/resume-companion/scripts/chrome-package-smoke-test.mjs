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
    env: { ...environment, RESUME_COMPANION_CHROME_DATA_DIR: profileDir, RESUME_COMPANION_CHROME_HEADLESS: '1', RESUME_COMPANION_SUPERVISOR_EPHEMERAL: '1' },
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

const first = createClient('resume-companion-chrome-package-smoke-first');
const second = createClient('resume-companion-chrome-package-smoke-second');
let firstClosed = false;

try {
  await Promise.all([
    first.client.connect(first.transport),
    second.client.connect(second.transport),
  ]);
  const firstNames = (await first.client.listTools()).tools.map(tool => tool.name);
  const secondNames = (await second.client.listTools()).tools.map(tool => tool.name);
  for (const required of ['list_pages', 'browser_takeover', 'form_observe', 'form_fill_fields', 'form_select_option', 'form_select_path', 'form_set_date', 'form_activate', 'take_snapshot', 'fill_form', 'list_network_requests', 'evaluate_script']) {
    assert(firstNames.includes(required), `First client missing ${required}`);
    assert(secondNames.includes(required), `Second client missing ${required}`);
  }
  assert(!firstNames.includes('click_at'), 'Experimental vision tool must remain disabled');
  assert.equal(await lockExists(), false, 'Tool discovery must not reserve the Chrome profile');

  const firstPages = await first.client.callTool({ name: 'list_pages', arguments: {} });
  assert(!firstPages.isError, `First real browser tool call must start Chrome: ${textOf(firstPages)}\n${first.diagnostic()}`);
  assert.equal(await lockExists(), true, 'First browser call must reserve the profile');
  const secondPages = await second.client.callTool({ name: 'list_pages', arguments: {} });
  assert(!secondPages.isError, `Second client must take over the running browser: ${textOf(secondPages)}\n${second.diagnostic()}`);
  const firstRevoked = await first.client.callTool({ name: 'list_pages', arguments: {} });
  assert(firstRevoked.isError && textOf(firstRevoked).includes('browser_lease_revoked'), `Old client must remain open but lose browser control:\n${textOf(firstRevoked)}`);
  const reclaimed = await first.client.callTool({ name: 'browser_takeover', arguments: {} });
  assert(!reclaimed.isError && textOf(reclaimed).includes('taken_over'), `Old client must be able to reclaim explicitly:\n${textOf(reclaimed)}`);
  const secondRevoked = await second.client.callTool({ name: 'list_pages', arguments: {} });
  assert(secondRevoked.isError && textOf(secondRevoked).includes('browser_lease_revoked'), `Previous owner must be fenced after explicit reclaim:\n${textOf(secondRevoked)}`);
  console.log('Two packaged clients share one Chrome; new-task takeover and explicit reclaim are fenced: OK');
} catch (error) {
  const diagnostics = [first.diagnostic(), second.diagnostic()].filter(Boolean).join('\n--- second client ---\n');
  if (diagnostics) console.error(`Resume Browser launcher diagnostics:\n${diagnostics}`);
  throw error;
} finally {
  if (!firstClosed) await first.client.close().catch(() => undefined);
  await second.client.close().catch(() => undefined);
  await waitForUnlocked();
  await rm(profileRoot, { recursive: true, force: true });
}
