import {chromium} from '@playwright/test';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
let browserPath=process.env.RESUME_TEST_BROWSER;
if(!browserPath&&!existsSync(chromium.executablePath())){
  const cache=join(homedir(),'Library/Caches/ms-playwright');
  if(existsSync(cache))for(const folder of readdirSync(cache).filter(x=>/^chromium-\d+$/.test(x)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))){const candidate=join(cache,folder,'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');if(existsSync(candidate)){browserPath=candidate;break;}}
}
const root=await mkdtemp(join(tmpdir(),'resume-performance-'));let context;
try{
  const extension=resolve('dist');context=await chromium.launchPersistentContext(root,{headless:true,executablePath:browserPath,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});const background=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(background.url()).hostname;
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);
  const workerFile=(await readdir('dist/assets')).find(f=>f.startsWith('parse-worker-')&&f.endsWith('.js'));
  const report=await page.evaluate(async file=>{
    const parser=new Worker(chrome.runtime.getURL('assets/'+file));
    const prefix='# 简历\n模板版本：resume-md/1\n## 基本信息\n- 姓名：性能样本\n## 项目经历\n### 项目1\n- 项目名称：合成回归\n- 项目内容：\n';
    const sample=prefix+Array.from({length:40},(_,i)=>'  - '+`要点${i} `+'合成测试资料'.repeat(70)).join('\n');
    const base='# 简历\n模板版本：resume-md/1\n## 基本信息\n- 姓名：上限样本\n## 补充信息\n';
    const large=base+'a'.repeat(262144-new TextEncoder().encode(base).length);
    async function measure(text){const start=performance.now();const result=await new Promise((resolve,reject)=>{parser.onmessage=e=>resolve(e.data);parser.onerror=()=>reject(new Error('Worker failed'));parser.postMessage({text});});return {ms:performance.now()-start,errors:result.ok?result.result.issues.filter(i=>i.severity==='error').length:1};}
    const times=[];for(let i=0;i<20;i++)times.push(await measure(sample));const upper=await measure(large);parser.terminate();const sorted=times.map(t=>t.ms).sort((a,b)=>a-b);
    return {browser:navigator.userAgent,sampleBytes:new TextEncoder().encode(sample).length,repetitions:20,coldMs:times[0].ms,p50Ms:sorted[9],p95Ms:sorted[18],maxMs:sorted[19],errors:times.reduce((n,t)=>n+t.errors,0),upperLimit:{bytes:new TextEncoder().encode(large).length,...upper}};
  },workerFile);
  await writeFile('artifacts/markdown-performance-0.4.0.json',JSON.stringify({date:new Date().toISOString(),...report},null,2)+'\n');console.log(JSON.stringify(report));if(report.errors||report.p95Ms>500)process.exitCode=1;
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
