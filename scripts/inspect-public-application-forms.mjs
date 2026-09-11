import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';

// Public engineering samples only; never attach to the user's Chrome profile.
const sites = [
  ['Lever / TXI', 'https://jobs.lever.co/txidigital/7c014a14-dce6-431c-9920-0dc1e9759c81/apply'],
  ['Greenhouse / Artefact', 'https://job-boards.greenhouse.io/artefact/jobs/7797496002'],
];
const only = process.argv[2];
if (only && !['lever', 'greenhouse'].includes(only)) throw new Error('Choose lever or greenhouse');
const bundle = await build({stdin: {contents: "import {FormEngine} from './extension/src/content/engine'; import {matchDefinition} from './extension/src/domain/rules'; window.inspectResumeFields = () => new FormEngine().scan().fields.map(({currentValue, ...field}) => {const source=matchDefinition(field); return {...field, source:source ? source.section+'/'+source.key : null};});", resolveDir: process.cwd()}, write: false, bundle: true, format: 'iife', target: 'chrome116'});
const browser = await chromium.launch({headless: true, executablePath: process.env.RESUME_TEST_BROWSER});
const report = {checked_at: new Date().toISOString(), method: 'Fresh anonymous contexts; read-only DOM and scanner; no form input, uploads, clicks or submission', sites: []};
try {
  for (const [name, url] of sites.filter(([name]) => !only || name.toLowerCase().startsWith(only))) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const entry = {name, url};
    try {
      const response = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 20000}).catch(error => {entry.navigation_error=error.message.split('\n')[0].slice(0,200);return null;});
      await page.locator('input:not([type=hidden])').first().waitFor({timeout: 10000});
      entry.http_status = response?.status();
      entry.final_url = new URL(page.url()).origin + new URL(page.url()).pathname;
      entry.forms = await page.evaluate(() => Array.from(document.forms).map(f => ({id:f.id,class:f.className})));
      entry.controls = await page.evaluate(() => Array.from(document.querySelectorAll('input,textarea,select,[role=combobox]')).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => ({
        tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), name: el.getAttribute('name'), id: el.id,
        role: el.getAttribute('role'), readonly: el.hasAttribute('readonly'), class: el.className, aria_required:el.getAttribute('aria-required'),
        label: Array.from(el.labels ?? []).map(l => l.textContent.trim().slice(0, 150)).join(' '),
        aria_label: el.getAttribute('aria-label'), labelledby: el.getAttribute('aria-labelledby'), controls: el.getAttribute('aria-controls'),
        ancestors: [el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean).map(p => ({tag: p.tagName.toLowerCase(), class: p.className, heading: p.querySelector('label,.application-label,h3,h4,legend')?.textContent.trim().slice(0, 150)})),
        lever_question: el.closest('.application-question') ? Array.from(el.closest('.application-question').querySelectorAll('.application-label,label')).map(p => ({tag:p.tagName.toLowerCase(),class:p.className,for:p.getAttribute('for'),direct_children:Array.from(p.children).map(c=>({tag:c.tagName.toLowerCase(),class:c.className})),heading:(p.matches('.application-label')?p.textContent:'').trim().slice(0,150)})) : [],
      })));
      await page.evaluate(bundle.outputFiles[0].text);
      entry.scan = await page.evaluate(() => window.inspectResumeFields());
    } catch (error) {entry.error = error.message.split('\n')[0].slice(0, 200);}
    await context.close();
    report.sites.push(entry);
    console.log(JSON.stringify({name,forms:entry.forms,error:entry.error,navigation_error:entry.navigation_error,scan:entry.scan?.map(f=>({label:f.label,kind:f.kind,required:f.required,blocked:f.blocked,source:f.source}))}));
  }
} finally {await browser.close();}
await writeFile('artifacts/public-application-inspection.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(`artifacts/public-application-inspection-${report.checked_at.replace(/[:.]/g, '-')}.json`, JSON.stringify(report, null, 2) + '\n');
