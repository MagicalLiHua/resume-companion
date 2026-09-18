import { randomUUID } from 'node:crypto';
import { chmod, copyFile, mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const id = z.string().regex(ID_PATTERN);
const optionalId = id.optional();
const text = z.string().max(6000);
const nullableText = text.nullable();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable();
const factInput = z.object({ id: optionalId, text }).strict();
const fact = z.object({ id, text }).strict();
const educationShape = {
  school: nullableText,
  major: nullableText,
  education_level: z.enum(['associate', 'bachelor', 'master', 'doctor', 'other']).nullable(),
  degree: nullableText,
  expected_degree: nullableText,
  completed: z.boolean().nullable(),
  study_mode: z.enum(['full_time', 'part_time', 'other']).nullable(),
  start_month: month,
  end_month: month,
  is_current: z.boolean().nullable(),
  is_expected_end: z.boolean().nullable(),
};
const experienceShape = {
  kind: z.enum(['internship', 'work']).nullable(),
  organization: nullableText,
  role: nullableText,
  start_month: month,
  end_month: month,
  is_current: z.boolean().nullable(),
};
const projectShape = {
  name: nullableText,
  role: nullableText,
  start_month: month,
  end_month: month,
  is_current: z.boolean().nullable(),
};
const certificateShape = { name: nullableText, issuer: nullableText, obtained_month: month };
const answerShape = { title: z.string().max(120), text };
const supplementalShape = {
  field_key: z.string().max(160),
  label: z.string().max(80),
  description: z.string().max(300),
  value_type: z.enum(['text', 'multiline']),
  value: nullableText,
};

const educationInput = z.object({ id: optionalId, ...educationShape }).strict();
const education = z.object({ id, ...educationShape }).strict();
const experienceInput = z.object({ id: optionalId, ...experienceShape, facts: z.array(factInput).max(50) }).strict();
const experience = z.object({ id, ...experienceShape, facts: z.array(fact).max(50) }).strict();
const projectInput = z.object({ id: optionalId, ...projectShape, technologies: z.array(z.string().max(120)).max(100), facts: z.array(factInput).max(50) }).strict();
const project = z.object({ id, ...projectShape, technologies: z.array(z.string().max(120)).max(100), facts: z.array(fact).max(50) }).strict();
const certificateInput = z.object({ id: optionalId, ...certificateShape }).strict();
const certificate = z.object({ id, ...certificateShape }).strict();
const answerInput = z.object({ id: optionalId, ...answerShape }).strict();
const answer = z.object({ id, ...answerShape }).strict();
const supplementalInput = z.object({ id: optionalId, ...supplementalShape }).strict();
const supplemental = z.object({ id, ...supplementalShape }).strict();
const basic = z.object({
  full_name: nullableText,
  email: z.string().max(254).email().nullable(),
  phone: z.string().max(80).nullable(),
  city: nullableText,
  job_intention: nullableText,
}).strict();

export const ProfileSchema = z.object({
  schema_version: z.literal('1.1'),
  profile_id: id,
  revision: z.number().int().nonnegative(),
  basic,
  education: z.array(education).max(30),
  experience: z.array(experience).max(50),
  projects: z.array(project).max(50),
  skills: z.array(z.string().max(120)).max(100),
  certificates: z.array(certificate).max(50),
  custom_answers: z.array(answer).max(50),
  supplemental_fields: z.array(supplemental).max(100),
}).strict().superRefine((profile, ctx) => {
  const ids = new Set([profile.profile_id]);
  const fieldKeys = new Set();
  for (const [section, records] of Object.entries({
    education: profile.education,
    experience: profile.experience,
    projects: profile.projects,
    certificates: profile.certificates,
    custom_answers: profile.custom_answers,
    supplemental_fields: profile.supplemental_fields,
  })) {
    records.forEach((record, index) => {
      const recordIds = [record.id, ...('facts' in record ? record.facts.map(item => item.id) : [])];
      for (const value of recordIds) {
        if (ids.has(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [section, index, 'id'], message: '条目和事实 ID 不能重复' });
        ids.add(value);
      }
      if ('start_month' in record && record.start_month && record.end_month && record.start_month > record.end_month) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [section, index, 'end_month'], message: '结束时间不能早于开始时间' });
      }
    });
  }
  profile.supplemental_fields.forEach((field, index) => {
    if (!field.field_key.trim() || !field.label.trim() || fieldKeys.has(field.field_key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['supplemental_fields', index], message: '补充资料需要名称和唯一字段标识' });
    }
    fieldKeys.add(field.field_key);
  });
});

