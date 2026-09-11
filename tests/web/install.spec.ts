import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';

test('登录前下载安装包，登录后可从侧边栏和连接页安装', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await mkdir('artifacts/screenshots/web', {recursive: true});
  await page.goto('/');
  await expect(page.getByRole('button', {name: '安装浏览器插件'})).toBeVisible();
  await page.screenshot({path: 'artifacts/screenshots/web/login-monochrome.png', fullPage: true, animations: 'disabled'});
  await page.getByRole('button', {name: '安装浏览器插件'}).click();
  const dialog = page.getByRole('dialog', {name: '安装简历随行插件'});
  await expect(dialog.getByText('当前浏览器：Chrome', {exact: false})).toBeVisible();
  await expect(dialog.getByLabel('扩展管理页地址')).toHaveValue('chrome://extensions');
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('link', {name: '下载插件安装包'}).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('resume-companion-0.3.2.zip');
  const downloaded = await readFile((await download.path())!);
  const expected = (await readFile('artifacts/resume-companion-0.3.2.zip.sha256', 'utf8')).split(/\s/)[0];
  expect(createHash('sha256').update(downloaded).digest('hex')).toBe(expected);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', {name: '复制地址'}).click();
  await expect(dialog.getByRole('status')).toContainText('地址已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('chrome://extensions');
  await page.screenshot({path: 'artifacts/screenshots/web/install-monochrome.png', fullPage: true, animations: 'disabled'});
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', {name: '安装浏览器插件'})).toBeFocused();
  await page.getByLabel('用户名', {exact: true}).fill('administrator');
  await page.getByLabel('密码（12–128 位）', {exact: true}).fill('synthetic-web-passphrase-2026');
  await page.getByRole('button', {name: '登录工作台'}).click();
  await page.getByRole('complementary').getByRole('button', {name: '安装浏览器插件'}).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: '关闭安装说明', exact: true}).click();
  await page.getByRole('button', {name: '连接插件', exact: false}).click();
  await expect(page.getByRole('heading', {name: '把简历带到当前浏览器'})).toBeVisible();
  await page.screenshot({path: 'artifacts/screenshots/web/connect-monochrome.png', fullPage: true, animations: 'disabled'});
  await page.getByRole('button', {name: '在当前浏览器安装'}).click();
  await expect(dialog).toContainText('http://127.0.0.1:4180');
  expect(errors).toEqual([]);
});

for (const scenario of [
  {name: 'Edge', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', browser: 'Edge', width: 1280},
  {name: 'Safari', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', browser: null, width: 1280},
  {name: '手机 Chrome', ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36', browser: null, width: 390},
]) {
  test(`${scenario.name} 安装引导与复制失败时的手动入口`, async ({browser}) => {
    const context = await browser.newContext({userAgent: scenario.ua, viewport: {width: scenario.width, height: 844}});
    const page = await context.newPage();
    try {
      await page.goto('http://127.0.0.1:4180');
      await page.getByRole('button', {name: '安装浏览器插件'}).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('扩展管理页地址')).toHaveValue(scenario.browser === 'Edge' ? 'edge://extensions' : 'chrome://extensions');
      if (!scenario.browser) await expect(dialog).toContainText('请使用电脑上的 Chrome 或 Edge');
      await page.evaluate(() => {navigator.clipboard.writeText = async () => {throw new Error('Clipboard unavailable');};});
      await dialog.getByRole('button', {name: '复制地址'}).click();
      await expect(dialog.getByRole('status')).toContainText('手动复制');
      await dialog.getByLabel('安装到哪个浏览器').selectOption('Edge');
      await expect(dialog.getByLabel('扩展管理页地址')).toHaveValue('edge://extensions');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (scenario.width === 390) await page.screenshot({path: 'artifacts/screenshots/web/install-mobile.png', fullPage: true, animations: 'disabled'});
    } finally {await context.close();}
  });
}
