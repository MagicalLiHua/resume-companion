const pause = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const pathText = (value: string) => value.split(/\s*\/\s*/).map(part => part.trim()).join(' / ');
class OptionsTimeout extends Error {}
export function antSelect(node: HTMLElement) {
  if (!node.matches('input.ant-select-selection-search-input[role="combobox"]')) return null;
  const root = node.closest<HTMLElement>('.ant-select-single');
  return root?.querySelector('.ant-select-selector') ? root : null;
}
export function antProxy(node: HTMLElement) {
  return antSelect(node) ?? (node.matches('input.ant-radio-input') ? node.closest<HTMLElement>('.ant-radio-wrapper') :
    node.matches('input.ant-checkbox-input') ? node.closest<HTMLElement>('.ant-checkbox-wrapper') : null);
}
export function antRead(node: HTMLElement) {
  const root = antSelect(node)!;
  const value = text(root.querySelector('.ant-select-selection-item'));
  return root.matches('.ant-cascader') ? pathText(value) : value;
}
function shown(node: HTMLElement) {
  return node.isConnected && !node.closest('[hidden],[aria-hidden="true"],.ant-select-dropdown-hidden') && ![...node.classList].some(name => /-leave(?:-|$)/.test(name)) && node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).opacity !== '0';
}
function popupFor(node: HTMLElement) {
  const linked = document.getElementById(node.getAttribute('aria-controls') || node.getAttribute('aria-owns') || '')?.closest<HTMLElement>('.ant-select-dropdown,.ant-cascader-dropdown');
  if (linked && shown(linked)) return linked;
  if (node.getAttribute('aria-expanded') !== 'true') return null;
  const popups = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown,.ant-cascader-dropdown')].filter(shown);
  return popups.length === 1 ? popups[0] : null;
}
async function open(node: HTMLElement, check = () => {}) {
  check();
  const root = antSelect(node);
  if (!root || root.matches('.ant-select-disabled') || node.matches(':disabled')) throw new Error('下拉框不可编辑');
  if (!popupFor(node)) {
    const trigger = root.querySelector<HTMLElement>('.ant-select-selector')!;
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    node.focus({ preventScroll: true });
  }
  for (let attempt = 0; attempt < 25; attempt++) {
    check();
    const popup = popupFor(node);
    if (popup) return popup;
    await pause();
  }
  throw new OptionsTimeout('下拉列表未打开，请检查页面');
}
function entries(popup: HTMLElement, level = 0) {
  const menus = popup.querySelectorAll<HTMLElement>('.ant-cascader-menu');
  const scope = menus.length ? menus[level] : popup;
  if (!scope) return [];
  return [...scope.querySelectorAll<HTMLElement>(menus.length ? '.ant-cascader-menu-item' : '.ant-select-item-option')]
    .filter(node => shown(node) && !node.matches('.ant-select-item-option-disabled,.ant-cascader-menu-item-disabled,[aria-disabled="true"]'))
    .map(node => ({ node, label: text(node.querySelector('.ant-cascader-menu-item-content,.ant-select-item-option-content') ?? node) }))
    .filter(item => item.label && !/作为我的学校$/.test(item.label));
}
type Entry = ReturnType<typeof entries>[number];
function expandable(entry: Entry) {
  return entry.node.matches('.ant-cascader-menu-item-expand') || Boolean(entry.node.querySelector('.ant-cascader-menu-item-expand-icon'));
}
function expanded(entry: Entry, popup: HTMLElement, level: number) {
  return entry.node.matches('.ant-cascader-menu-item-active') && entries(popup, level + 1).length > 0;
}
function sameEntries(a: Entry[], b: Entry[]) {
  return a.length === b.length && a.every((item, index) => item.node === b[index].node && item.label === b[index].label);
}
function loading(popup: HTMLElement) {
  return [popup, ...popup.querySelectorAll<HTMLElement>('[aria-busy="true"],.ant-spin-spinning,.ant-select-item-option-loading,.ant-cascader-menu-item-loading')]
    .some(node => shown(node) && (node.getAttribute('aria-busy') === 'true' || node.matches('.ant-spin-spinning,.ant-select-item-option-loading,.ant-cascader-menu-item-loading')))
    || [...popup.querySelectorAll<HTMLElement>('.ant-select-item,.ant-select-item-option,.ant-cascader-menu-item')].some(node => shown(node) && /^(正在加载|加载中|等待加载)/.test(text(node)));
}
function explicitlyEmpty(popup: HTMLElement) {
  return [...popup.querySelectorAll<HTMLElement>('.ant-empty,.ant-select-item-empty')].some(shown);
}
// Observe live candidates after every interaction; cached DOM nodes can belong to a previous search or parent.
async function stableOptions(node: HTMLElement, check: () => void, level = 0, previous?: Entry[]) {
  let last: Entry[] = [], lastPopup: HTMLElement | null = null, stableSince = Date.now();
  let changed = !previous?.length, lastEmpty = false;
  for (;;) {
    check();
    const popup = popupFor(node), now = Date.now();
    if (!popup) { lastPopup = null; stableSince = now; await pause(); continue; }
    const current = entries(popup, level), busy = loading(popup), empty = explicitlyEmpty(popup);
    if (busy || (previous && !sameEntries(previous, current))) changed = true;
    if (busy || popup !== lastPopup || empty !== lastEmpty || !sameEntries(last, current)) stableSince = now;
    last = current; lastPopup = popup; lastEmpty = empty;
    if (!busy && changed && (current.length || empty) && now - stableSince >= 240) return { popup, entries: current };
    await pause();
  }
}
function search(node: HTMLElement, query: string) {
  if ((node as HTMLInputElement).readOnly || antSelect(node)!.matches('.ant-cascader')) throw new Error('此控件尚不支持搜索查询，请读取级联候选或使用完整路径填写');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, query);
  node.dispatchEvent(new Event('input', { bubbles: true }));
}
export async function antOptions(node: HTMLElement, query?: string, guard = () => {}, path?: string[]) {
  const deadline = Date.now() + (path?.length ? 8000 : 3500), before = antRead(node);
  const root = antSelect(node)!;
  const kind = root.matches('.ant-cascader') ? 'cascade' : 'select';
  const searchSupported = kind === 'select' && !(node as HTMLInputElement).readOnly;
  let searching = false;
  if (query !== undefined && !searchSupported) throw new Error('此控件尚不支持搜索查询');
  if (path && (kind !== 'cascade' || query !== undefined)) throw new Error('分支路径仅适用于级联下拉，不能与搜索词同时使用');
  let ownPrefix = '';
  const check = () => {
    guard();
    if (antRead(node) !== before) throw new Error('查询期间字段值发生变化，请重新扫描');
    if (searching && (node as HTMLInputElement).value !== query) throw new Error('搜索词已变化，请重新查询');
    if (Date.now() > deadline) throw new OptionsTimeout('候选项未在时限内稳定，请保持招聘页在前台后重新查询');
  };
  try {
    const popup = await open(node, check);
    const previous = query !== undefined && (node as HTMLInputElement).value !== query ? entries(popup) : undefined;
    if (query !== undefined) { search(node, query); searching = true; }
    let result = await stableOptions(node, check, 0, previous);
    for (let level = 0; level < (path?.length ?? 0); level++) {
      check();
      const matches = result.entries.filter(entry => entry.label === path![level]);
      if (matches.length !== 1) throw new Error(`没有唯一的网页候选项“${path![level]}”，未展开`);
      const entry = matches[0];
      if (!expandable(entry)) throw new Error(`“${entry.label}”不是可确认的分支，未点击最终选项`);
      if (expanded(entry, result.popup, level)) {
        result = await stableOptions(node, check, level + 1);
        continue;
      }
      const previousChild = entries(result.popup, level + 1);
      ownPrefix = pathText(path!.slice(0, level + 1).join('/'));
      entry.node.click();
      await pause();
      result = await stableOptions(node, check, level + 1, previousChild);
    }
    const levels: string[][] = [], totalRendered: number[] = [], expandableLevels: boolean[][] = [];
    const count = Math.max(result.popup.querySelectorAll('.ant-cascader-menu').length || 1, (path?.length ?? 0) + 1);
    for (let level = 0; level < count; level++) {
      const current = await stableOptions(node, check, level);
      totalRendered.push(current.entries.length);
      levels.push(current.entries.slice(0, 100).map(item => item.label));
      expandableLevels.push(current.entries.slice(0, 100).map(expandable));
    }
    check();
    return { kind, status: (path?.length ? result.entries.length > 0 : totalRendered.some(Boolean)) ? 'ready' : 'empty', searchSupported, query,
      path, levels, expandable: expandableLevels, totalRendered, truncated: totalRendered.some(count => count > 100),
      note: '仅包含当前渲染的可选候选项，不选择值；虚拟列表可能还有未渲染项。级联填写需要完整路径。' };
  } catch (error) {
    // Some cascaders commit parent nodes. Restore only our exact prefix, never an unrelated edit.
    if (ownPrefix && antRead(node) !== before && antRead(node) === ownPrefix) {
      try {
        guard(); await antWrite(node, before, guard);
        if (antRead(node) !== before) throw new Error('恢复值未保留');
      } catch { throw new Error('该控件在展开分支时改变了选中值，恢复失败；请检查字段后重新扫描'); }
      throw new Error('该控件会在展开分支时选中父级；已恢复原值，不支持继续探测');
    }
    if (!(error instanceof OptionsTimeout)) throw error;
    return { kind, status: 'timeout', searchSupported, query, levels: [], totalRendered: [], truncated: false,
      pageState: { visibility: document.visibilityState, focused: document.hasFocus(), expanded: node.getAttribute('aria-expanded') === 'true' }, note: error.message };
  }
}
async function write(node: HTMLElement, value: string, check: () => void) {
  check();
  const root = antSelect(node)!;
  if (value === '') {
    const clear = root.querySelector<HTMLElement>('.ant-select-clear');
    if (!clear) throw new Error('该下拉框没有清空入口，无法自动恢复为空');
    clear.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    clear.click();
    await pause();
    return;
  }
  await open(node, check);
  const cascade = root.matches('.ant-cascader');
  const path = cascade ? value.split(/\s*\/\s*/) : [value];
  if (cascade && path.length < 2) throw new Error('级联地区需要完整路径，例如：江苏省 / 南京市 / 玄武区');
  let previous: Entry[] | undefined;
  for (let level = 0; level < path.length; level++) {
    check();
    let current = await stableOptions(node, check, level, previous);
    let matches = current.entries.filter(item => item.label === path[level]);
    if (!matches.length && !cascade && !(node as HTMLInputElement).readOnly) {
      const beforeSearch = (node as HTMLInputElement).value !== value ? current.entries : undefined;
      search(node, value);
      current = await stableOptions(node, check, level, beforeSearch);
      matches = current.entries.filter(item => item.label === path[level]);
    }
    if (matches.length !== 1) throw new Error(`没有唯一的网页候选项“${path[level]}”，未选择近似选项`);
    if (cascade && level < path.length - 1 && expanded(matches[0], current.popup, level)) { previous = undefined; continue; }
    previous = entries(current.popup, level + 1);
    matches[0].node.click();
    await pause();
    check();
    if (cascade && level < path.length - 1 && antRead(node) === pathText(path.slice(0, level + 1).join('/'))) throw new Error('网页已在这一层结束，提供的路径层数过多');
  }
  while (antRead(node) !== (cascade ? pathText(value) : value)) { check(); await pause(); }
}

export async function antWrite(node: HTMLElement, value: string, guard = () => {}) {
  const before = antRead(node), deadline = Date.now() + 6000;
  const check = () => {
    guard();
    if (!node.isConnected || node.matches(':disabled') || antSelect(node)?.matches('.ant-select-disabled')) throw new Error('下拉控件已变化或不可编辑，请重新扫描');
    if (Date.now() > deadline) throw new Error('下拉操作超时，请保持招聘页在前台并重新检查字段');
  };
  try { await write(node, value, check); }
  catch (error) {
    const current = antRead(node), desired = pathText(value);
    // Restore only a value produced by this path; never erase an unrelated edit.
    if (current !== before && (current === desired || desired.startsWith(current + ' / '))) {
      try {
        check(); await write(node, before, check);
        if (antRead(node) !== before) throw new Error('恢复值未保留');
      } catch { throw new Error(`${error instanceof Error ? error.message : '选择失败'}；字段可能已部分改变，请检查后重新扫描`); }
      throw new Error(`${error instanceof Error ? error.message : '选择失败'}；已恢复填写前的值`);
    }
    throw error;
  }
}
