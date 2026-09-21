const site = document.body.dataset.site;
const [sample, options] = await Promise.all([fetch(`${site}.json`).then(r => r.json()), fetch('options.json').then(r => r.json())]);
const state = { ready: false, values: {}, events: [], saves: 0, finalSubmissions: 0, records: [] };
const fields = [];
let activePopup = null;
let added = 0;
const clone = value => JSON.parse(JSON.stringify(value));
function node(tree, resolveSlot) {
  if ('slot' in Object(tree)) return resolveSlot?.(tree.slot) || document.createComment('omitted field');
  if (typeof tree === 'string') return document.createTextNode(tree);
  const el = document.createElement(tree.tag);
  for (const [key, value] of Object.entries(tree.attrs || {})) el.setAttribute(key, value);
  for (const [key, value] of Object.entries(tree.style || {})) el.style.setProperty(key,value);
  for (const child of tree.children || []) if (child) el.append(node(child,resolveSlot));
  return el;
}
const sd = name => `[class^="${name}-"],[class*=" ${name}-"]`;
function commit(key, value) { state.values[key] = clone(value); state.events.push({ key, value: clone(value) }); status(); }
function status() { document.querySelector('#lab-status').textContent = `${fields.length} 个字段区域 · ${state.events.length} 次本地更新 · 草稿保存 ${state.saves} 次`; }
let activeTrigger = null;
function expanded(trigger, value) {
  const owner=trigger?.closest('.ud__select,.ivu-select,'+sd('sd-Dropdown-container')) || trigger;
  for(const el of [owner,...owner?.querySelectorAll('[aria-expanded]')||[]]) if(el?.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded',String(value));
  if(owner?.matches('.ud__select')) owner.classList.toggle('ud__select-open',value);
  if(owner?.matches('.ivu-select')) owner.classList.toggle('ivu-select-visible',value);
}
function closePopup() { expanded(activeTrigger,false); activePopup?.remove(); activePopup = null; activeTrigger=null; }
function showPopup(tree, trigger, inline = false) {
  closePopup();
  const popup = node(tree); popup.classList.add('fixture-popup');
  if (inline) {
    trigger.closest(sd('sd-Dropdown-container')).append(popup);
    popup.style.left = '0'; popup.style.top = '100%';
  } else {
    document.body.append(popup);
    const box = trigger.getBoundingClientRect();
    popup.style.left = `${Math.min(box.left + scrollX, innerWidth - 290)}px`;
    popup.style.top = `${box.bottom + scrollY + 4}px`;
  }
  activePopup = popup;
  activeTrigger = trigger; expanded(trigger,true);
  popup.addEventListener('click', e => e.stopPropagation());
  return popup;
}
document.addEventListener('click', e => {
  if (activePopup && !activePopup.contains(e.target) && !e.target.closest('[data-fixture-control],.ud__select,.ivu-select,' + sd('sd-Input-container') + ',.select-input')) closePopup();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

function choices(label, input, index) {
  if (input.placeholder === '年') return Array.from({ length: 61 }, (_, i) => String(1980 + i));
  if (input.placeholder === '月') return Array.from({ length: 12 }, (_, i) => String(i + 1));
  if (/性别/.test(label)) return ['男', '女'];
  if (/学历类型/.test(label)) return ['统招全日制', '非全日制', '其他'];
  if (/学历/.test(label)) return ['博士', '硕士', '本科', '大专'];
  if (/学校/.test(label)) return options.schools;
  if (/竞赛/.test(label)) return ['示例程序设计竞赛', '示例创新竞赛'];
  if (/证书名称/.test(label)) return ['示例技术证书', '示例语言证书'];
  if (/语言|语种/.test(label)) return ['英语', '日语', '法语'];
  if (/精通程度|能力/.test(label)) return ['一般', '良好', '熟练', '精通'];
  if (/社交平台/.test(label)) return ['GitHub', '个人主页'];
  if (/政治面貌/.test(label)) return ['群众', '共青团员'];
  if (/求职状态/.test(label)) return ['在校-看看机会', '在校-考虑机会'];
  if (/薪资要求/.test(label)) return ['5000', '8000', '12000'];
  if (/干部级别/.test(label)) return index ? ['示例负责人', '示例成员'] : ['班级', '院系'];
  if (/专业/.test(label)) return ['计算机科学与技术', '软件工程', '电子信息'];
  if (/工作地点/.test(label)) return options.cities;
  if (/证件/.test(label) && index === 0) return ['身份证', '护照'];
  if (/手机/.test(label) && index === 0) return ['+86', '+1'];
  if (/工作经验/.test(label)) return ['应届生', '一年以下', '一至三年'];
  if (/掌握|听说|读写/.test(label)) return ['熟练', '良好', '一般'];
  return ['选项甲', '选项乙', '选项丙'];
}
function bindSelect(field, input, index, surface) {
  const key = `${field.id}:${index}`;
  const isSd = site === 'moka';
  const multi = surface.className.includes('multiple') || Boolean(surface.querySelector('.ud__select__selector-multiple'));
  const valueHost = isSd ? surface.querySelector(sd('sd-Input-display-value')) : surface.querySelector('.ud__select__selector__selectItem');
  if (valueHost) valueHost.textContent = '';
  surface.querySelectorAll('.ud__overflow__item').forEach(el => el.remove());
  let selected = multi ? [] : '';
  let searchGeneration = 0;
  function display() {
    if (valueHost) valueHost.textContent = selected;
    if (multi) {
      surface.querySelectorAll('.ud__overflow__item').forEach(el => el.remove());
      const host = surface.querySelector('.ud__overflow') || surface;
      for (const value of selected) {
        const item = document.createElement('span'); item.className = 'ud__overflow__item';
        const tag = document.createElement('span'); tag.className = 'ud__tag ud__select__selector__tag';
        const text = document.createElement('span'); text.className = 'ud__tag__content'; text.textContent = value;
        tag.append(text); item.append(tag); host.prepend(item);
      }
    }
    input.value = '';
  }
  function open(query = '') {
    const popup = showPopup(/竞赛/.test(field.label) && sample.templates.competition || sample.templates.select, input, isSd);
    const itemSelector = isSd ? sd('sd-Select-common-item') : '.ud__select__list__item';
    const item = popup.querySelector(itemSelector);
    if (!item) throw Error('Captured select item is missing');
    const parent = !isSd && item.closest('.rc-virtual-list-holder-inner') || item.parentElement;
    const template = (item.parentElement === parent ? item : item.parentElement).cloneNode(true); parent.replaceChildren();
    for (const value of choices(field.label, input, index).filter(v => !query || v.includes(query))) {
      const entry = template.cloneNode(true);
      const row = entry.matches(itemSelector) ? entry : entry.querySelector(itemSelector);
      const text = row.querySelector(isSd ? sd('sd-Menu-content-item') : '.ud__select__list__item__content') || row;
      text.textContent = value;
      row.classList.remove('ud__select__list__item-selected', 'ud__select__list__item-active');
      row.addEventListener('click', () => {
        selected = multi ? (selected.includes(value) ? selected.filter(x => x !== value) : [...selected, value]) : value;
        display(); commit(key, selected);
        for(const option of parent.querySelectorAll(itemSelector)) {
          const chosen = multi ? selected.includes(option.textContent.trim()) : selected === option.textContent.trim();
          option.classList.toggle('ud__select__list__item-selected',chosen && !isSd);
          if(option.hasAttribute('aria-selected'))option.setAttribute('aria-selected',String(chosen));
        }
        if (!multi) closePopup();
      });
      parent.append(entry);
    }
  }
  surface.addEventListener('click', e => {
    if (e.target.closest('.fixture-popup')) return;
    if (surface.tagName === 'LABEL' && e.target !== input) return;
    open();
  });
  input.addEventListener('input', () => {
    if (input.readOnly) return;
    const generation = ++searchGeneration, query = input.value;
    // Synthetic asynchronous suggestion delay, never a real recruitment API.
    setTimeout(() => { if (generation === searchGeneration && input.isConnected) open(query); }, 150);
  });
  field.resets.push(() => { selected = multi ? [] : ''; display(); });
  return key;
}
function bindCalendar(field, input, index) {
  const key = `${field.id}:${index}`;
  let year = 2024;
  let mode = 'month';
  function open() {
    const popup = showPopup(sample.templates.calendar, input, site === 'moka');
    const cells = site === 'moka' ? [...popup.querySelectorAll(sd('sd-basic-year-item'))]
      : site === 'feishu' ? [...popup.querySelectorAll('.ud__picker-month-panel-cell')]
        : [...popup.querySelectorAll('.ivu-date-picker-cells-cell')];
    const heading = popup.querySelector(site === 'moka' ? sd('sd-basic-selector-year') : site === 'feishu' ? '.ud__picker-panel-header-btn' : '.ivu-date-picker-header-label');
    if (heading) { heading.textContent = mode === 'year' ? `${year - 4}—${year + 7}` : `${year}年`; heading.onclick = site === 'moka' ? closePopup : () => { mode = 'year'; open(); }; }
    const buttons = site === 'moka' ? [...popup.querySelectorAll(sd('sd-basic-selector-icon'))]
      : site === 'feishu' ? [...popup.querySelectorAll('.ud__picker-panel-header-icon:not(.ud__picker-panel-header-collapse)')]
        : [...popup.querySelectorAll('.ivu-picker-panel-icon-btn')];
    buttons.slice(0,2).forEach((button,i) => { button.textContent = i ? '›' : '‹'; button.onclick = () => { year += (i ? 1 : -1) * (mode === 'year' ? 12 : 1); open(); }; });
    if (site === 'feishu') {
      const body = popup.querySelector('.ud__picker-panel-body');
      body?.classList.toggle('ud__picker-year-panel',mode==='year');
      body?.classList.toggle('ud__picker-month-panel',mode==='month');
    }
    const committed = String(state.values[key] || '');
    cells.forEach((cell, i) => {
      const value = mode === 'year' ? year - 4 + i : i + 1;
      const text = site === 'feishu' ? cell.querySelector('.ud__picker__cell-interactive-area') || cell : cell;
      text.textContent = `${value}${mode === 'month' ? '月' : mode === 'day' ? '日' : ''}`;
      cell.classList.remove('ud__picker__cell-selected', 'ivu-date-picker-cells-cell-selected');
      if (site === 'feishu') {
        cell.classList.toggle('ud__picker-year-panel-cell',mode==='year');
        cell.classList.toggle('ud__picker-month-panel-cell',mode==='month');
        cell.classList.toggle('ud__picker__cell-selected', mode==='year' ? Number(committed.slice(0,4))===value : committed===`${year}-${String(value).padStart(2,'0')}`);
      }
      if(site === 'moka')cell.parentElement.classList.toggle('sd-basic-selected-fixture',committed===`${year}-${String(value).padStart(2,'0')}`);
      cell.onclick = () => {
        if (mode === 'year') { year = value; mode = 'month'; open(); return; }
        const selected = `${year}-${String(value).padStart(2,'0')}`;
        input.value = site==='moka'?`${selected} (25岁)`:selected;
        commit(key, selected); closePopup();
      };
    });
  }
  input.addEventListener('click', () => {
    if (site === 'feishu' || site === 'moka') { mode='month'; year=Number(String(state.values[key]||'').slice(0,4))||2024; }
    open();
  });
  // Original date input typing is not presumed to commit a controlled date.
  input.addEventListener('blur', () => { const value=state.values[key] || '';input.value=site==='moka'&&value?`${value} (25岁)`:value; });
  field.resets.push(() => { input.value = ''; });
}
function bindRegion(field, surface, kind = 'region') {
  const key = `${field.id}:${kind}`;
  surface.onclick = () => {
    const popup = showPopup(sample.templates[kind], surface);
    popup.classList.add('fixture-region'); popup.style.left = '12vw'; popup.style.top = '16vh';
    const isJob = kind === 'job';
    const body = popup.querySelector(isJob ? '.job-type__content' : '.s-cascader');
    const sourceOption = popup.querySelector(isJob ? '.job-type__level-item' : '.s-cascader__option');
    const optionTemplate = sourceOption?.cloneNode(true);
    body.replaceChildren();
    const title = popup.querySelector(isJob ? '.job-type__header-title' : '.s-dialog__title');
    if (title) title.textContent = kind === 'job' ? '请选择职位名称' : kind === 'industry' ? '请选择行业类别' : '请选择行政区';
    const close = popup.querySelector(isJob ? '.job-type__header-close' : '.s-icon-guanbi'); if (close) close.onclick = closePopup;
    const path = [];
    function level(nodes, depth) {
      while (body.children.length > depth) body.lastElementChild.remove();
      const col = document.createElement(isJob ? 'ul' : 'div');
      col.className = isJob ? (depth === 2 ? 'job-type__last-level' : `job-type__level level-${depth ? 'two' : 'one'}`) : depth ? 's-cascader-horizontal-list' : 's-cascader__first-level s-scrollbar__wrap';
      const list = isJob ? col : document.createElement('ul');
      if (!isJob) { list.className = 's-scrollbar__view s-cascader__options'; col.append(list); }
      for (const entry of nodes) {
        const item = optionTemplate ? optionTemplate.cloneNode(true) : document.createElement('li');
        item.className = isJob ? 'job-type__level-item' : 's-cascader__option';
        const label = item.querySelector(isJob ? '.job-type__level-item-name' : '.s-cascader__option-content') || item; label.textContent = entry.label;
        item.onclick = () => {
          path.splice(depth); path[depth] = entry.label;
          while (body.children.length > depth + 1) body.lastElementChild.remove();
          if (entry.children) setTimeout(() => { if (activePopup === popup && path[depth] === entry.label) level(entry.children, depth + 1); }, 120);
          else {
            const display = surface.querySelector('.select-input__content,.select-input__placeholder,span') || surface;
            display.textContent = path.join('-'); commit(key, [...path]); closePopup();
          }
        };
        list.append(item);
      }
      body.append(col);
    }
    level(options[kind], 0);
  };
}
function bindIviewSelect(field, surface, index) {
  const key = `${field.id}:select-${index}`;
  const trigger = surface.querySelector('.ivu-select-selection');
  const selected = surface.querySelector('.ivu-select-selected-value');
  const placeholder = surface.querySelector('.ivu-select-placeholder');
  if (selected) selected.textContent = '';
  if (placeholder) { placeholder.hidden = false; placeholder.style.removeProperty('display'); }
  surface.querySelectorAll('.ivu-select-dropdown').forEach(e => e.remove());
  state.values[key] = '';
  const clear = () => { if (selected) selected.textContent = ''; if (placeholder) placeholder.hidden = false; commit(key, ''); };
  surface.addEventListener('fixture-clear', clear);
  (trigger || surface).onclick = () => {
    const popup = showPopup(sample.templates.select, surface);
    popup.querySelectorAll('.ivu-select-not-found,.ivu-select-loading').forEach(e => e.remove());
    const list = popup.querySelector('.ivu-select-dropdown-list');
    const template = list.querySelector('.ivu-select-item').cloneNode(true); list.replaceChildren();
    for (const value of choices(field.label, { placeholder: '' }, index)) {
      const item = template.cloneNode(true); item.className = 'ivu-select-item'; item.textContent = value;
      // Observed on the original iView Select: committing uses mousedown.
      item.onmousedown = event => {
        event.preventDefault();
        if (selected) selected.textContent = value;
        if (placeholder) placeholder.hidden = true;
        commit(key, value); closePopup();
        if (field.label === '最高学历') {
          for (const dependent of fields.filter(f => f.recordId === field.recordId && f.afterDegree)) dependent.wrapper.hidden = false;
        }
        if (field.label === '干部级别' && index === 0) {
          const child = [...field.wrapper.querySelectorAll('.ivu-select')][1];
          if (child) { child.classList.remove('ivu-select-disabled'); child.dispatchEvent(new Event('fixture-clear')); }
        }
      };
      list.append(item);
    }
  };
}
function addField(description, section) {
  const field = { ...description, resets: [] };
  fields.push(field);
  const root = node(field.tree), wrapper = root;
  wrapper.classList.add('fixture-field'); wrapper.dataset.fixtureField = field.id;
  wrapper.dataset.fixtureLabel = field.label; field.wrapper = wrapper;
  section?.append(wrapper);
  wrapper.hidden = Boolean(field.afterDegree);
  // Preserve original IDs/names, including duplicate IDs present in source
  // repeated records. Test identity lives separately in fixture metadata.
  root.querySelectorAll('.s-options,.s-tooltip,.s-search-feedback,.ivu-select-dropdown,.ivu-picker-panel-body-wrapper,.ai-tool,.feedback').forEach(e => e.remove());
  root.querySelectorAll('.ud__select__selector__selectItem,' + sd('sd-Input-display-value') + ',.ud__tag__content').forEach(el => el.textContent = '');
  root.querySelectorAll('input,textarea').forEach((input, index) => {
    input.value = ''; if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
    input.dataset.fixtureControl = `${field.id}:${index}`;
    state.values[`${field.id}:${index}`] = ['checkbox','radio'].includes(input.type) ? false : '';
    if (input.type === 'radio') {
      input.addEventListener('change', () => {
        for (const peer of root.querySelectorAll('input[type=radio]')) { if(peer!==input)peer.checked=false; state.values[peer.dataset.fixtureControl] = peer.checked; }
        commit(`${field.id}:choice`, input.closest('label')?.textContent.trim() || '');
      }); return;
    }
    if (input.type === 'checkbox') {
      input.addEventListener('change', () => {
        commit(`${field.id}:${index}`, input.checked);
        if (/至今/.test(input.closest('label')?.textContent || '')) {
          const ends = [...root.querySelectorAll('input')].filter(el => el.placeholder === '年' || el.placeholder === '月').slice(2);
          for (const end of ends) {
            end.disabled = input.checked;
            const display = end.closest(sd('sd-Select-container'))?.querySelector(sd('sd-Input-display-value'));
            if (display) display.textContent = '';
            commit(end.dataset.fixtureControl, '');
          }
          const endDate = [...root.querySelectorAll('.ivu-date-picker input')][1];
          if (endDate) { endDate.disabled = input.checked; endDate.value = ''; commit(endDate.dataset.fixtureControl, ''); }
        }
      }); return;
    }
    const select = site === 'moka' ? input.closest(sd('sd-Select-container')) : site === 'feishu' ? input.closest('.ud__select') : null;
    if (select && sample.templates.select && (site !== 'feishu' || select.querySelector('.ud__select__selector'))) { bindSelect(field, input, index, select); return; }
    if (site === 'moka' && /出生日期/.test(field.label) || site === 'feishu' && input.closest('.throne-biz-date-range-picker-wrapper') || site === 'zhaopin' && input.closest('.ivu-date-picker')) {
      bindCalendar(field, input, index); return;
    }
    input.addEventListener('input', () => commit(`${field.id}:${index}`, input.value));
  });
  if (site === 'zhaopin') {
    root.querySelectorAll('.zp-radio__item').forEach(item => {
      item.classList.remove('zp-radio__item-bg');
      item.onclick = () => { root.querySelectorAll('.zp-radio__item').forEach(el => el.classList.remove('zp-radio__item-bg')); item.classList.add('zp-radio__item-bg'); commit(`${field.id}:choice`, item.textContent.trim()); };
    });
    const selects = [...(root.matches('.ivu-select') ? [root] : []), ...root.querySelectorAll('.ivu-select:not(.ivu-auto-complete)')];
    selects.forEach((surface, index) => bindIviewSelect(field, surface, index));
    root.querySelectorAll('.select-input').forEach(surface => {
      surface.querySelectorAll('.select-input__item,.select-input__total').forEach(e => e.remove());
      const kind = /行业/.test(field.label) ? 'industry' : /职位/.test(field.label) ? 'job' : 'region';
      bindRegion(field, surface, kind);
    });
  }
  return field;
}
const collectSlots = tree => !tree || typeof tree === 'string' ? [] : 'slot' in tree ? [tree.slot] : (tree.children || []).flatMap(collectSlots);
function findTree(tree, predicate) {
  if (!tree || typeof tree === 'string' || 'slot' in tree) return null;
  if (predicate(tree)) return tree;
  for (const child of tree.children || []) { const found=findTree(child,predicate); if(found)return found; }
  return null;
}
const action = (root, text) => [...root.querySelectorAll('button,a,span')].find(e=>e.textContent.trim()===text&&!e.querySelector('button,a'));
function renderLayout(tree, descriptions, suffix = '', recordId) {
  const byId=new Map(descriptions.map(f=>[f.id,f]));
  return node(tree,id=>{
    const description=byId.get(id);
    return description ? addField({...description,id:description.id+suffix,recordId}).wrapper : document.createComment('excluded field');
  });
}
function saveLocal(root) {
  for (const el of root.querySelectorAll('button,a,span')) if (/^保存(?:并更新)?$/.test(el.textContent.trim())&&!el.querySelector('button,a')) el.onclick=()=>{state.saves++;status();};
}
for (const layout of sample.layouts) {
  const descriptions=sample.fields.filter(f=>collectSlots(layout).includes(f.id));
  const root=renderLayout(layout,descriptions);root.classList.add('fixture-section');document.querySelector('#fixture').append(root);saveLocal(root);
  const add=action(root,'添加');
  if (add) {
    const firstSection=descriptions[0].section;
    const originals=descriptions.filter(f=>f.section===firstSection);
    add.dataset.fixtureAddSection=firstSection;
    const wanted=new Set(originals.map(f=>f.id));
    const template=findTree(layout,t=>{const ids=collectSlots(t);return ids.length===wanted.size&&ids.every(id=>wanted.has(id));});
    add.onclick=()=>{
      closePopup();
      const first=fields.find(f=>f.id===originals[0].id).wrapper;
      const classes=(template.attrs.class||'').split(/\s+/).filter(Boolean);
      let originalRoot=first;
      while(originalRoot.parentElement&&!classes.every(c=>originalRoot.classList.contains(c)))originalRoot=originalRoot.parentElement;
      const copy=renderLayout(template,originals,`-copy-${added++}`);
      originalRoot.parentElement.append(copy);status();
    };
  }
}
for (const module of sample.modules || []) {
  let section, launcher;
  const template=site==='feishu' ? findTree(module.layout,t=>(t.attrs.class||'').split(/\s+/).some(c=>c.startsWith('apply-form-array-card__'))) : module.layout;
  function closed() {
    const root=module.closedLayout ? node(module.closedLayout) : document.createElement('div');
    root.classList.add('fixture-section');root.dataset.fixtureModule=module.id;
    if(!module.closedLayout){const title=document.createElement('div');title.className='fixture-module-title';title.textContent=module.title;root.append(title);}
    const add=action(root,'添加')||document.createElement('button');
    if(!add.isConnected&&!root.contains(add)){add.textContent=`${module.action}${module.title}`;root.append(add);}
    add.dataset.fixtureAddModule=module.id;add.onclick=addRecord;
    return {root,add};
  }
  function addRecord() {
    closePopup();
    const recordId=`${module.id}-record-${added++}`;
    const suffix=`--${recordId}`;
    let record;
    if(site==='feishu'&&!section.querySelector('[data-fixture-record-id]')){
      const expanded=renderLayout(module.layout,module.fields,suffix,recordId);
      expanded.classList.add('fixture-section');expanded.dataset.fixtureModule=module.id;section.replaceWith(expanded);section=expanded;
      record=expanded.querySelector('[class*="apply-form-array-card__"]');
    } else {
      record=renderLayout(template,module.fields,suffix,recordId);
      const existing=section.querySelector('[data-fixture-record-id]');
      (existing?.parentElement||section).append(record);
    }
    record.classList.add('fixture-record');record.dataset.fixtureRecordId=recordId;
    const cancel=record.querySelector('[class*="apply-form-array-card-delete"]')||action(record,'取消');
    if(!cancel)throw Error(`Captured cancel control missing: ${module.id}`);
    cancel.dataset.fixtureCancelRecord=recordId;
    cancel.onclick=()=>{
      closePopup();
      for(let i=fields.length-1;i>=0;i--)if(fields[i].recordId===recordId){
        for(const key of Object.keys(state.values))if(key.startsWith(`${fields[i].id}:`))delete state.values[key];
        fields.splice(i,1);
      }
      record.remove();state.records=state.records.filter(r=>r.id!==recordId);
      if(!section.querySelector('[data-fixture-record-id]')){const next=closed();section.replaceWith(next.root);section=next.root;launcher=next.add;}
      else if(launcher)launcher.disabled=false;
      status();
    };
    state.records.push({id:recordId,module:module.id});saveLocal(record);
    for(const add of section.querySelectorAll('button'))if(add.textContent.trim()==='添加'){add.dataset.fixtureAddModule=module.id;add.onclick=addRecord;launcher=add;}
    if(!module.repeatable&&launcher)launcher.disabled=true;
    status();
  }
  const initial=closed();section=initial.root;launcher=initial.add;document.querySelector('#fixture').append(section);
}
document.addEventListener('submit',event=>event.preventDefault());
document.querySelector('#reset-fixture').onclick = () => location.reload();
document.querySelector('#save-fixture').onclick = () => { state.saves++; status(); };
window.fixtureOracle = () => clone({ ...state, fields: fields.map(f => ({ id: f.id, label: f.label, section: f.section, record: f.recordId, visible: !f.wrapper.hidden })), popup: Boolean(activePopup) });
state.ready = true; status();