export const ProfileChangesSchema = z.object({
  basic: basic.partial().optional(),
  education: z.array(educationInput).max(30).optional(),
  experience: z.array(experienceInput).max(50).optional(),
  projects: z.array(projectInput).max(50).optional(),
  skills: z.array(z.string().max(120)).max(100).optional(),
  certificates: z.array(certificateInput).max(50).optional(),
  custom_answers: z.array(answerInput).max(50).optional(),
  supplemental_fields: z.array(supplementalInput).max(100).optional(),
}).strict();

export const ProfileSaveSchema = z.object({
  profile_id: id.optional().describe('更新时填写 resume_profile_list 返回的 ID；创建时省略'),
  expected_revision: z.number().int().nonnegative().optional().describe('更新时必填，必须等于最近读取到的修订号'),
  name: z.string().trim().min(1).max(80).optional(),
  changes: ProfileChangesSchema,
  source_markdown: z.string().max(262_144).nullable().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.profile_id && input.expected_revision === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_revision'], message: '更新资料必须提供 expected_revision' });
  if (!input.profile_id && input.expected_revision !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_revision'], message: '创建资料时不能提供 expected_revision' });
  if (!input.profile_id && !input.name) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: '创建资料必须提供名称' });
  if (input.profile_id && input.name === undefined && input.source_markdown === undefined && Object.keys(input.changes).length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['changes'], message: '没有要保存的更改' });
});

const StoredProfileSchema = z.object({
  format: z.literal('resume-companion-profile'),
  storage_version: z.literal(1),
  id,
  name: z.string().trim().min(1).max(80),
  revision: z.number().int().positive(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  source_markdown: z.string().max(262_144).nullable(),
  profile: ProfileSchema,
}).strict();

const IndexEntrySchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  revision: z.number().int().positive(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  has_source_markdown: z.boolean(),
}).strict();
const IndexSchema = z.object({
  format: z.literal('resume-companion-index'),
  storage_version: z.literal(1),
  profiles: z.array(IndexEntrySchema).max(100),
}).strict();

const emptyProfile = (profileId, revision) => ({
  schema_version: '1.1',
  profile_id: profileId,
  revision,
  basic: { full_name: null, email: null, phone: null, city: null, job_intention: null },
  education: [],
  experience: [],
  projects: [],
  skills: [],
  certificates: [],
  custom_answers: [],
  supplemental_fields: [],
});

const ensureId = value => value ?? randomUUID();
const normalizeFacts = records => records.map(record => ({ ...record, id: ensureId(record.id), facts: record.facts.map(item => ({ ...item, id: ensureId(item.id) })) }));
const normalizeRecords = records => records.map(record => ({ ...record, id: ensureId(record.id) }));
function mergeChanges(profile, changes, revision) {
  const next = structuredClone(profile);
  if (changes.basic) next.basic = { ...next.basic, ...changes.basic };
  if (changes.education) next.education = normalizeRecords(changes.education);
  if (changes.experience) next.experience = normalizeFacts(changes.experience);
  if (changes.projects) next.projects = normalizeFacts(changes.projects);
  if (changes.skills) next.skills = changes.skills;
  if (changes.certificates) next.certificates = normalizeRecords(changes.certificates);
  if (changes.custom_answers) next.custom_answers = normalizeRecords(changes.custom_answers);
  if (changes.supplemental_fields) next.supplemental_fields = normalizeRecords(changes.supplemental_fields);
  next.revision = revision;
  return ProfileSchema.parse(next);
}

function defaultDataDir() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Resume Companion');
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Resume Companion');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'resume-companion');
}

export function resolveDataDir(value = process.env.RESUME_COMPANION_DATA_DIR) {
  if (!value) return defaultDataDir();
  const expanded = value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
}

async function syncDirectory(path) {
  try { const handle = await open(path, 'r'); await handle.sync(); await handle.close(); } catch { /* Some platforms do not allow fsync on directories. */ }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  const handle = await open(temporary, 'r');
  await handle.sync();
  await handle.close();
  await rename(temporary, path);
  await chmod(path, 0o600).catch(() => {});
  await syncDirectory(dirname(path));
}

function storageError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function entryFor(stored) {
  return {
    id: stored.id,
    name: stored.name,
    revision: stored.revision,
    created_at: stored.created_at,
    updated_at: stored.updated_at,
    has_source_markdown: stored.source_markdown !== null,
  };
}

