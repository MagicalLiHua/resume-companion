import { test, expect, chromium, type BrowserContext, type Worker, type Page } from '@playwright/test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let context: BrowserContext, worker: Worker, extensionId: string;
test.beforeAll(async () => {
  const extensionPath = resolve('test-results/extension-localhost-only');
  await cp('dist', extensionPath, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'));
  // Test-only localhost permission substitutes for a physical toolbar click.
  // The packaged manifest remains activeTab-only and is checked below.
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(resolve(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext('', {
    headless: true, executablePath: process.env.RESUME_TEST_BROWSER,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).hostname;
  await mkdir('artifacts/screenshots', { recursive: true });
});
test.afterAll(async () => { await context?.close(); });
const uiPage = async (name: string) => { const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/${name}.html`); return page; };
async function useSample(editor: Page) {
  await expect(editor.getByRole('button', { name: '保存资料' })).toBeEnabled();
  await editor.getByRole('button', { name: '用示例资料体验' }).click();
  await editor.getByRole('button', { name: '替换编辑内容' }).click();
  await editor.getByRole('button', { name: '保存资料' }).click();
  await expect(editor.getByRole('status')).toHaveText('资料已保存到本机');
}
test('实际扩展：简历保存、重载和多窗口冲突保护', async () => {
  const editor = await uiPage('options'); await useSample(editor);
  await editor.reload(); await expect(editor.getByLabel('姓名', { exact: true })).toHaveValue('示例同学');
  const other = await uiPage('options'); await expect(other.getByLabel('姓名', { exact: true })).toHaveValue('示例同学');
  await editor.getByLabel('姓名', { exact: true }).fill('新的示例姓名'); await editor.getByRole('button', { name: '保存资料' }).click();
  await expect(editor.getByRole('status')).toHaveText('资料已保存到本机');
  await other.getByLabel('姓名', { exact: true }).fill('不应覆盖'); await other.getByRole('button', { name: '保存资料' }).click();
  await expect(other.getByRole('alert')).toContainText('其他窗口更新');
  expect(await worker.evaluate(async () => ((await chrome.storage.local.get('resume_state')).resume_state as any).current.profile.basic.full_name)).toBe('新的示例姓名');
  await other.close(); await useSample(editor); await editor.setViewportSize({ width: 1280, height: 960 });
  await editor.screenshot({ path: 'artifacts/screenshots/资料编辑.png', fullPage: true });
  await editor.close();
});
test('实际扩展：扫描、经历绑定、填写、回读与撤销', async () => {
  const editor = await uiPage('options'); await useSample(editor); await editor.close();
  const form = await context.newPage(); await form.goto('http://127.0.0.1:4174');
  const panel = await uiPage('sidepanel'); await expect(panel.getByText('示例同学', { exact: true })).toBeVisible();
  await form.bringToFront();
  // Dispatch in the extension page without focusing its tab; a real side panel
  // is not a browser tab and naturally leaves the target tab active.
  await panel.getByRole('button', { name: '扫描当前页' }).evaluate((b: HTMLButtonElement) => b.click());
  await expect(panel.getByRole('heading', { name: '填写预览' })).toBeVisible();
  await panel.getByLabel('教育经历 1 · 教育经历', { exact: true }).selectOption('edu-bachelor');
  await panel.getByLabel('教育经历 2 · 教育经历', { exact: true }).selectOption('edu-master');
  await panel.setViewportSize({ width: 440, height: 980 });
  await panel.screenshot({ path: 'artifacts/screenshots/填写预览.png', fullPage: true });
  await form.bringToFront();
  await panel.getByRole('button', { name: /^填写选中的/ }).evaluate((b: HTMLButtonElement) => b.click());
  await expect(form.locator('#full-name')).toHaveValue('示例同学');
  await expect(form.locator('[name=school1]')).toHaveValue('示例理工大学');
  await expect(form.locator('[name=school2]')).toHaveValue('示例科技大学');
  await expect(panel.getByRole('button', { name: '撤销本次填写' })).toBeEnabled();
  await expect(form.locator('[name=degree2]')).toHaveValue('');
  await expect(form.locator('[name=python]')).toBeChecked();
  await expect(form.locator('[name=rust]')).not.toBeChecked();
  await expect(form.locator('#agreement')).not.toBeChecked();
  expect(await form.evaluate(() => (window as any).__submitted)).toBe(0);
  const dataAccess = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: async () => {
      let readProfile = false, receivedProfile = false;
      try { readProfile = Boolean((await chrome.storage.local.get('resume_profile')).resume_profile); } catch { /* denied */ }
      try { receivedProfile = Boolean((await chrome.runtime.sendMessage({ type: 'PROFILE_LOAD' }))?.data?.profile); } catch { /* denied */ }
      return { readProfile, receivedProfile };
    } });
  });
  expect(dataAccess[0].result).toEqual({ readProfile: false, receivedProfile: false });
  await panel.getByRole('button', { name: '撤销本次填写' }).evaluate((b: HTMLButtonElement) => b.click());
  await expect(form.locator('#full-name')).toHaveValue(''); await expect(form.locator('[name=school1]')).toHaveValue('');
  await panel.close(); await form.close();
});
test('实际扩展：连续输入多行技能、经历和多项技术栈后保存重载', async () => {
  const editor = await uiPage('options'); await useSample(editor);
  await editor.getByRole('button', { name: /专业技能/ }).click();
  const skills = editor.getByLabel('专业技能（每行一项）');
  await skills.fill('Python'); await skills.press('End'); await skills.press('Enter'); await skills.pressSequentially('SQL'); await skills.press('Enter');
  await expect(skills).toHaveValue('Python\nSQL\n');
  await editor.getByRole('button', { name: /工作与实习/ }).click();
  const facts = editor.getByLabel('工作内容（每行一项）');
  await facts.fill('接口测试'); await facts.press('End'); await facts.press('Enter'); await facts.pressSequentially('API regression'); await facts.press('Enter');
  await expect(facts).toHaveValue('接口测试\nAPI regression\n');
  await editor.getByLabel('目前仍在此任职').selectOption('current');
  await editor.getByRole('button', { name: /项目经历/ }).click();
  const tech = editor.getByLabel('技术栈（用顿号或逗号分隔）');
  await tech.fill('Python'); await tech.press('End'); await tech.pressSequentially(',SQL,');
  await expect(tech).toHaveValue('Python、SQL、');
  const projectFacts = editor.getByLabel('项目描述（每行一项）');
  await projectFacts.fill('数据清洗'); await projectFacts.press('End'); await projectFacts.press('Enter'); await projectFacts.pressSequentially('SQL reports');
  await editor.getByLabel('项目仍在进行').selectOption('current');
  await editor.getByRole('button', { name: '保存资料' }).click(); await expect(editor.getByRole('status')).toHaveText('资料已保存到本机');
  await editor.reload();
  await editor.getByRole('button', { name: /专业技能/ }).click(); await expect(skills).toHaveValue('Python\nSQL');
  await editor.getByRole('button', { name: /工作与实习/ }).click(); await expect(facts).toHaveValue('接口测试\nAPI regression'); await expect(editor.getByLabel('目前仍在此任职')).toHaveValue('current');
  await editor.getByRole('button', { name: /项目经历/ }).click(); await expect(tech).toHaveValue('Python、SQL'); await expect(projectFacts).toHaveValue('数据清洗\nSQL reports'); await expect(editor.getByLabel('项目仍在进行')).toHaveValue('current');
  await editor.close();
});
test('实际扩展：更新资料或切换标签页使预览失效', async () => {
  const form = await context.newPage(); await form.goto('http://127.0.0.1:4174');
  const panel = await uiPage('sidepanel'); await form.bringToFront();
  await panel.getByRole('button', { name: '扫描当前页' }).evaluate((b: HTMLButtonElement) => b.click());
  await expect(panel.getByRole('heading', { name: '填写预览' })).toBeVisible();
  const another = await context.newPage(); await another.goto('http://127.0.0.1:4174'); await another.bringToFront();
  await expect(panel.getByText('页面或资料已变化。请重新扫描后再填写。')).toBeVisible();
  await expect(panel.getByRole('button', { name: /^填写选中的/ })).toBeDisabled();
  await expect(form.locator('#full-name')).toHaveValue(''); await expect(another.locator('#full-name')).toHaveValue('');
  await panel.close(); await form.close(); await another.close();
});
test('实际扩展：未知版本保持原数据，可明确恢复上一份备份', async () => {
  const editor = await uiPage('options'); await useSample(editor);
  await editor.getByLabel('姓名', { exact: true }).fill('备用版本'); await editor.getByRole('button', { name: '保存资料' }).click(); await expect(editor.getByRole('status')).toHaveText('资料已保存到本机');
  await worker.evaluate(async () => { const data = await chrome.storage.local.get('resume_state'); const s = data.resume_state as any; s.current.profile.schema_version='future'; await chrome.storage.local.set({resume_state:s}); });
  await editor.reload(); await expect(editor.getByRole('alert')).toContainText('格式异常或版本过新'); await expect(editor.getByRole('button', { name: '保存资料' })).toBeDisabled();
  await editor.getByRole('button', { name: '备份与恢复', exact:true }).first().click();
  await editor.getByRole('button', { name: '恢复上一份备份' }).click(); await editor.getByRole('button', { name: '确认恢复' }).click();
  await editor.getByRole('button',{name:/基本资料/}).first().click();
  await expect(editor.getByLabel('姓名', { exact: true })).toHaveValue('示例同学');
  await editor.close();
});
test('发布包：悬浮权限、资源隔离及无旧业务入口', async () => {
  const m = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  expect(m.permissions.sort()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage'].sort());
  expect(m.host_permissions).toEqual(['http://*/*','https://*/*']); expect(m.content_scripts[0].all_frames).toBe(false); expect(m.externally_connectable).toBeUndefined();
  expect(m.optional_host_permissions).toEqual(['https://*/*']);
  expect(m.content_security_policy.extension_pages).toContain("connect-src https:");
  expect(m.key).toBeTruthy();
  const content = await readFile('dist/content.js', 'utf8'); expect(content).not.toContain('ResumeTest'); expect(content).not.toContain('qiuzhifangzhou');
});
