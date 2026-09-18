#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChromeProfileLock, profileHash, resolveChromeProfileDir } from './chrome-profile.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const runtimePath = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
  resolve(moduleDirectory, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, '../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
].find(existsSync) ?? resolve(moduleDirectory, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
const profileDir = resolveChromeProfileDir();
const lock = new ChromeProfileLock(profileDir);

if (!existsSync(runtimePath)) {
  console.error('runtime_missing: 固定版本的 Chrome DevTools MCP 运行包不存在，请重新安装完整插件');
  process.exit(1);
}

try {
  await lock.acquire();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const upstreamArgs = [
  runtimePath,
  '--channel=stable',
  `--user-data-dir=${profileDir}`,
  '--no-usage-statistics',
  '--no-performance-crux',
  '--redact-network-headers',
  '--no-category-performance',
  '--no-category-emulation',
  '--screenshot-format=webp',
  '--screenshot-quality=80',
  '--screenshot-max-width=1440',
  '--screenshot-max-height=1200',
];
if (process.env.RESUME_COMPANION_CHROME_HEADLESS === '1') upstreamArgs.push('--headless');

const child = spawn(process.execPath, upstreamArgs, {
  cwd: dirname(runtimePath),
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...stringEnvironment(),
    CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
  },
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk: string) => process.stderr.write(redactDiagnostic(chunk)));

let closing = false;
function requestClose(signal: NodeJS.Signals): void {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) child.kill(signal);
}

child.once('error', error => {
  console.error(`upstream_start_failed: ${redactDiagnostic(error.message)}`);
  void lock.release().finally(() => process.exit(1));
});
child.once('exit', (code, signal) => {
  void lock.release().finally(() => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => requestClose(signal));
}

function redactDiagnostic(value: string): string {
  return value
    .replaceAll(profileDir, `<chrome-profile:${profileHash(profileDir)}>`)
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, '$1?<redacted>');
}

function stringEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
