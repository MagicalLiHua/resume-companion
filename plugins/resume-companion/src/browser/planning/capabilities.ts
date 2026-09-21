import type {RawField,RawPageForm} from '../form-engine.js';
import {manualReason,manualTasks} from '../manual-policy.js';
import {fixtureDiagnosticsAllowed} from '../execution-mode.js';
import {recipes,type Recipe} from './recipes.js';
import {fieldRules,normalizeField,recipeFor,sectionOf} from './field-rules.js';

export const CAPABILITY_VERSION='2026-09-21.4';
type Family=Recipe['family'];
interface ObservedField {section:string;labels:string[];modes?:NonNullable<RawField['inputMode']>[];}
interface Template {
  id:string;name:string;family:Family;host:string;path:string;company?:string;
  status:'ordinary_fill_verified'|'in_development';modules:string[];steps?:string[][];
  evidence:string;verified_version:string;verified_on:string;
  persistence:'not_verified'|'sample_reopened'|'preview_compared';limitations:string[];
  observed_unmapped?:ObservedField[];
}
interface Platform {
  id:string;name:string;family:Family;hosts:Array<{kind:'exact'|'suffix';value:string}>;
  compatible:boolean;limitations:string[];
}
const evidence='docs/51job与大易适配开发记录-2026-09-21.md';
const automatic='docs/reports/2026-09-21-automatic-preparation-024-development.md';
const cofcoModules=['个人信息','教育经历','社团（学生工作、活动）经历','实习/工作经历','研究项目经历','竞赛经历','获奖情况','语言能力/技能证书','家庭成员信息','自我评价'];
// Explicit employer identities and evidence, not a wildcard for each ATS host.
// Missing modules are valid; new modules/mandatory controls need revalidation.
const templates:Template[]=[
  {id:'feishu/bytedance-campus',name:'飞书／字节校园招聘',family:'ud',host:'jobs.bytedance.com',path:'/campus/resume/edit',status:'ordinary_fill_verified',
    modules:['基本信息','教育经历','实习经历','工作经历','项目经历','作品','竞赛','证书','语言能力','自我评价','社交账号'],
    evidence:automatic,verified_version:'0.24.0+codex.20260921020533',verified_on:'2026-09-21',persistence:'not_verified',
    limitations:['已验证普通字段；仍有资料缺项和未映射的企业字段。','未验证保存与刷新持久化。'],
    observed_unmapped:[{section:'基本信息',labels:['手机号码 / 区号','个人证件 / 类型'],modes:['choice']},{section:'基本信息',labels:['个人证件'],modes:['text']},{section:'教育经历',labels:['实验室','领域方向','导师'],modes:['text']}]},
  {id:'moka/kingdee-campus',name:'Moka／金蝶校园招聘',family:'sd',host:'app.mokahr.com',path:'/campus-recruitment/kingdeehr/166565',status:'ordinary_fill_verified',
    modules:['基础信息','个人信息','求职意向','工作经历','教育背景','实习经历','项目经验','语言能力','自我描述','获奖经历'],
    evidence:automatic,verified_version:'0.24.0+codex.20260921020533',verified_on:'2026-09-21',persistence:'not_verified',
    limitations:['语言程度可能没有等价选项，不能用近似选项替代。','未验证保存与刷新持久化。'],
    observed_unmapped:[{section:'个人信息',labels:['证件号码 / 类型'],modes:['choice']},{section:'个人信息',labels:['证件号码'],modes:['text']}]},
  {id:'beisen/chery',name:'北森／奇瑞',family:'phoenix',host:'chery.zhiye.com',path:'/form',status:'ordinary_fill_verified',
    modules:['个人信息','求职意向','教育经历','工作经历','项目经历'],
    evidence:automatic,verified_version:'0.24.0+codex.20260921020533',verified_on:'2026-09-21',persistence:'not_verified',
    limitations:['学校词库无候选时保留未完成项。','未验证保存与刷新持久化。'],
    observed_unmapped:[{section:'个人信息',labels:['证件号码'],modes:['text']},{section:'求职意向',labels:['现月薪(税前)','期望月薪(税前)','到岗时间'],modes:['choice']}]},
  {id:'51job/cofco',name:'51job／中粮',family:'job51',host:'xyz.51job.com',path:'/External/MyResume/FillInResume.aspx',company:'9f8de839-e7de-40c9-8f16-10526e9ac1be',status:'ordinary_fill_verified',
    modules:cofcoModules,steps:[...cofcoModules.map(s=>[s]),['本人承诺']],evidence,verified_version:'0.24.0+codex.20260921061719',verified_on:'2026-09-21',persistence:'preview_compared',
    limitations:['已验证十个普通页；未测条件分支仍需实时检查。','照片、亲属任职及本人承诺由用户处理。','预览比对不代表最终申请提交。']},
  {id:'51job/j10058',name:'51job／J10058',family:'job51',host:'xyz.51job.com',path:'/External/MyResume/FillInResume.aspx',company:'470877a9-5b7a-4eb3-ad0e-4f6c732e27ec',status:'ordinary_fill_verified',
    modules:['基本信息','教育经历','教育背景','IT技能','实习/工作经验','自我评价'],
    steps:[['上传附件简历','上传个人附件简历'],['基本信息'],['教育经历','教育背景'],['IT技能'],['实习/工作经验'],['自我评价']],
    evidence,verified_version:'0.24.0+codex.20260921045442',verified_on:'2026-09-21',persistence:'sample_reopened',limitations:['只对已验收样本的普通字段有保存后重开证据。','可选附件跳过，最终提交不自动执行。']},
  {id:'dayee/faw',name:'大易／中国一汽',family:'dayee',host:'faw-zhaopin.hotjob.cn',path:'/SU603374380dcad4635b836531/pb/resumeOperation.html',status:'ordinary_fill_verified',modules:['个人基本信息','教育经历','实习经历','工作经历','项目经验','校内职务','技能资质','外语能力','其他外语能力','家庭关系','科研经历','自我评价'],
    evidence:'docs/reports/2026-09-21-dayee-guopin-development.md',verified_version:'0.24.0+codex.20260921125511',verified_on:'2026-09-21',persistence:'sample_reopened',limitations:['本硕、基础信息和普通经历共 114 项完成 UI 读回；必填证件照及声明仍由本人处理。','整份保存和刷新内容验收未完成；不能据此声称投递或整站验收通过。'],observed_unmapped:[{section:'个人基本信息',labels:['期望面试地点'],modes:['choice']}]},
  {id:'51job/jiangsu-bank',name:'51job／江苏农商银行',family:'job51',host:'xyz.51job.com',path:'/External/MyResume/FillInResume.aspx',company:'26b69a02-efa5-4674-a984-40bcae578b0a',status:'in_development',modules:['个人信息','教育背景'],
    evidence:'docs/产品流程与架构收敛计划-2026-09-21.md',verified_version:'0.24.0+codex.20260921061719',verified_on:'2026-09-21',persistence:'not_verified',limitations:['仅个人页经过原站填写；教育与后续页面尚未完成验收。']},
  {id:'guopin/resume',name:'国聘／简历编辑器',family:'guopin',host:'c.iguopin.com',path:'/resume',status:'ordinary_fill_verified',modules:['求职意向','教育经历','项目经历','工作/实习经历','自我评价','资格证书'],
    evidence:'docs/reports/2026-09-21-dayee-guopin-development.md',verified_version:'0.24.0+codex.20260921125511',verified_on:'2026-09-21',persistence:'sample_reopened',limitations:['六类模块已有填写、保存及刷新证据；本硕、三条工作、意向、自评及四项证书完成 72 项独立预览比对。','账号基本信息保持已有值，未验证空白账号基础信息填写；自定义增加的其他模块、附件及当前在职分支不在本次已验收范围。','模块保存不等于最终申请提交。']},
];
const platforms:Platform[]=[
  {id:'feishu-recruitment',name:'飞书招聘',family:'ud',hosts:[{kind:'exact',value:'jobs.bytedance.com'}],compatible:true,limitations:['当前可信来源仅包含已实测的招聘站；新增官方承载域名需加入目录。']},
  {id:'moka',name:'Moka',family:'sd',hosts:[{kind:'exact',value:'app.mokahr.com'}],compatible:true,limitations:['兼容页面只填写实时扫描后可识别的普通字段。']},
  {id:'beisen',name:'北森',family:'phoenix',hosts:[{kind:'suffix',value:'zhiye.com'}],compatible:true,limitations:['不同企业词库仍以页面候选和执行核验为准。']},
  {id:'dayee',name:'大易',family:'dayee',hosts:[{kind:'suffix',value:'hotjob.cn'}],compatible:true,limitations:['企业专用字段和选项转换不从一汽模板继承。']},
  {id:'guopin',name:'国聘',family:'guopin',hosts:[{kind:'exact',value:'c.iguopin.com'}],compatible:true,limitations:['只处理已识别的简历模块，不自动增加网站未开放的模块。']},
  {id:'51job-custom',name:'51job 企业定制',family:'job51',hosts:[{kind:'exact',value:'xyz.51job.com'}],compatible:false,limitations:['分页和企业差异较大，继续按精确企业模板验收。']},
];
export interface SupportDifference {code:string;scope?:string;field?:string;required?:boolean;}
type PublicTemplate=ReturnType<typeof publicTemplate>;
type PublicPlatform=ReturnType<typeof publicPlatform>;
export interface SupportReport {
  catalog_version:string;status:'supported_partial'|'unsupported_template'|'template_in_development'|'page_changed'|'not_resume_form'|'platform_candidate'|'fixture';
  autofill_allowed:boolean;match_level?:'verified_template'|'compatible_platform'|'platform_candidate'|'fixture';template?:PublicTemplate;platform?:PublicPlatform;
  differences:SupportDifference[];difference_count:number;blocking_difference_count:number;advisory_difference_count:number;
  observed_modules:string[];known_unmapped_fields:Array<{scope:string;field:string;required:boolean}>;
  fillable_modules:string[];skipped_modules:string[];manual_task_count:number;
}
function publicTemplate(t:Template){
  return {id:t.id,name:t.name,family:t.family,status:t.status,modules:t.modules,evidence:t.evidence,verified_version:t.verified_version,verified_on:t.verified_on,persistence:t.persistence,limitations:t.limitations};
}
function platformModules(p:Platform):string[]{return [...new Set(templates.filter(t=>t.family===p.family&&t.status==='ordinary_fill_verified').flatMap(t=>t.modules))];}
function publicPlatform(p:Platform){return {id:p.id,name:p.name,family:p.family,compatible:p.compatible,modules:platformModules(p),evidence_templates:templates.filter(t=>t.family===p.family&&t.status==='ordinary_fill_verified').map(t=>t.id),limitations:p.limitations};}
export function capabilityCatalog(){return {catalog_version:CAPABILITY_VERSION,platforms:platforms.map(publicPlatform),templates:templates.map(publicTemplate)};}
const isButton=(f:RawField)=>f.tag==='button'||f.role==='button';
const hostMatches=(host:string,rule:Platform['hosts'][number])=>rule.kind==='exact'?host===rule.value:host===rule.value||host.endsWith(`.${rule.value}`);
const platformForUrl=(url:URL)=>url.protocol==='https:'?platforms.find(p=>p.hosts.some(rule=>hostMatches(url.hostname,rule))):undefined;
const blockingDifference=(d:SupportDifference)=>d.code==='form_family_changed'||d.code==='workflow_changed'||d.code==='origin_not_trusted'||d.code==='unrecognized_required_control'||d.code==='unknown_required_module'||d.code==='unknown_required_field'||Boolean(d.required&&['control_kind_changed','unsupported_control_kind'].includes(d.code));
function kindSupported(f:RawField,keys:string[],component:boolean):boolean {
  if(!['text','choice','choice_or_custom','date','boolean'].includes(f.inputMode??''))return false;
  if(component)return true;
  if(keys.some(k=>['full_name','phone','email','description','combined_description','responsibilities','self_description','portfolio_url','url'].includes(k)))return f.inputMode==='text';
  if(keys.some(k=>['range','start','end','obtained_month','birth_date'].includes(k)))return f.inputMode==='date';
  return !['checkbox','radio'].includes(f.type)||f.inputMode==='boolean'||f.inputMode==='choice';
}
/** No values, resume identifiers, or query strings are included in this report. */
export function inspectSupport(raw:RawPageForm,env:NodeJS.ProcessEnv=process.env):SupportReport {
  const differences:SupportDifference[]=[],known_unmapped_fields:SupportReport['known_unmapped_fields']=[],fillable=new Set<string>();
  const observedModuleSet=new Set(raw.fields.filter(f=>f.plannerFamily&&!isButton(f)).map(f=>sectionOf(f.scope)));
  let template:Template|undefined,platform:Platform|undefined,match_level:SupportReport['match_level'];
  const result=(status:SupportReport['status']):SupportReport=>{
    const blocking=differences.filter(blockingDifference).length;
    const observed_modules=[...observedModuleSet];
    const fillable_modules=observed_modules.filter(module=>fillable.has(module));
    return {catalog_version:CAPABILITY_VERSION,observed_modules,known_unmapped_fields,fillable_modules,skipped_modules:observed_modules.filter(module=>!fillable.has(module)),manual_task_count:manualTasks(raw).length,status,
      autofill_allowed:(status==='supported_partial'&&blocking===0)||status==='fixture',...(match_level?{match_level}:{}),...(template?{template:publicTemplate(template)}:{}),...(platform?{platform:publicPlatform(platform)}:{}),
      differences:differences.slice(0,20),difference_count:differences.length,blocking_difference_count:blocking,advisory_difference_count:differences.length-blocking};
  };
  if(fixtureDiagnosticsAllowed(raw.url,env)){match_level='fixture';return result('fixture');}
  let url:URL;try{url=new URL(raw.url);}catch{return result('unsupported_template');}
  const path=url.pathname.replace(/\/$/,'');
  template=templates.find(t=>url.protocol==='https:'&&url.hostname===t.host&&path===t.path&&(!t.company||url.searchParams.get('CtmID')?.toLowerCase()===t.company));
  platform=platformForUrl(url);
  if(template){
    match_level='verified_template';platform=platforms.find(p=>p.family===template!.family);
    if(template.status==='in_development')return result('template_in_development');
  }
  const recipe=recipeFor(raw.fields);
  if(!raw.fields.some(f=>f.plannerFamily&&!isButton(f))&&!raw.workflow)return result('not_resume_form');
  if(!template){
    if(platform){
      if(!platform.compatible)return result('unsupported_template');
      match_level='compatible_platform';
      if(recipe?.family!==platform.family){differences.push({code:'form_family_changed'});return result('page_changed');}
    }else if(recipe){
      platform=platforms.find(p=>p.family===recipe.family&&p.compatible);
      if(platform){match_level='platform_candidate';differences.push({code:'origin_not_trusted'});return result('platform_candidate');}
      return result('unsupported_template');
    }else return result('unsupported_template');
  }
  const family=template?.family??platform!.family;
  if(recipe?.family!==family&&!(family==='job51'&&raw.workflow&&!recipe))differences.push({code:'form_family_changed'});
  if(template?.steps){
    const w=raw.workflow;
    if(!w||w.steps.length!==template.steps.length||w.steps.some((s,i)=>!template!.steps![i]?.includes(s))||w.current<0||w.current>=w.steps.length||!w.heading.startsWith(w.steps[w.current]!))differences.push({code:'workflow_changed'});
  }
  const rules=recipes.find(r=>r.family===family)!;
  for(const section of raw.sections)if(rules.sections.some(rule=>rule.sections.includes(section)))observedModuleSet.add(section);
  for(const field of raw.fields)if(field.plannerFamily===family&&rules.sections.some(rule=>rule.sections.includes(sectionOf(field.scope))))observedModuleSet.add(sectionOf(field.scope));
  const evidenceModules=template?.modules??platformModules(platform!);
  const reportedModules=new Set<string>();
  for(const f of raw.fields){
    if(isButton(f)||f.disabled||manualReason(f))continue;
    if(!f.plannerFamily){if(f.required)differences.push({code:'unrecognized_required_control',scope:f.scope,field:f.label,required:true});continue;}
    const section=sectionOf(f.scope);
    const sectionRule=rules.sections.find(r=>r.sections.includes(section));
    if(!sectionRule){
      if(!reportedModules.has(section)){differences.push({code:f.required?'unknown_required_module':'unknown_module',scope:section,required:f.required});reportedModules.add(section);}
      continue;
    }
    if(!evidenceModules.includes(section)&&!reportedModules.has(section)){differences.push({code:'unverified_module',scope:section,required:false});reportedModules.add(section);}
    const unmapped=template?.observed_unmapped?.find(o=>o.section===section&&o.labels.includes(f.label));
    if(unmapped){
      if(unmapped.modes&&!unmapped.modes.includes(f.inputMode!))differences.push({code:'control_kind_changed',scope:f.scope,field:f.label,required:f.required});
      known_unmapped_fields.push({scope:f.scope,field:f.label,required:f.required});continue;
    }
    // Date components are only recognized when their real group is present.
    const group=raw.fields.find(g=>g.frame===f.frame&&g.scope===f.scope&&g.role==='date-group'&&f.label.startsWith(`${g.label} / `));
    const label=group?.label??f.label;
    const semanticLabel=family==='job51'?label.replace(/^(博士|硕士|本科|大专)(是否统招|是否专升本|是否有海外留学经历|担任职务|班级排名|专业排名)$/,'$2'):label;
    const matches=fieldRules(sectionRule,semanticLabel,template?.company??null);
    if(!matches.length&&!sectionRule.negative?.includes(label))differences.push({code:f.required?'unknown_required_field':'unknown_field',scope:f.scope,field:f.label,required:f.required});
    else if(!kindSupported(f,matches.map(m=>m.key),Boolean(group)))differences.push({code:'unsupported_control_kind',scope:f.scope,field:f.label,required:f.required});
    else fillable.add(section);
  }
  return result(differences.some(blockingDifference)?'page_changed':'supported_partial');
}
export class UnsupportedFormError extends Error {
  readonly code='form_not_supported';
  constructor(readonly support:SupportReport){super('form_not_supported');}
}
export function assertSupportedForm(raw:RawPageForm):void {
  const report=inspectSupport(raw);if(!report.autofill_allowed)throw new UnsupportedFormError(report);
}
