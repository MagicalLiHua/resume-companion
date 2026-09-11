import { emptyProfile, newRecord, newId, ProfileSchema, type Profile } from './profile';
import { bytes, type DateMetadata, type SourceDocument } from './state';

export interface ImportIssue {code:string;severity:'warning'|'error';line:number;message:string}
export interface MarkdownResult {candidate:Profile;issues:ImportIssue[];sourceMap:Record<string,number>;fieldMetadata:DateMetadata;sourceDocument:SourceDocument}
type Section='basic'|'education'|'experience'|'projects'|'skills'|'certificates'|'custom_answers'|'unmapped';
type Spec = [string,string,'text'|'list'|'date'|'enum'|'educationState'|'current'|'endNature'];
export const specs:Partial<Record<Section,Spec[]>>={
  basic:[['姓名','full_name','text'],['邮箱','email','text'],['手机','phone','text'],['所在城市','city','text'],['求职意向','job_intention','text']],
  education:[['学校','school','text'],['专业','major','text'],['学历层次','education_level','enum'],['已获学位','degree','text'],['预计学位','expected_degree','text'],['教育状态','completed','educationState'],['学习形式','study_mode','enum'],['开始时间','start_month','date'],['结束时间','end_month','date'],['结束时间性质','is_expected_end','endNature']],
  experience:[['类型','kind','enum'],['公司','organization','text'],['岗位','role','text'],['开始时间','start_month','date'],['结束时间','end_month','date'],['当前状态','is_current','current'],['工作内容','facts','list']],
  projects:[['项目名称','name','text'],['担任角色','role','text'],['开始时间','start_month','date'],['结束时间','end_month','date'],['当前状态','is_current','current'],['技术栈','technologies','list'],['项目内容','facts','list']],
  certificates:[['证书名称','name','text'],['颁发机构','issuer','text'],['取得时间','obtained_month','date']],
  custom_answers:[['问题名称','title','text'],['回答内容','text','list']],
};
const headings:Record<string,Section>={'基本信息':'basic','个人信息':'basic','教育经历':'education','工作与实习':'experience','工作经历':'experience','实习经历':'experience','项目经历':'projects','项目':'projects','技能':'skills','技能清单':'skills','证书':'certificates','固定回答':'custom_answers','补充信息':'unmapped'};
const aliases:Record<string,string>={'电话':'手机','城市':'所在城市','组织':'公司','职位':'岗位'};
const enums:Record<string,Record<string,string>>={education_level:{'大专':'associate','专科':'associate','本科':'bachelor','硕士':'master','博士':'doctor','其他':'other'},study_mode:{'全日制':'full_time','非全日制':'part_time','其他':'other'},kind:{'工作':'work','实习':'internship'}};
const isEmpty=(s:string)=>!s.trim()||/^(未提供|未知|N\/A|不详|-)$/i.test(s.trim());
const labelOf=(s:string)=>s.trim().replace(/^\*\*(.*?)\*\*$/,'$1').trim();
interface RawField {value:string;line:number;spec:Spec}
interface RawRecord {section:Section;line:number;fields:Map<string,RawField>;internship:boolean;extra:boolean}

