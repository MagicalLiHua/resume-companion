import { homedir } from 'node:os';
import { lstat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { profileHash } from '../chrome-profile.js';

export type SupervisorHello = {
  kind: 'connect' | 'upgrade' | 'shutdown';
  client_version: string;
  protocol: number;
  session_id: string;
};

export type SupervisorReply = {
  status: 'ready' | 'upgrade_required' | 'protocol_mismatch' | 'shutting_down' | 'error';
  supervisor_version: string;
  protocol: number;
  message?: string;
};

export function supervisorSocketPath(profileDir: string): string {
  const id = profileHash(profileDir);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\resume-companion-browser-${id}`
    : join(supervisorRuntimeDir(), `${id}.sock`);
}

export function supervisorStartupLockPath(profileDir: string): string {
  return join(supervisorRuntimeDir(), `${profileHash(profileDir)}.start.lock`);
}

// Clients in different tasks can receive different TMPDIR values. Discovery and
// startup serialization must nevertheless address the same per-user service.
// Keep Unix sockets short even when the user's home/profile path is long.
export function supervisorRuntimeDir(): string {
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Resume Companion', 'runtime')
    : `/tmp/resume-companion-${process.getuid!()}`;
}

export async function ensureSupervisorRuntimeDir(): Promise<void> {
  const directory = supervisorRuntimeDir();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
    || process.platform !== 'win32' && (metadata.uid !== process.getuid!() || (metadata.mode & 0o077) !== 0)) {
    throw new Error('browser_supervisor_runtime_unsafe: runtime directory must be private and owned by this user');
  }
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value.split('+')[0]!.split('-')[0]!.split('.').map(item => Number(item) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  if (left === right) return 0;
  const cachebuster = (value: string): string => /^.+\+codex\.(.+)$/.exec(value)?.[1] ?? '';
  const leftCachebuster = cachebuster(left);
  const rightCachebuster = cachebuster(right);
  if (leftCachebuster === rightCachebuster) return 0;
  if (!leftCachebuster) return -1;
  if (!rightCachebuster) return 1;
  return leftCachebuster > rightCachebuster ? 1 : -1;
}
