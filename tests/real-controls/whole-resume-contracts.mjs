import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {harness,dataOf} from './harness.mjs';
const text=await readFile(new URL('../fixtures/complete-virtual-resume-v1.md',import.meta.url),'utf8');
const part=heading=>{
  const lines=text.split('\n'),start=lines.findIndex(line=>/^#{2,3} /.test(line)&&line.replace(/^#+ /,'')===heading);
  assert.ok(start>=0,heading);
  let end=start+1;while(end<lines.length&&!/^#{2,3} /.test(lines[end]))end++;
  const body=lines.slice(start+1,end).join('\n').trim();
  return {body,get:key=>{const match=body.match(new RegExp(`^- ${key}：(.+)$`,'m'));assert.ok(match,`${heading}: ${key}`);return match[1];}};
};
const browser=await harness();
const call=async(name,args={})=>dataOf(await browser.call(name,args));
const metrics=[];
try {
  for(const seeded of [false,true]) {
    await browser.open('whole-resume',seeded?1:0);
    const started=performance.now();
    const catalog=await call('form_observe',{page_id:browser.pageId,mode:'overview',include_values:'state',max_bytes:80000});
    assert.equal(catalog.coverage.complete,true);
    const facts={},records=[],unresolved=[],protected_fields=[],expected=[];
    function record(section,values,existing=false,missing=[]) {
      const id=`r${records.length}`,found=existing===true?catalog.records.filter(r=>r.section===section):[];
      if(existing===true)assert.equal(found.length,1,section);
      const steps=Object.entries(values).map(([field,[action,value,source]])=>{
        const stepId=`${id}s${Object.keys(facts).length}`;
        facts[stepId]={value,source:`complete-virtual-resume-v1.md#${source}`};
        return {id:stepId,field,action,source_ref:stepId,overwrite:seeded&&existing===true};
      });
      records.push({id,section,mode:existing===true?'existing':existing==='reveal'?'reveal':'new',...(existing===true?{binding:found[0].binding}:{}),steps});
      unresolved.push(...missing.map(([field,status,reason])=>({record_id:id,field,status,reason})));
      expected.push({section,values:Object.fromEntries(Object.entries(values).map(([key,[,value]])=>[key,value]))});
      return id;
    }
    const fill=(value,source)=>['fill',value,source],select=(value,source)=>['select',value,source],range=(a,b,source)=>['date',{start:a,end:b},source];
    const basic=part('个人基本信息');
    const basicId=record('基本信息',{姓名:fill(basic.get('中文姓名'),'个人基本信息'),手机号:fill(basic.get('手机号'),'个人基本信息'),邮箱:fill(basic.get('邮箱'),'个人基本信息'),期望工作地点:select(['杭州','上海'],'求职意向')},true);
    protected_fields.push({record_id:basicId,field:'个人证件'});
    for(const [heading,degree,seed] of [['教育经历 2：本科','本科',seeded],['教育经历 3：硕士研究生','硕士',false],['教育经历 1：高中','高中',false]]) {
      const source=part(heading),high=degree==='高中';
      record('教育经历',{学校名称:fill(source.get('学校'),heading),学历:select(degree,heading),学历类型:select('统招全日制',heading),
        ...(!high?{学院:fill(source.get('学院'),heading),专业:fill(source.get('专业'),heading)}:{}),
        起止时间:range(source.get('入学时间'),source.get(degree==='硕士'?'预计毕业时间':'毕业时间'),heading)},seed,
        high?[['学院','missing_information','资料没有高中学院'],['专业','missing_information','资料没有高中专业']]:[]);
    }
    record('实习经历',{'没有实习经历':fill(false,'工作与实习经历')},true);
    records.at(-1).steps[0].overwrite=true;
    const enable=records.at(-1).steps[0].id;
    for(const [heading,section] of [['经历 1：质量工程实习生','实习经历'],['经历 2：数据分析实习生','实习经历'],['经历 3：研究助理','工作经历']]) {
      const source=part(heading);record(section,{公司名称:fill(source.get('单位'),heading),职位名称:fill(source.get('职位'),heading),描述:fill(source.body,heading),起止时间:range(source.get('开始时间'),source.get('结束时间'),heading)});
      if(section==='实习经历')for(const step of records.at(-1).steps)step.depends_on=[enable];
    }
    for(const heading of ['项目 1：招聘表单质量平台','项目 2：银行网点客流预测与排班建议','项目 3：校园二手交易数据治理工具']) {
      const source=part(heading);record('项目经历',{项目名称:fill(heading.split('：')[1],heading),项目角色:fill(source.get('项目角色'),heading),描述:fill(source.body,heading),起止时间:range(source.get('开始时间'),source.get('结束时间'),heading)},false,[['项目链接','missing_information','资料未提供项目链接']]);
    }
    for(const heading of ['获奖 2','获奖 4']) {const source=part(heading);record('竞赛',{竞赛名称:fill(source.get('奖项'),heading),描述:fill(source.body,heading)});}
    for(let index=1;index<=4;index++){const heading=`证书 ${index}`,source=part(heading);record('证书',{证书名称:fill(source.get('证书名称'),heading),描述:fill(source.body,heading)});}
    record('语言能力',{语言:select('英语','英语')},false,[['精通程度','needs_judgment','熟练没有精确候选，不能推断精通']]);
    record('语言能力',{语言:select('日语','其他语言'),精通程度:select('入门','其他语言')});
    record('语言能力',{语言:select('普通话','中文'),精通程度:select('母语','中文')});
    record('自我评价',{自我评价:fill(part('自我评价').body,'自我评价')},'reveal');
    record('作品链接',{},true,[['作品链接','missing_information','没有提供作品链接']]);
    const plan={schema_version:1,page_id:browser.pageId,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,
      profile_revision:createHash('sha256').update(text).digest('hex'),facts,records,unresolved,protected_fields};
    let windows=1,result=await call('form_run',{action:'start',request_id:`whole-resume-${seeded}`,plan});
    while(result.status==='paused_window'&&windows++<4)result=await call('form_run',{action:'resume',run_id:result.run_id});
    assert.equal(result.status,'partial',JSON.stringify(result));
    assert.deepEqual(result.counts,{verified_ui:Object.keys(facts).length},JSON.stringify(result));
    assert.equal(result.uncertain_adds.length,0);
    assert.equal(result.added_records.length,seeded?18:19);
    const actual=(await browser.evalPage('() => window.fixtureOracle()')).values;
    const indexes={};
    for(const entry of expected) {
      if('没有实习经历' in entry.values)continue;
      const index=indexes[entry.section]??0;indexes[entry.section]=index+1;
      for(const [field,value] of Object.entries(entry.values)) {
        const wanted=value&&typeof value==='object'&&!Array.isArray(value)?[value.start,value.end]:value;
        assert.deepEqual(actual[entry.section][index][field],wanted,`${entry.section}/${index}/${field}`);
      }
    }
    assert.equal(actual.基本信息[0].个人证件,'TEST-PRESERVE-IDENTITY');
    assert.equal(actual.实习经历.length,2,'the prerequisite-created internship must not become an empty third record');
    assert.ok(result.page_audit.covered_fields>=Object.keys(facts).length);
    assert.equal(result.persistence,'not_verified');
    metrics.push({seeded,sections:11,record_scopes:records.length,planned_values:Object.keys(facts).length,date_ranges:9,
      unresolved:unresolved.length,windows,elapsed_ms:Math.round(performance.now()-started),runner_ms:result.elapsed_ms,
      manual_interventions:0,low_level_recovery:0,persistence:result.persistence});
    console.log(JSON.stringify({scenario_passed:true,...metrics.at(-1)}));
  }
  console.log(JSON.stringify({passed:true,metrics}));
} finally {await browser.close();}
