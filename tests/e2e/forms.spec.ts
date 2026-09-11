import { test, expect } from '@playwright/test';
import cases from '../fixtures/cases.json' with { type: 'json' };

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function fixtureHtml(style: number, fields: typeof cases.fields) {
  function fieldHtml(f: typeof fields[number], i: number) {
    const label = style === 7 ? `${f.label} *` : style === 8 ? ` ${f.label} ： ` : style === 20 ? `\n ${f.label}\n ` : style === 6 ? f.english : f.label;
    const id = `field-${i}`;
    const kind = f.key === 'education_level' ? 'select' : f.key === 'start_month' ? 'month' : f.key === 'email' ? 'email' : 'text';
    const attr = style === 3 ? `aria-label="${escape(label)}"` : style === 4 ? `aria-labelledby="label-${i}"` : style === 5 ? `placeholder="${escape(label)}"` : '';
    const name = style === 6 ? f.english : f.key;
    let control = kind === 'select'
      ? `<select id="${id}" name="${name}" ${attr}><option value="">请选择</option><option value="level-6">${style === 13 ? '大学本科' : '本科'}</option><option value="level-7">硕士</option></select>`
      : `<input id="${id}" name="${name}" type="${kind}" ${attr} ${style === 15 ? 'autocomplete="off"' : ''}>`;
    if (style === 14 && f.key === 'education_level') return `<div id="${id}"><label><input type="radio" name="学历" value="level-6">本科</label><label><input type="radio" name="学历" value="level-7">硕士</label></div>`;
    if (style === 19 && f.key === 'job_intention') control = `<textarea id="${id}" name="${name}"></textarea>`;
    if (style === 2) return `<label>${escape(label)}${control}</label>`;
    if ([3, 5, 6].includes(style)) return `<div>${control}</div>`;
    if (style === 4) return `<span id="label-${i}">${escape(label)}</span>${control}`;
    if (style === 10) return `<table><tr><td><label for="${id}">${escape(label)}</label></td><td>${control}</td></tr></table>`;
    const basic = `<label for="${id}">${escape(label)}</label>${control}`;
    return style === 18 ? `<div><div><span>${basic}</span></div></div>` : `<div>${basic}</div>`;
  }
  const indices = style === 11 ? fields.map((_, i) => i).reverse() : fields.map((_, i) => i);
  const group = (name: string, filter: string) => {
    const content = indices.filter(i => fields[i].section === filter).map(i => fieldHtml(fields[i], i)).join('');
    return style === 9 ? `<section><h2>${name}</h2>${content}</section>` : `<fieldset><legend>${name}</legend>${content}</fieldset>`;
  };
  return `<style>input,select,textarea{display:block;margin:12px;padding:7px}input[type=radio]{display:inline}label{display:inline-block}fieldset,section{padding:20px}</style><form>${group('基本资料', 'basic')}${group('教育经历', 'education')}${style === 16 ? '<input type="hidden" value="SYNTHETIC-HIDDEN">' : ''}${style === 17 ? '<label>密码<input type="password" value="SYNTHETIC-PASSWORD"></label>' : ''}<button type="submit">提交</button></form>`;
}
for (const scenario of cases.scenarios) {
  test(`表单样本 ${scenario.id}：${scenario.name}（10 个标注字段）`, async ({ page }) => {
    if (scenario.id === 12) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/'); await page.setContent(fixtureHtml(scenario.id, cases.fields));
    await page.addScriptTag({ url: '/test-engine.js' });
    const result = await page.evaluate(async () => {
      const { FormEngine, demoProfile, sources, suggestSource, proposedValue } = (window as any).ResumeTest;
      const p = demoProfile(); p.education = [p.education[1]];
      const engine = new FormEngine(), snapshot = engine.scan(), available = sources(p);
      const ops = snapshot.fields.filter((f: any) => !f.blocked).map((f: any) => ({ fieldId: f.id, expectedValue: f.currentValue, value: proposedValue(f, suggestSource(f, available, {})).value }));
      const results = await engine.fill({ ...snapshot, operationId: 'fixture-fill', operations: ops });
      return { results, values: Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=password]),select,textarea')).map((e: any) => ({ id: e.id, value: e.type === 'radio' ? e.checked && e.value : e.value })).filter(x => x.id || x.value) };
    });
    expect(result.results).toHaveLength(10);
    expect(result.results.every((r: { status: string }) => r.status === 'filled'), JSON.stringify(result.results)).toBe(true);
    for (const [i, field] of cases.fields.entries()) {
      if (scenario.id === 14 && field.key === 'education_level') await expect(page.locator('input[type=radio][value="level-6"]')).toBeChecked();
      else await expect(page.locator(`#field-${i}`)).toHaveValue(field.expected);
    }
  });
}

