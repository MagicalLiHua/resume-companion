import { useId } from 'react';
import { newId, newRecord, parseProfile, type Profile, type RecordSection } from '../domain/profile';

export const navigation = [
  ['basic', '01', '基本资料', '让每一次填写，都从准确的信息开始。'],
  ['education', '02', '教育经历', '区分已获学位与预计学位，按实际情况填写。'],
  ['experience', '03', '工作与实习', '把做过的事情写清楚，后续直接用于网页填写。'],
  ['projects', '04', '项目经历', '记录项目、承担的角色和可核实的成果。'],
  ['skills', '05', '专业技能', '只记录你已掌握、愿意在面试中说明的技能。'],
  ['certificates', '06', '证书记录', '记录证书信息，特殊证书字段暂需手填。'],
  ['custom_answers', '07', '固定回答', '保存已审核的自我评价等文字，下次直接使用。'],
  ['supplemental_fields', '08', '补充资料', '维护简历之外的信息；重新导入简历时保留。'],
] as const;
export type Tab = typeof navigation[number][0];
export function Input({ label, value, onChange, type = 'text', multiline = false, placeholder }: { label: string; value: string | null; onChange: (s: string | null) => void; type?: string; multiline?: boolean; placeholder?: string }) {
  const id = useId();
  return <label className={`form-field ${multiline ? 'span-2' : ''}`} htmlFor={id}><span>{label}</span>{multiline
    ? <textarea id={id} value={value ?? ''} onChange={e => onChange(e.target.value || null)} placeholder={placeholder} rows={4}/>
    : <input id={id} type={type} value={value ?? ''} onChange={e => onChange(e.target.value || null)} placeholder={placeholder}/>}</label>;
}
export function Select({ label, value, options, onChange }: { label: string; value: string | null; options: [string, string][]; onChange: (s: string | null) => void }) {
  const id = useId();
  return <label className="form-field" htmlFor={id}><span>{label}</span><select id={id} value={value ?? ''} onChange={e => onChange(e.target.value || null)}><option value="">暂未填写</option>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>;
}
export function describeImport(profile: Profile) {
  return [profile.basic.full_name || '未填写姓名', `${profile.education.length} 段教育`, `${profile.experience.length} 段工作 / 实习`, `${profile.projects.length} 个项目`, `${profile.skills.length} 项技能`].join(' · ');
}
export function prepareProfile(draft: Profile) {
  // Keep separators while typing; remove empty list rows only at the save/export boundary.
  const profile = structuredClone(draft);
  profile.skills = profile.skills.map(s => s.trim()).filter(Boolean);
  for (const record of [...profile.experience, ...profile.projects]) record.facts = record.facts.filter(f => f.text.trim());
  for (const project of profile.projects) project.technologies = project.technologies.map(s => s.trim()).filter(Boolean);
  return parseProfile(profile);
}
const friendly: Record<string, string> = { basic: '基本资料', full_name: '姓名', email: '邮箱', phone: '手机', city: '现居城市', job_intention: '求职意向', education: '教育', school: '学校', major: '专业', education_level: '学历', degree: '已获学位', expected_degree: '预计学位', completed: '已完成', study_mode: '学习形式', start_month: '开始时间', end_month: '结束时间', is_current: '进行中', is_expected_end: '预计结束', experience: '工作与实习', kind: '类型', organization: '单位', role: '角色', facts: '经历事实', text: '内容', projects: '项目', name: '名称', technologies: '技术', skills: '技能', certificates: '证书', issuer: '颁发机构', obtained_month: '取得年月', custom_answers: '固定回答', title: '标题', supplemental_fields:'补充资料', label:'资料名称', description:'含义说明', value:'资料内容', value_type:'内容类型' };
export function importDiff(before: Profile, after: Profile) {
  function flatten(value: unknown, path: string[] = [], out: Record<string, string> = {}) {
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (!['id', 'profile_id', 'revision', 'schema_version', 'field_key'].includes(k)) flatten(v, [...path, /^\d+$/.test(k) ? `第 ${Number(k) + 1} 项` : friendly[k] ?? k], out);
    } else out[path.join(' / ')] = value === null || value === '' ? '未填写' : value === true ? '是' : value === false ? '否' : String(value);
    return out;
  }
  const a = flatten(before), b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]).map(k => ({ key: k, before: a[k] ?? '无', after: b[k] ?? '移除' }));
}
export function ProfileFields({profile, onChange, tab, disabled = false}: {profile: Profile; onChange: (p: Profile) => void; tab: Tab; disabled?: boolean}) {
  const current = navigation.find(n => n[0] === tab)!;
  function edit(fn: (p: Profile) => void) { const next = structuredClone(profile); fn(next); onChange(next); }
  function changeRecord(section: RecordSection, index: number, key: string, value: unknown) { edit(p => { (p[section][index] as Record<string, unknown>)[key] = value; }); }
  function changeFacts(section: 'experience' | 'projects', index: number, value: string | null) {
    edit(p => { const previous = p[section][index].facts; p[section][index].facts = (value ? value.split('\n') : []).map((text, i) => ({ id: previous[i]?.id ?? newId(), text })); });
  }
  function dates(section: 'education' | 'experience' | 'projects', i: number) {
    const record = profile[section][i];
    return <><Input label={section === 'education' ? '入学年月' : '开始年月'} type="month" value={record.start_month} onChange={v => changeRecord(section, i, 'start_month', v)}/><Input label={section === 'education' && profile.education[i].is_expected_end ? '预计毕业年月' : '结束年月'} type="month" value={record.end_month} onChange={v => changeRecord(section, i, 'end_month', v)}/></>;
  }
  function recordFields(section: RecordSection, i: number) {
    if (section === 'education') {
      const r = profile.education[i];
      return <><Input label="学校名称" value={r.school} onChange={v => changeRecord(section, i, 'school', v)}/><Input label="所学专业" value={r.major} onChange={v => changeRecord(section, i, 'major', v)}/><Select label="就读学历" value={r.education_level} options={[["associate","大专"],["bachelor","本科"],["master","硕士研究生"],["doctor","博士研究生"],["other","其他"]]} onChange={v => changeRecord(section, i, 'education_level', v)}/><Select label="学习形式" value={r.study_mode} options={[["full_time","全日制"],["part_time","非全日制"],["other","其他"]]} onChange={v => changeRecord(section, i, 'study_mode', v)}/><Input label="已获得学位" placeholder="尚未授予则留空" value={r.degree} onChange={v => changeRecord(section, i, 'degree', v)}/><Input label="预计获得学位" placeholder="例如：工学硕士" value={r.expected_degree} onChange={v => changeRecord(section, i, 'expected_degree', v)}/>{dates(section, i)}<Select label="教育状态" value={r.completed === true ? 'completed' : r.is_current === true ? 'current' : r.completed === false && r.is_current === false ? 'incomplete' : null} options={[["completed","已完成"],["current","在读"],["incomplete","未完成"]]} onChange={v => edit(p => {const e=p.education[i]; e.completed=v===null?null:v==='completed';e.is_current=v===null?null:v==='current';})}/><Select label="结束时间性质" value={r.is_expected_end === null ? null : r.is_expected_end ? 'expected' : 'actual'} options={[["expected","预计"],["actual","实际"]]} onChange={v=>changeRecord(section,i,'is_expected_end',v===null?null:v==='expected')}/></>;
    }
    if (section === 'experience') {
      const r = profile.experience[i];
      return <><Input label="单位名称" value={r.organization} onChange={v => changeRecord(section, i, 'organization', v)}/><Input label="担任职位" value={r.role} onChange={v => changeRecord(section, i, 'role', v)}/><Select label="经历类型" value={r.kind} options={[["internship","实习"],["work","正式工作"]]} onChange={v => changeRecord(section, i, 'kind', v)}/><div/>{dates(section, i)}<Select label="目前仍在此任职" value={r.is_current===null?null:r.is_current?'current':'ended'} options={[["current","进行中"],["ended","已结束"]]} onChange={v=>changeRecord(section,i,'is_current',v===null?null:v==='current')}/><Input label="工作内容（每行一项）" multiline value={r.facts.map(f => f.text).join('\n')} onChange={v => changeFacts(section, i, v)}/></>;
    }
    if (section === 'projects') {
      const r = profile.projects[i];
      return <><Input label="项目名称" value={r.name} onChange={v => changeRecord(section, i, 'name', v)}/><Input label="项目角色" value={r.role} onChange={v => changeRecord(section, i, 'role', v)}/>{dates(section, i)}<Select label="项目仍在进行" value={r.is_current===null?null:r.is_current?'current':'ended'} options={[["current","进行中"],["ended","已结束"]]} onChange={v=>changeRecord(section,i,'is_current',v===null?null:v==='current')}/><Input label="技术栈（用顿号或逗号分隔）" value={r.technologies.join('、')} onChange={v => changeRecord(section, i, 'technologies', v ? v.split(/[、,，]/) : [])}/><div/><Input label="项目描述（每行一项）" multiline value={r.facts.map(f => f.text).join('\n')} onChange={v => changeFacts(section, i, v)}/></>;
    }
    if (section === 'certificates') {
      const r = profile.certificates[i];
      return <><Input label="证书名称" value={r.name} onChange={v => changeRecord(section, i, 'name', v)}/><Input label="颁发机构" value={r.issuer} onChange={v => changeRecord(section, i, 'issuer', v)}/><Input label="取得年月" type="month" value={r.obtained_month} onChange={v => changeRecord(section, i, 'obtained_month', v)}/></>;
    }
    if(section==='supplemental_fields'){
      const r=profile.supplemental_fields[i];return <><Input label="资料名称" value={r.label} onChange={v=>changeRecord(section,i,'label',v??'')}/><Select label="内容类型" value={r.value_type} options={[["text","短文本"],["multiline","长文本"]]} onChange={v=>changeRecord(section,i,'value_type',v??'text')}/><Input label="资料内容" value={r.value} multiline={r.value_type==='multiline'} onChange={v=>changeRecord(section,i,'value',v)}/><Input label="含义说明" value={r.description} onChange={v=>changeRecord(section,i,'description',v??'')}/></>;
    }
    const r = profile.custom_answers[i];
    return <><Input label="回答标题（与网页字段对应）" value={r.title} onChange={v => changeRecord(section, i, 'title', v ?? '')}/><div/><Input label="已审核的回答内容" multiline value={r.text} onChange={v => changeRecord(section, i, 'text', v ?? '')}/></>;
  }
  return <fieldset className="editor-content" disabled={disabled}>
      {tab === 'basic' ? <section className="card"><div className="section-heading"><h2>认识你，从这里开始</h2><span>空缺信息可以稍后补充</span></div><div className="form-grid"><Input label="姓名" placeholder="填写你的真实姓名" value={profile.basic.full_name} onChange={v => edit(p => { p.basic.full_name = v; })}/><Input label="手机号码" type="tel" placeholder="用于招聘方联系" value={profile.basic.phone} onChange={v => edit(p => { p.basic.phone = v; })}/><Input label="电子邮箱" type="email" placeholder="name@example.com" value={profile.basic.email} onChange={v => edit(p => { p.basic.email = v; })}/><Input label="现居城市" placeholder="例如：南京" value={profile.basic.city} onChange={v => edit(p => { p.basic.city = v; })}/><Input label="求职意向" placeholder="例如：测试开发工程师" value={profile.basic.job_intention} onChange={v => edit(p => { p.basic.job_intention = v; })}/></div><div className="card-foot">填写时先预览，再把选中的资料带入当前网页。</div></section>
      : tab === 'skills' ? <section className="card"><h2>你的能力清单</h2><Input label="专业技能（每行一项）" multiline value={profile.skills.join('\n')} placeholder={'Python\n接口测试\n数据库基础'} onChange={v => edit(p => { p.skills = v ? v.split('\n') : []; })}/><div className="chips">{profile.skills.map((s, i) => <span key={i}>{s}</span>)}</div></section>
      : <>{profile[tab].map((record, i) => <section className="card record-card" key={record.id}><div className="section-heading"><h2><span className="record-index">{String(i + 1).padStart(2, '0')}</span>{current[2]}</h2><div className="row-actions"><button aria-label={`上移第 ${i + 1} 项`} disabled={!i} onClick={() => edit(p => { const items = p[tab]; [items[i - 1], items[i]] = [items[i], items[i - 1]]; })}>↑</button><button aria-label={`下移第 ${i + 1} 项`} disabled={i === profile[tab].length - 1} onClick={() => edit(p => { const items = p[tab]; [items[i], items[i + 1]] = [items[i + 1], items[i]]; })}>↓</button><button className="danger-text" aria-label={`删除第 ${i + 1} 项`} onClick={() => edit(p => { p[tab].splice(i, 1); })}>移除</button></div></div><div className="form-grid">{recordFields(tab, i)}</div></section>)}<button className="add-record" onClick={() => edit(p => { (p[tab] as unknown[]).push(newRecord(tab)); })}>＋ 添加{current[2]}</button></>}
      </fieldset>;
}
