import { tmpdir } from 'node:os';
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
    : join(tmpdir(), `rc-browser-${id}.sock`);
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