test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith('表单样本')) { await page.goto('/'); await page.addScriptTag({ url: '/test-engine.js' }); }
});
test('已有值保护、操作去重和有条件撤销', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const engine = new (window as any).ResumeTest.FormEngine(), s = engine.scan();
    const f = s.fields.find((f: any) => f.label === '姓名');
    const node = document.querySelector('#full-name') as HTMLInputElement;
    node.value = '用户预览后的修改';
    const conflict = await engine.fill({ ...s, operationId: 'conflict', operations: [{ fieldId: f.id, expectedValue: '', value: '拟填姓名' }] });
    const s2 = engine.scan(), f2 = s2.fields.find((f: any) => f.label === '姓名');
    const request = { ...s2, operationId: 'overwrite', operations: [{ fieldId: f2.id, expectedValue: node.value, value: '明确覆盖' }] };
    let events = 0; node.addEventListener('input', () => events++);
    const filled = await engine.fill(request); await engine.fill(request);
    const afterDedup = events;
    const undone = await engine.undo(s2);
    return { conflict, filled, afterDedup, undone, value: node.value, submitted: (window as any).__submitted };
  });
  expect(result.conflict[0].status).toBe('skipped'); expect(result.filled[0].status).toBe('filled'); expect(result.afterDedup).toBe(1);
  expect(result.undone[0].status).toBe('undone'); expect(result.value).toBe('用户预览后的修改'); expect(result.submitted).toBe(0);
});
test('后续手改内容不会被撤销覆盖', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const e = new (window as any).ResumeTest.FormEngine(), s = e.scan(); const f = s.fields.find((f: any) => f.label === '姓名');
    await e.fill({ ...s, operationId: 'one', operations: [{ fieldId: f.id, expectedValue: '', value: '初次填写' }] });
    (document.querySelector('#full-name') as HTMLInputElement).value = '用户的新修改';
    await e.undo(s); return (document.querySelector('#full-name') as HTMLInputElement).value;
  })).toBe('用户的新修改');
});
test('节点替换、标签更改和 SPA 导航使旧计划失效', async ({ page }) => {
  for (const change of ['replace', 'label', 'route']) {
    await page.reload(); await page.addScriptTag({ url: '/test-engine.js' });
    const result = await page.evaluate(async change => {
      const e = new (window as any).ResumeTest.FormEngine(), s = e.scan(), f = s.fields.find((f: any) => f.label === '姓名');
      const n = document.querySelector('#full-name')!;
      if (change === 'replace') n.replaceWith(n.cloneNode(true));
      if (change === 'label') n.parentElement!.firstChild!.textContent = '身份证号码';
      if (change === 'route') history.pushState({}, '', '/changed');
      try { await e.fill({ ...s, operationId: 'stale', operations: [{ fieldId: f.id, expectedValue: '', value: '不得写入' }] }); return 'unexpected'; } catch { return (document.querySelector('#full-name') as HTMLInputElement).value; }
    }, change);
    expect(result).toBe('');
  }
});
test('扫描与写入计划均排除敏感字段，整批无效请求不产生部分写入', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const e = new (window as any).ResumeTest.FormEngine(), s = e.scan();
    const f = s.fields.find((f: any) => f.label === '姓名'), password = s.fields.find((f: any) => f.label === '密码');
    let rejected = false;
    try { await e.fill({ ...s, operationId: 'invalid', operations: [{ fieldId: f.id, expectedValue: '', value: '不应写入' }, { fieldId: password.id, expectedValue: null, value: '不应写入' }] }); } catch { rejected = true; }
    return { payload: JSON.stringify(s), rejected, name: (document.querySelector('#full-name') as HTMLInputElement).value, agreed: (document.querySelector('#agreement') as HTMLInputElement).checked };
  });
  expect(result.payload).not.toContain('SYNTHETIC-'); expect(result.rejected).toBe(true); expect(result.name).toBe(''); expect(result.agreed).toBe(false);
});
test('同名教育经历明确绑定后取值，不按数组顺序猜测', async ({ page }) => {
  const values = await page.evaluate(() => {
    const { FormEngine, demoProfile, sources, suggestSource } = (window as any).ResumeTest;
    const s = new FormEngine().scan(), all = sources(demoProfile());
    const fields = s.fields.filter((f: any) => f.label === '学校名称');
    return fields.map((f: any, index: number) => ({ empty: !suggestSource(f, all, {}), value: suggestSource(f, all, { [`${f.groupId}:education`]: index === 0 ? 'edu-bachelor' : 'edu-master' }).value }));
  });
  expect(values).toEqual([{ empty: true, value: '示例理工大学' }, { empty: true, value: '示例科技大学' }]);
});
test('React 受控字段触发状态更新；拒绝值的控件必须报告失败', async ({ page }) => {
  await page.goto('/controlled.html'); await expect(page.locator('#controlled-name')).toBeVisible(); await page.addScriptTag({ url: '/test-engine.js' });
  const result = await page.evaluate(async () => {
    const e = new (window as any).ResumeTest.FormEngine(), s = e.scan();
    return e.fill({ ...s, operationId: 'react', operations: s.fields.map((f: any) => ({ fieldId: f.id, expectedValue: f.currentValue, value: f.label === '姓名' ? '受控姓名' : 'student@example.com' })) });
  });
  expect(result[0].status).toBe('filled'); expect(result[1].status).toBe('failed'); await expect(page.locator('#react-state')).toHaveText('受控姓名');
});