const displayEnums = {
  associate: '大专', bachelor: '本科', master: '硕士研究生', doctor: '博士研究生',
  full_time: '全日制', part_time: '非全日制', other: '其他', internship: '实习', work: '工作',
};
function scalarSource(profile, sourceRef) {
  if (sourceRef === 'skills') return profile.skills.join('、');
  const parts = sourceRef.split('/');
  if (parts[0] === 'basic' && parts.length === 2 && Object.hasOwn(profile.basic, parts[1])) return profile.basic[parts[1]];
  if (parts[0] === 'custom_answers' && parts.length === 2) return profile.custom_answers.find(item => item.id === parts[1])?.text;
  if (parts[0] === 'supplemental_fields' && parts.length === 2) return profile.supplemental_fields.find(item => item.id === parts[1])?.value;
  if (['education', 'experience', 'projects', 'certificates'].includes(parts[0]) && parts.length === 3) {
    const record = profile[parts[0]].find(item => item.id === parts[1]);
    if (!record || !Object.hasOwn(record, parts[2])) return undefined;
    const raw = record[parts[2]];
    if (Array.isArray(raw)) return raw.map(item => typeof item === 'string' ? item : item.text).join(parts[2] === 'facts' ? '\n' : '、');
    if (typeof raw === 'string') return displayEnums[raw] ?? raw;
    if (typeof raw === 'boolean' || raw === null) return raw;
  }
  return undefined;
}

export class ProfileStore {
  constructor(dataDir = resolveDataDir()) {
    this.dataDir = dataDir;
    this.indexPath = join(dataDir, 'index.json');
    this.queue = Promise.resolve();
  }

  async initialize() {
    for (const folder of ['', 'profiles', 'history', 'backups']) await mkdir(join(this.dataDir, folder), { recursive: true, mode: 0o700 });
    await chmod(this.dataDir, 0o700).catch(() => {});
    try { await stat(this.indexPath); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await atomicWrite(this.indexPath, { format: 'resume-companion-index', storage_version: 1, profiles: [] });
    }
    await this.readIndex();
    return this.status();
  }

