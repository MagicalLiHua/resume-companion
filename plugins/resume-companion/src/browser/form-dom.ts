import type { CandidateMeta, RawField, RawPageForm, TargetSpec } from './form-engine.js';

/** Serialized into the page. No module-level values may be referenced here. */
export function createDomFormRuntime() {
  const text = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = (value: unknown): string => text(value).replace(/[\s*：:]+/g, '').toLowerCase();
  const controlSelector = 'input:not([type="hidden"]),textarea,select,button,[contenteditable="true"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"],[role="button"],[role="slider"],[role="spinbutton"],.phoenix-radio-group,.phoenix-select,.ant-radio-group';
  const sdSelect = '[class^="sd-Select-container-"],[class*=" sd-Select-container-"]';
  const sdInput = '[class^="sd-Input-container-"],[class*=" sd-Input-container-"]';
  const sdDropdown = '[class^="sd-Dropdown-container-"],[class*=" sd-Dropdown-container-"]';
  const udModule = '[class^="applyFormModuleWrapper__"],[class*=" applyFormModuleWrapper__"]';
  const udRecord = '[class^="apply-form-array-card__"],[class*=" apply-form-array-card__"]';
  const udRange = '.throne-biz-date-range-picker-wrapper';
  const sdModule = '[class^="apply-block-"],[class*=" apply-block-"],[class^="basic-block-"],[class*=" basic-block-"]';
  const sdRecord = '[class^="apply-fields-"][class*=" multi-"],[class*=" apply-fields-"][class*=" multi-"]';
  const overlaySelector = '.common-unmodeled-layer__layerContent,[role="listbox"],[role="menu"],[role="tree"],[role="dialog"],.ant-select-dropdown,.ant-cascader-menus,.ant-picker-dropdown,.ant-calendar-picker-container,.ui-autocomplete,.el-select-dropdown,.el-cascader__dropdown,.el-picker-panel,.ud__select__dropdown,.ud__picker-date-panel,.popup[aria-label],[class^="sd-Dropdown-dropdown-"],[class*=" sd-Dropdown-dropdown-"]';
  const optionSelector = '.area-item-container,.list-item-container,.phoenix-selectList__listItem,[role="option"],[role="treeitem"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],.ant-select-item-option,.ant-cascader-menu-item,.el-select-dropdown__item,.el-cascader-node,.ud__select__list__item,.ud__tree__node:has(input[type=checkbox]),[class^="sd-Select-common-item-"],[class*=" sd-Select-common-item-"],[class^="sd-Menu-content-item-"],[class*=" sd-Menu-content-item-"],li,td,button';
  const componentSelector = `.phoenix-select,.phoenix-radio-group,.ant-select,.ant-cascader,.el-select,.el-cascader,.ud__select,${sdSelect},${sdDropdown}`;
  const headingSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"],.ant-card-head-title,.el-card__header,.form-title,.section-title,fieldset > legend';
  const job51Root = document.querySelector('.cornercol1') ?? document.querySelector('.corner_right');
  const job51 = Boolean(job51Root && document.querySelector('input[id="imgbtnNext"],input[id="imgbtnPrevious"],input[id="imgbtnSave"]'));
  const buttonLike = (element: Element): boolean => element.matches('button,[role="button"],input[type="submit"],input[type="button"],input[type="image"],input[type="reset"]');
  const definitionTitle = (element: Element): Element | null => element.closest('dl')?.querySelector(':scope > dt') ?? null;
  const dayeeSections = new Map<Element,string>();
  const dayeeRecords = new Map<Element,string>();
  const dayeeAdds = new Map<Element,string>();
  const guopinSections = new Map<Element,string>();
  const educationSlots = new Map<Element,'high_school'|'highest'|'other'>();
  const guopinRecords = new Map<Element,string>();
  const guopinPreviews = new Map<Element,{label:string;value:string;date:boolean}>();
  const guopin = location.hostname==='c.iguopin.com' && Boolean(document.querySelector('.resume-left-content .item-section .section-title h2'));
  const job51Slots = new Map<Element,string>();
  const job51Records = new Map<Element,string>();
  let job51Add:Element|null=null;
  const visible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement) || element.closest('[hidden],[aria-hidden="true"],.common-unmodeled-layer-hidden')) return false;
    const proxy = element.matches('input') && element.closest(`${sdSelect},.phoenix-select`) || (element.matches('input[role=combobox]') ? element.closest('.ant-select,.el-select,.el-cascader,.ud__select') : null);
    const surface = proxy || element;
    const rect = surface.getBoundingClientRect();
    const style = getComputedStyle(surface);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const certificateDialogs=guopin?Array.from(document.querySelectorAll('.my-cascader-modal[role=dialog]')).filter(el=>visible(el)&&text(el.querySelector('.title-search .ant-select-selection-placeholder')?.textContent)==='请填写证书名称'&&Boolean(document.querySelector('#certificate .section-title h2'))):[];
  const certificateDialog=certificateDialogs.length===1?certificateDialogs[0]:undefined;
  // Weak identity survives scans without retaining detached SPA nodes or writing DOM attributes.
  const key = Symbol.for('resume-companion.semantic-identities.v1');
  const host = window as unknown as Record<symbol, { ids: WeakMap<Element, string>; next: number; epoch: string }>;
  const registry = host[key] ??= { ids: new WeakMap(), next: 0, epoch: Math.random().toString(36).slice(2) };
  const identity = (element: Element): string => {
    let id = registry.ids.get(element);
    if (!id) { id = `${registry.epoch}:${++registry.next}`; registry.ids.set(element, id); }
    return id;
  };
  const accessibleLabel = (element: Element): string => text(element.getAttribute('aria-label')) || text(
    text(element.getAttribute('aria-labelledby')).split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' '));
  const optionLabel = (element: Element): string => {
    const content = element.querySelector('.area-text-label,.item-text-label,.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label,.ud__select__list__item__content,.ud__tree__node__label,[class^="sd-Menu-content-item-"],[class*=" sd-Menu-content-item-"]');
    if (content) return text(content.textContent);
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('[aria-hidden="true"],[role="img"],svg').forEach(node => node.remove());
    return accessibleLabel(element) || text(clone.textContent);
  };
  // CSS-module suffixes are unstable. Use structural title/control relationships
  // for unlabelled component inputs; never treat a selected display as a label.
  const titleTexts = new WeakMap<Element, string>();
  const titleText = (node: Element): string => {
    if (titleTexts.has(node)) return titleTexts.get(node)!;
    const copy = node.cloneNode(true) as Element;
    copy.querySelectorAll('button,[role="button"],input,svg,style,script,[aria-hidden="true"],[class*="required-asterisk"]').forEach(el => el.remove());
    const result = text(copy.textContent).replace(/^[*\s]+|[*：:\s]+$/g, '');
    titleTexts.set(node, result);
    return result;
  };
  for(const section of document.querySelectorAll('form.ant-form > .form-cell')) {
    const heading=section.querySelector(':scope > .tit-wrap > .tit > p');
    const name=text(heading?.textContent);
    if(!name || !visible(section))continue;
    dayeeSections.set(section,name);
    const add=section.querySelector(':scope > .form-cell-right > .add-more > .add-more-btn');
    if(add){
      dayeeAdds.set(add,`添加${name}`);
      Array.from(section.querySelectorAll(':scope > .form-cell-right > .form-cell-inner')).filter(visible).forEach((record,i)=>dayeeRecords.set(record,`${name} / 第${i+1}条`));
    }
  }
  const structuralTitle = (node: Element): Element | undefined => Array.from(node.children).find(child =>
    Array.from(child.classList).some(name => /^(?:(?:block|section|group|form|field|filed)[-_]?)?(?:title|heading|header|label)(?:[-_]|$)/i.test(name))
    && Boolean(titleText(child)) && titleText(child).length <= 80
    && !child.querySelector('input,textarea,select,[role="combobox"]'));
  if(guopin)for(const section of document.querySelectorAll('.resume-left-content > .item-section')){
    const name=text(section.querySelector('.section-title h2')?.textContent);
    if(!name||!visible(section))continue;
    guopinSections.set(section,name);
    Array.from(section.querySelectorAll('.item-section-content-multiple > .edit-section,.item-section-content-multiple > .item-section-tpl')).filter(visible).forEach((record,i)=>{
      guopinRecords.set(record,`${name} / 第${i+1}条`);
      if(record.matches('.item-section-tpl')&&!record.querySelector('.edit-section')){
        const anchors:Record<string,Array<[string,string]>>={
          '项目经历':[['.project_name-field strong','项目名称']],
          '工作/实习经历':[['.company_name-field strong','单位名称'],['.job_name-field strong','职位名称']],
          '教育经历':[['.school_cn-field strong','学校名称']],
          '求职意向':[['.position-field strong','期望职位'],['.line-separator-list li:nth-child(1)','薪资要求'],['.line-separator-list li:nth-child(2)','工作地区'],['.line-separator-list li:nth-child(3)','期望行业']],
        };
        for(const [selector,label] of anchors[name]??[]){const node=record.querySelector(selector);if(node)guopinPreviews.set(node,{label,value:text(node.textContent),date:false});}
        const period=record.querySelector('[class*="period"] span');
        const range=text(period?.textContent).match(/^(\d{4}-\d{2})至(\d{4}-\d{2}|今)/);
        const label=({'项目经历':'起止时间','工作/实习经历':'在职时间','教育经历':'就读年月'} as Record<string,string>)[name];
        if(period&&range&&label)guopinPreviews.set(period,{label,value:`${range[1]} / ${range[2]==='今'?'至今':range[2]}`,date:true});
      }
    });
    for(const record of Array.from(section.querySelectorAll('.item-section-content:not(.item-section-content-multiple) > .item-section-tpl')).filter(visible)){
      const node=name==='自我评价'?record.querySelector('.assessment-field .value'):name==='资格证书'?record.querySelector('.my-tags'):null;
      if(node)guopinPreviews.set(node,{label:name==='资格证书'?'证书名称':'自我评价',value:name==='资格证书'?Array.from(node.querySelectorAll('.ant-tag')).map(n=>text(n.textContent)).join(' / '):text(node.textContent),date:false});
    }
  }
  // Some enterprise forms expose fixed education slots instead of Add cards.
  // Require the paired visible labels; custom CCA identifiers carry no meaning.
  if(job51 && text(job51Root?.querySelector('h1')?.textContent)==='教育经历'){
    const rows=Array.from(job51Root!.querySelectorAll('dl')).filter(visible);
    const titles=rows.map(row=>text(row.querySelector(':scope > dt')?.textContent).replace(/[\s*＊]/g,''));
    const second=titles.indexOf('其他学历');
    if(titles[0]==='最高学历' && second>0 && titles.includes('毕业学校2') && titles.includes('专业2')){
      rows.forEach((row,i)=>job51Slots.set(row,`教育经历 / 第${i<second?1:2}条`));
      job51Records.set(rows[0]!,'教育经历 / 第1条');job51Records.set(rows[second]!,'教育经历 / 第2条');
    }else if(titles[0]==='最高学历'&&titles.some(t=>/^(博士|硕士|本科|大专)是否统招$/.test(t))){
      let level='',ordinal=0;
      rows.forEach((row,i)=>{
        const next=/^(博士|硕士|本科|大专)是否统招$/.exec(titles[i]??'')?.[1];
        if(next&&next!==level){level=next;ordinal++;job51Records.set(row,`教育经历 / 第${ordinal}条`);}
        if(level)job51Slots.set(row,`教育经历 / 第${ordinal}条`);
      });
    }
  }
  if(job51){
    const section=text(job51Root?.querySelector('h1')?.textContent);
    if(section==='教育背景'){
      const rows=Array.from(job51Root!.querySelectorAll('dl')).filter(visible);
      const titles=rows.map(row=>titleText(row.querySelector(':scope > dt')!).replace(/[\s*＊]/g,''));
      const highest=titles.indexOf('最高学历'),other=titles.indexOf('其他学历2');
      if(titles[0]==='高中毕业学校'&&titles.includes('高中入学时间')&&highest>0){
        rows.forEach((row,i)=>{
          if(i===highest||/报告|上传/.test(titles[i]??''))return;
          const slot=i<highest?'high_school':other>=0&&i>=other?'other':'highest';
          const scope=`教育背景 / 第${slot==='high_school'?1:slot==='highest'?2:3}条`;
          educationSlots.set(row,slot);job51Slots.set(row,scope);
          if(![...job51Records.values()].includes(scope))job51Records.set(row,scope);
        });
      }
    }
    const cards=Array.from(job51Root!.querySelectorAll('.ci')).filter(el=>visible(el)&&el.querySelector(':scope > dl')&&el.querySelector(':scope > .tb input.btnAppend'));
    cards.forEach((card,i)=>job51Records.set(card,`${section} / 第${i+1}条`));
    job51Add=cards.at(-1)?.querySelector(':scope > .tb input.btnAppend')??null;
  }
  // Phoenix forms repeat IDs on their heading and each record. Pair the
  // heading with a containing section instead of using getElementById or
  // styled-components' generated class names.
  const phoenixSections = new Map<Element, string>();
  const phoenixRecords = new Map<Element, string>();
  const phoenixAdds = new Map<Element, string>();
  for (const form of document.querySelectorAll('.ux-standard-form .form[id]')) {
    if (!form.querySelector('.form-item--phoenix') || !visible(form)) continue;
    for (let parent = form.parentElement, depth = 0; parent && depth < 12; parent = parent.parentElement, depth++) {
      const heading = Array.from(parent.children).find(node => node.id === form.id && !node.querySelector('input,textarea,select') && titleText(node));
      if (!heading) continue;
      const name = titleText(heading);
      phoenixSections.set(parent, name);
      const cards = Array.from(parent.querySelectorAll('.ux-standard-form')).filter(node => node.querySelector('.form')?.id === form.id && visible(node));
      const add = Array.from(parent.querySelectorAll('div,span,a,button')).find(node => node.id === `${form.id}_addButton`)
        || Array.from(parent.querySelectorAll('span,button,a')).find(node => text(node.textContent) === `添加${name}` && !node.querySelector('span,button,a'));
      if (add) phoenixAdds.set(add, `添加${name}`);
      if (add || cards.length > 1) cards.forEach((card, index) => phoenixRecords.set(card, `${name} / 第${index + 1}条`));
      break;
    }
  }
  const phoenixDate = (element: Element): boolean => Boolean(element.closest('.phoenix-select')?.querySelector('[id$="field_date_time_picker"],[*|href$="field_date_time_picker"]'));
  const fieldContainers = new WeakMap<Element, Element | null>();
  const structuralField = (element: Element): Element | null => {
    if (fieldContainers.has(element)) return fieldContainers.get(element)!;
    let found: Element | null = null;
    if (element.closest(`${sdInput},[class^="sd-Textarea-"],[class*=" sd-Textarea-"]`)) {
      for (let parent = element.parentElement, depth = 0; parent && depth < 10; parent = parent.parentElement, depth++) {
        if (structuralTitle(parent)) { found = parent; break; }
        if (parent === document.body) break;
      }
    }
    fieldContainers.set(element, found);
    return found;
  };
  // A named year/month group is one date target as well as independently
  // addressable selects. Restrict grouping to an observed, unambiguous shape.
  const dateGroups = new Map<Element, { parts: Array<HTMLInputElement | HTMLSelectElement>; current: HTMLInputElement | null }>();
  const udRanges = new Map<Element, HTMLInputElement[]>();
  const udFieldLabel = (element: Element): string => {
    const field = element.closest('.ud-formily-item');
    const label = field?.querySelector(':scope > .ud-formily-item-label .ud-formily-item-label-content');
    const base=(text(label?.textContent) || text(field?.getAttribute('data-form-field-i18n-name'))).replace(/[＊*：:]+/g, '').trim();
    if(element.closest('.ud__select') && field && Array.from(field.querySelectorAll('input')).some(input=>!input.closest('.ud__select'))) {
      if(/手机号码|手机号|电话号码|phone/i.test(base))return `${base} / 区号`;
      if(/个人证件|证件类型|身份证件/i.test(base))return `${base} / 类型`;
    }
    return base;
  };
  for (const root of document.querySelectorAll(udRange)) {
    const parts = Array.from(root.querySelectorAll<HTMLInputElement>('input:not([type=hidden])'));
    if (visible(root) && parts.length === 2 && udFieldLabel(root)) udRanges.set(root, parts);
  }
  if(guopin)for(const root of document.querySelectorAll('.item-section .resume-common-form-item .ant-picker-range')){
    const parts=Array.from(root.querySelectorAll<HTMLInputElement>('input:not([type=hidden])'));
    if(visible(root)&&parts.length===2)udRanges.set(root,parts);
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('input')) {
    if (!input.closest(sdSelect)) continue;
    const container = structuralField(input);
    if (!container || dateGroups.has(container) || !visible(container)) continue;
    const groupTitle = structuralTitle(container);
    if (!groupTitle || !/时间|日期|年月|月份|起止|期间|期限|出生|入学|毕业|入职|离职|date|period|duration/i.test(titleText(groupTitle))) continue;
    const parts = Array.from(container.querySelectorAll<HTMLInputElement>('input')).filter(node => node.closest(sdSelect));
    const shape = parts.map((node,index) => {
      const expected=index%2?'月':'年';
      if(node.placeholder)return node.placeholder;
      // Moka removes the placeholder after selection and may default the month
      // when the year changes. Preserve the group using committed display text,
      // never an uncommitted search query or an arbitrary numeric input.
      const display=text(node.closest(sdSelect)?.querySelector('[class^="sd-Input-display-value-"],[class*=" sd-Input-display-value-"]')?.textContent);
      return (index%2?/^(?:0?[1-9]|1[0-2])月?$/:/^\d{4}年?$/).test(display)?expected:'';
    }).join('/');
    if (!['年/月', '年/月/年/月'].includes(shape)) continue;
    const checks = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const current = checks.filter(node => /^(至今|目前|在职|present|current)$/i.test(accessibleLabel(node) || text(node.closest('label')?.textContent)));
    if (checks.length && (checks.length !== 1 || current.length !== 1 || parts.length !== 4)) continue;
    dateGroups.set(container, { parts, current: current[0] || null });
  }
  // The legacy 51job template pairs native year/month selects in a named DL.
  // Require both date semantics and numeric option shapes; city pairs are not dates.
  if (job51) for (const container of document.querySelectorAll('dl')) {
    const title = definitionTitle(container);
    if (!title || !/时间|日期|年月|起止|出生|入学|毕业/.test(titleText(title))) continue;
    const parts = Array.from(container.querySelectorAll<HTMLSelectElement>('dd select')).filter(visible);
    if (![2,4].includes(parts.length) || !parts.every((part,index) => {
      const values = Array.from(part.options).map(o=>text(o.textContent)).filter(v=>!/^[-—请选择\s]*$/.test(v));
      return values.length > 0 && values.every(v=>(index%2?/^(?:0?[1-9]|1[0-2])月?$/:/^\d{4}年?$/).test(v));
    })) continue;
    dateGroups.set(container, {parts,current:null});
  }
  const structuredLabel = (element: Element): string => {
    const container = structuralField(element);
    const title = container && structuralTitle(container);
    if (!title) return '';
    const base = titleText(title);
    const inputs = Array.from(container!.querySelectorAll('input'));
    if(element.closest(sdSelect) && /证件号码|个人证件|身份证件/.test(base) && inputs.some(input=>!input.closest(sdSelect))) return `${base} / 类型`;
    if (element.closest(sdSelect) && inputs.length === 2 && inputs.some(input => input !== element && !input.closest(sdSelect)
      && (input.type === 'tel' || /手机号|手机号码|电话号码|phone number/i.test(input.placeholder)))) return `${base} / 区号`;
    const parts = dateGroups.get(container!)?.parts || [];
    if (parts.includes(element as HTMLInputElement)) {
      const index = parts.indexOf(element as HTMLInputElement);
      return `${base} / ${parts.length===4?(index < 2 ? '开始' : '结束'):''}${index%2?'月':'年'}`;
    }
    return base;
  };
  const labelOf = (element: Element): string => {
    if(element===certificateDialog)return '证书名称';
    if(certificateDialog?.contains(element)&&buttonLike(element))return text(element.textContent).replace(/\s+/g,'')||accessibleLabel(element);
    if(guopinPreviews.has(element))return guopinPreviews.get(element)!.label;
    if(guopin&&element.closest('.item-section')){
      const salary=element.closest('.two-salary-field');
      if(salary){const inputs=Array.from(salary.querySelectorAll('.salary_monthly input[role=combobox]'));const index=inputs.indexOf(element as HTMLInputElement);if(index>=0)return `薪资要求（元/月） / ${index===0?'最低':'最高'}`;}
      if(buttonLike(element))return text(element.textContent).replace(/\s+/g,'');
      const item=element.closest('.resume-common-form-item');
      const title=item?.querySelector(':scope > .ant-form-item-row > .ant-form-item-label > label');
      if(title){
        const clone=title.cloneNode(true) as Element;clone.querySelectorAll('.tip,svg,.anticon').forEach(e=>e.remove());
        const base=text(clone.textContent);
        const period=element.closest('.rangepicker-period');
        if(period&&element instanceof HTMLInputElement){
          if(element.closest('.period-end-temp'))return `${base} / 结束`;
          if(element.closest('.period-end-date'))return `${base} / 结束`;
          if(element.placeholder==='开始时间')return `${base} / 开始`;
        }
        const range=element.closest('.ant-picker-range');
        if(range&&element!==range){const inputs=Array.from(range.querySelectorAll('input'));return `${base} / ${inputs.indexOf(element as HTMLInputElement)===0?'开始':'结束'}`;}
        return base;
      }
    }
    if(dayeeAdds.has(element))return dayeeAdds.get(element)!;
    if(element.closest('.form-cell') && dayeeSections.has(element.closest('.form-cell')!)) {
      const item=element.closest('.ant-form-item');
      const label=item?.querySelector(':scope > .ant-form-item-label > label');
      if(label && !buttonLike(element)){
        const clone=label.cloneNode(true) as Element;
        clone.querySelectorAll('.labelRequired,.anticon,svg,button').forEach(el=>el.remove());
        const base=text(clone.textContent).replace(/[?？*＊]+$/,'').trim();
        const parts=Array.from(item!.querySelectorAll('[role="combobox"]'));
        if(parts.length===2 && parts.includes(element) && /城市|籍贯|居住地/.test(base))return `${base} / ${parts.indexOf(element)?'城市':'省份'}`;
        return base;
      }
    }
    if (phoenixAdds.has(element)) return phoenixAdds.get(element)!;
    if (element.matches('input[type=checkbox]') && element.closest('.phoenix-checkbox')) return text(element.closest('.phoenix-checkbox')?.textContent);
    if (element.closest('.form-item--phoenix') && !element.matches('button,[role="button"]')) {
      const field = element.closest('.form-item--phoenix')!;
      return text(field.querySelector(':scope > .form-item__title .form-item__text')?.textContent);
    }
    if (dateGroups.has(element)) return titleText(structuralTitle(element) ?? definitionTitle(element)!);
    if (udRanges.has(element)) return udFieldLabel(element);
    const aria = accessibleLabel(element);
    if (aria) return aria;
    if (buttonLike(element) && (job51 || element instanceof HTMLInputElement)) {
      const explicit = text(element.getAttribute('title') || element.getAttribute('alt'));
      const known:Record<string,string> = {imgbtnNext:'下一步',imgbtnPrevious:'上一步',imgbtnSave:'保存',imgbtnSubmit:'最终提交',btnPreview:'预览'};
      return (job51 && known[element.id]) || explicit || text((element as HTMLInputElement).value) || text(element.textContent);
    }
    const dt = job51 && definitionTitle(element);
    if (dt) {
      const dl = element.closest('dl')!;
      const slot=educationSlots.get(dl);
      const base = slot?titleText(dt).replace(/^(?:高中|最高学历)/,'').replace(/2$/,''):job51Slots.get(dl)?.endsWith('第2条')?titleText(dt).replace(/2$/, ''):titleText(dt);
      const parts = dateGroups.get(dl)?.parts;
      if (parts?.includes(element as HTMLSelectElement)) {
        const i=parts.indexOf(element as HTMLSelectElement);
        return `${base} / ${parts.length===4?(i<2?'开始':'结束'):''}${i%2?'月':'年'}`;
      }
      const selects = Array.from(dl.querySelectorAll('dd select'));
      if (selects.length===2 && selects.includes(element)) {
        const index=selects.indexOf(element);
        if(base==='技能')return `${base} / ${index?'名称':'类别'}`;
        if(base==='职位')return `${base} / ${index?'职位':'职类'}`;
        return `${base} / ${/城市|地点|居住地|籍贯|生源地/.test(base)?(index?'城市':'省份'):(index?'等级':'类型')}`;
      }
      if (selects.includes(element) && /手机|电话/.test(base)) return `${base} / 区号`;
      if(selects.includes(element)&&/身份证号|证件号码/.test(base)&&dl.querySelector('dd input:not([type=hidden])'))return `${base} / 类型`;
      // Prefix/type and number are siblings, not a protected parent plus child.
      if(selects.length===1 && element.matches('input:not([type=hidden])') && /手机|电话|身份证号|证件号码/.test(base))return `${base} / 号码`;
      if(selects.length===3&&selects.includes(element))return `${base} / ${['类型','类别','明细'][selects.indexOf(element)]}`;
      return base;
    }
    if (element.matches(optionSelector) && element.closest(overlaySelector)) return optionLabel(element);
    if (!element.matches('button,[role="button"]') && element.closest('.ud-formily-item')) {
      const label = udFieldLabel(element);
      const range = element.closest(udRange);
      const parts = range && udRanges.get(range);
      if (label && parts?.includes(element as HTMLInputElement)) return `${label} / ${parts.indexOf(element as HTMLInputElement) === 0 ? '开始年月' : '结束年月'}`;
      if (label) return label;
    }
    const structured = structuredLabel(element);
    if (structured && !element.matches('button,[role="button"]')) return structured;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).filter(label => !label.matches(sdInput)).map(label => text(label.textContent)).filter(Boolean).join(' ');
      if (labels) return labels;
    }
    // Candidate text and button text must never inherit the enclosing form label.
    if (element.matches(optionSelector) && element.closest(overlaySelector)) return optionLabel(element);
    if (element.matches('button,[role="button"]') && !element.hasAttribute('aria-haspopup')) return optionLabel(element);
    const item = element.closest('.ant-form-item,.el-form-item,.form-item,[data-field],[role="group"]');
    const label = item?.querySelector('label,.ant-form-item-label,.el-form-item__label,legend,[data-label]');
    return text(label?.textContent) || text(element.getAttribute('placeholder') || element.getAttribute('name') || (element as HTMLElement).innerText || element.textContent).slice(0, 160);
  };
  // In-page navigation exposes reliable section boundaries even when visual titles
  // are ordinary div/span nodes. No site names or site-specific selectors are used.
  const regions = new Map<Element, string>();
  for (const anchor of document.querySelectorAll('a[href*="#"]')) {
    const href = anchor.getAttribute('href') || '';
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) continue;
      const region = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      const label = text(anchor.textContent);
      if (region && visible(region) && label && label.length <= 80 && (region.querySelector(controlSelector) || region.querySelector('.add-more-btn'))) regions.set(region, label.replace(/\s*必填\s*$/, ''));
    } catch { /* Ignore malformed anchors. */ }
  }
  const headings = Array.from(document.querySelectorAll(headingSelector)).filter(node => visible(node) && Boolean(titleText(node)) && !node.closest('footer,[role="contentinfo"]'));
  const structuralRegions = new Map<Element, string>();
  for (const input of document.querySelectorAll('input,textarea,select')) {
    const field = structuralField(input);
    if (!field) continue;
    for (let parent = field.parentElement, depth = 0; parent && depth < 6; parent = parent.parentElement, depth++) {
      const title = structuralTitle(parent);
      if (title && visible(title)) { structuralRegions.set(parent, titleText(title)); break; }
    }
  }
  const scopeOf = (element: Element): string => {
    if(certificateDialog&&(element===certificateDialog||certificateDialog.contains(element)))return '资格证书';
    for(let node:Element|null=element;node;node=node.parentElement){
      if(guopinRecords.has(node))return guopinRecords.get(node)!;
      if(guopinSections.has(node))return guopinSections.get(node)!;
    }
    if(element===job51Add)return text(job51Root?.querySelector('h1')?.textContent);
    const slot=element.closest('dl');if(slot&&job51Slots.has(slot))return job51Slots.get(slot)!;
    const card=element.closest('.ci');if(card&&job51Records.has(card))return job51Records.get(card)!;
    for(let node:Element|null=element;node;node=node.parentElement){
      if(dayeeRecords.has(node))return dayeeRecords.get(node)!;
      if(dayeeSections.has(node))return dayeeSections.get(node)!;
    }
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (phoenixRecords.has(node)) return phoenixRecords.get(node)!;
      if (phoenixSections.has(node)) return phoenixSections.get(node)!;
    }
    const module = element.closest(udModule);
    const moduleLabel = text(module?.querySelector('.applyFormModuleWrapper-title')?.textContent);
    if (module && moduleLabel) {
      // The Add button belongs to its module; other controls belong to the
      // concrete repeated card, even when the page duplicates every field ID.
      const record = element.closest(udRecord);
      if (record && !(element.matches('button') && text(element.textContent) === '添加')) {
        const records = Array.from(module.querySelectorAll(udRecord)).filter(card => card.closest(udModule) === module);
        return `${moduleLabel} / 第${records.indexOf(record) + 1}条`;
      }
      return moduleLabel;
    }
    const sdSection=element.closest(sdModule);
    const sdTitle=sdSection && structuralTitle(sdSection);
    if(sdSection && sdTitle && sdSection.querySelector(`${sdInput},textarea`)) {
      const name=titleText(sdTitle);
      const card=element.closest(sdRecord);
      if(card && card.closest(sdModule)===sdSection) {
        const cards=Array.from(sdSection.querySelectorAll(sdRecord)).filter(node=>node.closest(sdModule)===sdSection);
        return `${name} / 第${cards.indexOf(card)+1}条`;
      }
      return name;
    }
    for (let current = element.parentElement; current; current = current.parentElement) {
      const record = current.getAttribute('data-record-label');
      if (record) return text(record);
      const region = regions.get(current);
      if (region) return region;
      const structuralRegion = structuralRegions.get(current);
      if (structuralRegion) return structuralRegion;
      if (current.matches('fieldset,section,article,form,[role="dialog"],[role="region"]')) {
        const aria = accessibleLabel(current);
        if (aria) return aria;
        const heading = current.querySelector(':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > header');
        if (heading && titleText(heading)) return titleText(heading);
      }
    }
    const previousHeading=headings.filter(node => Boolean(node.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    return previousHeading?titleText(previousHeading):'';
  };
  const job51Companion=(element:Element):HTMLInputElement|null=>{
    if(!job51||!element.matches('.custom-combobox-input'))return null;
    const row=element.closest('dl');let next:Element|null|undefined=row?.nextElementSibling;
    const rawLabel=text(row?.querySelector(':scope > dt')?.textContent).replace(/[\s*＊]/g,''),prefix=/^(博士|硕士|本科|大专)/.exec(rawLabel)?.[0]??'';
    const label=rawLabel.slice(prefix.length);
    if(prefix){const title=`${prefix}其他${/学校/.test(label)?'学校':'专业'}`;
      const candidates=Array.from((row?.closest('.ci')??job51Root!).querySelectorAll('dl')).filter(d=>text(d.querySelector(':scope > dt')?.textContent).replace(/[\s*＊]/g,'')===title);
      next=candidates.length===1?candidates[0]:null;
    }
    const other=text(next?.querySelector(':scope > dt')?.textContent).replace(new RegExp(`^${prefix}`),'');
    if(!next?.matches('dl')||!(/学校/.test(label)&&/^其他学校/.test(other)||/专业/.test(label)&&/^其他专业/.test(other)))return null;
    return next.querySelector<HTMLInputElement>('dd input:not([type=hidden])');
  };
  const valueOf = (element: Element): { value: string; checked: boolean | null } => {
    if(element===certificateDialog)return {value:Array.from(element.querySelectorAll('.flat-foot .select-list .select-item')).map(optionLabel).join(' / '),checked:null};
    if(guopinPreviews.has(element))return {value:guopinPreviews.get(element)!.value,checked:null};
    if(job51 && element.matches('.custom-combobox-input')) {
      const select=element.closest('dd')?.querySelector<HTMLSelectElement>('select[data-dict]');
      const selected=select?Array.from(select.selectedOptions).filter(o=>o.value && !/^[-—请选择\s]*$/.test(text(o.textContent))).map(o=>text(o.textContent)).join(' / '):'';
      return {value:/^其他(?:院校|专业)$/.test(selected)&&job51Companion(element)?job51Companion(element)!.value:selected,checked:null};
    }
    if(element.matches('.ant-radio-group'))return {value:text(element.querySelector('.ant-radio-wrapper-checked,.ant-radio-button-wrapper-checked')?.textContent),checked:null};
    if (element.matches('.phoenix-radio-group')) return {value: text(element.querySelector('.phoenix-radio--checked .phoenix-radio__radio-text')?.textContent), checked: null};
    if (element.matches('.phoenix-select')) {
      const selected = element.closest('.phoenix-select')!.querySelectorAll('.phoenix-select__tipWrapper--visible .phoenix-select__tipEle,.phoenix-select__tag');
      return {value: Array.from(selected).filter(visible).map(node => text(node.textContent)).join(' / '), checked:null};
    }
    if(element instanceof HTMLInputElement && element.closest('label.day_info')?.closest(sdDropdown)) {
      const month=/^(\d{4}-\d{2})(?:\s*[（(]\d+岁[）)])?$/.exec(element.value.trim());
      return {value:month?.[1]??element.value,checked:null};
    }
    const udDates = udRanges.get(element);
    if (udDates) return {value: udDates.some(input=>input.value) ? udDates.map(input => input.value).join(' / ') : '', checked: null};
    const group = dateGroups.get(element);
    if (group) {
      const values = group.parts.map(part => valueOf(part).value);
      const endpoint = (index: number): string => {
        const year = values[index] || '', month = values[index + 1] || '';
        const y = /^(\d{1,4})\s*年?$/.exec(year), m = /^(\d{1,2})\s*月?$/.exec(month);
        return y && m ? `${y[1]!.padStart(4, '0')}-${m[1]!.padStart(2, '0')}` : [year, month].filter(Boolean).join(' / ');
      };
      return { value: [endpoint(0), group.parts.length === 4 ? (group.current?.checked ? '至今' : endpoint(2)) : ''].filter(Boolean).join(' / '), checked: null };
    }
    if(guopin && element instanceof HTMLInputElement && element.closest('.period-end-date') && !element.value){
      const proxy=element.closest('.period-end')?.querySelector<HTMLInputElement>('.period-end-temp input');
      if(proxy?.value==='至今')return {value:'至今',checked:null};
    }
    if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) return { value: element.value, checked: element.checked };
    if (['checkbox', 'radio', 'switch'].includes(element.getAttribute('role') || '')) return { value: '', checked: element.getAttribute('aria-checked') === 'true' };
    const component = element.closest(componentSelector);
    if (component && element.matches('input,[role="combobox"]')) {
      // UD also wraps ordinary editable text in .ud__select (observed school
      // input). Only the selector/search-input structure represents a Select.
      if (component.matches('.ud__select') && !component.querySelector('.ud__select__selector') && element instanceof HTMLInputElement)
        return {value:element.value,checked:null};
      const items = Array.from(component.querySelectorAll('.ant-select-selection-item,.ant-select-selection-selected-value,.el-select__selected-item:not(.is-transparent):not(.el-select__input-wrapper),.el-cascader__tags .el-tag,.ud__select__selector__selectItem,.ud__select__selector__tag .ud__tag__content,[class^="sd-Input-display-value-"],[class*=" sd-Input-display-value-"]'))
        .filter(item => !item.closest(overlaySelector) && visible(item)).map(item => text(item.textContent)).filter(Boolean);
      if (items.length) return { value: items.join(' / '), checked: null };
      // UD AutoComplete keeps accepted free text in its input, without a
      // selected-item node. A normal searchable Select must still choose an item.
      if (component.matches('.ud__select') && element instanceof HTMLInputElement && !element.readOnly
        && component.querySelector('.ud__select__selector-hide-arrow')
        && !component.querySelector('.ud__select__selector-readOnly,.ud__select__selector-multiple,.ud__select__selector__selectItem')
        && element.getAttribute('aria-expanded') !== 'true' && !component.classList.contains('ud__select-open')
        && !component.contains(document.activeElement)) return { value: element.value, checked: null };
      // A search query is not a selected value.
      if (component.matches(`.ant-select,.el-select,.ud__select,${sdSelect},${sdDropdown}`)) return { value: '', checked: null };
    }
    if (element instanceof HTMLInputElement) return { value: element.type === 'password' ? (element.value ? '<present>' : '') : element.value, checked: null };
    if (element instanceof HTMLTextAreaElement) return { value: element.value, checked: null };
    if (element instanceof HTMLSelectElement) return { value: Array.from(element.selectedOptions).filter(option => (option.value !== '' || job51 && /身份证号码? \/ 类型$/.test(labelOf(element)) && text(option.textContent)==='国内身份证或护照（含港澳台）') && !/^[-—请选择\s]*$/.test(text(option.textContent))).map(option => text(option.textContent)).join(' / '), checked: null };
    return { value: text(element.getAttribute('aria-valuetext') || element.getAttribute('aria-valuenow') || ((element as HTMLElement).isContentEditable || element.hasAttribute('aria-haspopup') || element.hasAttribute('aria-expanded') ? (element as HTMLElement).innerText : '')), checked: null };
  };
  const fields = Array.from(document.querySelectorAll(controlSelector)).filter(element => {
    const popup = element.closest(overlaySelector);
    return !(guopin && element.closest('.item-section-tpl') && !element.closest('.edit-section') && !buttonLike(element)) && !(guopin && element.matches('input') && element.closest('.period-end-temp') && element.closest('.period-end')?.querySelector('.period-end-date .ant-picker input')) && !(job51 && element.matches('input.btnAppend') && element!==job51Add) && !element.matches('input[type="file"]') && !(element.matches('input') && (element.closest('.phoenix-select,.ant-radio-group') || element.closest('.ant-select') && element.closest('[role=combobox]') && element.closest('[role=combobox]')!==element)) && !element.closest('.ant-rate') && visible(element) && (!popup || popup.matches('[role="dialog"]'));
  });
  if(certificateDialog){for(let i=fields.length-1;i>=0;i--)if(certificateDialog.contains(fields[i]!)&&!buttonLike(fields[i]!))fields.splice(i,1);fields.push(certificateDialog);}
  fields.push(...guopinPreviews.keys());
  fields.push(...phoenixAdds.keys());
  fields.push(...dayeeAdds.keys());
  fields.push(...dateGroups.keys());
  fields.push(...udRanges.keys());
  const errorSelector = '.form-item__error,.form-item__errorMessage,[role="alert"],.ant-form-item-explain-error,.ant-form-item-control.has-error .ant-form-explain,.el-form-item__error,.ud-formily-item-error-help,.invalid-feedback';
  const definitionErrors = (element:Element):Element[] => job51 ? Array.from(element.querySelectorAll('dd label font')).filter(el=>visible(el) && /不能为空|请选择|请填写|不正确|无效|格式|必须|错误|不能|不得|超过/.test(text(el.textContent))) : [];
  const errorOf = (element: Element): string => {
    const linked = [element.getAttribute('aria-errormessage'), element.getAttribute('aria-describedby')].filter(Boolean).join(' ').split(/\s+/)
      .map(id => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el && visible(el) && (el.matches(errorSelector) || element.getAttribute('aria-invalid') === 'true')));
    const container = element.closest('.ud-formily-item,.ant-form-item,.el-form-item,.form-item--phoenix');
    // A Dayee province/city pair has one shared validation message. A selected
    // province is valid while its dependent city is still missing; keep that
    // message on the city so parent verification does not block the child.
    const pair=element.closest('.cascader-plugins-wrap');
    const pairControls=pair?Array.from(pair.querySelectorAll('[role=combobox]')):[];
    const selectedParent=Boolean(element.closest('.form-cell') && dayeeSections.has(element.closest('.form-cell')!) && pairControls.length===2 && pairControls[0]===element && valueOf(element).value);
    const local = container && !selectedParent ? Array.from(container.querySelectorAll(errorSelector)).filter(el => visible(el) && el.closest('.ud-formily-item,.ant-form-item,.el-form-item,.form-item--phoenix') === container) : [];
    const dl=element.closest('dl');
    return [...new Set([...linked,...local,...(dl?definitionErrors(dl):[])].map(el => text(el.textContent)).filter(Boolean))].join(' / ');
  };
  const policyContextOf = (element: Element):string => {
    const labels:string[]=[];
    for(let node=element.parentElement;node&&node!==document.body;node=node.parentElement){
      const heading=node.matches('dl')?node.querySelector(':scope > dt')
        :node.matches('fieldset')?node.querySelector(':scope > legend')
        :node.matches('.ant-form-item,.el-form-item,.ud-formily-item,.form-item,[data-field],[role="group"]')
          ?node.querySelector(':scope > label,:scope > legend,:scope > .ant-form-item-label,:scope > .ud-formily-item-label') : null;
      const label=heading?titleText(heading):node.matches('[role="group"]')?accessibleLabel(node):'';
      if(label&&!labels.includes(label))labels.push(label.slice(0,240));
      if(labels.length>=6)break;
    }
    return labels.join(' / ');
  };
  const meta = (element: Element, index: number): RawField => {
    const input = element instanceof HTMLInputElement ? element : null;
    const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const component=element.closest(componentSelector);
    const freeName=Boolean(input && !input.readOnly && component?.matches('.ud__select')
      && component.querySelector('.ud__select__selector-hide-arrow')
      && !component.querySelector('.ud__select__selector-readOnly,.ud__select__selector-multiple,.ud__select__selector__selectItem'));
    const autocomplete=Boolean(input?.closest('.phoenix-auto-complete-container'));
    const job51Autocomplete=Boolean(job51 && input?.matches('.custom-combobox-input') && input.closest('dd')?.querySelector('select[data-dict]'));
    const dayee=Boolean(element.closest('.form-cell') && dayeeSections.has(element.closest('.form-cell')!));
    const dayeeDictionary=Boolean(dayee && input && /^请选择(?:最高学历毕业院校|最高学历专业|学校|专业)/.test(input.placeholder));
    const choice=job51Autocomplete || dayeeDictionary || autocomplete || element instanceof HTMLSelectElement || element.getAttribute('role')==='combobox'
      || Boolean(component?.querySelector('.ud__select__selector')) || Boolean(element.closest(`${sdSelect},${sdDropdown},.phoenix-select`)) || element.matches('.phoenix-radio-group,.ant-radio-group');
    const inputMode:RawField['inputMode']=element===certificateDialog?'choice':guopinPreviews.get(element)?.date||dateGroups.has(element)||udRanges.has(element)||phoenixDate(element)||input && (['date','month'].includes(input.type) || Boolean(input.closest('.ant-calendar-picker')) || Boolean(guopin&&input.closest('.ant-picker')) || Boolean(job51 && input.readOnly && /setday\(this\)/.test(input.getAttribute('onfocus')??'')) || Boolean(input.closest('label.day_info')?.closest(sdDropdown))) ? 'date'
      : input && ['checkbox','radio'].includes(input.type) ? 'boolean' : freeName ? 'choice_or_custom' : choice ? 'choice' : 'text';
    const value=valueOf(element);
    const radioGroup=input?.type==='radio'&&input.name?Array.from((input.getRootNode() as Document|ShadowRoot).querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(other=>other.name===input.name&&other.form===input.form):[];
    return {
      ...(radioGroup.length?{choiceGroup:{id:identity(radioGroup[0]!),label:policyContextOf(element).split(' / ')[0]||labelOf(element),answered:radioGroup.some(r=>r.checked),required:radioGroup.some(r=>r.required||r.getAttribute('aria-required')==='true')}}:{}),
      inputMode,
      ...(job51Companion(element)?{relatedFields:[labelOf(job51Companion(element)!)]}:{}),
      ...(job51 && input?.readOnly && /setday\(this\)/.test(input.getAttribute('onfocus')??'')
        || dayee && location.hostname==='faw-zhaopin.hotjob.cn' && input?.closest('.ant-calendar-picker') && /^(开始时间|结束时间|出生日期|考试时间)$/.test(labelOf(element))
        ?{datePrecision:'date' as const}:{}),
      ...(guopin&&(element.closest('.item-section')||element===certificateDialog)?{plannerFamily:'guopin' as const}:dayee?{plannerFamily:'dayee' as const}:job51?{plannerFamily:'job51' as const}:element.closest('.form-item--phoenix')?{plannerFamily:'phoenix' as const}
        :element.closest(sdModule)||element.closest(sdSelect)?{plannerFamily:'sd' as const}
        :element.closest(udModule)||element.closest('.ud-formily-item')?{plannerFamily:'ud' as const}:{}),
      pendingInput:Boolean(job51Autocomplete && input?.value && input.value!==text(input.closest('dd')?.querySelector('select[data-dict] option:checked')?.textContent)) || Boolean(autocomplete && input===document.activeElement && input?.value) || Boolean(element.matches('.phoenix-select') && element.querySelector<HTMLInputElement>('input')?.value && !value.value) || Boolean(input && !job51Autocomplete && ['choice','choice_or_custom'].includes(inputMode) && input.value && !value.value),
      frame: 0, index, identity: identity(element), tag: element.tagName.toLowerCase(),
      ...(element.closest('dl')&&educationSlots.has(element.closest('dl')!)?{educationSlot:educationSlots.get(element.closest('dl')!)!}:{}),
      role: element===certificateDialog?'combobox':guopinPreviews.get(element)?.date||dateGroups.has(element) || udRanges.has(element) ? 'date-group' : text(element.getAttribute('role') || (buttonLike(element) || phoenixAdds.has(element) || dayeeAdds.has(element) ? 'button' : element.matches('.phoenix-radio-group,.phoenix-select,.ant-radio-group') || element.matches('input') && element.closest(`${sdSelect},${sdDropdown},.phoenix-select`) ? 'combobox' : '')),
      type: text(input?.type || element.getAttribute('type')), label: labelOf(element), scope: scopeOf(element), ...value,
      policyContext: policyContextOf(element),
      disabled: guopinPreviews.has(element) || Boolean(control.disabled) || element.getAttribute('aria-disabled') === 'true' || Boolean(element.closest('.phoenix-select--disabled,.phoenix-radio--disabled,.ant-select-disabled,.el-select.is-disabled,.el-cascader.is-disabled,.ud__select-disabled,[class*="sd-Input-disabled-"],[class*="sd-Menu-disabled-"],[class*="sd-Select-disabled-"]')),
      readonly: guopinPreviews.has(element) || Boolean(input?.readOnly || element instanceof HTMLTextAreaElement && element.readOnly) || element.getAttribute('aria-readonly') === 'true',
      required: !buttonLike(element) && (Boolean(guopin && element.closest('.two-salary-field')?.querySelector(':scope > .ant-form-item-row > .ant-form-item-label > .ant-form-item-required')) || Boolean(guopin && element.closest('.resume-common-form-item')?.querySelector(':scope > .ant-form-item-row > .ant-form-item-label > .ant-form-item-required')) || Boolean(element.closest('.form-item--phoenix')?.querySelector(':scope > .form-item__title .form-item__required')) || Boolean(control.required) || element.getAttribute('aria-required') === 'true' || Boolean(element.closest('.ud-formily-item')?.querySelector(':scope > .ud-formily-item-label .ud-formily-item-asterisk')) || Boolean(job51 && /[*＊]/.test(definitionTitle(element)?.textContent??'')) || Boolean(element.closest('.ant-form-item')?.querySelector('.ant-form-item-required'))), visible: visible(element),
      options: element instanceof HTMLSelectElement ? Array.from(element.options).filter(option => !option.disabled).map(option => text(option.textContent)).filter(Boolean) : [],
      constraints: { minlength: 'minLength' in control && control.minLength >= 0 ? control.minLength : null, maxlength: 'maxLength' in control && control.maxLength >= 0 ? control.maxLength : null, min: text(element.getAttribute('min')) || null, max: text(element.getAttribute('max')) || null, step: text(element.getAttribute('step')) || null, pattern: text(element.getAttribute('pattern')) || null },
      invalid: Boolean(errorOf(element)) || element.getAttribute('aria-invalid') === 'true' || Boolean(control.validity && !control.validity.valid),
      error: errorOf(element),
    };
  };
  const navigationMenu = (node: Element): boolean => {
    if (!node.matches('[role="menu"]')) return false;
    if (node.matches('.ant-menu-root') || node.closest('nav,header,[role="navigation"]')) return true;
    const items = Array.from(node.querySelectorAll('[role="menuitem"],li'));
    return items.length > 0 && items.every(item => item.matches('a[href]') || Boolean(item.querySelector('a[href]')));
  };
  const overlays = Array.from(document.querySelectorAll(overlaySelector)).filter(node => visible(node) && !navigationMenu(node)).filter(node => !node.parentElement?.closest(overlaySelector) || !visible(node.parentElement.closest(overlaySelector)!));
  const optionsIn = (root: Element): Element[] => {
    const explicit = Array.from(root.querySelectorAll(optionSelector)).filter(visible);
    // ARIA listboxes sometimes expose only StaticText in AX: use their DOM text
    // containers, only inside this popup, and avoid nested duplicate candidates.
    const fallback = Array.from(root.querySelectorAll('[role="listbox"] > *,[role="menu"] > *,[role="tree"] > *'));
    if (root.matches('[role="listbox"],[role="menu"],[role="tree"]')) fallback.push(...root.children);
    const items = [...new Set([...explicit, ...fallback.filter(node => !explicit.some(other => node.contains(other) || other.contains(node)))])];
    return items.filter(node => visible(node) && Boolean(optionLabel(node)) && !items.some(other => other !== node && other.contains(node)));
  };
  const ownedBy = (root: Element, trigger: Element): boolean => {
    const ids = text(`${trigger.getAttribute('aria-controls') || ''} ${trigger.getAttribute('aria-owns') || ''}`).split(/\s+/).filter(Boolean);
    if(trigger.closest('.phoenix-select--active') && root.matches('.common-unmodeled-layer__layerContent'))
      return Array.from(document.querySelectorAll('.phoenix-select--active')).filter(visible).length===1 && overlays.filter(n=>n.matches('.common-unmodeled-layer__layerContent')).length===1;
    return ids.some(id => { const controlled = document.getElementById(id); return controlled && (root === controlled || root.contains(controlled) || controlled.contains(root)); })
      || Boolean(trigger.closest(componentSelector)?.contains(root))
      || Boolean(trigger.closest(sdDropdown)?.contains(root))
      || Boolean(root.parentElement === trigger.parentElement && trigger !== root && !root.contains(trigger))
      || Boolean(accessibleLabel(root) && norm(accessibleLabel(root)).includes(norm(labelOf(trigger))));
  };
  const hasOverlay = (spec: TargetSpec): boolean => fields.some(trigger =>
    (!spec.identity || identity(trigger) === spec.identity) && norm(labelOf(trigger)) === norm(spec.field)
    && (!spec.scope || spec.scope === 'page' || norm(scopeOf(trigger)) === norm(spec.scope))
    && (trigger.getAttribute('aria-expanded') === 'true' || overlays.some(root => ownedBy(root, trigger))));
  const ranked = (spec: TargetSpec): Array<{ element: Element; meta: CandidateMeta }> => {
    const target = norm(spec.option ?? spec.field);
    const scope = norm(spec.scope) === 'page' ? '' : norm(spec.scope);
    let nodes = fields;
    if (spec.option !== undefined) {
      const triggers = fields.filter(node => (!spec.identity || identity(node) === spec.identity) && norm(labelOf(node)) === norm(spec.field) && (!scope || norm(scopeOf(node)) === scope));
      let roots = overlays.filter(root => triggers.some(trigger => ownedBy(root, trigger)));
      if (!roots.length && triggers.length === 1 && overlays.length === 1 && !fields.some(other => other !== triggers[0] && ownedBy(overlays[0]!, other))) roots = overlays;
      nodes = roots.flatMap(root => {
        const columns = Array.from(root.querySelectorAll('.ant-cascader-menu,.el-cascader-menu')).filter(visible);
        if (spec.optionLevel !== undefined && columns.length) return columns[spec.optionLevel] ? optionsIn(columns[spec.optionLevel]!) : [];
        return optionsIn(root);
      });
    }
    return nodes.map((element, index): { element: Element; meta: CandidateMeta } | null => {
      if (spec.option === undefined && spec.identity && identity(element) !== spec.identity) return null;
      const data = meta(element, index);
      if (spec.option === undefined && scope && norm(data.scope) !== scope) return null;
      const isOption = spec.option !== undefined;
      if (isOption && data.disabled) return null;
      const label = isOption ? optionLabel(element) : data.label;
      const roles = [data.tag, data.role, data.type, isOption ? 'option' : '', data.tag === 'input' ? 'input' : ''];
      if (spec.roles?.length && !spec.roles.some(role => roles.includes(role))) return null;
      const labelNorm = norm(label);
      // Option labels are exact: selecting a nearby place with a shared prefix is unsafe.
      const score = (!isOption && spec.identity) || labelNorm === target ? 120 : !isOption && !spec.identity && target && labelNorm.includes(target) ? 72 : 0;
      if (!score) return null;
      return { element, meta: { ...data, label, score } };
    }).filter((item): item is { element: Element; meta: CandidateMeta } => item !== null).sort((a, b) => b.meta.score - a.meta.score);
  };
  const resolve = (spec: TargetSpec): Element | null => {
    const results = ranked(spec);
    return results[0] && results[0].meta.score !== results[1]?.meta.score ? results[0].element : null;
  };
  const collect = (): Omit<RawPageForm, 'url' | 'title'> => ({
    documentId: registry.epoch,
    attachments:Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).flatMap(input=>{
      const container=input.closest('.ud-formily-item,.ant-form-item,.form-item--phoenix,.resume-common-form-item,dl,[data-field],fieldset,label')??input.parentElement;
      if(input.disabled||!container||!visible(container))return [];
      const data=meta(input,-1),preview=job51&&/^照片/.test(data.label)?container.querySelector<HTMLImageElement>('#imgPreview'):null;
      const accepted=Boolean(preview&&visible(preview)&&preview.complete&&preview.naturalWidth>0)
        ||Boolean(container.querySelectorAll('input[type="file"]').length===1&&Array.from(container.querySelectorAll('.ant-upload-list-item-done')).some(visible)&&!Array.from(container.querySelectorAll('.ant-upload-list-item-error')).some(visible));
      return [{frame:0,scope:data.scope,field:data.label||'附件',required:data.required,
        state:accepted?'accepted_ui' as const:input.files?.length?'selected_unverified' as const:'pending' as const}];
    }),
    ...(job51?{workflow:(()=>{
      const items=Array.from(document.querySelectorAll('li.leftli1,li.leftli2')).filter(visible);
      const active=items.filter(el=>el.classList.contains('leftli2'));
      const steps=items.map(el=>text(el.querySelector('.lispan')?.textContent||el.getAttribute('title')));
      const next=document.querySelector<HTMLInputElement>('#imgbtnNext');
      const heading=text(job51Root?.querySelector('h1')?.textContent);
      return {family:'job51' as const,template:`${location.origin}${location.pathname}:${new URL(location.href).searchParams.get('CtmID')??''}`,
        steps,current:active.length===1?items.indexOf(active[0]!):-1,heading,
        next:Boolean(next && visible(next) && !next.disabled && next.title==='Next'),
        manual:Array.from(job51Root!.querySelectorAll('dl')).filter(visible).filter(row=>{
          const title=text(row.querySelector(':scope > dt')?.textContent);
          if(/[*＊]/.test(title)&&row.querySelector('input[type=file],iframe[src*=UpLoad]')){
            // This template renders its accepted photo in the parent page.
            // A selected local filename alone is not upload completion.
            const preview=row.querySelector<HTMLImageElement>('#imgPreview');
            return !(/^照片/.test(title)&&preview&&visible(preview)&&preview.complete&&preview.naturalWidth>0);
          }
          if(!/声明|承诺|授权|签署|同意.*(?:身份证|个人信息|条款|隐私)/.test(title))return false;
          const controls=Array.from(row.querySelectorAll('select,input[type=checkbox],input[type=radio]')).filter(visible);
          return !controls.length||!controls.some(el=>el instanceof HTMLSelectElement?Boolean(valueOf(el).value):(el as HTMLInputElement).checked);
        }).map(row=>titleText(row.querySelector(':scope > dt')!)),
        optionalAttachment:/无附件[，,]?\s*直接点击下一步/.test(text(job51Root?.textContent))};
    })()}:{}),
    ...(Array.from(document.querySelectorAll('[role="dialog"],.ant-modal')).some(el=>visible(el)&&/当前未登录或登录状态失效|登录(?:状态|信息|会话)?(?:已)?(?:失效|过期)/.test(text(el.textContent)))?{authenticationRequired:true}:{}),
    records: [...guopinRecords.keys(),...job51Records.keys(),...dayeeRecords.keys(),...phoenixRecords.keys(), ...Array.from(document.querySelectorAll(`${udRecord},${sdRecord},[data-record-label]`))].filter(visible).map(node => ({identity: identity(node), scope: scopeOf(node), frame: 0})),
    fields: fields.map(meta),
    overlays: overlays.map(root => ({ frame: 0, role: root.getAttribute('role') || 'overlay', label: fields.filter(trigger => ownedBy(root, trigger)).map(labelOf)[0] || accessibleLabel(root), options: optionsIn(root).map(optionLabel).slice(0, 120) })),
    sections: [...new Set([...dayeeSections.values(),...phoenixSections.values(), ...regions.values(), ...structuralRegions.values(), ...Array.from(document.querySelectorAll(udModule)).filter(visible).map(node => titleText(node.querySelector('.applyFormModuleWrapper-title') ?? node)), ...headings.filter(node => ![...regions.keys()].some(region => region.contains(node))).map(titleText), ...Array.from(document.querySelectorAll('section[aria-label],[role="region"][aria-label]')).filter(visible).map(accessibleLabel)].filter(Boolean))],
    validations: [...new Set([...Array.from(document.querySelectorAll(`${errorSelector},[aria-live],.error`)).filter(visible),...definitionErrors(document.documentElement)].map(node => text(node.textContent)).filter(Boolean))],
  });
  const setValue = (spec: TargetSpec, value: string | boolean | number): { applied: boolean } => {
    const element = resolve(spec);
    if (!element || (element as HTMLInputElement).disabled || element.getAttribute('aria-disabled') === 'true' || (element as HTMLInputElement).readOnly) return { applied: false };
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      let next: string | boolean = String(value);
      let property = 'value';
      if (element instanceof HTMLSelectElement) {
        const option = Array.from(element.options).find(item => !item.disabled && (item.value === next || text(item.textContent) === next));
        if (!option) return { applied: false };
        next = option.value;
      } else if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) { property = 'checked'; next = Boolean(value); }
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, property)?.set?.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { applied: true };
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus(); element.textContent = String(value); element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) })); return { applied: true };
    }
    return { applied: false };
  };
  const click = (spec: TargetSpec): { applied: boolean } => {
    const element = resolve(spec);
    if (!(element instanceof HTMLElement) || (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true') return { applied: false };
    element.focus({ preventScroll: true }); element.click(); return { applied: true };
  };
  return { collect, describe: (element:Element) => meta(element,fields.indexOf(element)), candidates: (spec: TargetSpec): CandidateMeta[] => ranked(spec).map(item => item.meta).slice(0, 20), resolve, setValue, click, hasOverlay,
    dateGroup: (element: Element) => {
      const group = dateGroups.get(element);
      return group ? { parts: group.parts.map((part, index) => ({ element: part, meta: meta(part, index), endpoint: index < 2 ? 'start' : 'end', part: index % 2 ? 'month' : 'year' })),
        current: group.current ? { element: group.current, checked: group.current.checked, disabled: group.current.disabled } : null } : null;
    } };
}
