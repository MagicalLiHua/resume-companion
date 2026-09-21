import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const capture = resolve(root, process.argv[2] || '.local-archive/captures/2026-09-20');
const output = resolve(root, '.local-archive/offline-sites');
await mkdir(output, { recursive: true });
const read = async name => JSON.parse(await readFile(join(capture, `${name}.json`), 'utf8'));
const specs = [
  { id: 'moka', title: 'Moka · SD', fields: 'moka-fields-v2', templates: { select: 'moka-select-open', calendar: 'moka-calendar-open' } },
  { id: 'feishu', title: '飞书招聘 · UD / Formily', fields: 'feishu-fields-v2', templates: { select: 'feishu-select-open', competition: 'feishu-competition-open', calendar: 'feishu-month-open' } },
  { id: 'zhaopin', title: '智联招聘 · iView / S', fields: 'zhaopin-fields-v2', templates: { select: 'zhaopin-select-open', calendar: 'zhaopin-month-open', region: 'zhaopin-region-open', industry: 'zhaopin-industry-open', job: 'zhaopin-job-open' } },
];
const strings = node => typeof node === 'string' ? [node] : (node?.children || []).flatMap(strings);
const walk = function* (node) { if (node && typeof node === 'object') { yield node; for (const child of node.children || []) yield* walk(child); } };
const normalize = node => {
  if (typeof node === 'string') return node;
  if (!node) return null;
  if ('slot' in node) return node;
  const attrs = { ...node.attrs };
  if (attrs.class) attrs.class = attrs.class.split(/\s+/).filter(name => !/not-empty|hasValue|(?:^|[-_])(?:checked|selected|active|item-bg)$/.test(name)).join(' ');
  for (const key of ['aria-expanded','aria-selected','aria-checked']) if (key in attrs) attrs[key] = 'false';
  return { ...node, attrs, children: node.children.map(normalize) };
};
const section = (site, index) => {
  if (site === 'moka') return index < 3 ? '基础信息' : index < 10 ? '个人信息' : index < 13 ? '求职意向' : index < 17 ? '工作经历' : index < 21 ? '教育背景' : index < 25 ? '实习经历' : index < 30 ? '项目经验' : index < 34 ? '语言能力' : index < 35 ? '自我描述' : '获奖经历';
  if (site === 'feishu') return index < 6 ? '基本信息' : index < 15 ? '教育经历 1' : index < 24 ? '教育经历 2' : '实习经历';
  return '个人信息';
};
const slots = tree => !tree || typeof tree === 'string' ? [] : 'slot' in tree ? [tree.slot] : (tree.children || []).flatMap(slots);
const mapSlots = (tree, prefix) => typeof tree === 'string' ? tree : 'slot' in tree ? {slot:`${prefix}-${tree.slot}`} : {...tree,children:(tree.children||[]).map(c=>mapSlots(c,prefix))};
const manifest = { version: 3, capture_date: '2026-09-20', sites: [], fidelity: {
  observed: ['field and control DOM shape', 'label placement', 'input roles and readonly state', 'opened dropdown/month/year/region/industry/job panel structure', 'Feishu eight initially collapsed modules after Add', 'Zhaopin nine Add forms and job status/intention editors', 'Zhaopin education initial state and bachelor-dependent fields'],
  retained_v2: ['original field IDs and names, including source duplicate IDs', 'data-form-field identifiers and labels', 'ARIA relationships and input constraints', 'original field and edit-record ancestor structure', 'Feishu collapsed module structure', 'iView option mousedown commit behavior'],
  reconstructed: ['local styling', 'synthetic options', 'selection event handlers', 'calendar navigation after the observed initial panel', 'asynchronous responses', 'repeat-record creation and cancellation', 'remote search responses', 'unobserved education branches and dependent option sets', 'Zhaopin collapsed section launcher'],
  excluded: ['real resume values', 'authentication state', 'original site scripts', 'original network endpoints', 'uploads and real submission'],
} };
for (const spec of specs) {
  const captured = await read(spec.fields);
  if (captured.truncated) throw new Error(`Capture was truncated: ${spec.fields}`);
  const templates = {};
  for (const [kind, name] of Object.entries(spec.templates)) {
    const value = await read(name);
    if (value.truncated) throw new Error(`Capture was truncated: ${name}`);
    if (!value.roots.length) throw new Error(`Missing captured panel: ${name}`);
    templates[kind] = normalize(value.roots[0].tree);
  }
  const fallback = { 10: '当前薪资', 11: '期望薪资', 12: '期望城市' };
  const fields = captured.roots.filter(row => row.tree && (spec.id !== 'feishu' || row.index > 0 && row.index < 28)).map(row => {
    const label = (row.label || strings(row.tree).find(value => /[\u4e00-\u9fff]/.test(value)))?.replace(/[：:*]/g, '').trim() || (spec.id === 'moka' ? fallback[row.index] : '') || `字段 ${row.index + 1}`;
    const tree = normalize(row.tree);
    return { id: `${spec.id}-${row.index}`, label, section: section(spec.id, row.index), tree, provenance:{capture:spec.fields,root:row.index} };
  });
  const modules = [];
  if (spec.id === 'feishu') {
    const closed = await read('feishu-closed-v2');
    for (const row of captured.roots.filter(r => r.index >= 28 && r.label !== '作品附件')) {
      if (!row.label || !row.section) throw new Error(`Unlabelled expanded Feishu field ${row.index}`);
      let module = modules.find(m => m.title === row.section);
      if (!module) { module = { id: `feishu-module-${modules.length}`, title: row.section, action: '添加', repeatable: row.section !== '自我评价', fields: [] }; modules.push(module); }
      module.fields.push({ id: `feishu-${row.index}`, label: row.label.replace(/[：:*]/g, '').trim(), section: row.section, tree: normalize(row.tree), provenance:{capture:spec.fields,root:row.index} });
    }
    for (const module of modules) {
      const layout = captured.layouts.find(l=>slots(l.tree).some(i=>module.fields.some(f=>f.id===`feishu-${i}`)));
      module.layout = mapSlots(normalize(layout.tree), 'feishu');
      module.closedLayout = normalize(closed.roots.find(r=>strings(r.tree).includes(module.title)).tree);
    }
  }
  if (spec.id === 'zhaopin') {
    const expanded = await read('zhaopin-expanded-v2');
    const initialEducation = await read('zhaopin-education-initial');
    if (initialEducation.truncated || initialEducation.roots.length !== 2) throw new Error('Missing initial education branch');
    for (const group of expanded.sections) {
      if (group.capture.truncated || !group.capture.roots.length) throw new Error(`Incomplete Zhaopin module ${group.key}`);
      if (group.key === 'education' && group.capture.roots.length !== 7) throw new Error('Expanded education capture is incomplete');
      const moduleFields = group.capture.roots.map(row => {
        const label = (row.label || (group.key === 'self' ? '个人优势' : group.key === 'status' ? '求职状态' : strings(row.tree).find(s => /[\u4e00-\u9fff]/.test(s))) || '').replace(/[：:*]/g, '').trim();
        if (!label) throw new Error(`Unlabelled Zhaopin field ${group.key}:${row.index}`);
        return { id: `zhaopin-${group.key}-${row.index}`, label, section: group.label, tree: normalize(row.tree), provenance:{capture:'zhaopin-expanded-v2',section:group.key,root:row.index}, ...(group.key === 'education' && !['最高学历','海外学习经历'].includes(label) ? { afterDegree: true } : {}) };
      });
      modules.push({ id: `zhaopin-${group.key}`, title: group.label, action: ['status','intent'].includes(group.key) ? '编辑' : '添加', repeatable: !['self','status','intent'].includes(group.key), fields: moduleFields, layout: mapSlots(normalize(group.capture.layouts[0].tree),`zhaopin-${group.key}`) });
    }
  }
  const layouts = captured.layouts.filter(l=>slots(l.tree).some(i=>fields.some(f=>f.id===`${spec.id}-${i}`))).map(l=>mapSlots(normalize(l.tree),spec.id));
  const data = { ...spec, source: captured.source, fields, layouts, modules, templates, fidelity: manifest.fidelity };
  await writeFile(join(output, `${spec.id}.json`), JSON.stringify(data));
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'"><title>${spec.title} 离线表单</title><link rel="stylesheet" href="style.css"><body data-site="${spec.id}"><header class="lab-header"><a href="index.html">← 样本目录</a><h1>${spec.title}</h1><p>离线结构样本 · 虚构资料 · 所有交互只影响本地测试页</p><button id="reset-fixture">重置</button><button id="save-fixture">保存测试草稿</button><output id="lab-status">加载中…</output></header><main id="fixture"></main><script type="module" src="runtime.js"></script></body></html>`;
  await writeFile(join(output, `${spec.id}.html`), html);
  manifest.sites.push({ id: spec.id, title: spec.title, fields: fields.length + modules.reduce((n,m)=>n+m.fields.length,0), initial_fields: fields.length, modules: modules.map(m=>({id:m.id,title:m.title,fields:m.fields.length})), panels: Object.keys(templates), source: captured.source });
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(join(output, 'options.json'), JSON.stringify({ schools: ['示例科技大学', '星河大学', '远山学院'], cities: ['北京', '上海', '杭州'], region: [{ label: '甲省', children: [{ label: '甲城市', children: [{ label: '示例区' }, { label: '新区' }] }] }, { label: '乙省', children: [{ label: '乙城市', children: [{ label: '示例区' }] }] }], industry: [{ label:'示例行业门类', children:[{label:'示例软件行业'},{label:'示例服务行业'}]}], job: [{label:'示例职位大类',children:[{label:'示例技术方向',children:[{label:'示例开发工程师'},{label:'示例测试工程师'}]}]}] }));
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>招聘表单离线样本</title><link rel="stylesheet" href="style.css"><body><main class="directory"><h1>招聘表单离线样本</h1><p>来源于本次打开的三份表单。DOM 结构经过脱敏，交互和候选数据在本地重建。</p>${manifest.sites.map(s => `<a class="site-card" href="${s.id}.html"><strong>${s.title}</strong><span>${s.fields} 个字段区域 · ${s.panels.length} 类弹层样本 →</span></a>`).join('')}<p>这些是结构与行为回归夹具，不是原站前端运行包。实际接口、联动和保存仍需真实页面验收。</p></main></body></html>`);
for (const file of ['runtime.js', 'style.css']) await copyFile(join(root, 'tests/ats-offline', file), join(output, file));
console.log(JSON.stringify({ output, sites: manifest.sites }, null, 2));
