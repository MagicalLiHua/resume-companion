import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_VERSION = '0.16.1';
export const BROWSER_SUPERVISOR_PROTOCOL = 1;

export function resolveRuntimePluginVersion(moduleUrl: string): string {
  const directory = dirname(fileURLToPath(moduleUrl));
  for (const manifest of [
    resolve(directory, '.codex-plugin/plugin.json'),
    resolve(directory, '../.codex-plugin/plugin.json'),
  ]) {
    try {
      const value = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
      if (typeof value.version === 'string' && value.version.trim()) return value.version.trim();
    } catch {
      // Bundles and source tests have different relative roots; try the next location.
    }
  }
  return PLUGIN_VERSION;
}

export const RUNTIME_PLUGIN_VERSION = resolveRuntimePluginVersion(import.meta.url);
