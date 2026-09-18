import { copyFile, chmod, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_HOST_NAME, RESUME_COMPANION_EXTENSION_ID } from '../../shared/browser-bridge.js';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const extensionId = argument('--extension-id') ?? RESUME_COMPANION_EXTENSION_ID;
if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('--extension-id 必须是 32 位 Chrome 扩展 ID');
const dataDir = resolveDataDir(argument('--data-dir'));
const installDir = join(dataDir, 'native-host');
await mkdir(installDir, { recursive: true, mode: 0o700 });
const sourceHost = join(sourceDir, 'host.bundle.mjs');
const installedHost = join(installDir, 'host.bundle.mjs');
await copyFile(sourceHost, installedHost);
await chmod(installedHost, 0o700);
const launcher = join(installDir, 'run-host');
const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(launcher, `#!/bin/sh\nexport RESUME_COMPANION_DATA_DIR=${quote(dataDir)}\nexec ${quote(process.execPath)} ${quote(installedHost)} "$@"\n`, { mode: 0o700 });
await chmod(launcher, 0o700);
const manifest = { name: NATIVE_HOST_NAME, description: 'Resume Companion local MCP bridge', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] };
const manifestPath = nativeManifestPath();
await mkdir(dirname(manifestPath), { recursive: true, mode: 0o700 });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
if (process.platform === 'win32') execFileSync('reg', ['add', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, '/ve', '/d', manifestPath, '/f'], { stdio: 'ignore' });
console.log(JSON.stringify({ installed: true, manifest: manifestPath, data_dir: dataDir, extension_id: extensionId }, null, 2));

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function resolveDataDir(value?: string): string {
  if (value) return resolve(value.replace(/^~(?=\/)/, homedir()));
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Resume Companion');
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Resume Companion');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'resume-companion');
}
function nativeManifestPath(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`);
  if (process.platform === 'win32') return join(dataDir, `${NATIVE_HOST_NAME}.json`);
  return join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`);
}
