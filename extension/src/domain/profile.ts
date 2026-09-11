import { z } from 'zod';
import { parseProfile as parseLegacyProfile } from './profile-v1';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const text = z.string().max(6000);
const optionalText = text.nullable();
const month = z.string().max(80).nullable();
const fact = z.strictObject({ id, text });
const education = z.strictObject({
  id, school: optionalText, major: optionalText,
  education_level: z.enum(['associate', 'bachelor', 'master', 'doctor', 'other']).nullable(),
  degree: optionalText, expected_degree: optionalText, completed: z.boolean().nullable(),
  study_mode: z.enum(['full_time', 'part_time', 'other']).nullable(),
  start_month: month, end_month: month, is_current: z.boolean().nullable(), is_expected_end: z.boolean().nullable(),
});
const experience = z.strictObject({
  id, kind: z.enum(['internship', 'work']).nullable(), organization: optionalText, role: optionalText,
  start_month: month, end_month: month, is_current: z.boolean().nullable(), facts: z.array(fact).max(50),
});
const project = z.strictObject({
  id, name: optionalText, role: optionalText, start_month: month, end_month: month,
  is_current: z.boolean().nullable(), technologies: z.array(z.string().max(120)).max(100), facts: z.array(fact).max(50),
});
export const SupplementalSchema = z.strictObject({ id, field_key: z.string().max(160), label: z.string().max(80), description: z.string().max(300), value_type: z.enum(['text', 'multiline']), value: optionalText });
export const DraftProfileSchema = z.strictObject({
  schema_version: z.literal('1.1'), profile_id: id, revision: z.number().int().min(0),
  basic: z.strictObject({
    full_name: optionalText, email: z.string().max(254).nullable(),
    phone: z.string().max(80).nullable(), city: optionalText, job_intention: optionalText,
  }),
  education: z.array(education).max(30), experience: z.array(experience).max(50), projects: z.array(project).max(50),
  skills: z.array(z.string().max(120)).max(100),
  certificates: z.array(z.strictObject({ id, name: optionalText, issuer: optionalText, obtained_month: month })).max(50),
  custom_answers: z.array(z.strictObject({ id, title: z.string().max(120), text })).max(50),
  supplemental_fields: z.array(SupplementalSchema).max(100),
});
export const ProfileSchema = DraftProfileSchema.superRefine((p, ctx) => {
  if (p.basic.email && !z.email().safeParse(p.basic.email).success) ctx.addIssue({code:'custom',path:['basic','email'],message:'邮箱格式不正确'});
  const fieldKeys = new Set<string>();
  for (const [i, f] of p.supplemental_fields.entries()) {
    if (!f.label.trim() || !f.field_key.trim() || fieldKeys.has(f.field_key)) ctx.addIssue({code:'custom',path:['supplemental_fields',i],message:'补充资料需要名称和唯一字段标识'});
    fieldKeys.add(f.field_key);
  }
  const ids = new Set<string>([p.profile_id]);
  for (const section of ['education', 'experience', 'projects', 'certificates', 'custom_answers', 'supplemental_fields'] as const) {
    p[section].forEach((item, index) => {
      for (const key of [item.id, ...('facts' in item ? item.facts.map(f => f.id) : [])]) {
        if (ids.has(key)) ctx.addIssue({ code: 'custom', path: [section, index, 'id'], message: '条目和事实 ID 不能重复' });
        ids.add(key);
      }
      if ('start_month' in item && item.start_month && item.end_month && item.start_month > item.end_month) {
        ctx.addIssue({ code: 'custom', path: [section, index, 'end_month'], message: '结束时间不能早于开始时间' });
      }
      for (const key of ['start_month','end_month','obtained_month']) {
        const value = (item as Record<string, unknown>)[key];
        if (value && (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))) ctx.addIssue({code:'custom',path:[section,index,key],message:'请输入有效年月 YYYY-MM'});
      }
      if (section === 'education') {
        const e = item as z.infer<typeof education>;
        if (e.completed && (e.is_current || e.is_expected_end)) ctx.addIssue({ code: 'custom', path: [section, index], message: '已完成的教育经历不能同时标为在读或预计结束' });
        if ((e.completed===null)!==(e.is_current===null)) ctx.addIssue({code:'custom',path:[section,index],message:'教育状态需明确选择已完成、在读、未完成或未知'});
      }
      if (section === 'custom_answers' && !(item as {title:string}).title.trim()) ctx.addIssue({code:'custom',path:[section,index,'title'],message:'请补充回答标题'});
    });
  }
});
export type Profile = z.infer<typeof ProfileSchema>;
export type RecordSection = 'education' | 'experience' | 'projects' | 'certificates' | 'custom_answers' | 'supplemental_fields';
export const newId = () => crypto.randomUUID();
export function emptyProfile(): Profile {
  return { schema_version: '1.1', profile_id: newId(), revision: 0,
    basic: { full_name: null, email: null, phone: null, city: null, job_intention: null },
    education: [], experience: [], projects: [], skills: [], certificates: [], custom_answers: [], supplemental_fields: [] };
}
export function newRecord<T extends RecordSection>(section:T):Profile[T][number];
export function newRecord(section: RecordSection) {
  const base = { id: newId() };
  switch (section) {
    case 'education': return { ...base, school: null, major: null, education_level: null, degree: null, expected_degree: null, completed: null, study_mode: null, start_month: null, end_month: null, is_current: null, is_expected_end: null } satisfies Profile['education'][number];
    case 'experience': return { ...base, kind: null, organization: null, role: null, start_month: null, end_month: null, is_current: null, facts: [] } satisfies Profile['experience'][number];
    case 'projects': return { ...base, name: null, role: null, start_month: null, end_month: null, is_current: null, technologies: [], facts: [] } satisfies Profile['projects'][number];
    case 'certificates': return { ...base, name: null, issuer: null, obtained_month: null };
    case 'custom_answers': return { ...base, title: '', text: '' };
    case 'supplemental_fields': return {...base, field_key: `custom.${base.id}`, label: '', description: '', value_type: 'text' as const, value: null};
  }
}
export function parseProfile(input: unknown): Profile {
  if (input && typeof input === 'object' && (input as {schema_version?:unknown}).schema_version === '1.0') {
    input = {...parseLegacyProfile(input), schema_version: '1.1', supplemental_fields: []};
  }
  const result = ProfileSchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.slice(0, 4).map(i => `${i.path.join('.') || '简历'}：${i.code === 'custom' ? i.message : '格式不正确或版本不支持'}`).join('；'));
  return result.data;
}
export function parseProfileFile(raw: string) {
  if (new TextEncoder().encode(raw).length > 1048576) throw new Error('文件超过 1 MiB，请缩小后导入');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('这不是有效的 JSON 文件'); }
  return parseProfile(value);
}
export function demoProfile(): Profile {
  return parseProfile({ ...emptyProfile(), profile_id: 'demo-profile',
    basic: { full_name: '示例同学', email: 'student@example.com', phone: '13800000000', city: '南京', job_intention: '测试开发工程师' },
    education: [
      { ...newRecord('education'), id: 'edu-master', school: '示例科技大学', major: '计算机技术', education_level: 'master', degree: null, expected_degree: '工学硕士', study_mode: 'full_time', start_month: '2024-09', end_month: '2027-06', completed: false, is_current: true, is_expected_end: true },
      { ...newRecord('education'), id: 'edu-bachelor', school: '示例理工大学', major: '软件工程', education_level: 'bachelor', degree: '工学学士', expected_degree: null, study_mode: 'full_time', start_month: '2020-09', end_month: '2024-06', completed: true, is_current: false, is_expected_end: false },
    ],
    experience: [{ ...newRecord('experience'), id: 'exp-demo', kind: 'internship', is_current: false, organization: '示例科技公司', role: '测试开发实习生', start_month: '2026-06', end_month: '2026-08', facts: [{ id: 'fact-exp', text: '编写接口回归测试用例，整理测试结果。' }] }],
    projects: [{ ...newRecord('projects'), id: 'project-demo', name: '接口测试工具', role: '主要开发者', start_month: '2026-03', end_month: '2026-05', technologies: ['Python', 'pytest'], facts: [{ id: 'fact-project', text: '实现测试结果汇总与失败用例定位。' }] }],
    skills: ['Python', 'Java', '接口测试'],
    custom_answers: [{ id: 'answer-demo', title: '自我评价', text: '注重问题复现与验证，愿意持续学习并改进工具。' }],
  });
}