export function parseMarkdown(raw:string):MarkdownResult {
  const candidate=emptyProfile(), issues:ImportIssue[]=[], fieldMetadata:DateMetadata={}, sourceMap:Record<string,number>={};
  const sourceDocument:SourceDocument={text:raw,templateVersion:'resume-md/1',importedAt:Date.now(),profileRevision:0,unmapped:[]};
  const result={candidate,issues,fieldMetadata,sourceMap,sourceDocument};
  const issue=(code:string,severity:'warning'|'error',line:number,message:string)=>issues.push({code,severity,line,message});
  if(bytes(raw)>262144){issue('INPUT_TOO_LARGE','error',1,'Markdown 超过 256 KiB');return result;}
  const lines=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const nonempty=lines.flatMap((l,i)=>l.trim()?[i]:[]); let first=nonempty[0]??0,last=nonempty.at(-1)??0;
  if(/^```(?:md|markdown)?\s*$/i.test(lines[first]?.trim())) {
    if(lines[last]?.trim()!=='```'||last===first){issue('MULTIPLE_DOCUMENTS','error',first+1,'请只保留一份完整 Markdown 代码块');return result;}
    first++;last--;
  }
  let section:Section|undefined, record:RawRecord|undefined, continuation:RawField|undefined, version=false,recognized=0;
  const records:RawRecord[]=[];
  const keep=(line:number,text:string)=>{sourceDocument.unmapped.push({line,text});if(record)record.extra=true;};
  for(let i=first;i<=last;i++) {
    const line=i+1,text=lines[i],trim=text.trim(); if(!trim)continue;
    if(trim.startsWith('```')){issue('MULTIPLE_DOCUMENTS','error',line,'不支持多个代码块或嵌套代码；请只保留模板正文');keep(line,text);continue;}
    if(/^模板版本\s*[：:]/.test(trim)) {
      const v=trim.replace(/^模板版本\s*[：:]\s*/,''); version=true;
      if(v!=='resume-md/1')issue('TEMPLATE_VERSION_UNSUPPORTED','error',line,'模板版本不支持');continue;
    }
    if(/^#\s+简历\s*$/.test(trim)){continuation=undefined;continue;}
    const h2=trim.match(/^##\s+(.+)$/);
    if(h2){section=Object.hasOwn(headings,h2[1].trim())?headings[h2[1].trim()]:undefined;record=undefined;continuation=undefined;
      if(!section){section='unmapped';issue('SECTION_UNKNOWN','warning',line,'未识别章节已保留；可复制到补充资料表');keep(line,text);}
      if(section==='basic'){record={section,line,fields:new Map(),internship:false,extra:false};records.push(record);}
      continue;
    }
    if(section==='unmapped'){keep(line,text.startsWith('> ')?text.slice(2):text);continue;}
    const h3=trim.match(/^###\s+(.+)$/);
    if(h3){continuation=undefined;if(section&&section!=='basic'&&section!=='skills'){
      record={section,line,fields:new Map(),internship:findChapter(lines,i)==='实习经历',extra:false};records.push(record);
    }else{issue('RECORD_UNGROUPED','warning',line,'条目不在支持的经历章节中');keep(line,text);}continue;}
    if(continuation&&/^\s{2,}\S/.test(text)) {
      const part=text.replace(/^\s{2}/,''); continuation.value+='\n'+part;continue;
    }
    continuation=undefined;
    if(section==='skills'){
      const s=trim.match(/^[-*+]\s+(.*)$/);
      if(s){if(!isEmpty(s[1])&&!candidate.skills.includes(s[1]))candidate.skills.push(s[1]);recognized++;}
      else{issue('FIELD_UNKNOWN','warning',line,'技能请使用普通列表');keep(line,text);}continue;
    }
    const f=trim.match(/^[-*+]\s+(.+?)[：:]\s*(.*)$/);
    if(!f||!section||!record){issue('RECORD_UNGROUPED','warning',line,'无法确认内容所属字段，请使用模板章节和条目标题');keep(line,text);continue;}
    const label=Object.hasOwn(aliases,labelOf(f[1]))?aliases[labelOf(f[1])]:labelOf(f[1]);
    const spec=specs[section]?.find(s=>s[0]===label);
    if(!spec){issue('FIELD_UNKNOWN','warning',line,`未识别字段“${label}”，原文已保留`);keep(line,text);continue;}
    recognized++;
    const field:RawField={spec,value:f[2],line};
    if(record.fields.has(spec[1])){
      const before=record.fields.get(spec[1])!;
      issue('FIELD_CONFLICT',before.value===field.value?'warning':'error',line,`字段重复，另一处在第 ${before.line} 行；请核对后保留一项`);
      keep(line,text);continue;
    }
    record.fields.set(spec[1],field); if(spec[2]==='list')continuation=field;
  }
  if(!recognized)issue('NO_FIELDS','error',1,'没有识别到模板字段，请粘贴完整模板内容');
  if(!version&&recognized)issue('VERSION_MISSING','warning',1,'缺少模板版本，已按 resume-md/1 处理');
  const basicSeen=new Map<string,RawField>();
  for(const rec of records) {
    const {section}=rec;
    if(section!=='basic'&&!rec.extra&&![...rec.fields.values()].some(f=>!isEmpty(listText(f.value))))continue;
    const item:Record<string,unknown>=section==='basic'?candidate.basic:({...newRecord(section as Exclude<Section,'basic'|'skills'|'unmapped'>)});
    if(section==='experience'&&rec.internship)item.kind='internship';
    for(const [key,f] of rec.fields){
      if(section==='basic'&&basicSeen.has(key)) {const old=basicSeen.get(key)!;issue('FIELD_CONFLICT',old.value===f.value?'warning':'error',f.line,`字段与第 ${old.line} 行重复`);continue;}
      if(section==='basic')basicSeen.set(key,f);
      const path=`${section==='basic'?'basic':item.id}.${key}`;sourceMap[path]=f.line;
      const v=f.value.trim();if(isEmpty(v))continue;
      switch(f.spec[2]) {
        case 'text':item[key]=v;break;
        case 'list': {
          const entries=listItems(v);if(key==='text')item[key]=entries.join('\n');
          else item[key]=key==='facts'?entries.map(text=>({id:newId(),text})):entries;break;
        }
        case 'enum': {
          const mapped=enums[key]&&Object.hasOwn(enums[key],v)?enums[key][v]:undefined;if(mapped)item[key]=mapped;else{issue('ENUM_UNKNOWN','warning',f.line,`“${v}”不在支持选项中，暂不填写此项`);keep(f.line,`${f.spec[0]}：${v}`);}break;
        }
        case 'educationState': {
          const state:Record<string,[boolean,boolean]>={'已完成':[true,false],'在读':[false,true],'未完成':[false,false]};
          if(Object.hasOwn(state,v)){item.completed=state[v][0];item.is_current=state[v][1];}else{issue('ENUM_UNKNOWN','warning',f.line,'教育状态未识别');keep(f.line,`教育状态：${v}`);}break;
        }
        case 'current':if(v==='进行中')item.is_current=true;else if(v==='已结束')item.is_current=false;else{issue('ENUM_UNKNOWN','warning',f.line,'当前状态未识别');keep(f.line,`当前状态：${v}`);}break;
        case 'endNature':if(v==='实际')item.is_expected_end=false;else if(v==='预计')item.is_expected_end=true;else{issue('ENUM_UNKNOWN','warning',f.line,'结束时间性质未识别');keep(f.line,`结束时间性质：${v}`);}break;
        case 'date': {
          if(v==='至今'&&key==='end_month')break;
          const clean=v.replace(/^预计\s*/,'').replace(/年|月/g,'-').replace(/日$/,'').replace(/\/$/,'').replace(/\//g,'-').replace(/-$/,'');
          const parts=clean.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
          const year=parts?Number(parts[1]):0,month=Number(parts?.[2]??1),day=Number(parts?.[3]??1);
          if(!parts||year<1||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()){
            issue('DATE_INVALID','error',f.line,'无效日期，请改为 YYYY、YYYY-MM 或 YYYY-MM-DD');keep(f.line,`${f.spec[0]}：${v}`);break;
          }
          const normalized=parts[2]?`${parts[1]}-${String(month).padStart(2,'0')}`:null;
          item[key]=normalized;fieldMetadata[path]={raw:v,precision:parts[3]?'day':parts[2]?'month':'year',normalized};
          if(!parts[2])issue('DATE_PRECISION_INSUFFICIENT','warning',f.line,'只有年份，已保留原文；补充月份后才能填年月控件');break;
        }
      }
    }
    const end=rec.fields.get('end_month');
    if(end?.value.trim()==='至今'){
      if(item.is_current===false||item.completed===true)issue('STATUS_CONFLICT','error',end.line,'至今与已完成或已结束矛盾');
      else{item.is_current=true;if(section==='education')item.completed=false;}item.end_month=null;
    }
    if(end?.value.trim().startsWith('预计')){
      if(item.is_expected_end===false)issue('STATUS_CONFLICT','error',end.line,'预计日期与实际结束性质冲突');
      if(section==='education')item.is_expected_end=true;
    }
    const from=fieldMetadata[`${item.id}.start_month`],to=fieldMetadata[`${item.id}.end_month`];
    if(from&&to){
      const bound=(meta:DateMetadata[string],upper:boolean)=>{const parts=meta.raw.match(/\d+/g)??[];const year=parts[0],month=String(Number(parts[1]??(upper?12:1))).padStart(2,'0'),day=String(Number(parts[2]??(upper?new Date(Number(year),Number(month),0).getDate():1))).padStart(2,'0');return `${year}-${month}-${day}`;};
      if(bound(from,false)>bound(to,true))issue('DATE_RANGE','error',end?.line??rec.line,'结束时间不能早于开始时间（按已提供的日期精度核对）');
    }
    if(section!=='basic')(candidate[section as 'education'] as unknown[]).push(item);
  }
  const validated=ProfileSchema.safeParse(candidate);
  if(!validated.success)for(const e of validated.error.issues){
    const [section,index,field]=e.path;const item=typeof index==='number'?(candidate as unknown as Record<string,Array<{id:string}>>)[String(section)]?.[index]:null;
    const key=item?`${item.id}.${String(field??'')}`:`${String(section)}.${String(index)}`;
    issue('PROFILE_INVALID','error',sourceMap[key]??1,e.code==='custom'?e.message:`${e.path.join(' / ')}：内容格式或数量超出限制`);
  }
  return result;
}
function findChapter(lines:string[],index:number){for(let i=index-1;i>=0;i--){const m=lines[i].trim().match(/^##\s+(.+)$/);if(m)return m[1];}return '';}
function listItems(value:string):string[]{
  const output:string[]=[];
  for(const line of value.trim().split('\n')){
    if(!line.trim())continue;
    if(/^\s{2,}/.test(line)&&output.length){output[output.length-1]+='\n'+(/^\s+[-*+]\s/.test(line)?line:line.trimStart());continue;}
    const m=line.match(/^\s*[-*+]\s+(.*)$/);
    if(m){if(!isEmpty(m[1]))output.push(m[1]);}
    else if(!isEmpty(line)){if(output.length&&/^\s/.test(line))output[output.length-1]+='\n'+line.trim();else output.push(line.trim());}
  }return output;
}
function listText(value:string){return listItems(value).join('\n');}
export function exportMarkdown(profile:Profile, metadata:DateMetadata={}, source:SourceDocument|null=null):string {
  const out=['# 简历','模板版本：resume-md/1',''];
  const titles:Record<string,string>={basic:'基本信息',education:'教育经历',experience:'工作与实习',projects:'项目经历',skills:'技能',certificates:'证书',custom_answers:'固定回答'};
  for(const section of ['basic','education','experience','projects','skills','certificates','custom_answers'] as const){
    const items=section==='basic'?[profile.basic]:section==='skills'?[]:profile[section];
    if(section!=='basic'&&!profile[section].length)continue;
    out.push(`## ${titles[section]}`);
    if(section==='skills'){out.push(...profile.skills.map(s=>`- ${s}`),'');continue;}
    items.forEach((entry,i)=>{
      const item=entry as Record<string,unknown>;if(section!=='basic')out.push(`### ${titles[section]} ${i+1}`);
      for(const [label,key,type] of specs[section]??[]){
        let value=item[key];
        if(type==='enum')value=Object.entries(enums[key]).find(([,v])=>v===value)?.[0]??null;
        if(type==='educationState')value=item.completed===true?'已完成':item.is_current===true?'在读':item.completed===false&&item.is_current===false?'未完成':null;
        if(type==='current')value=value===true?'进行中':value===false?'已结束':null;
        if(type==='endNature')value=value===true?'预计':value===false?'实际':null;
        if(type==='date'){const meta=metadata[`${item.id}.${key}`];if(meta&&meta.normalized===item[key])value=meta.raw;else if(key==='end_month'&&item.is_current===true&&!value)value='至今';}
        if(type==='list'){
          const list=Array.isArray(value)?value.map(v=>typeof v==='string'?v:(v as {text:string}).text):value?[String(value)]:[];
          out.push(`- ${label}：`,...(list.length?list:['未提供']).map(v=>v.split('\n').map((line,i)=>i===0?`  - ${line}`:/^\s+[-*+]\s/.test(line)?`  ${line}`:`    ${line}`).join('\n')));
        }else out.push(`- ${label}：${value??'未提供'}`);
      }out.push('');
    });
  }
  if(source?.unmapped.length){out.push('## 补充信息',...source.unmapped.flatMap(u=>u.text.split('\n').map(l=>`> ${l}`)),'');}
  return out.join('\n');
}
