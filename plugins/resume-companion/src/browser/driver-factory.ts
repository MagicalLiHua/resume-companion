import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserDriver } from './types.js';
import { DevToolsDriver } from './devtools-driver.js';
import { ExtensionDriver } from './extension-driver.js';

export function createBrowserDriver(dataDir: string): BrowserDriver {
  const selected = process.env.RESUME_COMPANION_BROWSER_DRIVER ?? 'extension';
  if (!['extension', 'devtools', 'auto'].includes(selected)) throw new Error('RESUME_COMPANION_BROWSER_DRIVER 必须是 extension、devtools 或 auto');
  if (selected !== 'devtools') return new ExtensionDriver({ dataDir });
  const runtimePath = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
    resolve(import.meta.dirname, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, '../../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  ].find(existsSync) ?? resolve(import.meta.dirname, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
  return new DevToolsDriver({ dataDir, runtimePath });
}