  exclusive(job) {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async readIndex() {
    let raw;
    try { raw = await readFile(this.indexPath, 'utf8'); } catch (error) { throw storageError('storage_unavailable', `无法读取资料索引：${error.message}`); }
    const parsed = IndexSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw storageError('storage_corrupt', '资料索引格式损坏，请从 backups 恢复或重建索引');
    return parsed.data;
  }

  async readStored(profileId) {
    let raw;
    try { raw = await readFile(join(this.dataDir, 'profiles', `${profileId}.json`), 'utf8'); }
    catch (error) { if (error?.code === 'ENOENT') throw storageError('profile_missing', '指定的本地资料不存在'); throw storageError('storage_unavailable', `无法读取资料：${error.message}`); }
    let value;
    try { value = JSON.parse(raw); } catch { throw storageError('storage_corrupt', `资料 ${profileId} 不是有效 JSON`); }
    const parsed = StoredProfileSchema.safeParse(value);
    if (!parsed.success) throw storageError('storage_corrupt', `资料 ${profileId} 格式损坏或版本不支持`);
    return parsed.data;
  }

  async list() {
    await this.initialize();
    const index = await this.readIndex();
    return index.profiles.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async status() {
    const index = await this.readIndex();
    return { data_dir: this.dataDir, storage_version: 1, profile_count: index.profiles.length };
  }

  async get(profileId) {
    await this.initialize();
    return this.readStored(id.parse(profileId));
  }

  async save(rawInput) {
    const input = ProfileSaveSchema.parse(rawInput);
    return this.exclusive(async () => {
      await this.initialize();
      const index = await this.readIndex();
      const now = new Date().toISOString();
      let stored;
      let previous = null;
      if (input.profile_id) {
        previous = await this.readStored(input.profile_id);
        if (previous.revision !== input.expected_revision) throw storageError('profile_changed', `资料已经更新；当前修订为 ${previous.revision}，请重新读取后再保存`);
        const name = input.name ?? previous.name;
        if (index.profiles.some(item => item.id !== previous.id && item.name === name)) throw storageError('name_conflict', '已有同名资料，请换一个名称');
        const revision = previous.revision + 1;
        stored = StoredProfileSchema.parse({
          ...previous,
          name,
          revision,
          updated_at: now,
          source_markdown: input.source_markdown === undefined ? previous.source_markdown : input.source_markdown,
          profile: mergeChanges(previous.profile, input.changes, revision),
        });
      } else {
        if (index.profiles.length >= 100) throw storageError('profile_limit', '本地资料已达到 100 份上限');
        if (index.profiles.some(item => item.name === input.name)) throw storageError('name_conflict', '已有同名资料，请换一个名称');
        const profileId = randomUUID();
        stored = StoredProfileSchema.parse({
          format: 'resume-companion-profile', storage_version: 1, id: profileId, name: input.name,
          revision: 1, created_at: now, updated_at: now,
          source_markdown: input.source_markdown ?? null,
          profile: mergeChanges(emptyProfile(profileId, 1), input.changes, 1),
        });
      }
      const serialized = JSON.stringify(stored);
      if (Buffer.byteLength(serialized, 'utf8') > 1_048_576) throw storageError('profile_too_large', '单份资料超过 1 MiB，请精简后再保存');
      if (previous) {
        const historyDir = join(this.dataDir, 'history', previous.id);
        await mkdir(historyDir, { recursive: true, mode: 0o700 });
        await atomicWrite(join(historyDir, `${previous.revision}.json`), previous);
      }
      await atomicWrite(join(this.dataDir, 'profiles', `${stored.id}.json`), stored);
      const nextEntries = index.profiles.filter(item => item.id !== stored.id);
      nextEntries.push(entryFor(stored));
      await atomicWrite(this.indexPath, { ...index, profiles: nextEntries });
      return { profile: entryFor(stored), changed_sections: Object.keys(input.changes), source_markdown_saved: stored.source_markdown !== null };
    });
  }

  async readView(raw) {
    const params = z.object({
      profile_id: id,
      section: z.enum(['basic', 'education', 'experience', 'projects', 'skills', 'certificates', 'custom_answers', 'supplemental_fields']).optional(),
      record_id: id.optional(),
      source_refs: z.array(z.string().min(1).max(240)).max(100).optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(50).optional(),
      include_source_markdown: z.boolean().optional(),
    }).strict().parse(raw);
    if (params.record_id && !params.section) throw storageError('invalid_request', 'record_id 需要同时指定 section');
    const stored = await this.get(params.profile_id);
    const base = { profile_id: stored.id, name: stored.name, profile_revision: stored.revision, updated_at: stored.updated_at };
    if (params.source_refs) {
      const entries = params.source_refs.map(source_ref => {
        const value = scalarSource(stored.profile, source_ref);
        if (value === undefined) throw storageError('source_missing', `资料来源不存在：${source_ref}`);
        return { source_ref, value, unknown: value === null || value === '' };
      });
      return { ...base, directory: false, entries };
    }
    if (!params.section) {
      const sections = Object.fromEntries(['basic', 'education', 'experience', 'projects', 'skills', 'certificates', 'custom_answers', 'supplemental_fields'].map(section => {
        const value = stored.profile[section];
        return [section, { records: Array.isArray(value) ? value.length : 1 }];
      }));
      return { ...base, directory: true, sections, has_source_markdown: stored.source_markdown !== null, source_markdown: params.include_source_markdown ? stored.source_markdown : undefined };
    }
    let value = stored.profile[params.section];
    if (params.record_id) {
      if (!Array.isArray(value)) throw storageError('invalid_request', '这个栏目不支持 record_id');
      value = value.find(item => item.id === params.record_id);
      if (!value) throw storageError('record_missing', '指定记录不存在');
    }
    if (!Array.isArray(value) || params.record_id) return { ...base, directory: false, section: params.section, data: value, source_markdown: params.include_source_markdown ? stored.source_markdown : undefined };
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 20;
    const data = value.slice(offset, offset + limit);
    return { ...base, directory: false, section: params.section, offset, total: value.length, data, next_offset: offset + data.length < value.length ? offset + data.length : null, source_markdown: params.include_source_markdown ? stored.source_markdown : undefined };
  }

  async resolveSource(reference) {
    const schema = z.object({ profile_id: id, profile_revision: z.number().int().positive(), source_ref: z.string().min(1).max(240) }).strict();
    const source = schema.parse(reference);
    const stored = await this.get(source.profile_id);
    if (stored.revision !== source.profile_revision) throw storageError('profile_changed', `资料已经更新；当前修订为 ${stored.revision}`);
    const value = scalarSource(stored.profile, source.source_ref);
    if (value === undefined) throw storageError('source_missing', `资料来源不存在：${source.source_ref}`);
    if (value === null || value === '') throw storageError('source_unknown', '资料未提供该事实，不自动编造');
    if (typeof value !== 'string' && typeof value !== 'boolean') throw storageError('source_type', '资料来源不是单个可填写值');
    if (typeof value === 'string' && value.length > 10_000) throw storageError('source_too_long', '资料来源超过单次填写上限');
    return value;
  }

  async rebuildIndex() {
    return this.exclusive(async () => {
      await mkdir(join(this.dataDir, 'profiles'), { recursive: true, mode: 0o700 });
      const names = (await readdir(join(this.dataDir, 'profiles'))).filter(name => name.endsWith('.json'));
      const profiles = [];
      for (const name of names) {
        const profileId = name.slice(0, -5);
        if (!ID_PATTERN.test(profileId)) continue;
        try { profiles.push(entryFor(await this.readStored(profileId))); } catch { /* Keep corrupt files for manual recovery. */ }
      }
      let backup;
      try {
        backup = join(this.dataDir, 'backups', `index-${new Date().toISOString().replaceAll(':', '-')}.json`);
        await copyFile(this.indexPath, backup);
      } catch { backup = null; }
      const index = { format: 'resume-companion-index', storage_version: 1, profiles };
      await atomicWrite(this.indexPath, index);
      return { rebuilt: true, profiles: profiles.length, backup };
    });
  }
}
