// Read-only discovery in an empty browser profile. No login, form entry or submission.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const sites = [
  ['国聘', 'https://c.iguopin.com/resume'],
  ['智联个人简历', 'https://i.zhaopin.com/resume'],
  ['应届生', 'https://q.yingjiesheng.com/pc/myresume'],
];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.RESUME_TEST_BROWSER ? { executablePath: process.env.RESUME_TEST_BROWSER } : {}),
});
const report = { checked_at: new Date().toISOString(), method: 'Unauthenticated read-only navigation; no clicks or form input', sites: [] };
try {
  for (const [name, url] of sites) {
    const context = await browser.newContext({ locale: 'zh-CN' });
    const page = await context.newPage();
    const entry = { name, requested_url: url };
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.locator('body').waitFor({ timeout: 5000 });
      await page.waitForFunction(() => document.body.innerText.trim().length > 80, null, { timeout: 5000 }).catch(() => {});
      // Public resume URLs can immediately redirect to login; settle that navigation once.
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
      const current = new URL(page.url());
      entry.final_url = current.origin + current.pathname;
      entry.http_status = response?.status() ?? null;
      entry.page = await page.evaluate(() => {
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const text = document.body.innerText;
        const controls = [...document.querySelectorAll('input,select,textarea,[role="combobox"]')].filter(visible);
        return {
          title: document.title.slice(0, 160),
          login_visible: /登录|登陆|注册|验证码|手机号/.test(text) || /login|passport/.test(location.href),
          verification_visible: /滑动验证|安全验证|人机验证|验证码/.test(text + document.title),
          resume_editor_visible: /教育经历/.test(text) && /保存|添加教育/.test(text),
          visible_controls: controls.map(el => ({
            tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), role: el.getAttribute('role'),
            label: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 100),
            readonly: el.hasAttribute('readonly'),
          })),
        };
      });
      entry.fill_validation = 'not performed';
    } catch (error) {
      entry.error = /Timeout/.test(error.message) ? 'navigation timeout' : error.message.split('\n')[0].slice(0, 200);
    } finally {
      await context.close();
    }
    report.sites.push(entry);
    console.log(JSON.stringify(entry));
  }
} finally {
  await browser.close();
}
await writeFile(new URL('../artifacts/public-site-inspection.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
