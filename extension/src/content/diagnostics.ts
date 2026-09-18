// Structural diagnostics for adapter development. Never return input values,
// placeholders, page HTML, cookies, or storage.
const trim = (value: string | null, limit = 180) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const redact = (value: string) => value.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱]').replace(/\d{7,}[\dXx]*/g, '[号码]');
function meta(node: Element) {
  return {
    tag: node.tagName.toLowerCase(),
    id: redact(trim(node.id)),
    classes: trim(node.getAttribute('class')),
    role: node.getAttribute('role'),
  };
}
export function inspectForm() {
  const nodes = [...document.querySelectorAll<HTMLElement>('input,select,textarea,[role="combobox"]')];
  const controls = nodes.slice(0, 150).map(node => {
    const ancestors = [];
    for (let parent = node.parentElement; parent && ancestors.length < 12; parent = parent.parentElement) ancestors.push(meta(parent));
    const style = getComputedStyle(node);
    return {
      ...meta(node), type: node.getAttribute('type'),
      disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
      readonly: node.hasAttribute('readonly'),
      opacity: style.opacity, display: style.display, visibility: style.visibility,
      controls: trim(node.getAttribute('aria-controls') || node.getAttribute('aria-owns')),
      expanded: node.getAttribute('aria-expanded'),
      ancestors,
    };
  });
  const popups = [...document.querySelectorAll<HTMLElement>('[class*="dropdown"],[role="listbox"],.ant-cascader-menus')]
    .slice(0, 80).map(node => ({ ...meta(node),
      visible: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden',
      parent: node.parentElement ? meta(node.parentElement) : null,
      selectOptions: node.querySelectorAll('.ant-select-item-option').length,
      cascadeMenus: node.querySelectorAll('.ant-cascader-menu').length,
    }));
  return { pageState: { visibility: document.visibilityState, focused: document.hasFocus() }, controls, popups, truncated: nodes.length > controls.length };
}
