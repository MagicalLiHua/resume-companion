// Explicit live integration check of the built extension. No real resume data or key is written to artifacts.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
let context,root,server,phase='configuration',privateKey='';
const report={date:new Date().toISOString(),extensionVersion:'0.4.0',syntheticDataOnly:true,protocol:'anthropic',keyInArtifacts:false,passed:false};
try{
  const raw=execFileSync('python3',['-c',`from pathlib import Path
import json,re,shlex,os
values={k:os.environ[k] for k in ('DEEPSEEK_API_KEY','DEEPSEEK_MODEL') if os.environ.get(k)}
for line in (Path.home()/'.bashrc').read_text().splitlines():
 m=re.match(r'^\\s*(?:export\\s+)?(DEEPSEEK_API_KEY|DEEPSEEK_MODEL)\\s*=\\s*(.*)$',line)
 if m:
  parts=shlex.split(m.group(2),comments=True)
  if len(parts)==1 and '$' not in parts[0] and chr(96) not in parts[0]: values.setdefault(m.group(1),parts[0])
print(json.dumps(values))`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const config=JSON.parse(raw);privateKey=config.DEEPSEEK_API_KEY||'';if(!config.DEEPSEEK_API_KEY)throw new Error('missing configuration');
  root=await mkdtemp(join(tmpdir(),'resume-product-live-'));const extension=join(root,'extension');await cp('dist',extension,{recursive:true});
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*','https://api.deepseek.com/*'];await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
  server=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><form><fieldset><legend>基本资料</legend><label>您目前落脚的城市<input id="city"></label><label>希望从事什么职业<input id="role"></label><label>请留下可联系到您的电子信箱<input id="email"></label></fieldset><fieldset><legend>紧急联系人</legend><label>联系人姓名<input id="contact"></label></fieldset><button type="submit">提交</button></form><script>window.submitted=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submitted++}</script>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  phase='browser';context=await chromium.launchPersistentContext(join(root,'profile'),{headless:true,executablePath:process.env.RESUME_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],env:{...process.env,DEBUG:'',PWDEBUG:''}});
  context.setDefaultTimeout(10000);const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
  const editor=await context.newPage();await editor.goto(`chrome-extension://${id}/options.html`);phase='profile';
  await editor.getByRole('button',{name:'载入示例资料',exact:true}).click();await editor.getByRole('button',{name:'替换编辑内容',exact:true}).click();await editor.getByRole('button',{name:'保存资料',exact:true}).click();await editor.getByText('资料已保存到本机',{exact:true}).waitFor();
  phase='model-settings';await editor.getByRole('button',{name:'模型设置',exact:true}).click();await editor.getByLabel('模型名称').fill(config.DEEPSEEK_MODEL||'deepseek-flash');await editor.getByLabel('模型 API Key',{exact:true}).fill(config.DEEPSEEK_API_KEY);await editor.getByRole('button',{name:'连接并测试',exact:true}).click();await editor.getByText(/连接成功 ·/).waitFor({timeout:40000});
  report.connection=await editor.getByText(/连接成功 ·/).innerText();
  phase='scan';const form=await context.newPage();await form.goto(`http://127.0.0.1:${port}`);const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/sidepanel.html`);await form.bringToFront();await panel.getByRole('button',{name:'扫描当前页',exact:true}).evaluate(b=>b.click());await panel.getByRole('button',{name:'用模型辅助匹配',exact:true}).evaluate(b=>b.click());
  const outbound=await panel.getByLabel('模型发送内容',{exact:true}).inputValue();for(const secret of [config.DEEPSEEK_API_KEY,'student@example.com','13800000000','示例同学','南京'])if(outbound.includes(secret))throw new Error('Unexpected private value in disclosure');
  phase='model-match';await panel.getByRole('button',{name:'确认发送并匹配',exact:true}).evaluate(b=>b.click());await panel.getByText('模型建议 · 请核对',{exact:true}).first().waitFor({timeout:40000});
  const before=await form.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value));if(before.some(Boolean))throw new Error('Unexpected write before confirmation');
  const expected=[['您目前落脚的城市','basic/city'],['希望从事什么职业','basic/job_intention'],['请留下可联系到您的电子信箱','basic/email']];
  for(const [label,ref] of expected){const card=panel.locator('.field-card').filter({has:panel.getByText(label,{exact:true})});await card.getByRole('button',{name:'使用此来源',exact:true}).evaluate(b=>b.click());if(await card.locator('.source-select select').inputValue()!==ref)throw new Error('Incorrect source suggestion');}
  report.matchSummary=await panel.locator('.binding-card').filter({hasText:'陌生字段，让模型帮你对应'}).innerText();phase='fill';report.previewSummary=await panel.locator('.panel-actions').innerText();await panel.getByRole('button',{name:/填写选中的 3 项/}).evaluate(b=>b.click());await panel.getByText('已填写并回读确认').first().waitFor();
  const values=await form.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value));if(JSON.stringify(values)!==JSON.stringify(['南京','测试开发工程师','student@example.com','']))throw new Error('Incorrect filled values');
  if(await form.evaluate(()=>window.submitted)!==0)throw new Error('Unexpected submission');
  const backup=await editor.evaluate(async()=>(await chrome.runtime.sendMessage({type:'PROFILE_EXPORT'})).data);if(JSON.stringify(backup).includes(config.DEEPSEEK_API_KEY))throw new Error('Key leaked into backup');
  phase='report';report.cases={selectedAndFilled:3,unmatchedContactLeftEmpty:true,noWriteBeforeConfirmation:true,noAutomaticSubmission:true,backupExcludesKey:true};report.passed=true;
}catch(error){report.failedPhase=phase;report.error=['Unexpected private value in disclosure','Incorrect filled values','Incorrect source suggestion','Unexpected submission','Key leaked into backup','Unexpected write before confirmation'].includes(error?.message)?error.message:'验证未完成，请按 failedPhase 检查；异常详情不包含在报告中';}finally{
  await context?.close().catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));if(root)await rm(root,{recursive:true,force:true});await mkdir('artifacts',{recursive:true});await writeFile('artifacts/pure-plugin-live-model-0.4.0.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
if(!report.passed)process.exitCode=1;
