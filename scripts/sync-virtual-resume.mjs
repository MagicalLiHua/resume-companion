import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Test data only. Never reads the user's local profile library.
const fixture=name=>new URL(`../tests/fixtures/${name}`,import.meta.url);
const source=fixture('comprehensive-virtual-profile.json');
const profile=JSON.parse(await readFile(source,'utf8'));
const marker='## 当前自动填写记录与完整补充信息';
const original=await readFile(fixture('complete-virtual-resume.md'),'utf8');
const prefix=original.split(marker)[0].trimEnd();
const labels={basic:'个人基本信息',intent:'求职意向',education:'教育经历',experience:'工作与实习经历',projects:'项目经历',skills:'技能',languages:'语言能力',awards:'获奖情况',certificates:'证书',campus:'校园经历',competitions:'竞赛经历',custom_answers:'自定义回答',section_status:'栏目提供状态'};
let body=`${prefix}\n\n${marker}\n\n以下内容与 \`comprehensive-virtual-profile.json\` 的当前数据逐项同步。字段路径用于精确区分同名经历、家庭成员和企业专属问题；未开放的模块不强行填入网站。\n`;
const line=(path,value)=>{
  const shown=value===null?'未提供':value===true?'是':value===false?'否':String(value);
  const [first,...rest]=shown.split('\n');
  body+=`- \`${path}\`：${first}\n${rest.map(s=>`  ${s}\n`).join('')}`;
};
function walk(value,path){
  if(Array.isArray(value))value.forEach((item,index)=>walk(item,`${path}.${item?.id??index+1}`));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>walk(item,`${path}.${key}`));
  else line(path,value);
}
for(const [section,data] of Object.entries(profile.changes)){
  if(section==='supplemental_fields')continue;
  body+=`\n### ${labels[section]??section}（结构化记录）\n\n`;walk(data,section);
}
body+=`\n### 网申补充字段（${profile.changes.supplemental_fields.length} 项）\n\n`;
for(const item of profile.changes.supplemental_fields)line(item.field_key,item.value);
for(const name of ['complete-virtual-resume.md','comprehensive-virtual-resume.md'])await writeFile(fixture(name),body);
profile.source_markdown=body;
await writeFile(source,JSON.stringify(profile,null,2)+'\n');
console.log(`Synchronized ${profile.changes.supplemental_fields.length} supplemental facts and all structured records to ${fileURLToPath(fixture('complete-virtual-resume.md'))}`);
