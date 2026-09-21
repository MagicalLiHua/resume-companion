import {createHash} from 'node:crypto';
import {capabilityCatalog} from './capabilities.js';
import {recipes} from './recipes.js';
import {manualReason} from '../manual-policy.js';
import type {Requirement,RequirementCatalog} from '../../profile-requirements.js';

/** Projection of supported adapter semantics, without selectors or resume data.
 * Presence in the catalog means "may be requested", never "required everywhere". */
export function requirementsCatalog():RequirementCatalog {
  const templates=capabilityCatalog().templates.filter(t=>t.status==='ordinary_fill_verified');
  const entries=new Map<string,Requirement>();
  const add=(section:string,key:string,label:string,use:Requirement['uses'][number],condition?:Requirement['condition'])=>{
    const id=JSON.stringify([section,key,condition]);
    const entry=entries.get(id)??{section,key,label,uses:[],...(condition?{condition}:{})};
    if(!entry.uses.some(u=>u.template_id===use.template_id&&u.module===use.module))entry.uses.push(use);
    entries.set(id,entry);
  };
  for(const template of templates){
    const recipe=recipes.find(r=>r.family===template.family)!;
    for(const module of template.modules){
      const group=recipe.sections.find(s=>s.sections.includes(module));if(!group)continue;
      const use={template_id:template.id,template_name:template.name,module};
      for(const source of group.sources)for(const rule of group.fields){
        // Employer-specific rules currently belong to the unverified bank.
        if(rule.company||manualReason({label:rule.labels[0]!,scope:module}))continue;
        const key=rule.key,label=rule.labels[0]!;
        if(['school_other','major_other','job51_school_option','job51_major_option','full_time'].includes(key))continue;
        if(key==='range'){
          add(source,'start','开始年月（YYYY-MM）',use);add(source,'end','结束年月（YYYY-MM；仍在进行则留空）',use);
          add(source,'current','是否仍在进行（是/否）',use);continue;
        }
        if(key==='cities'){add('intent','cities','期望工作城市（列表）',use);continue;}
        if(key==='combined_description'){add(source,'description','项目描述',use);add(source,'responsibilities','项目职责',use);continue;}
        if(key==='self_career_description'){add('basic','self_description','自我评价',use);add('basic','career_plan','职业规划',use);continue;}
        if(/^father_|^mother_/.test(key)){
          for(const [k,l] of [['relation','关系（父亲/母亲等）'],['name','姓名'],['organization','工作单位'],['role','职位']])add('family',k!,l!,use);
          continue;
        }
        // Names/text derived from an existing collection are prepared there.
        if(key==='certificate_names'){add('certificates','name','证书名称',use);continue;}
        if(key==='skills_text'){add('basic','skills_text','其他技能',use);continue;}
        if(key==='degree'){
          add(source,'completed','此段学历是否已完成（是/否）',use);
          add(source,key,'已经获得的学位（未获得不填预计学位）',use,{key:'completed',equals:'true'});continue;
        }
        const labels:Record<string,string>={level:'此段就读学历（高中/大专/本科/硕士/博士/其他）',study_mode:'学习形式（全日制/非全日制/其他）',highest_education:'最高学历（注明已获得还是在读，勿混用）',start:'开始年月（YYYY-MM）',end:'结束年月（YYYY-MM）',current:'是否仍在进行（是/否）'};
        add(source,key,labels[key]??label,use);
      }
    }
  }
  const requirements=[...entries.values()];
  return {version:`req-${createHash('sha256').update(JSON.stringify(requirements)).digest('hex').slice(0,16)}`,requirements,template_ids:templates.map(t=>t.id),templates:templates.map(t=>({id:t.id,modules:t.modules}))};
}
