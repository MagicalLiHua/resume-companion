import type { Profile } from './profile';
import type { Field, Section, Value } from './types';

export const sectionNames: Record<Section, string> = { basic: '基本资料', education: '教育经历', experience: '工作与实习', projects: '项目经历', skills: '技能', custom_answers: '固定回答', supplemental_fields:'补充资料', other: '当前表单' };
export const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s:：*＊✱()（）·、，,\-_/]/g, '');
export function classifyGroup(label: string): Section {
  if (/教育|学习经历|学历|学位/.test(label)) return 'education';
  if (/项目/.test(label)) return 'projects';
  if (/实习|工作经历|任职/.test(label)) return 'experience';
  if (/技能|技术栈/.test(label)) return 'skills';
  if (/个人|基本|联系/.test(label)) return 'basic';
  return 'other';
}
export const blockedLabel = (text: string) => /密码|验证码|校验码|身份证|证件号|护照|银行卡|信用卡|银行账户|承诺|声明|同意|隐私|协议|授权|调剂|password|passcode|one.?time|otp|captcha|passport|credit.?card|bank.?account|consent|agreement/i.test(text);
type Definition = { section: Section; key: string; label: string; aliases: string[] };
export const definitions: Definition[] = [
  { section: 'basic', key: 'full_name', label: '姓名', aliases: ['姓名', '真实姓名', '中文姓名', '名字', 'fullname', 'name'] },
  { section: 'basic', key: 'email', label: '邮箱', aliases: ['邮箱', '电子邮箱', '电子邮件', 'email', 'emailaddress'] },
  { section: 'basic', key: 'phone', label: '手机号', aliases: ['手机号', '手机号码', '联系电话', '电话', 'mobile', 'phone', 'tel'] },
  { section: 'basic', key: 'city', label: '现居城市', aliases: ['现居城市', '现居住地', '目前居住城市', '居住城市', 'city'] },
  { section: 'basic', key: 'job_intention', label: '求职意向', aliases: ['求职意向', '意向职位', '期望职位', '应聘岗位'] },
  { section: 'education', key: 'school', label: '学校', aliases: ['学校', '学校名称', '毕业院校', '就读院校', '院校', 'school', 'university'] },
  { section: 'education', key: 'major', label: '专业', aliases: ['专业', '所学专业', '专业名称', '就读专业', 'major'] },
  { section: 'education', key: 'education_level', label: '就读学历', aliases: ['学历', '就读学历', '学历层次', 'educationlevel'] },
  { section: 'education', key: 'degree', label: '已获学位', aliases: ['学位', '已获学位', '所获学位', 'degree'] },
  { section: 'education', key: 'expected_degree', label: '预计学位', aliases: ['预计学位', '拟获学位'] },
  { section: 'education', key: 'study_mode', label: '学习形式', aliases: ['学习形式', '学习方式', '培养方式'] },
  { section: 'education', key: 'start_month', label: '入学时间', aliases: ['入学时间', '入学年月', '开始时间', '开始年月', 'startdate'] },
  { section: 'education', key: 'end_month', label: '毕业时间', aliases: ['毕业时间', '毕业年月', '结束时间', '结束年月', 'enddate', '预计毕业时间'] },
  { section: 'experience', key: 'organization', label: '单位', aliases: ['公司', '公司名称', '单位', '单位名称', '实习单位', '工作单位', '实习公司', 'company', 'organization'] },
  { section: 'experience', key: 'role', label: '职位', aliases: ['职位', '岗位', '职务', '实习职位', '担任职务', 'role', 'position'] },
  { section: 'experience', key: 'start_month', label: '开始时间', aliases: ['开始时间', '开始年月', '入职时间', '实习开始时间', 'startdate'] },
  { section: 'experience', key: 'end_month', label: '结束时间', aliases: ['结束时间', '结束年月', '离职时间', '实习结束时间', 'enddate'] },
  { section: 'experience', key: 'facts', label: '工作内容', aliases: ['工作内容', '实习内容', '工作描述', '主要职责', '职责描述'] },
  { section: 'projects', key: 'name', label: '项目名称', aliases: ['项目名称', '项目名', 'projectname'] },
  { section: 'projects', key: 'role', label: '项目角色', aliases: ['项目角色', '担任角色', '承担角色', '角色', 'role'] },
  { section: 'projects', key: 'start_month', label: '开始时间', aliases: ['开始时间', '开始年月', '项目开始时间', 'startdate'] },
  { section: 'projects', key: 'end_month', label: '结束时间', aliases: ['结束时间', '结束年月', '项目结束时间', 'enddate'] },
  { section: 'projects', key: 'technologies', label: '技术栈', aliases: ['技术栈', '使用技术', '技术工具', 'technologies'] },
  { section: 'projects', key: 'facts', label: '项目描述', aliases: ['项目描述', '项目内容', '项目介绍', '项目职责'] },
  { section: 'skills', key: 'skills', label: '技能', aliases: ['技能', '专业技能', '技能特长', '掌握技能', 'skills'] },
];
const enumText: Record<string, string> = { associate: '大专', bachelor: '本科', master: '硕士研究生', doctor: '博士研究生', full_time: '全日制', part_time: '非全日制', other: '其他', engineering_master: '工学硕士' };
export interface Source { ref: string; definition: Definition; recordId?: string; recordTitle?: string; recordKind?: string | null; value: string; note?: string; description?:string }
export function sources(profile: Profile): Source[] {
  const all: Source[] = [];
  for (const d of definitions) {
    if (d.section === 'basic') {
      all.push({ ref: `basic/${d.key}`, definition: d, value: profile.basic[d.key as keyof Profile['basic']] ?? '' });
    } else if (d.section === 'skills') {
      all.push({ ref: 'skills', definition: d, value: profile.skills.join('、') });
    } else if (d.section === 'education' || d.section === 'experience' || d.section === 'projects') {
      profile[d.section].forEach((item, index) => {
        const raw = (item as Record<string, unknown>)[d.key];
        const value = Array.isArray(raw) ? raw.map(v => typeof v === 'string' ? v : v.text).join(d.key === 'facts' ? '\n' : '、') : typeof raw === 'string' ? enumText[raw] ?? raw : '';
        all.push({ ref: `${d.section}/${item.id}/${d.key}`, definition: d, recordId: item.id,
          recordTitle: ('school' in item ? item.school : 'organization' in item ? item.organization : item.name) || `经历 ${index + 1}`,
          recordKind: 'kind' in item ? item.kind : undefined, value,
          note: d.key === 'end_month' && 'is_expected_end' in item && item.is_expected_end ? '预计结束时间，请核对网页含义' : undefined,
        });
      });
    }
  }
  for (const a of profile.custom_answers) all.push({ ref: `custom_answers/${a.id}`, definition: { section: 'custom_answers', key: a.id, label: a.title, aliases: [a.title] }, value: a.text });
  for(const f of profile.supplemental_fields)if(!blockedLabel(f.label))all.push({ref:`supplemental_fields/${f.id}`,definition:{section:'supplemental_fields',key:f.field_key,label:f.label,aliases:[f.label]},value:f.value??'',description:f.description});
  return all;
}
export function matchDefinition(field: Field): Definition | undefined {
  if (field.blocked || blockedLabel(field.label)) return undefined;
  const label = normalize(field.label);
  let candidates = definitions.filter(d => d.aliases.some(a => normalize(a) === label));
  if (field.section !== 'other') {
    const withinGroup = candidates.filter(d => d.section === field.section);
    candidates = withinGroup;
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function bindingKey(field: Field, section: Section) { return `${field.groupId}:${section}`; }
export function sourceCompatible(field:Field,source:Source,bindings:Record<string,string>={}):boolean {
  if(field.blocked||blockedLabel(field.label)||blockedLabel(source.definition.label))return false;
  if(/紧急联系|亲属|家庭成员|父亲|母亲|配偶|emergency|parent|spouse/i.test(field.label+' '+field.groupLabel))return false;
  const s=source.definition.section;
  if(field.section!=='other'&&!['supplemental_fields','custom_answers'].includes(s)&&field.section!==s)return false;
  if(/实习/.test(field.label+field.groupLabel)&&source.recordId&&s==='experience'&&source.recordKind!=='internship')return false;
  const bound=bindings[bindingKey(field,s)];if(source.recordId&&bound&&bound!==source.recordId)return false;
  return true;
}
export function suggestSource(field: Field, all: Source[], bindings: Record<string, string>): Source | undefined {
  if (field.blocked) return undefined;
  if (field.kind === 'checkbox') return field.section === 'skills' ? all.find(s => s.ref === 'skills' && s.value.split('、').some(v => normalize(v) === normalize(field.label))) : undefined;
  const d = matchDefinition(field);
  let candidates = (d ? all.filter(s => s.definition === d) : all.filter(s => ['custom_answers','supplemental_fields'].includes(s.definition.section) && normalize(s.definition.label) === normalize(field.label))).filter(s=>sourceCompatible(field,s,bindings));
  if (candidates[0]?.recordId) {
    const bound = bindings[bindingKey(field, candidates[0].definition.section)];
    if (bound) candidates = candidates.filter(s => s.recordId === bound);
    if (/实习/.test(field.label + field.groupLabel)) candidates = candidates.filter(s => !s.recordKind || s.recordKind === 'internship');
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
const aliases: Record<string, string[]> = {
  '硕士研究生': ['硕士研究生', '硕士'], '博士研究生': ['博士研究生', '博士'], '大专': ['大专', '专科', '大学专科'],
  '本科': ['本科', '大学本科'], '工学硕士': ['工学硕士', '硕士学位', '硕士'], '工学学士': ['工学学士', '学士学位', '学士'],
};
export function proposedValue(field: Field, source?: Source): { value: Value | null; reason: string } {
  if (field.blocked) return { value: null, reason: field.blocked };
  if (!source) return { value: null, reason: '选择资料来源，或先绑定这一组经历' };
  const value = source.value;
  if (!value.trim()) return { value: null, reason: '资料中尚未填写此项' };
  if (field.kind === 'checkbox') return source.definition.section === 'skills' && field.section === 'skills' && source.value.split('、').some(v => normalize(v) === normalize(field.label))
    ? { value: true, reason: '来自已保存的技能列表' } : { value: null, reason: '不是已确认的技能，请手动处理' };
  if (field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value: null, reason: '此处需要完整日期；不会自动补造日' };
  if (field.kind === 'month' && !/^\d{4}-\d{2}$/.test(value)) return { value: null, reason: '此处需要年月' };
  if (field.kind === 'ant-cascader' && value.split(/\s*\/\s*/).length < 2) return { value: null, reason: '此处需要完整的地区层级；不能只凭城市补造省区' };
  if (field.maxLength >= 0 && value.length > field.maxLength) return { value: null, reason: `超过网页的 ${field.maxLength} 字符限制` };
  if (field.kind === 'select-one' || field.kind === 'radio') {
    const exact = field.options.filter(o => normalize(o.label) === normalize(value));
    const accepted = new Set((aliases[value] ?? [value]).map(normalize));
    const matches = exact.length ? exact : field.options.filter(o => accepted.has(normalize(o.label)));
    if (matches.length !== 1) return { value: null, reason: matches.length ? '多个选项含义相同，请手动选择' : '网页没有唯一匹配选项，请手动选择' };
    return { value: matches[0].value, reason: source.note ?? '已匹配网页选项' };
  }
  return { value, reason: source.note ?? '来自已保存的本地资料' };
}
