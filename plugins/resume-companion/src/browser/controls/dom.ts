import type { TargetSpec } from '../form-engine.js';
// This factory is serialized together with the common semantic reader. Keep it
// closure-free: it only inspects public DOM, never framework state or test hooks.
export function createControlDom(common: any) {
  const sdSelect = '[class^="sd-Select-container-"],[class*=" sd-Select-container-"]';
  const sdDropdown = '[class^="sd-Dropdown-container-"],[class*=" sd-Dropdown-container-"]';
  const sdMenu = '[class^="sd-Select-menu-"],[class*=" sd-Select-menu-"]';
  const sdItem = '[class^="sd-Menu-content-item-"],[class*=" sd-Menu-content-item-"]';
  const text = (value: unknown): string =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const norm = (value: unknown): string =>
    text(value)
      .replace(/[\s*：:]+/g, '')
      .toLowerCase();
  const visible = (el: Element): boolean => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden],[aria-hidden="true"],.common-unmodeled-layer-hidden')) return false;
    const proxy = el.matches('input') && el.closest(`${sdSelect},.phoenix-select`) || (el.matches('input[role=combobox]')
      ? el.closest('.ant-select,.el-select,.el-cascader,.ud__select')
      : null);
    const surface = proxy || el;
    const box = surface.getBoundingClientRect();
    const style = getComputedStyle(surface);
    return (
      style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
    );
  };
  const key = Symbol.for('resume-companion.control-dom.v1');
  const host = window as any;
  const registry = (host[key] ??= {
    ids: new WeakMap(),
    nodes: new Map(),
    next: 0,
    epoch: Math.random().toString(36).slice(2),
  });
  const token = (el: Element | null | undefined): string | null => {
    if (!el) return null;
    let id = registry.ids.get(el);
    if (!id) {
      id = `${registry.epoch}:${++registry.next}`;
      registry.ids.set(el, id);
      registry.nodes.set(id, new WeakRef(el));
    }
    if (registry.nodes.size > 4000)
      for (const [key, ref] of registry.nodes)
        if (!ref.deref()?.isConnected) registry.nodes.delete(key);
    return id;
  };
  const element = (id: string): HTMLElement | null => {
    const el = registry.nodes.get(id)?.deref();
    return el?.isConnected && visible(el) ? el : null;
  };
  const disabled = (el: Element): boolean =>
    Boolean(
      (el as HTMLInputElement).disabled ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.closest(
          '.phoenix-selectList__listItem--disabled,.phoenix-radio--disabled,.phoenix-select--disabled,.ant-calendar-disabled-cell,.ant-calendar-year-panel-cell-disabled,.ant-calendar-month-panel-cell-disabled,.ant-select-dropdown-menu-item-disabled,.phoenix-calendar-disabled-cell,.phoenix-calendar-year-panel-disabled-cell,.phoenix-calendar-month-panel-disabled-cell,.ant-picker-cell-disabled,.ant-select-item-option-disabled,.ant-cascader-menu-item-disabled,.is-disabled,td.disabled,.ud__select-disabled,.ud__select__list__item-disabled,.ud__picker__cell-disabled,[class*="sd-Input-disabled-"],[class*="sd-Menu-disabled-"],[class*="sd-Select-disabled-"]',
        ),
    );
  const componentSelector = `.custom-combobox,.phoenix-auto-complete-container,.phoenix-select,.phoenix-radio-group,.ant-radio-group,.ant-picker,.ant-calendar-picker,.el-date-editor,.ant-select,.el-cascader,.el-select,.ud__select,.throne-biz-date-range-picker-input,.throne-biz-date-range-picker-wrapper,${sdSelect},${sdDropdown}`;
  const label = (el: Element): string => {
    const clone = el.cloneNode(true) as Element;
    clone
      .querySelectorAll(
        'svg,[role="img"],.ant-select-selection-item-remove,.el-tag__close,[aria-hidden="true"]',
      )
      .forEach((e) => e.remove());
    return text(clone.textContent);
  };
  function locate(spec: TargetSpec): { input: HTMLElement; root: HTMLElement; meta: any } | null {
    const found = common.candidates({
      ...spec,
      roles: ['input', 'textarea', 'select', 'combobox', 'button', 'date-group'],
    });
    if (!found.length) return null;
    const best = found.filter((x: any) => x.score === found[0].score);
    const located = best
      .map((meta: any) => {
        const semantic = common.resolve({ ...spec, identity: meta.identity });
        const input = semantic?.matches('.phoenix-select') ? semantic.querySelector('input') || semantic : semantic;
        return input ? { input, root: input.closest(componentSelector) || input, meta } : null;
      })
      .filter(Boolean);
    const roots = [...new Set(located.map((x: any) => x.root))];
    if (roots.length > 1) throw new Error('target_ambiguous');
    return located[0] || null;
  }
  const overlaysFor = (root: HTMLElement, input: HTMLElement, family: string): Element[] => {
    if(family==='job51-autocomplete')return document.activeElement===input ? Array.from(document.querySelectorAll('.ui-autocomplete')).filter(visible) : [];
    if(family==='guopin-path'){
      if(registry.dictionaryOwner!==token(root))return [];
      const placeholder=text(root.querySelector('.ant-select-selection-placeholder')?.textContent);
      return Array.from(document.querySelectorAll('.my-cascader-modal[role="dialog"]')).filter(el=>visible(el)&&(!placeholder||text(el.querySelector('.title-search .ant-select-selection-placeholder')?.textContent)===placeholder));
    }
    if(family==='dayee-dictionary'){
      if(registry.dictionaryOwner!==token(root))return [];
      const school=/学校|院校/.test(input.getAttribute('placeholder')??'');
      return Array.from(document.querySelectorAll('[role="dialog"]')).filter(el=>visible(el) && Boolean(el.querySelector(school?'.search-bar input[placeholder*="学校"]':'.search-bar input[placeholder*="专业"]')));
    }
    if (family==='phoenix-autocomplete') {
      return document.activeElement===input && !document.querySelector('.phoenix-select--active')
        ? Array.from(document.querySelectorAll('.common-unmodeled-layer__layerContent')).filter(visible) : [];
    }
    if (family.startsWith('phoenix-')) {
      if (!root.matches('.phoenix-select--active')) return [];
      // A portal has no DOM ownership link. Require one active trigger and one
      // visible portal; do not borrow another control's candidate list.
      const active = Array.from(document.querySelectorAll('.phoenix-select--active')).filter(visible);
      return active.length === 1 && active[0] === root
        ? Array.from(document.querySelectorAll('.common-unmodeled-layer__layerContent')).filter(visible) : [];
    }
    if (family === 'sd-select'  || family === 'sd-date') {
      const owner = root.closest(sdDropdown);
      return owner ? Array.from(owner.querySelectorAll('[class^="sd-Dropdown-dropdown-"],[class*=" sd-Dropdown-dropdown-"]'))
        .filter(el => visible(el) && el.closest(sdDropdown) === owner) : [];
    }
    const selector =
      family === 'ant-date'
        ? '.ant-picker-dropdown,.ant-calendar-picker-container'
        : family === 'el-date'
          ? '.el-picker-panel,.el-picker__popper'
          : family === 'ant-path' || family === 'ant-select'
            ? '.ant-select-dropdown,.ant-cascader-menus'
            : family === 'el-path'
              ? '.el-cascader__dropdown'
              : family === 'ud-select' ? '.ud__select__dropdown'
              : family === 'ud-date' ? '.ud__picker-date-panel'
              : family === 'el-select'
                ? '.el-select__popper,.el-select-dropdown'
                : '[role="listbox"],[role="tree"],.popup[aria-label]';
    const all = Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .filter(
        (el) =>
          !el.parentElement?.closest(selector) || !visible(el.parentElement.closest(selector)!),
      );
    const controls = text(
      `${input.getAttribute('aria-controls') || ''} ${input.getAttribute('aria-owns') || ''}`,
    )
      .split(/\s+/)
      .filter(Boolean);
    const owned = all.filter(
      (el) =>
        root.contains(el) ||
        controls.some((id) => {
          const n = document.getElementById(id);
          return n && (el === n || el.contains(n) || n.contains(el));
        }),
    );
    return owned.length ? owned : all;
  };
  const monthNumber = (value: string): number => {
    const words = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const normalized = text(value).toLowerCase();
    const i = words.findIndex((x) => normalized.startsWith(x));
    if (i >= 0) return i + 1;
    const cn = chinese.indexOf(normalized.replace('月', ''));
    if (cn >= 0) return cn + 1;
    const number = Number(normalized.replace(/月|month/gi, ''));
    return number >= 1 && number <= 12 ? number : 0;
  };
  const calendar = (popup: Element): any => {
    const phoenix = popup.querySelector('.phoenix-calendar,.ant-calendar');
    if (phoenix) {
      const css=(s:string)=>s.replaceAll('phoenix-calendar',phoenix.matches('.ant-calendar')?'ant-calendar':'phoenix-calendar');
      const yearPanel = Array.from(phoenix.querySelectorAll(css('.phoenix-calendar-year-panel'))).find(visible);
      const monthPanel = Array.from(phoenix.querySelectorAll(css('.phoenix-calendar-month-panel'))).find(visible);
      const panel = yearPanel || monthPanel || phoenix;
      const prefix = css(yearPanel ? 'phoenix-calendar-year-panel' : monthPanel ? 'phoenix-calendar-month-panel' : 'phoenix-calendar');
      const mode = yearPanel ? 'year' : monthPanel ? 'month' : 'date';
      const header = panel.querySelector(`.${prefix}-header`);
      const headerText = text(header?.textContent);
      const cells = Array.from(panel.querySelectorAll(`.${prefix}-cell`)).filter(visible);
      const find = (selector: string) => token(Array.from(panel.querySelectorAll(css(selector))).find(visible));
      return [{mode, year:Number(headerText.match(/\d{4}/)?.[0] || 0), month:monthNumber(text(panel.querySelector(css('.phoenix-calendar-month-select'))?.textContent)) || Number(headerText.match(/(\d{1,2})月/)?.[1] || 0),header:headerText,
        cells:cells.map(cell=>({token:token(cell),text:text(cell.textContent),title:'',
          disabled:disabled(cell)||Boolean(cell.querySelector('[aria-disabled="true"]')),
          inView:!cell.matches(css('.phoenix-calendar-last-month-cell,.phoenix-calendar-next-month-btn-day,.phoenix-calendar-year-panel-last-decade-cell,.phoenix-calendar-year-panel-next-decade-cell')),
          selected:cell.className.includes('selected') || Boolean(cell.querySelector('[aria-selected="true"]')),
          month:mode==='month'?monthNumber(text(cell.textContent)):0})),
        yearButton:find('.phoenix-calendar-year-select,.phoenix-calendar-month-panel-year-select'),
        monthButton:find('.phoenix-calendar-month-select'),
        prev:find(yearPanel?'.phoenix-calendar-year-panel-prev-decade-btn':monthPanel?'.phoenix-calendar-month-panel-prev-year-btn':'.phoenix-calendar-prev-year-btn'),
        next:find(yearPanel?'.phoenix-calendar-year-panel-next-decade-btn':monthPanel?'.phoenix-calendar-month-panel-next-year-btn':'.phoenix-calendar-next-year-btn'),
        prevMonth:find('.phoenix-calendar-prev-month-btn'),nextMonth:find('.phoenix-calendar-next-month-btn')}];
    }
    const sd=(prefix:string):string=>`[class^="${prefix}-"],[class*=" ${prefix}-"]`;
    const sdPanel=popup.matches(sd('sd-panal-menu-wrapper'))?popup:popup.querySelector(sd('sd-panal-menu-wrapper'));
    if(sdPanel) {
      const header=sdPanel.querySelector(sd('sd-basic-selector'));
      const cells=Array.from(sdPanel.querySelectorAll(sd('sd-basic-year-item'))).filter(visible);
      const arrows=header?Array.from(header.querySelectorAll(sd('sd-basic-selector-icon'))).filter(visible):[];
      const headerText=text(header?.textContent);
      const mode=cells.length===12 && cells.every(c=>monthNumber(text(c.textContent))>0)?'month'
        :cells.length>0 && cells.every(c=>/^\d{4}$/.test(text(c.textContent)))?'year':null;
      if(!header || arrows.length!==2 || !mode)return [];
      return [{mode,year:Number(headerText.match(/\d{4}/)?.[0]||0),month:0,header:headerText,
        cells:cells.map(cell=>({token:token(cell),text:text(cell.textContent),title:'',
          disabled:disabled(cell)||Boolean(cell.closest(sd('sd-basic-disabled'))),inView:true,
          selected:Boolean(cell.closest(sd('sd-basic-selected'))),month:mode==='month'?monthNumber(text(cell.textContent)):0})),
        yearButton:null,monthButton:null,prev:token(arrows[0]),next:token(arrows[1]),prevMonth:null,nextMonth:null}];
    }
    if (popup.matches('.ud__picker-date-panel')) {
      const header = popup.querySelector('.ud__picker-panel-header');
      const cells = Array.from(popup.querySelectorAll('.ud__picker__cell')).filter(visible);
      const mode = cells.some(cell=>cell.matches('.ud__picker-year-panel-cell')) ? 'year'
        : cells.some(cell=>cell.matches('.ud__picker-month-panel-cell')) ? 'month' : null;
      if (!mode || !header) return [];
      const headerText = text(header.textContent);
      const navigation = Array.from(header.querySelectorAll('.ud__picker-panel-header-icon:not(.ud__picker-panel-header-collapse)')).filter(visible);
      // These two ordered buttons are the observed previous/next controls. A
      // changed header shape is unsupported rather than guessed by arrow count.
      if (navigation.length !== 2) return [];
      return [{ mode, year: Number(headerText.match(/\d{4}/)?.[0] || 0), month: 0, header: headerText,
        cells: cells.map(cell=>({ token:token(cell), text:text(cell.textContent), title:cell.getAttribute('title')||'', disabled:disabled(cell), inView:true,
          selected:cell.matches('.ud__picker__cell-selected')||cell.getAttribute('aria-selected')==='true', month:mode==='month'?monthNumber(text(cell.textContent)):0 })),
        yearButton:token(header.querySelector('.ud__picker-panel-header-btn')), monthButton:null,
        prev:token(navigation[0]), next:token(navigation[1]), prevMonth:null, nextMonth:null }];
    }
    const ant = popup.matches('.ant-picker-dropdown');
    const panels = Array.from(
      popup.querySelectorAll(
        ant ? '.ant-picker-panel' : '.el-date-range-picker__content,.el-date-picker__body',
      ),
    ).filter(visible);
    const list = panels.length ? panels : [popup];
    return list
      .map((panel) => {
        const table = Array.from(panel.querySelectorAll('table')).find(visible);
        if (!table) return null;
        const mode =
          table.matches('.el-year-table') || table.closest('.ant-picker-year-panel')
            ? 'year'
            : table.matches('.el-month-table') || table.closest('.ant-picker-month-panel')
              ? 'month'
              : table.closest('.ant-picker-decade-panel')
                ? 'decade'
                : 'date';
        const header =
          panel.querySelector(
            '.ant-picker-header,.el-date-picker__header,.el-date-range-picker__header',
          ) || popup.querySelector('.el-date-picker__header');
        const headerText = text(header?.textContent);
        const years = headerText.match(/\d{4}/g)?.map(Number) || [];
        const year = years[0] || 0;
        const monthLabel =
          header?.querySelector('.ant-picker-month-btn') ||
          header?.querySelectorAll('.el-date-picker__header-label')[1];
        let month = monthNumber(text(monthLabel?.textContent));
        if (!month) {
          const word = headerText.match(
            /January|February|March|April|May|June|July|August|September|October|November|December/i,
          );
          if (word) month = monthNumber(word[0]);
        }
        if (!month && mode === 'date') {
          const selected = table.querySelector('td.ant-picker-cell-in-view[title]');
          month = Number(selected?.getAttribute('title')?.split('-')[1] || 0);
        }
        if (!month && mode === 'date') {
          const m = headerText.match(/\d{4}\s*年\s*(\d{1,2})\s*月/);
          if (m) month = Number(m[1]);
        }
        const cells = Array.from(table.querySelectorAll('td'))
          .filter(visible)
          .map((td) => ({
            token: token(td.querySelector('button,a,.cell') || td),
            text: text(td.textContent),
            title: td.getAttribute('title') || '',
            disabled: disabled(td),
            inView: ant
              ? td.classList.contains('ant-picker-cell-in-view')
              : !td.matches('.prev-month,.next-month,.prev-year,.next-year'),
            selected:
              td.getAttribute('aria-selected') === 'true' ||
              td.matches(
                '.ant-picker-cell-selected,.ant-picker-cell-range-start,.ant-picker-cell-range-end,.current,.today.selected,.start-date,.end-date',
              ),
            month: mode === 'month' ? monthNumber(text(td.textContent)) : 0,
          }));
        const find = (selector: string): string | null =>
          token(
            Array.from((header || panel).querySelectorAll(selector)).find(
              (el) => visible(el) && !disabled(el),
            ),
          );
        return {
          mode,
          year,
          month,
          header: headerText,
          cells,
          yearButton: ant
            ? find('.ant-picker-year-btn')
            : token(header?.querySelectorAll('.el-date-picker__header-label')[0]),
          monthButton: ant
            ? find('.ant-picker-month-btn')
            : token(header?.querySelectorAll('.el-date-picker__header-label')[1]),
          prev: find('.ant-picker-header-super-prev-btn,button.d-arrow-left'),
          next: find('.ant-picker-header-super-next-btn,button.d-arrow-right'),
          prevMonth: find('.ant-picker-header-prev-btn,button.arrow-left'),
          nextMonth: find('.ant-picker-header-next-btn,button.arrow-right'),
        };
      })
      .filter(Boolean);
  };
  function read(spec: TargetSpec & { popupToken?: string }): any {
    const target = locate(spec);
    if (!target) return null;
    const { input, root, meta } = target;
    const sdField = root.closest('[class^="apply-field-"],[class*=" apply-field-"],[class^="field-"],[class*=" field-"]');
    const sdDismiss = sdField && Array.from(sdField.children).find(el =>
      /^(?:title|filed-title|field-title)-/.test(el.className) &&
      !el.matches('button,a,input,label,[role="button"]') &&
      !el.querySelector('button,a,input,select,textarea,[role="button"]'));
    const dateGroup = common.dateGroup(input);
    const family = meta.plannerFamily==='guopin'&&meta.scope==='资格证书'&&root.matches('.my-cascader-modal[role=dialog]')?'guopin-certificates':meta.plannerFamily==='guopin'&&root.closest('.cascader-modal-field')?'guopin-path': meta.plannerFamily==='job51' && meta.inputMode==='date' && input instanceof HTMLInputElement && input.readOnly && /setday\(this\)/.test(input.getAttribute('onfocus')??'') ? 'my97-date' : meta.plannerFamily==='job51' && root.matches('.custom-combobox') ? 'job51-autocomplete' : meta.plannerFamily==='dayee' && meta.inputMode==='choice' && input instanceof HTMLInputElement && root===input ? 'dayee-dictionary'
      : root.matches('.ant-radio-group') ? 'ant-radio' : root.matches('.phoenix-auto-complete-container') ? 'phoenix-autocomplete'
      : root.matches('.phoenix-radio-group') ? 'phoenix-radio'
      : root.matches('.phoenix-select') ? (meta.inputMode==='date'?'phoenix-date':'phoenix-select')
      : root.matches('.ant-picker,.ant-calendar-picker')
      ? 'ant-date'
      : root.matches('.throne-biz-date-range-picker-wrapper,.throne-biz-date-range-picker-input') ? 'ud-date'
      : root.matches('.ud__select') && root.querySelector('.ud__select__selector') ? 'ud-select'
      : root.matches(sdDropdown) && input.closest('label.day_info') ? 'sd-date'
      : root.matches('.el-date-editor')
        ? 'el-date'
        : root.matches('.ant-cascader')
          ? 'ant-path'
          : root.matches('.el-cascader')
            ? 'el-path'
            : root.matches('.ant-select')
              ? 'ant-select'
              : root.matches('.el-select')
                ? 'el-select'
                : root.matches(`${sdSelect},${sdDropdown}`) ? 'sd-select' : 'native';
    let candidates = family==='guopin-certificates'?[root]:overlaysFor(root, input, family);
    // Phoenix clears the trigger's active class before its portal finishes
    // closing. Keep our owned portal until it is hidden so the next control
    // cannot mistake that exit animation for a second candidate layer.
    if (family.startsWith('phoenix-') && spec.popupToken && !candidates.length
        && !root.matches('.phoenix-select--active')) {
      const closing = element(spec.popupToken);
      if (closing && visible(closing) && !document.querySelector('.phoenix-select--active')) candidates = [closing];
    }
    if (spec.popupToken) {
      const old = element(spec.popupToken);
      if (old && candidates.includes(old)) candidates = [old];
    }
    if (candidates.length > 1) throw new Error('overlay_ambiguous');
    const popup = candidates[0];
    // An unrelated popup does not belong to a still-closed control.
    const expanded =
      input.getAttribute('aria-expanded') === 'true' ||
      root.classList.contains('phoenix-select--active') ||
      (family.startsWith('phoenix-') && Boolean(popup)) ||
      (['dayee-dictionary','guopin-path','guopin-certificates','job51-autocomplete'].includes(family) && Boolean(popup)) ||
      root.classList.contains('ant-select-open') ||
      root.classList.contains('ud__select-open') ||
      root.classList.contains('is-opened') ||
      (Boolean(popup) && family.endsWith('-date') && (root.classList.contains('ant-picker-focused') || root.matches('.ant-calendar-picker') && popup?.contains(document.activeElement)));
    const explicitlyClosed =
      input.hasAttribute('aria-expanded') && input.getAttribute('aria-expanded') === 'false';
    const attached =
      (!explicitlyClosed||family==='guopin-path') &&
      Boolean(
        popup &&
          (root.contains(popup) || (family === 'sd-select' && root.closest(sdDropdown)?.contains(popup)) ||
            root.contains(document.activeElement) ||
            expanded ||
            spec.popupToken),
      );
    const overlay = attached ? popup : undefined;
    const inputs = Array.from(
      root.querySelectorAll('input:not([type=hidden])'),
    ) as HTMLInputElement[];
    if (input instanceof HTMLInputElement && !inputs.includes(input)) inputs.push(input);
    const tags = Array.from(root.querySelectorAll(family==='guopin-certificates'?'.flat-foot .select-list .select-item':'.phoenix-select__tag,.ant-select-selection-item,.el-tag__content,.ud__select__selector__tag .ud__tag__content'))
      .filter(visible)
      .map(label)
      .filter(Boolean);
    let value = meta.value || '';
    if (family.endsWith('-date') && family!=='phoenix-date') value = inputs.map((x) => family==='sd-date'?x.value.replace(/\s*[（(]\d+岁[）)]$/, ''):x.value).join(' / ');
    const optionLabel = (e: Element): string =>
      label(
        (['guopin-path','guopin-certificates'].includes(family) ? e.querySelector('.item-txt') : null) || e.querySelector(
          `.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label,.ud__select__list__item__content,.ud__tree__node__label,.area-text-label,.item-text-label,.phoenix-selectList__singleLabel,.phoenix-radio__radio-text,${sdItem}`,
        ) || e,
      );
    const option = (e: Element): any => ({
      token: token(e),
      label: optionLabel(e),
      disabled: disabled(e) || Boolean(e.querySelector('input[type=checkbox]:disabled')),
      selected:
        (['guopin-path','guopin-certificates'].includes(family) && e.matches('.leaf-item.active')) ||
        Boolean(e.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked) || e.getAttribute('aria-selected') === 'true' ||
        e.getAttribute('aria-checked') === 'true' ||
        Boolean(e.closest('[class^="sd-Menu-container-"],[class*=" sd-Menu-container-"]')?.getAttribute('aria-selected') === 'true') ||
        e.matches(
          '.phoenix-radio--checked,.phoenix-selectList__listItem--selected,.ant-cascader-menu-item-active,.el-cascader-node.in-active-path,.el-cascader-node.is-active,.el-select-dropdown__item.is-selected,.ud__select__list__item-selected',
        ),
      branch:
        Boolean(
          e.querySelector('.ant-cascader-menu-item-expand-icon,.el-cascader-node__postfix'),
        ) || e.hasAttribute('aria-expanded'),
      loading:
        e.className.toString().includes('loading') || Boolean(e.querySelector('.is-loading')),
      check: token(
        e.querySelector('.el-radio__inner,.el-checkbox__inner,.ud__checkbox') ||
          e.querySelector('input[type=radio],input[type=checkbox]'),
      ),
      leaf: e.getAttribute('aria-expanded') === 'false',
    });
    const columns = overlay
      ? Array.from(overlay.querySelectorAll(`.ant-cascader-menu,.el-cascader-menu,${sdMenu}`))
          .filter(visible)
          .map((column) =>
            Array.from(
              column.querySelectorAll(
                `.ant-cascader-menu-item,.el-cascader-node,[role=menuitemcheckbox],[role=treeitem],${sdItem}`,
              ),
            )
              .filter(e => visible(e) && (!column.matches(sdMenu) || e.closest(sdMenu) === column))
              .map(option),
          )
      : [];
    const componentOptions = overlay
      ? Array.from(
          overlay.querySelectorAll('.phoenix-selectList__listItem,.ant-select-item-option,.ant-select-dropdown-menu-item,.el-select-dropdown__item,.ud__select__list__item,.ud__tree__node:has(input[type=checkbox]),[class^="sd-Select-common-item-"],[class*=" sd-Select-common-item-"]'),
        ).filter(visible)
      : [];
    let options = (
      componentOptions.length
        ? componentOptions
        : overlay
          ? Array.from(overlay.querySelectorAll('[role=option]')).filter(visible)
          : []
    ).map(option);
    if(family==='job51-autocomplete' && overlay)options=Array.from(overlay.querySelectorAll('.ui-menu-item')).filter(visible).map(option);
    if (family==='ant-radio') options=Array.from(root.querySelectorAll('.ant-radio-wrapper,.ant-radio-button-wrapper')).filter(visible).map(option);
    // Subject-item nodes are categories, not selectable majors. Search results
    // replace that tree with school-item leaves, with full disambiguating labels.
    if(family==='dayee-dictionary' && overlay)options=Array.from(overlay.querySelectorAll('.school-item')).filter(visible).map(option);
    if (family==='phoenix-radio') options=Array.from(root.querySelectorAll('.phoenix-radio')).filter(visible).map(option);
    // SD's year/month and remote-search menus can render Menu content items
    // without Select-common-item wrappers. One owned column is a flat select;
    // multi-column paths keep their separate path contract.
    if (!options.length && family === 'sd-select' && columns.length === 1)
      options = columns[0]!;
    if (overlay && !options.length) {
      const containers = [
        overlay,
        ...Array.from(overlay.querySelectorAll('[role=listbox]')),
      ].filter((e) => e.matches('[role=listbox]'));
      options = containers.flatMap((container) =>
        Array.from(container.children).filter(visible).map(option),
      );
    }
    const scroll = overlay
      ? Array.from(
          overlay.querySelectorAll(
            '.phoenix-selectList__virtualList-holder,.rc-virtual-list-holder,.el-select-dropdown__wrap,.el-scrollbar__wrap,[role=listbox],[class^="sd-Select-scrollable-"],[class*=" sd-Select-scrollable-"]',
          ),
        ).find((e) => visible(e) && e.scrollHeight > e.clientHeight + 2)
      : undefined;
    const area=family==='phoenix-select'?overlay?.querySelector('.area-selector-container,.constant-main-selector-container'):null;
    const confirm = overlay
      ? Array.from(
          overlay.querySelectorAll(
            `.ant-picker-ok button,.el-picker-panel__footer button,.ant-cascader-footer button${family === 'sd-select' || ['dayee-dictionary','guopin-path','guopin-certificates'].includes(family) ? ',button,[role=button]' : family==='phoenix-select'?',.phoenix-button':''}`,
          ),
        ).filter((e) => visible(e) && !disabled(e) && (family==='dayee-dictionary'?/^(选择|确定)$/:/^(ok|确定|确认)$/i).test(norm(e.textContent)))
      : [];
    const clear = root.querySelector(
      '.ant-select-clear,.el-select__clear,.el-input__clear,.ant-picker-clear',
    );
    const panels = overlay && family.endsWith('-date') ? calendar(overlay) : [];
    const customRoot=family==='sd-select'?overlay?.querySelector('[class^="custom-option-"],[class*=" custom-option-"]'):null;
    const customButtons=customRoot?Array.from(customRoot.querySelectorAll('button')).filter(e=>visible(e)&&!disabled(e)):[];
    const customInputs=customRoot?Array.from(customRoot.querySelectorAll('input:not([type=hidden])')).filter(visible):[];
    const customEntry=customButtons.filter(e=>/^添加(?:学校|专业)(?:全称|名称)$/.test(text(e.textContent)));
    const customConfirm=customButtons.filter(e=>/^(添加|确定)$/.test(text(e.textContent)));
    registry.capabilities ??= new WeakMap();
    const hint = `${input.getAttribute('placeholder')}|${input.getAttribute('size')}`;
    let capability = registry.capabilities.get(root);
    if (!capability || capability.hint !== hint)
      capability = { hint, precision: null, awaitOpening: false };
    const activeEndpoint=inputs.indexOf(document.activeElement as HTMLInputElement);
    if(activeEndpoint>=0)capability.activeEndpoint=activeEndpoint;
    if(family==='ud-date' && inputs.some(x=>x.value) && inputs.every(x=>!x.value || /^\d{4}[-/]\d{2}$/.test(x.value)))capability.precision='month';
    if (!expanded && !overlay) capability.awaitOpening = true;
    if (panels.length && capability.awaitOpening) {
      const mode = panels[0].mode;
      if (mode === 'date' || mode === 'month') capability.precision = mode;
      capability.awaitOpening = false;
    }
    registry.capabilities.set(root, capability);
    return {
      family,
      ...(['guopin-path','guopin-certificates'].includes(family)?{guopinPath:{tabs:Array.from(overlay?.querySelectorAll('.flat-left [role=tab]')??[]).filter(visible).map(option),parents:Array.from(overlay?.querySelectorAll('.flat-left .level-item')??[]).filter(visible).map(option),leaves:Array.from(overlay?.querySelectorAll('.flat-leaf .leaf-item')??[]).filter(visible).map(option),path:Array.from(overlay?.querySelectorAll('.label-path .path-item > span:first-child')??[]).map(el=>text(el.textContent)),close:token(overlay?.querySelector('.ant-modal-close'))}}:{}),
      ...(family==='job51-autocomplete'&&meta.relatedFields?.length?{companion:{input:token(input.closest('dl')?.nextElementSibling?.querySelector('dd input:not([type=hidden])')),value:input.closest('dl')?.nextElementSibling?.querySelector<HTMLInputElement>('dd input:not([type=hidden])')?.value??'',otherLabel:/专业/.test(meta.label)?'其他专业':'其他院校'}}:{}),
      ...(family==='dayee-dictionary'?{dictionary:{search:token(overlay?.querySelector('.search-bar input')),cancel:token(overlay&&Array.from(overlay.querySelectorAll('button')).find(el=>/^取消$/.test(norm(el.textContent))))}}:{}),
      ...(input instanceof HTMLSelectElement ? {nativeOptions:Array.from(input.options).map(option=>({label:text(option.textContent),value:option.value,disabled:option.disabled||Boolean(option.closest('optgroup[disabled]'))}))}:{}),
      ...(['phoenix-autocomplete','job51-autocomplete'].includes(family)?{editing:meta.pendingInput}:{}),
      ...(area ? {pendingSelection:{
        search:token(area.querySelector('.area-search-input input,.content-search input')),
        selected:Array.from(area.querySelector('.select-data-container')?.children || []).filter(node=>!node.matches('.select-data-empty')).map(label),
        options:Array.from(area.querySelectorAll('.area-item-container,.list-item-container')).filter(visible).map(node=>({
          ...option(node),check:token(node.querySelector('.icon-container')),
          selected:Boolean(node.querySelector('.area-icon-CheckboxChecked,.CheckboxChecked')),
        })),
      }}:{}),
      document: registry.epoch,
      root: token(root),
      trigger: token(root.matches('.phoenix-select')?root:root.querySelector('.el-select__wrapper,.ant-select-selector,.ant-select-selection,.ud__select__selector') || (family === 'sd-select' && root.matches(sdSelect) ? root : input)),
      input: token(family==='phoenix-select' && overlay?.querySelector('.phoenix-selectList__searchWrapper input') || input),
      inputs: inputs.map((x) => ({
        token: token(x),
        value: family==='phoenix-date' ? meta.value : family==='sd-date' ? x.value.replace(/\s*[（(]\d+岁[）)]$/, '') : x.value,
        type: x.type,
        readonly: x.readOnly,
        placeholder: x.placeholder,
      })),
      label: meta.label,
      policyContext: meta.policyContext,
      scope: meta.scope,
      identity: meta.identity,
      ...(dateGroup ? { splitDate: {
        parts: dateGroup.parts.map((part: any) => ({ label: part.meta.label, identity: part.meta.identity, value: part.meta.value, disabled: part.meta.disabled, invalid: part.meta.invalid, endpoint: part.endpoint, part: part.part })),
        current: dateGroup.current ? { token: token(dateGroup.current.element), checked: dateGroup.current.checked, disabled: dateGroup.current.disabled } : null,
      } } : {}),
      value,
      tags,
      disabled: meta.disabled || disabled(root),
      readonly: meta.readonly,
      constraints: meta.constraints,
      invalid: meta.invalid,
      checked: meta.checked,
      popupToken: overlay ? token(overlay) : null,
      popupReady: Boolean(
        overlay &&
          Number(getComputedStyle(overlay).opacity || 1) > 0.98 &&
          ![overlay, overlay.parentElement]
            .filter((node): node is Element => Boolean(node && node !== document.body))
            .some(
              (node) =>
                typeof node.getAnimations === 'function' &&
                node
                  .getAnimations()
                  .some(
                    (animation) =>
                      animation.playState === 'running' &&
                      animation.effect?.getComputedTiming().iterations !== Infinity,
                  ),
            ),
      ),
      expanded: expanded || Boolean(overlay),
      ...(capability.activeEndpoint!==undefined?{activeEndpoint:capability.activeEndpoint}:{}),
      calendar: panels,
      precision: capability.precision,
      hasTime: Boolean(overlay?.querySelector('.ant-picker-time-panel,.el-time-panel')),
      columns,
      options,
      confirm: confirm.length === 1 ? token(confirm[0]) : null,
      clear: token(clear),
      dismiss: root.matches('.ant-calendar-picker') ? token(root.closest('.form-cell')?.querySelector(':scope > .tit-wrap .tit > p')) : family.startsWith('phoenix-') ? token(root.closest('.form-item--phoenix')?.querySelector(':scope > .form-item__title')) : family === 'ud-date' || family === 'ud-select' ? token(root.closest('.ud-formily-item')?.querySelector(':scope > .ud-formily-item-label')) : family.startsWith('sd-') ? token(sdDismiss) : null,
      ...(customRoot?{custom:{entry:customEntry.length===1?token(customEntry[0]):null,
        input:customInputs.length===1?token(customInputs[0]):null,confirm:customConfirm.length===1?token(customConfirm[0]):null}}:{}),
      opaqueSelection:
        Boolean(
          Array.from(root.querySelectorAll('.ant-select-selection-overflow-item-rest')).some(
            visible,
          ),
        ) || tags.some((v) => /^\+\s*\d/.test(v)),
      multiple:
        family==='guopin-certificates' || root.matches('.ant-select-multiple,.phoenix-select--multi') ||
        Boolean(root.querySelector('.ud__select__selector-multiple,.ud__select__selector__tag')) ||
        Boolean(root.querySelector('.el-select__tags,.el-tag')) ||
        Boolean(overlay?.querySelector('.el-select-dropdown.is-multiple')),
      scroll: scroll
        ? {
            token: token(scroll),
            top: scroll.scrollTop,
            height: scroll.clientHeight,
            total: scroll.scrollHeight,
          }
        : null,
    };
  }
  return { read, element, beginDictionary:(id:string):boolean=>{
    if(Array.from(document.querySelectorAll('[role="dialog"]')).some(visible))return false;
    registry.dictionaryOwner=id;return Boolean(element(id));
  } };
}

/** A bounded observer between probes; it never writes site data. */
export function waitControlMutation(tokens: string[], timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const registry = (window as any)[Symbol.for('resume-companion.control-dom.v1')];
    const roots = tokens
      .map((id) => registry?.nodes.get(id)?.deref())
      .filter((el): el is Element => Boolean(el?.isConnected));
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      for (const name of ['input', 'change', 'focusout'])
        document.removeEventListener(name, event, true);
      if (registry) registry.watchers = Math.max(0, (registry.watchers || 1) - 1);
      resolve();
    };
    const event = (event: Event): void => {
      if (roots.some((root) => root.contains(event.target as Node))) finish();
    };
    const observer = new MutationObserver(finish);
    for (const root of roots)
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    observer.observe(document.body, { childList: true });
    for (const name of ['input', 'change', 'focusout'])
      document.addEventListener(name, event, true);
    if (registry) registry.watchers = (registry.watchers || 0) + 1;
    const timer = setTimeout(finish, Math.max(1, Math.min(timeout, 80)));
  });
}
