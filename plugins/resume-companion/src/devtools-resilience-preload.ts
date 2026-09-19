import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installStaleUidRecovery } from './browser/stale-uid-recovery.js';

const runtimeEntry = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME_ENTRY;
if (!runtimeEntry) throw new Error('runtime_preload_missing_entry: Chrome DevTools MCP runtime entry is not configured');

const mcpPagePath = resolve(dirname(runtimeEntry), '../McpPage.js');
if (!existsSync(mcpPagePath)) throw new Error('runtime_preload_incompatible: Chrome DevTools MCP McpPage module is missing');

const runtimeModule = await import(pathToFileURL(mcpPagePath).href) as {
  McpPage?: { prototype: { getElementByUid(uid: string): Promise<unknown> } };
};
if (!runtimeModule.McpPage) throw new Error('runtime_preload_incompatible: Chrome DevTools MCP McpPage export is missing');
installStaleUidRecovery(runtimeModule.McpPage);

