import { afterEach, describe, expect, test } from 'vitest';
import { ResumeBrowserHost } from '../src/resume-browser-server.js';
import { compareVersions } from '../src/browser/supervisor-protocol.js';

const hosts: ResumeBrowserHost[] = [];
afterEach(async () => {
  while (hosts.length) await hosts.pop()!.close();
});

describe('shared browser supervisor lease', () => {
  test('a newer task takes over at an operation boundary and the old task stays revoked', async () => {
    const host = new ResumeBrowserHost();
    hosts.push(host);
    await expect(host.run('old-task', async () => 'old')).resolves.toBe('old');
    await expect(host.run('new-task', async () => 'new')).resolves.toBe('new');
    await expect(host.run('old-task', async () => 'unexpected')).rejects.toThrow(/browser_lease_revoked/);

    const restored = await host.takeover('old-task');
    expect(restored.structuredContent.status).toBe('taken_over');
    await expect(host.run('old-task', async () => 'restored')).resolves.toBe('restored');
    await expect(host.run('new-task', async () => 'unexpected')).rejects.toThrow(/browser_lease_revoked/);
  });

  test('uses release versions and cachebusters for supervisor upgrades', () => {
    expect(compareVersions('0.16.0+codex.20260919080000', '0.16.0+codex.20260919070000')).toBe(1);
    expect(compareVersions('0.16.0+codex.20260919070000', '0.16.0+codex.20260919080000')).toBe(-1);
    expect(compareVersions('0.16.0+codex.same', '0.16.0+codex.same')).toBe(0);
    expect(compareVersions('0.16.1', '0.16.0')).toBe(1);
    expect(compareVersions('0.15.9', '0.16.0')).toBe(-1);
  });
});
