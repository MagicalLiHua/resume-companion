import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Compare rendered fixtures against the independently captured source, not the
// builder's output tree. Capture omissions and replay exceptions stay explicit.
export async function auditFidelity(browser, sample, captureRoot) {
  const cache = new Map();
  const sourceOf = async ref => {
    if (!cache.has(ref.capture)) cache.set(ref.capture, JSON.parse(await readFile(resolve(captureRoot, `${ref.capture}.json`), 'utf8')));
    const value = cache.get(ref.capture);
    return ref.section ? value.sections.find(s=>s.key===ref.section).capture : value;
  };
  const pathTo = (tree, index, parents = []) => {
    if (!tree || typeof tree === 'string') return null;
    if ('slot' in tree) return tree.slot === index ? parents : null;
    for (const child of tree.children || []) { const path=pathTo(child,index,[...parents,{tag:tree.tag,attrs:tree.attrs}]);if(path)return path; }
    return null;
  };
  const specs=[];
  for(const field of [...sample.fields,...sample.modules.flatMap(m=>m.fields)]) {
    const source=await sourceOf(field.provenance);
    if(source.truncated)throw Error(`Truncated source: ${field.id}`);
    const row=source.roots.find(r=>r.index===field.provenance.root);
    const ancestors=source.layouts.map(l=>pathTo(l.tree,row.index)).find(Boolean);
    if(!row||!ancestors)throw Error(`Missing source structure: ${field.id}`);
    specs.push({id:field.id,tree:row.tree,ancestors});
  }
  return browser.evalPage(`() => (${compare.toString()})(${JSON.stringify(specs)})`);
}

function compare(specs) {
  const report={field_roots:0,controls:0,attributes:0,ancestor_chains:0,mismatches:[]};
  const ignoredState=new Set(['value','checked','selected','aria-expanded','aria-selected','aria-checked','aria-invalid']);
  const stableClass=value=>String(value||'').split(/\s+/).filter(c=>c&&!c.startsWith('fixture-')&&!/not-empty|hasValue|(?:^|[-_])(?:checked|selected|active|item-bg)$/.test(c)).sort().join(' ');
  const removed='.s-options,.s-tooltip,.s-search-feedback,.ivu-select-dropdown,.ivu-picker-panel-body-wrapper,.ai-tool,.feedback,.ud__overflow__item,.select-input__item,.select-input__total';
  const create=tree=>{
    if(typeof tree==='string')return document.createTextNode(tree);
    const e=document.createElement(tree.tag);for(const [k,v] of Object.entries(tree.attrs||{}))e.setAttribute(k,v);
    for(const c of tree.children||[])e.append(create(c));return e;
  };
  const controls=root=>[...(root.matches('input,textarea,select,[role=combobox]')?[root]:[]),...root.querySelectorAll('input,textarea,select,[role=combobox]')];
  const check=(source,actual,field,where)=>{
    if(!actual||source.tagName!==actual.tagName){report.mismatches.push({field,where,reason:'element type'});return;}
    const names=new Set([...source.attributes,...actual.attributes].map(a=>a.name));
    for(const name of names){
      if(ignoredState.has(name)||name==='style'||name==='hidden'||name.startsWith('data-fixture-')||name==='data-field-label')continue;
      const expected=name==='class'?stableClass(source.getAttribute(name)):source.getAttribute(name);
      const found=name==='class'?stableClass(actual.getAttribute(name)):actual.getAttribute(name);
      report.attributes++;
      if(expected!==found)report.mismatches.push({field,where,attribute:name,expected,actual:found});
    }
  };
  for(const spec of specs){
    const roots=[...document.querySelectorAll('[data-fixture-field]')].filter(e=>e.dataset.fixtureField===spec.id||e.dataset.fixtureField.startsWith(spec.id+'--'));
    for(const actual of roots){
      const source=create(spec.tree);source.querySelectorAll(removed).forEach(e=>e.remove());
      const field=actual.dataset.fixtureField;check(source,actual,field,'root');report.field_roots++;
      const before=controls(source),after=controls(actual);
      if(before.length!==after.length)report.mismatches.push({field,reason:'control count',expected:before.length,actual:after.length});
      before.forEach((control,index)=>{
        check(control,after[index],field,`control ${index}`);report.controls++;
        let expected=control.parentElement,found=after[index]?.parentElement;
        while(expected&&expected!==source){check(expected,found,field,`control ${index} parent`);expected=expected.parentElement;found=found?.parentElement;}
      });
      let parent=actual.parentElement;
      for(const expected of [...spec.ancestors].reverse()){
        const sourceParent=create({...expected,children:[]});check(sourceParent,parent,field,'record ancestor');parent=parent?.parentElement;
      }
      report.ancestor_chains++;
    }
  }
  return report;
}
