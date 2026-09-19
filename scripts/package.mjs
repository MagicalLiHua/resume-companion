import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const pluginRoot = resolve(root, 'plugins/resume-companion');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Invalid version');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
const name = `resume-companion-${pkg.version}`;
const staging = resolve(root, 'artifacts', name);
const archive = resolve(root, 'artifacts', `${name}.zip`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
const packagedPlugin = resolve(staging, 'plugins/resume-companion');
await mkdir(packagedPlugin, { recursive: true });
for (const item of ['.codex-plugin', '.mcp.json', 'package.json', 'server.mjs', 'server.bundle.mjs', 'chrome-launcher.bundle.mjs', 'runtime', 'skills']) {
  await cp(resolve(pluginRoot, item), resolve(packagedPlugin, item), { recursive: true });
}
await cp(resolve(root, 'LICENSE'), resolve(staging, 'LICENSE'));
await cp(resolve(root, 'SECURITY.md'), resolve(staging, 'SECURITY.md'));
await cp(resolve(root, '.agents/plugins/marketplace.json'), resolve(staging, '.agents/plugins/marketplace.json'));
await cp(resolve(root, 'README.md'), resolve(staging, 'README.md'));
await cp(resolve(root, 'CONTRIBUTING.md'), resolve(staging, 'CONTRIBUTING.md'));
await cp(resolve(root, 'CHANGELOG.md'), resolve(staging, 'CHANGELOG.md'));
await mkdir(resolve(staging, 'docs'), { recursive: true });
for (const file of [
  'getting-started.md',
  'mcp-tools.md',
  'development.md',
  'validation.md',
]) {
  await cp(resolve(root, 'docs', file), resolve(staging, 'docs', file));
}
execFileSync(process.execPath, [resolve(pluginRoot, 'scripts/package-smoke-test.mjs'), resolve(packagedPlugin, 'server.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(pluginRoot, 'scripts/chrome-package-smoke-test.mjs'), resolve(packagedPlugin, 'chrome-launcher.bundle.mjs')], { cwd: root, stdio: 'inherit' });
await writeFile(resolve(staging, 'README.txt'), `简历随行 ${pkg.version} 开发预览版

Codex：按 docs/getting-started.md 安装插件。插件会同时注册本地资料 MCP 和基于固定 Chrome DevTools 底座的 Resume Browser MCP。

需要 Node.js 24 和 Chrome 116+。首次网页任务会打开 Resume Companion 专用的持久 Chrome Profile，请在该窗口登录招聘网站一次。后续任务会复用该登录状态，无需安装扩展、Native Host 或开启远程调试。

AI 可以填写、保存普通草稿和进入普通下一步；最终申请提交、声明、验证码、密码和附件上传由用户完成。
无需授予 ChatGPT 修改 macOS App 的权限。

发布包只包含程序和公开文档，不包含用户资料、密钥或内部调试记录。
`);
const notices = resolve(staging, '第三方许可');
await mkdir(notices, { recursive: true });
const pluginLock = JSON.parse(await readFile(resolve(pluginRoot, 'package-lock.json'), 'utf8'));
for (const [packagePath, metadata] of Object.entries(pluginLock.packages)) {
  if (!packagePath.startsWith('node_modules/') || metadata.dev) continue;
  const dependencyRoot = resolve(pluginRoot, packagePath);
  let licenseFile;
  try { licenseFile = (await readdir(dependencyRoot)).find(file => /^licen[cs]e(?:\.|$)/i.test(file)); } catch { continue; }
  if (!licenseFile) continue;
  const dependency = packagePath.slice('node_modules/'.length).replaceAll('/node_modules/', '--').replaceAll('/', '__');
  await cp(resolve(dependencyRoot, licenseFile), resolve(notices, `codex-${dependency}.txt`));
}
await rm(archive, { force: true });
execFileSync('zip', ['-qr', archive, name], { cwd: resolve(root, 'artifacts') });
const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(`${archive}.sha256`, `${hash}  ${name}.zip\n`);
console.log(`安装包：${archive}\nSHA-256：${hash}`);
