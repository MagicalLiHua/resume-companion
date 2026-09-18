import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserDriver } from './types.js';
import { DevToolsDriver } from './devtools-driver.js';
import { ExtensionDriver } from './extension-driver.js';

export type DriverSelection = 'devtools' | 'extension' | 'auto';

export function configuredDriver(value = process.env.RESUME_COMPANION_BROWSER_DRIVER): DriverSelection {
  if (!value) return 'devtools';
  if (value === 'devtools' || value === 'extension' || value === 'auto') return value;
  throw new Error('RESUME_COMPANION_BROWSER_DRIVER 必须是 devtools、extension 或 auto');
}

export function createBrowserDriver(dataDir: string): BrowserDriver {
  const selection = configuredDriver();
  if (selection === 'extension') return new ExtensionDriver();
  const runtimePath = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
    resolve(import.meta.dirname, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, '../../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    resolve(import.meta.dirname, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  ].find(existsSync) ?? resolve(import.meta.dirname, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
  if (selection === 'auto' && !existsSync(runtimePath)) return new ExtensionDriver();
  return new DevToolsDriver({ dataDir, runtimePath });
}
