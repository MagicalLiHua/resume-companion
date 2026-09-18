import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.setContent(await readFile('tests/fixtures/async-options.html','utf8'));
  await page.addScriptTag({content:await readFile('test-results/test-engine.js','utf8')});
  await page.evaluate(()=>{const w=window as any;w.engine=new w.ResumeTest.FormEngine();w.snapshot=w.engine.scan()});
});

test('等待异步候选与弹层替换完成，不把加载中当空列表',async({page})=>{
 const result=await page.evaluate(async()=>{const w=window as any;w.mode='delayed';const s=w.snapshot;return w.engine.options({...s,fieldId:s.fields[0].id})});
 expect(result).toMatchObject({status:'ready',searchSupported:true,levels:[['示例大学']],totalRendered:[1],truncated:false});
});
test('MCP 搜索候选保留选中值并排除创建项，随后可填写、回读、撤销',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,field=s.fields[0];
  await w.engine.options({...s,fieldId:field.id});
  const options=await w.engine.options({...s,fieldId:field.id,query:'示例'}),before=w.selected.school??'';
  const fill=await w.engine.fill({...s,operationId:'search-fill',operations:[{fieldId:field.id,value:'示例大学',expectedValue:''}]});
  const verify=w.engine.verify(s),undo=await w.engine.undo(s);
  return {options,before,fill,verify,undo,selected:w.selected.school,submits:w.submits};
 });
 expect(result.options).toMatchObject({status:'ready',query:'示例',levels:[['示例大学']]});expect(result.before).toBe('');
 expect(result.fill[0].status).toBe('filled');expect(result.verify[0].status).toBe('filled');expect(result.undo[0].status).toBe('undone');expect(result.selected).toBe('');expect(result.submits).toBe(0);
});
test('空结果与未知超时分别返回，不泄漏过期候选',async({page})=>{
 const empty=await page.evaluate(async()=>{const w=window as any,s=w.snapshot;return w.engine.options({...s,fieldId:s.fields[0].id,query:'不存在'})});
 expect(empty).toMatchObject({status:'empty',levels:[[]]});
 const timeout=await page.evaluate(async()=>{const w=window as any,s=w.snapshot;document.querySelector('.ant-select-clear')!.dispatchEvent(new MouseEvent('mousedown'));w.mode='never';return w.engine.options({...s,fieldId:s.fields[0].id})});
 expect(timeout).toMatchObject({status:'timeout',levels:[]});
});
test('等待期间出现第二个同名候选时拒绝选中',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any;w.mode='duplicate';(document.querySelector('#school') as HTMLInputElement).readOnly=true;const s=w.engine.scan();
  return {filled:await w.engine.fill({...s,operationId:'ambiguous',operations:[{fieldId:s.fields[0].id,value:'示例大学',expectedValue:''}]}),clicks:w.clicks};
 });
 expect(result.filled[0].status).toBe('failed');expect(result.filled[0].message).toContain('唯一');expect(result.clicks).toEqual([]);
});
test('级联逐层延迟且每次替换整个弹层，仍按完整路径回读',async({page})=>{
 const result=await page.evaluate(async()=>{const w=window as any,s=w.snapshot;const fill=await w.engine.fill({...s,operationId:'cascade-replace',operations:[{fieldId:s.fields[1].id,value:'国内 / 江苏省 / 示例大学',expectedValue:''}]});return {fill,verify:w.engine.verify(s),value:w.selected.path}});
 expect(result.fill[0].status).toBe('filled');expect(result.verify[0].status).toBe('filled');expect(result.value).toBe('国内 / 江苏省 / 示例大学');
});
test('候选超过返回上限时明确标注截断',async({page})=>{
 const result=await page.evaluate(async()=>{const w=window as any;w.mode='many';const s=w.snapshot;return w.engine.options({...s,fieldId:s.fields[0].id})});
 expect(result.status).toBe('ready');expect(result.truncated).toBe(true);expect(result.totalRendered).toEqual([105]);expect(result.levels[0]).toHaveLength(100);
});
test('查询等待时用户更改搜索词会停止，保留新搜索',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot;setTimeout(()=>{const input=document.querySelector('#school') as HTMLInputElement;input.value='用户新搜索';input.dispatchEvent(new Event('input',{bubbles:true}))},100);
  try {await w.engine.options({...s,fieldId:s.fields[0].id,query:'示例'});return ''}catch(e){return (e as Error).message}
 });
 expect(result).toContain('搜索词已变化');expect(await page.locator('#school').inputValue()).toBe('用户新搜索');
});
test('级联搜索和超长查询在操作前拒绝',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,errors=[];
  for(const input of [{fieldId:s.fields[1].id,query:'学校'},{fieldId:s.fields[0].id,query:'x'.repeat(121)}]){
   try{await w.engine.options({...s,...input})}catch(e){errors.push((e as Error).message)}
  }
  return {errors,popups:document.querySelectorAll('.ant-select-dropdown').length};
 });
 expect(result.errors).toHaveLength(2);expect(result.popups).toBe(0);
});
test('空搜索词清除过滤，返回重新加载后的候选',async({page})=>{
 const result=await page.evaluate(async()=>{const w=window as any,s=w.snapshot;await w.engine.options({...s,fieldId:s.fields[0].id,query:'示例'});return w.engine.options({...s,fieldId:s.fields[0].id,query:''})});
 expect(result).toMatchObject({status:'ready',query:'',levels:[['旧学校']]});
});
test('父级点击后子级未更新时不使用残留候选',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,field=s.fields[1];await w.engine.options({...s,fieldId:field.id});
  const popup=document.querySelector('.ant-select-dropdown')!;
  const stale=document.createElement('ul');stale.className='ant-cascader-menu';stale.innerHTML='<li class="ant-cascader-menu-item">江苏省</li>';stale.onclick=()=>w.clicks.push('STALE');popup.append(stale);
  (popup.querySelector('.ant-cascader-menu-item') as HTMLElement).onclick=()=>{};
  const filled=await w.engine.fill({...s,operationId:'stale-child',operations:[{fieldId:field.id,expectedValue:'',value:'国内 / 江苏省'}]});return {filled,clicks:w.clicks};
 });
 expect(result.filled[0].status).toBe('failed');expect(result.filled[0].message).toContain('超时');expect(result.clicks).toEqual([]);
});

