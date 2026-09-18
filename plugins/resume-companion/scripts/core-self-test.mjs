import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(import.meta.dirname, '..');
const dataDir = await mkdtemp(join(tmpdir(), 'resume-companion-mcp-'));
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'));
const client = new Client({ name: 'resume-companion-contract', version: '1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['server.bundle.mjs'],
  cwd: root,
  env: { ...baseEnv, RESUME_COMPANION_DATA_DIR: dataDir },
  stderr: 'pipe',
});

const call = async (name, arguments_ = {}) => client.callTool({ name, arguments: arguments_ });
await client.connect(transport);
try {
  const listed = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(listed, [
    'resume_act', 'resume_activate_tab', 'resume_list_tabs', 'resume_observe',
    'resume_profile_list', 'resume_profile_read', 'resume_profile_save',
    'resume_status', 'resume_undo_operations', 'resume_wait',
  ].sort());

  const initial = await call('resume_status');
  assert.equal(initial.structuredContent.storage.profile_count, 0);
  assert.equal(initial.structuredContent.browser.kind, 'extension');
  assert.equal(initial.structuredContent.browser.ready, true);
  assert.equal(initial.structuredContent.browser.connected, false);

  const created = await call('resume_profile_save', {
    name: '合成测试简历',
    changes: {
      basic: { full_name: '测试同学', email: 'test@example.com', city: '南京' },
      education: [{
        school: '示例大学', major: '软件工程', education_level: 'bachelor', degree: '工学学士',
        expected_degree: null, completed: true, study_mode: 'full_time',
        start_month: '2020-09', end_month: '2024-06', is_current: false, is_expected_end: false,
      }],
    },
  });
  assert.equal(created.isError, undefined);
  const profile = created.structuredContent.profile;
  assert.equal(profile.revision, 1);
  assert.equal((await call('resume_profile_list')).structuredContent.profiles.length, 1);
  const basic = await call('resume_profile_read', { profile_id: profile.id, section: 'basic' });
  assert.equal(basic.structuredContent.data.full_name, '测试同学');
  const education = await call('resume_profile_read', { profile_id: profile.id, section: 'education' });
  const educationId = education.structuredContent.data[0].id;

  const sources = await call('resume_profile_read', {
    profile_id: profile.id,
    source_refs: ['basic/full_name', `education/${educationId}/school`],
  });
  assert.deepEqual(sources.structuredContent.entries.map(entry => [entry.source_ref, entry.value]), [
    ['basic/full_name', '测试同学'],
    [`education/${educationId}/school`, '示例大学'],
  ]);

  const stale = await call('resume_profile_save', {
    profile_id: profile.id,
    expected_revision: 0,
    changes: { basic: { city: '上海' } },
  });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error.code, 'profile_changed');
} finally {
  await client.close();
  await rm(dataDir, { recursive: true, force: true });
}
console.log('MCP tool catalog, browser-driver readiness, local storage, source resolution and revision conflicts: OK');
