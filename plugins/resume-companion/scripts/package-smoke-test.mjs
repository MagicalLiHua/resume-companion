import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = resolve(process.argv[2] ?? '');
const dataDir = await mkdtemp(join(tmpdir(), 'resume-companion-package-'));
const environment = Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === 'string'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  cwd: dirname(entry),
  env: { ...environment, RESUME_COMPANION_DATA_DIR: dataDir },
  stderr: 'pipe',
});
const client = new Client({ name: 'resume-companion-package-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.length !== 6) throw new Error(`Expected 6 tools, received ${tools.tools.length}`);
  const status = await client.callTool({ name: 'resume_status', arguments: {} });
  if (status.isError || status.structuredContent?.service?.role !== 'profile_library') throw new Error('Packaged profile service is not ready');
  const saved = await client.callTool({
    name: 'resume_profile_save',
    arguments: { name: 'Package smoke profile', changes: { basic: { full_name: 'Synthetic User' } } },
  });
  if (saved.isError || saved.structuredContent?.profile?.revision !== 1) throw new Error('Packaged profile store failed');
  const preparation=await client.callTool({name:'resume_prepare',arguments:{profile_id:saved.structuredContent.profile.id,expected_revision:1}});
  if(preparation.isError||!preparation.structuredContent?.questionnaire_id)throw new Error('Packaged preparation service failed');
  console.log('Packaged MCP starts with six profile tools, personalized preparation and local revisioned storage: OK');
} finally {
  await client.close().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true });
}
