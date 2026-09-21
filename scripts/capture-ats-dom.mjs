// Read-only browser function for user-authorized fixture capture. It deliberately
// serializes a small allowlist of structural attributes and static form labels,
// never live values, links, scripts, storage, framework state or network traffic.
export function captureAtsDom(config) {
  const labels = new Set(('基本信息|基础信息|个人信息|教育经历|教育背景|工作经历|实习经历|项目经历|项目经验|求职意向|姓名|手机号码|邮箱|电子邮箱|个人证件|性别|工作经验|最高学历|所在地|最近公司|证件号码|出生日期 (年龄)|出生年月|户口所在地|现居住城市|政治面貌|当前身份|期望工作地点|起止时间|就读时间|学历类型|学校名称|学历|学院|专业|专业名称|实验室|领域方向|导师|公司名称|职位名称|工作职责|描述|项目名称|职责|项目描述|项目中职责|语言类型|掌握程度|听说|读写|自我描述|获奖时间|奖项名称|至今|国外|男|女|学生|职场人|开始时间|结束时间|请选择|请输入|年|月|日|确定|取消|保存|保存并更新|添加|搜索|省份|城市|区县|全部|本科|硕士|博士|大专|高中|统招全日制|非全日制').split('|'));
  // Additional labels must be explicitly reviewed static UI text, never values.
  for (const label of config.labels || []) labels.add(label);
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const safeText = value => {
    const s = normalize(value);
    const plain = s.replace(/^[*：:\s]+|[*：:\s]+$/g, '');
    if (labels.has(plain)) return s;
    if (/^(请输入|请选择|搜索)[\u4e00-\u9fff、/，：:（）() ]{0,32}$/.test(s)) return s;
    if (/^[*：:/—\-~～]$/.test(s)) return s;
    return '';
  };
  const identifier = value => /^[\w:.[\]-]{1,180}$/.test(value) ? value : '';
  const attrs = new Set(['class','role','type','readonly','disabled','required','multiple','tabindex','minlength','maxlength','min','max','step','pattern','autocomplete','inputmode','spellcheck','rows','cols','aria-haspopup','aria-expanded','aria-disabled','aria-multiselectable','aria-level','aria-hidden','aria-required','aria-invalid','aria-selected','aria-checked','aria-autocomplete','aria-orientation']);
  const references = new Set(['id','for','aria-controls','aria-labelledby','aria-describedby','aria-owns','aria-activedescendant']);
  const identifiers = new Set(['name','data-form-field-id','data-form-field-name']);
  let nodes = 0, truncated = false;
  const encode = (el, depth = 0, slots) => {
    if (slots?.has(el)) return { slot: slots.get(el) };
    if (depth > 32 || nodes++ > 20000) { truncated = true; return null; }
    if (el.nodeType === Node.TEXT_NODE) return safeText(el.textContent) || null;
    if (el.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE|SVG|IMG|IFRAME|CANVAS|VIDEO|AUDIO|OBJECT|EMBED|LINK|META|NOSCRIPT)$/.test(el.tagName)) return null;
    if (el.matches('input[type=password],input[type=hidden],input[type=file]')) return null;
    const attributes = {};
    for (const attr of el.attributes) {
      if (attrs.has(attr.name)) attributes[attr.name] = attr.value;
      else if (references.has(attr.name)) { const value = attr.value.split(/\s+/).map(identifier); if (value.every(Boolean)) attributes[attr.name] = value.join(' '); }
      else if (identifiers.has(attr.name)) { const value = identifier(attr.value); if (value) attributes[attr.name] = value; }
      else if (['placeholder','aria-label','title','data-form-field-i18n-name'].includes(attr.name)) { const value = safeText(attr.value); if (value) attributes[attr.name] = value; }
    }
    // Existing selection classes describe component shape; text and checked/
    // value attributes are intentionally omitted. Offline code initializes state.
    const children = el.tagName === 'TEXTAREA' ? [] : [...el.childNodes].map(child => encode(child, depth + 1, slots)).filter(x => x !== null);
    const style = {};
    for (const key of ['display','visibility','pointer-events']) if (el.style.getPropertyValue(key)) style[key] = el.style.getPropertyValue(key);
    return { tag: el.tagName.toLowerCase(), attrs: attributes, ...(Object.keys(style).length ? { style } : {}), children };
  };
  let roots = [...document.querySelectorAll(config.selector)];
  if (config.leaf) roots = roots.filter(el => !el.querySelector(config.selector));
  if (!config.includeHidden) roots = roots.filter(visible);
  if (roots.length > (config.limit || 100)) truncated = true;
  roots = roots.slice(0, config.limit || 100);
  return {
    format: 'resume-companion-sanitized-dom-v2',
    site: config.site,
    source: `${location.origin}${location.pathname}`,
    captured_at: new Date().toISOString(),
    state: config.state || 'closed',
    roots: roots.map((el, index) => {
      const style = getComputedStyle(el);
      const label = config.labelSelector ? safeText(el.querySelector(config.labelSelector)?.textContent) : '';
      const section = config.sectionContainer ? safeText(el.closest(config.sectionContainer)?.querySelector(config.sectionLabel)?.textContent) : '';
      return { index, ...(label ? { label } : {}), ...(section ? { section } : {}), visible: visible(el), tree: encode(el), layout: { display: style.display, position: style.position, flexDirection: style.flexDirection, fontSize: style.fontSize, width: Math.round(el.getBoundingClientRect().width) } };
    }),
    ...(config.layoutSelector ? { layouts: [...new Set(roots.map(el => el.closest(config.layoutSelector)).filter(Boolean))].map(el => ({tree:encode(el,0,new Map(roots.map((root,index)=>[root,index])))})) } : {}),
    truncated,
    notes: ['static labels allowlisted', 'values and credentials omitted', 'original structural IDs and field names retained', 'no original scripts or remote assets', 'interaction must be reconstructed and independently checked'],
  };
}
