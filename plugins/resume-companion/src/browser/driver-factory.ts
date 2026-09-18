import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserDriver } from './types.js';
import { DevToolsDriver } from './devtools-driver.js';

export function createBrowserDriver(dataDir: string): BrowserDriver {
  const runtimePath = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
    resolve(import.meta.dirname, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, '../../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  ].find(existsSync) ?? resolve(import.meta.dirname, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
  return new DevToolsDriver({ dataDir, runtimePath });
}
