import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ChromeProfileLock, profileHash, resolveChromeProfileDir } from '../src/chrome-profile.js';

const cleanups: string[] = [];
afterEach(async () => {
  while (cleanups.length) await rm(cleanups.pop()!, { recursive: true, force: true });
});

describe('dedicated Chrome profile', () => {
  test('resolves explicit paths and returns a non-reversible diagnostic id', () => {
    const relative = resolveChromeProfileDir('./test-profile');
    expect(relative).toMatch(/test-profile$/);
    expect(profileHash(relative)).toMatch(/^[a-f0-9]{12}$/);
    expect(profileHash(relative)).not.toContain('test-profile');
  });

  test('allows one launcher at a time and releases only its own lock', async () => {
    const root = join(tmpdir(), `resume-chrome-lock-${crypto.randomUUID()}`);
    cleanups.push(root);
    const profile = join(root, 'chrome-profile');
    const first = new ChromeProfileLock(profile);
    const second = new ChromeProfileLock(profile);
    await first.acquire();
    await expect(second.acquire()).rejects.toThrow(/profile_in_use/);
    const stored = JSON.parse(await readFile(first.lockPath, 'utf8')) as { pid: number; profile_hash: string };
    expect(stored).toMatchObject({ pid: process.pid, profile_hash: profileHash(profile) });
    await second.release();
    await expect(readFile(first.lockPath, 'utf8')).resolves.toContain('resume-companion-chrome-lock');
    await first.release();
    await expect(second.acquire()).resolves.toBeUndefined();
    await second.release();
  });

  test('recovers a well-formed lock whose owner process is gone', async () => {
    const root = join(tmpdir(), `resume-chrome-stale-${crypto.randomUUID()}`);
    cleanups.push(root);
    const profile = join(root, 'chrome-profile');
    const lock = new ChromeProfileLock(profile);
    await mkdir(dirname(lock.lockPath), { recursive: true });
    await writeFile(lock.lockPath, JSON.stringify({
      format: 'resume-companion-chrome-lock', pid: 2_147_483_000, token: 'stale', started_at: new Date(0).toISOString(), profile_hash: profileHash(profile),
    }));
    await expect(lock.acquire()).resolves.toBeUndefined();
    await lock.release();
  });

  test('does not remove a stale MCP lock while Chrome still marks the profile busy', async () => {
    const root = join(tmpdir(), `resume-chrome-busy-${crypto.randomUUID()}`);
    cleanups.push(root);
    const profile = join(root, 'chrome-profile');
    const lock = new ChromeProfileLock(profile);
    await mkdir(profile, { recursive: true });
    await writeFile(lock.lockPath, JSON.stringify({
      format: 'resume-companion-chrome-lock', pid: 2_147_483_000, token: 'stale', started_at: new Date(0).toISOString(), profile_hash: profileHash(profile),
    }));
    await writeFile(join(profile, 'SingletonLock'), 'occupied');
    await expect(lock.acquire()).rejects.toThrow(/专用 Chrome 仍在使用 Profile/);
    await unlink(join(profile, 'SingletonLock'));
    await expect(lock.acquire()).resolves.toBeUndefined();
    await lock.release();
  });
});
