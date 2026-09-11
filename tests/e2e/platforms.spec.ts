import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const url = 'https://jobs.lever.co/example/00000000-0000-4000-8000-000000000001/apply';
async function fixture(page: Page, target = url, html?: string) {
  const body = html ?? await readFile('tests/fixtures/lever-application.html', 'utf8');
  // Serve an authored fixture under the target origin; all real network requests are blocked.
  await page.route('**/*', route => route.request().url() === target ? route.fulfill({contentType:'text/html',body}) : route.abort());
  await page.goto(target);
  await page.addScriptTag({content: await readFile('test-results/test-engine.js', 'utf8')});
}

test('Lever 仿真：真实标题、基本资料和固定回答可预览填写，位置与声明不写入', async ({page}) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const {FormEngine, demoProfile, sources, suggestSource, proposedValue} = (window as any).ResumeTest;
    const profile = demoProfile(); profile.custom_answers = [{id:'project-answer',title:'Describe your project',text:'I built a synthetic test project.'}];
    const engine = new FormEngine(), snapshot = engine.scan(), available = sources(profile);
    const rows = snapshot.fields.map((field: any) => ({field,source:suggestSource(field,available,{})}));
    const operations = rows.filter((r:any)=>r.source).map((r:any)=>({fieldId:r.field.id,expectedValue:r.field.currentValue,value:proposedValue(r.field,r.source).value}));
    const filled = await engine.fill({...snapshot,operationId:'lever-fixture',operations});
    const values = ['name','email','phone'].map(name=>(document.querySelector(`[name="${name}"]`) as HTMLInputElement).value);
    const answer = (document.querySelector('textarea') as HTMLTextAreaElement).value;
    const undone = await engine.undo(snapshot);
    return {labels:snapshot.fields.map((f:any)=>f.label),blocked:snapshot.fields.filter((f:any)=>f.blocked).map((f:any)=>({label:f.label,currentValue:f.currentValue})),filled,values,expected:[profile.basic.full_name,profile.basic.email,profile.basic.phone],answer,undone,restored:!Array.from(document.querySelectorAll('input:not([type=radio]),textarea')).some((el:any)=>el.value),submitted:(window as any).__submitted,radioChecked:document.querySelector('input[type=radio]:checked')!==null};
  });
  expect(result.labels).toContain('Describe your project');
  expect(result.labels).toContain('How did you hear about this role?');
  expect(result.labels).not.toContain('Type your response');
  expect(result.values).toEqual(result.expected);
  expect(result.answer).toBe('I built a synthetic test project.');
  expect(result.filled).toHaveLength(4); expect(result.filled.every((r:any)=>r.status==='filled')).toBe(true);
  expect(result.blocked).toEqual([{label:'Current location',currentValue:null},{label:'Do you consent to sharing your application?',currentValue:null}]);
  expect(result.undone.every((r:any)=>r.status==='undone')).toBe(true); expect(result.restored).toBe(true);
  expect(result.submitted).toBe(0); expect(result.radioChecked).toBe(false);
});

test('Lever 仿真：标题更改与预览后手动修改会阻止旧计划', async ({page}) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const engine = new (window as any).ResumeTest.FormEngine();
    const first = engine.scan(), name = first.fields.find((f:any)=>f.label==='Full name✱');
    const node = document.querySelector('[name=name]') as HTMLInputElement;
    node.value='User edited';
    const conflict = await engine.fill({...first,operationId:'conflict',operations:[{fieldId:name.id,expectedValue:'',value:'Do not overwrite'}]});
    const second = engine.scan(), target = second.fields.find((f:any)=>f.label==='Full name✱');
    document.querySelector('.application-label')!.textContent='Passport';
    let stale=false;
    try {await engine.fill({...second,operationId:'changed-heading',operations:[{fieldId:target.id,expectedValue:'User edited',value:'Do not overwrite'}]});} catch {stale=true;}
    return {status:conflict[0].status,stale,value:node.value};
  });
  expect(result).toEqual({status:'skipped',stale:true,value:'User edited'});
});

test('Lever 仿真：域名、路径、表单与标题结构不匹配时回退通用扫描', async ({page}) => {
  const base = await readFile('tests/fixtures/lever-application.html','utf8');
  for (const [target, html] of [
    [url.replace('jobs.lever.co','jobs.lever.co.example.invalid'),base],
    [url.replace('/apply','/unverified'),base],
    [url,base.replace('id="application-form"','id="unverified-form"')],
    [url,base.replace('<div class="text">Describe your project</div>','<div class="text">Describe your project</div><div class="application-label">Ambiguous label</div>')],
  ]) {
    await page.unrouteAll(); await fixture(page,target,html);
    const labels = await page.evaluate(()=>new (window as any).ResumeTest.FormEngine().scan().fields.map((f:any)=>f.label));
    expect(labels).toContain('Type your response');
    expect(labels).not.toContain('Describe your project');
  }
});

test('ARIA 必填标记进入预览，属性变化使旧计划失效', async ({page}) => {
  await fixture(page,url,'<label>姓名<input id="name" aria-required="true"></label>');
  const result = await page.evaluate(async () => {
    const engine = new (window as any).ResumeTest.FormEngine(), snapshot=engine.scan(), field=snapshot.fields[0];
    document.querySelector('input')!.setAttribute('aria-required','false');
    let stale=false;
    try {await engine.fill({...snapshot,operationId:'aria-change',operations:[{fieldId:field.id,expectedValue:'',value:'Do not write'}]});} catch {stale=true;}
    return {required:field.required,stale,value:(document.querySelector('input') as HTMLInputElement).value};
  });
  expect(result).toEqual({required:true,stale:true,value:''});
});