test('逐层探测级联分支后可继续填写已展开路径、验证和撤销',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,field=s.fields[1];
  const first=await w.engine.options({...s,fieldId:field.id,path:['国内']});
  const second=await w.engine.options({...s,fieldId:field.id,path:['国内','江苏省']});
  const before=w.selected.path??'',leafClicks=[...w.clicks],branchClicks=[...w.branchClicks];
  const fill=await w.engine.fill({...s,operationId:'expanded-path',operations:[{fieldId:field.id,expectedValue:'',value:'国内 / 江苏省 / 示例大学'}]});
  return {first,second,before,leafClicks,branchClicks,fill,verify:w.engine.verify(s),undo:await w.engine.undo(s),after:w.selected.path,submits:w.submits};
 });
 expect(result.first).toMatchObject({status:'ready',levels:[['国内'],['江苏省']],expandable:[[true],[true]]});
 expect(result.second).toMatchObject({status:'ready',levels:[['国内'],['江苏省'],['示例大学']],expandable:[[true],[true],[false]]});
 expect(result.before).toBe('');expect(result.leafClicks).toEqual([]);expect(result.branchClicks).toEqual(['国内','江苏省']);
 expect(result.fill[0].status).toBe('filled');expect(result.verify[0].status).toBe('filled');expect(result.undo[0].status).toBe('undone');expect(result.after).toBe('');expect(result.submits).toBe(0);
});
test('探测路径不能点击叶子项，不能包含重复候选',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,field=s.fields[1],errors=[];
  try{await w.engine.options({...s,fieldId:field.id,path:['国内','江苏省','示例大学']})}catch(e){errors.push((e as Error).message)}
  const menu=document.querySelector('.ant-cascader-menu')!;menu.append(menu.firstElementChild!.cloneNode(true));
  try{await w.engine.options({...s,fieldId:field.id,path:['国内']})}catch(e){errors.push((e as Error).message)}
  return {errors,clicks:w.clicks,selected:w.selected.path??''};
 });
 expect(result.errors[0]).toContain('未点击最终选项');expect(result.errors[1]).toContain('唯一');expect(result.clicks).toEqual([]);expect(result.selected).toBe('');
});
test('展开父级就提交选中值的级联会停止并恢复原值',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot;w.mode='parent-select';let error='';
  try{await w.engine.options({...s,fieldId:s.fields[1].id,path:['国内']})}catch(e){error=(e as Error).message}
  return {error,selected:w.selected.path};
 });
 expect(result.error).toContain('已恢复原值');expect(result.selected).toBe('');
});
test('探测期间用户另选值时停止并保留用户修改',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot;let error='';
  setTimeout(()=>{document.querySelector('#path')!.closest('.ant-select')!.querySelector('.ant-select-selection-item')!.textContent='用户自己的学校';w.selected.path='用户自己的学校'},360);
  try{await w.engine.options({...s,fieldId:s.fields[1].id,path:['国内']})}catch(e){error=(e as Error).message}
  return {error,selected:w.selected.path};
 });
 expect(result.error).toContain('字段值发生变化');expect(result.selected).toBe('用户自己的学校');
});
test('无效分支参数在展开前拒绝',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,errors=[];
  for(const input of [{fieldId:s.fields[0].id,path:['国内']},{fieldId:s.fields[1].id,path:[]},{fieldId:s.fields[1].id,path:[' ']},{fieldId:s.fields[1].id,path:['国内'],query:'学校'}]){
   try{await w.engine.options({...s,...input})}catch(e){errors.push((e as Error).message)}
  }
  return {errors,popups:document.querySelectorAll('.ant-select-dropdown').length};
 });
 expect(result.errors).toHaveLength(4);expect(result.popups).toBe(0);
});
test('分支加载后明确为空时返回 empty，不把父级候选当作子级结果',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,field=s.fields[1];await w.engine.options({...s,fieldId:field.id});
  const popup=document.querySelector('.ant-select-dropdown')!;
  (popup.querySelector('.ant-cascader-menu-item') as HTMLElement).onclick=()=>popup.insertAdjacentHTML('beforeend','<div class="ant-empty">暂无数据</div>');
  return w.engine.options({...s,fieldId:field.id,path:['国内']});
 });
 expect(result).toMatchObject({status:'empty',levels:[['国内'],[]],totalRendered:[1,0],expandable:[[true],[]]});
});
