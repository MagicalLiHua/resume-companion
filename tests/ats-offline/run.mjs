import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { harness, dataOf } from '../real-controls/harness.mjs';
import { auditFidelity } from './fidelity.mjs';
const fixtureRoot = resolve(import.meta.dirname, '../../.local-archive/offline-sites');
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, 'manifest.json'), 'utf8'));
const browser = await harness({ fixtureRoot });
const results = [];
const interact = async code => browser.evalPage(code);
const oracle = async () => browser.evalPage('() => window.fixtureOracle()');
const click = async selector => interact(`() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)throw Error('Missing fixture control'); el.click(); return true; }`);
const option = async text => interact(`() => { const item=[...document.querySelectorAll('.fixture-popup .ivu-select-item,.fixture-popup .ud__select__list__item')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!item)throw Error('Missing fixture option'); item.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})); item.click(); return true; }`);
const type = async (selector, value) => interact(`() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)throw Error('Missing fixture input'); input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; }`);
const wait = async predicate => {
  for (let i=0;i<35;i++) { if(await browser.evalPage(`() => (${predicate})`)) return; await new Promise(r=>setTimeout(r,60)); }
  throw Error(`Fixture state did not change: ${predicate}`);
};
try {
  for (const site of manifest.sites) {
    const sample=JSON.parse(await readFile(resolve(fixtureRoot,`${site.id}.json`),'utf8'));
    await browser.open(site.id);
    const initial = await oracle();
    assert.equal(initial.fields.length, site.initial_fields);
    assert.equal(initial.finalSubmissions, 0);
    const observed = dataOf(await browser.call('form_observe', {page_id:browser.pageId,mode:'overview',include_values:'state',max_bytes:20000}));
    assert(!observed.error, `${site.id}: observation failed`);
    const compatibility = { fields:observed.fields.length, unnamed_fields:observed.fields.filter(f=>!f.label).length, date_groups:observed.fields.filter(f=>f.kind==='date_group').length, sections:observed.sections };
    compatibility.initial_fidelity=await auditFidelity(browser,sample,resolve(fixtureRoot,'../captures/2026-09-20'));
    assert.deepEqual(compatibility.initial_fidelity.mismatches,[],`${site.id}: source structure changed`);
    if(site.id==='moka') {
      const batch = dataOf(await browser.call('form_fill_fields', {page_id:browser.pageId,fields:[{field:'公司名称',scope:'工作经历 / 第1条',value:'示例科技有限公司'}],test_mode:true}));
      assert.equal(batch.results[0].status,'filled');
      const selected = dataOf(await browser.call('form_select_option', {page_id:browser.pageId,field:'性别',scope:'个人信息',value:'女',test_mode:true}));
      assert.equal(selected.status,'verified_ui');
      const date = dataOf(await browser.call('form_set_date', {page_id:browser.pageId,field:'起止时间',scope:'工作经历 / 第1条',range:{start:'2023-06',end:'2025-07'},test_mode:true}));
      assert.equal(date.status,'verified_ui',JSON.stringify(date));
      const values = (await oracle()).values;
      assert.equal(values['moka-13:0'],'2023'); assert.equal(values['moka-13:1'],'6');
      assert.equal(values['moka-13:2'],'2025'); assert.equal(values['moka-13:3'],'7');
      compatibility.mcp_month_range = true;
    } else if (site.id==='feishu') {
      await click('[data-fixture-field="feishu-9"] .ud__select__selector__search__input');
      await option('硕士');
      assert.equal((await oracle()).values['feishu-9:0'],'硕士');
      await click('[data-fixture-field="feishu-6"] input');
      await click('.fixture-popup .ud__picker-month-panel-cell:nth-child(1)');
      assert.match((await oracle()).values['feishu-6:0'],/^2024-\d{2}$/);
      await click('[data-fixture-field="feishu-5"] .ud__select__selector__search__input');
      await option('北京');
      await option('上海');
      assert.deepEqual((await oracle()).values['feishu-5:0'],['北京','上海']);
      const before=(await oracle()).fields.length;
      await click('[data-fixture-add-section="教育经历 1"]');
      assert((await oracle()).fields.length>before);
      compatibility.fixture_ui = ['single select','month panel','multiple select','repeat record'];
      compatibility.mcp_known_gap = 'UD multiple Select and unobserved picker variants still require coverage';
    } else {
      await click('[data-fixture-field="zhaopin-3"] input');
      await click('.fixture-popup .ivu-date-picker-cells-cell:nth-child(6)');
      assert.equal((await oracle()).values['zhaopin-3:0'],'2024-06');
      await click('[data-fixture-field="zhaopin-4"] .select-input');
      await click('.fixture-popup .s-cascader__options .s-cascader__option');
      await wait('document.querySelectorAll(".fixture-popup .s-cascader > div").length===2');
      await click('.fixture-popup .s-cascader > div:nth-child(2) .s-cascader__option');
      await wait('document.querySelectorAll(".fixture-popup .s-cascader > div").length===3');
      await click('.fixture-popup .s-cascader > div:nth-child(3) .s-cascader__option');
      assert.deepEqual((await oracle()).values['zhaopin-4:region'],['甲省','甲城市','示例区']);
      compatibility.fixture_ui=['month picker','asynchronous three-level region'];
      compatibility.mcp_known_gap='iView month picker and div-based region triggers remain incomplete';
    }
    if (site.modules.length) {
      const baseCount = (await oracle()).fields.length;
      for (const module of site.modules) {
        const before = await oracle();
        await click(`[data-fixture-add-module="${module.id}"]`);
        const after = await oracle();
        assert.equal(after.fields.length, before.fields.length + module.fields, `${module.title} lost fields`);
        const record = after.records.at(-1);
        assert.equal(record.module, module.id);
        assert(await interact(`() => document.querySelector('[data-fixture-record-id="${record.id}"]').querySelectorAll('input,textarea,.ivu-select,.select-input,.zp-radio__item').length > 0`), `${module.title} has no editable controls`);
      }
      assert.equal((await oracle()).fields.length, baseCount + site.fields - site.initial_fields);
      compatibility.expanded_fidelity=await auditFidelity(browser,sample,resolve(fixtureRoot,'../captures/2026-09-20'));
      assert.deepEqual(compatibility.expanded_fidelity.mismatches,[],`${site.id}: added record structure changed`);
      compatibility.expanded_modules = site.modules.length;
      if (site.id === 'zhaopin') {
        const education = (await oracle()).records.find(r=>r.module==='zhaopin-education');
        const recordSelector = `[data-fixture-record-id="${education.id}"]`;
        assert.equal((await oracle()).fields.filter(f=>f.record===education.id&&f.visible).length,2,'Education should begin with degree and overseas flag');
        await click(`${recordSelector} [data-fixture-label="最高学历"] .ivu-select-selection`);
        await click('.fixture-popup .ivu-select-item:nth-child(3)');
        assert.equal((await oracle()).fields.filter(f=>f.record===education.id&&f.visible).length,2,'iView click alone must not commit a selection');
        await option('本科');
        assert.equal((await oracle()).fields.filter(f=>f.record===education.id&&f.visible).length,7,'Degree must reveal education fields');
        const work = (await oracle()).records.find(r=>r.module==='zhaopin-work');
        const workSelector = `[data-fixture-record-id="${work.id}"]`;
        await click(`${workSelector} [data-fixture-label="在职时间"] .ivu-date-picker input`);
        await click('.fixture-popup .ivu-date-picker-cells-cell:nth-child(6)');
        await click(`${workSelector} [data-fixture-label="在职时间"] input[type=checkbox]`);
        assert(await interact(`() => [...document.querySelectorAll('${workSelector} [data-fixture-label="在职时间"] .ivu-date-picker input')][1].disabled`),'Current must disable end date');
        for (const [label,body,levels,kind] of [['所属行业','.s-cascader',2,'industry'],['职位名称','.job-type__content',3,'job']]) {
          await click(`${workSelector} [data-fixture-label="${label}"] .select-input`);
          for(let depth=0;depth<levels;depth++) {
            await wait(`document.querySelectorAll('.fixture-popup ${body} > *').length===${depth+1}`);
            await click(`.fixture-popup ${body} > :nth-child(${depth+1}) ${kind==='job'?'.job-type__level-item':'.s-cascader__option'}`);
          }
          const field=(await oracle()).fields.find(f=>f.record===work.id&&f.label===label);
          assert.equal((await oracle()).values[`${field.id}:${kind}`].length,levels);
        }
        const skill=(await oracle()).records.find(r=>r.module==='zhaopin-skill');
        await click(`[data-fixture-record-id="${skill.id}"] [data-fixture-label="掌握程度"] label:last-child input`);
        const proficiency=(await oracle()).fields.find(f=>f.record===skill.id&&f.label==='掌握程度');
        assert.equal((await oracle()).values[`${proficiency.id}:choice`],'精通');
        compatibility.fixture_ui.push('education dependent fields','current date range','industry hierarchy','job hierarchy','native radio');
      } else {
        const contest=(await oracle()).records.find(r=>r.module==='feishu-module-3');
        await click(`[data-fixture-record-id="${contest.id}"] .ud__select input`);
        await option('示例程序设计竞赛');
        const language=(await oracle()).records.find(r=>r.module==='feishu-module-5');
        await click(`[data-fixture-record-id="${language.id}"] [data-fixture-label="语言"] .ud__select input`);
        await option('英语');
        compatibility.fixture_ui.push('competition select','language select','all eight optional modules');
      }
      const expanded=dataOf(await browser.call('form_observe',{page_id:browser.pageId,mode:'overview',include_values:'state',max_bytes:40000}));
      assert(!expanded.truncated,'Expanded observation was truncated');
      compatibility.expanded_observation={fields:expanded.fields.length,unnamed_fields:expanded.fields.filter(f=>!f.label).length};
      const projectModule=site.modules.find(m=>m.title==='项目经历');
      const firstRecord=(await oracle()).records.find(r=>r.module===projectModule.id);
      const projectSelector=`[data-fixture-record-id="${firstRecord.id}"] [data-fixture-label="项目名称"] input`;
      await type(projectSelector,'示例隔离项目');
      const firstField=(await oracle()).fields.find(f=>f.record===firstRecord.id&&f.label==='项目名称');
      await click(`[data-fixture-add-module="${projectModule.id}"]`);
      const secondRecord=(await oracle()).records.at(-1);
      const secondField=(await oracle()).fields.find(f=>f.record===secondRecord.id&&f.label==='项目名称');
      assert.equal((await oracle()).values[`${secondField.id}:0`],'');
      await click(`[data-fixture-cancel-record="${secondRecord.id}"]`);
      assert.equal((await oracle()).values[`${firstField.id}:0`],'示例隔离项目','Cancel removed another record value');
      assert(!(await oracle()).fields.some(f=>f.record===secondRecord.id));
      assert(!Object.keys((await oracle()).values).some(key=>key.startsWith(`${secondField.id}:`)));
      if(site.id==='feishu')assert(await interact(`() => document.querySelectorAll('#formily-item-school').length>=2`),'Original repeated form IDs were rewritten');
      for (const record of (await oracle()).records) await click(`[data-fixture-cancel-record="${record.id}"]`);
      assert.equal((await oracle()).fields.length,baseCount,'Cancel did not remove the new fields');
      compatibility.fixture_ui.push('record value isolation','cancel cleanup','original repeated DOM IDs');
    }
    await click('#save-fixture');
    assert.equal((await oracle()).saves,1);
    const safety=await browser.evalPage(`() => ({urls:performance.getEntriesByType('resource').map(r=>r.name),html:document.documentElement.outerHTML,origin:location.origin,submits:window.fixtureOracle().finalSubmissions})`);
    assert(safety.urls.every(url=>url.startsWith(safety.origin+'/')), 'External resource request');
    assert(!/https?:\/\/[^"\s<>]+/.test(safety.html), 'Remote link embedded in offline HTML');
    assert.equal(safety.submits,0);
    assert(!/(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)\d{17}[\dXx](?!\d)/.test(safety.html), 'Phone or identity number in fixture');
    results.push({site:site.id,passed:true,compatibility});
    console.log(`PASS ${site.id}: offline interactions and no external resources`);
  }
} finally { await browser.close(); }
const file=resolve(import.meta.dirname,'../../.local-archive/offline-sites/RESULTS.json');
await writeFile(file,JSON.stringify({created_at:new Date().toISOString(),kind:'fixture-functionality-and-MCP-observation-baseline',results},null,2));
console.log(JSON.stringify({report:file,passed:results.length,total:manifest.sites.length}));
