import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProfileStore } from '../../plugins/resume-companion/src/profile-store';

const created: string[] = [];
async function store() {
  const directory = await mkdtemp(join(tmpdir(), 'resume-companion-store-'));
  created.push(directory);
  const value = new ProfileStore(directory);
  await value.initialize();
  return { value, directory };
}
afterEach(async () => {
  await Promise.all(created.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('MCP local profile store', () => {
  test('creates readable profiles, assigns stable record ids and resolves scalar sources', async () => {
    const { value, directory } = await store();
    const saved = await value.save({
      name: '测试开发版',
      changes: {
        basic: { full_name: '示例同学', email: 'student@example.com', city: '南京' },
        education: [{
          school: '示例大学', major: '软件工程', education_level: 'bachelor', degree: '工学学士',
          expected_degree: null, completed: true, study_mode: 'full_time',
          start_month: '2020-09', end_month: '2024-06', is_current: false, is_expected_end: false,
        }],
        skills: ['TypeScript', 'Playwright'],
      },
      source_markdown: '# 合成测试简历',
    });
    expect(saved.profile).toMatchObject({ name: '测试开发版', revision: 1, has_source_markdown: true });
    const profileId = saved.profile.id;
    const directoryView = await value.readView({ profile_id: profileId });
    expect(directoryView).toMatchObject({ directory: true, profile_revision: 1, has_source_markdown: true });
    const education = await value.readView({ profile_id: profileId, section: 'education' });
    const educationData = education.data as Array<{ id: string }>;
    expect(educationData[0]?.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await value.resolveSource({ profile_id: profileId, profile_revision: 1, source_ref: 'basic/full_name' })).toBe('示例同学');
    expect(await value.resolveSource({ profile_id: profileId, profile_revision: 1, source_ref: `education/${educationData[0]?.id}/education_level` })).toBe('本科');
    const mode = (await import('node:fs/promises')).stat(join(directory, 'profiles', `${profileId}.json`));
    expect((await mode).mode & 0o077).toBe(0);
  });

  test('updates only supplied sections and rejects stale concurrent writes', async () => {
    const { value } = await store();
    const createdProfile = await value.save({
      name: '通用版',
      changes: { basic: { full_name: '甲', email: null }, skills: ['Python'] },
    });
    const profileId = createdProfile.profile.id;
    const updated = await value.save({
      profile_id: profileId,
      expected_revision: 1,
      changes: { basic: { phone: '13800000000' } },
    });
    expect(updated.profile.revision).toBe(2);
    const stored = await value.get(profileId);
    expect(stored.profile.basic).toMatchObject({ full_name: '甲', phone: '13800000000' });
    expect(stored.profile.skills).toEqual(['Python']);
    await expect(value.save({
      profile_id: profileId,
      expected_revision: 1,
      changes: { basic: { city: '上海' } },
    })).rejects.toThrow(/profile_changed/);
    expect((await value.get(profileId)).profile.basic.city).toBeNull();
  });

  test('serializes competing updates so exactly one revision wins', async () => {
    const { value } = await store();
    const profileId = (await value.save({ name: '并发测试', changes: {} })).profile.id;
    const results = await Promise.allSettled([
      value.save({ profile_id: profileId, expected_revision: 1, changes: { basic: { city: '北京' } } }),
      value.save({ profile_id: profileId, expected_revision: 1, changes: { basic: { city: '广州' } } }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await value.get(profileId)).revision).toBe(2);
  });

  test('can rebuild a damaged index without changing profile files', async () => {
    const { value, directory } = await store();
    const saved = await value.save({ name: '恢复测试', changes: { basic: { full_name: '保留资料' } } });
    const profilePath = join(directory, 'profiles', `${saved.profile.id}.json`);
    const before = await readFile(profilePath, 'utf8');
    await writeFile(join(directory, 'index.json'), '{broken', 'utf8');
    const rebuilt = await value.rebuildIndex();
    expect(rebuilt).toMatchObject({ rebuilt: true, profiles: 1 });
    expect(await readFile(profilePath, 'utf8')).toBe(before);
    expect((await value.list())[0].name).toBe('恢复测试');
  });
});
