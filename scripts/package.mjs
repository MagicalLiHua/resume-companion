import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const pluginRoot = resolve(root, 'plugins/resume-companion');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Invalid version');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
const name = `applymcp-${pkg.version}`;
const staging = resolve(root, 'artifacts', name);
const archive = resolve(root, 'artifacts', `${name}.zip`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
const packagedPlugin = resolve(staging, 'plugins/resume-companion');
await mkdir(packagedPlugin, { recursive: true });
for (const item of ['.codex-plugin', '.claude-plugin', '.cursor-plugin', '.mcp.json', 'client-configs', 'plugin.json', 'mcp.json', 'package.json', 'server.mjs', 'server.bundle.mjs', 'chrome-launcher.bundle.mjs', 'browser-supervisor.bundle.mjs', 'runtime', 'skills']) {
  await cp(resolve(pluginRoot, item), resolve(packagedPlugin, item), { recursive: true });
}
await mkdir(resolve(packagedPlugin, 'scripts'), { recursive: true });
await cp(resolve(pluginRoot, 'scripts/reload-codex-mcp.mjs'), resolve(packagedPlugin, 'scripts/reload-codex-mcp.mjs'));
await cp(resolve(pluginRoot, 'scripts/print-agent-config.mjs'), resolve(packagedPlugin, 'scripts/print-agent-config.mjs'));
await cp(resolve(pluginRoot, 'scripts/client-integrations-test.mjs'), resolve(packagedPlugin, 'scripts/client-integrations-test.mjs'));
await cp(resolve(root, 'LICENSE'), resolve(staging, 'LICENSE'));
await cp(resolve(root, 'SECURITY.md'), resolve(staging, 'SECURITY.md'));
await cp(resolve(root, '.agents/plugins/marketplace.json'), resolve(staging, '.agents/plugins/marketplace.json'));
await cp(resolve(root, '.claude-plugin'), resolve(staging, '.claude-plugin'), { recursive: true });
await cp(resolve(root, '.cursor-plugin'), resolve(staging, '.cursor-plugin'), { recursive: true });
for (const file of ['kimi.plugin.json']) {
  await cp(resolve(root, file), resolve(staging, file));
}
await cp(resolve(root, 'README.md'), resolve(staging, 'README.md'));
await cp(resolve(root, 'CONTRIBUTING.md'), resolve(staging, 'CONTRIBUTING.md'));
await cp(resolve(root, 'CHANGELOG.md'), resolve(staging, 'CHANGELOG.md'));
await mkdir(resolve(staging, 'docs'), { recursive: true });
await mkdir(resolve(staging, 'docs/reports'), { recursive: true });
await cp(resolve(root, 'docs/assets'), resolve(staging, 'docs/assets'), { recursive: true });
for (const file of [
  'getting-started.md',
  'mcp-tools.md',
  'development.md',
  'validation.md',
  'agent-clients.md',
  '51job与大易适配开发记录-2026-09-21.md',
  '51job与大易适配调研-2026-09-21.md',
  'reports/2026-09-21-dayee-guopin-development.md',
  'reports/2026-09-21-dayee-guopin-development.metrics.json',
]) {
  await cp(resolve(root, 'docs', file), resolve(staging, 'docs', file));
}
await cp(resolve(root, 'clients'), resolve(staging, 'clients'), { recursive: true });
const workbuddyRoot = resolve(staging, 'clients/workbuddy');
const workbuddyProfile = resolve(workbuddyRoot, 'applymcp-profile');
const workbuddyBrowser = resolve(workbuddyRoot, 'applymcp-browser');
await cp(resolve(pluginRoot, 'server.bundle.mjs'), resolve(workbuddyProfile, 'server.bundle.mjs'));
await cp(resolve(pluginRoot, 'skills'), resolve(workbuddyProfile, 'skills'), { recursive: true });
for (const item of ['chrome-launcher.bundle.mjs', 'browser-supervisor.bundle.mjs', 'runtime']) {
  await cp(resolve(pluginRoot, item), resolve(workbuddyBrowser, item), { recursive: true });
}
execFileSync(process.execPath, [resolve(pluginRoot, 'scripts/client-integrations-test.mjs'), packagedPlugin, '--packaged'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(pluginRoot, 'scripts/package-smoke-test.mjs'), resolve(packagedPlugin, 'server.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(pluginRoot, 'scripts/chrome-package-smoke-test.mjs'), resolve(packagedPlugin, 'chrome-launcher.bundle.mjs')], { cwd: root, stdio: 'inherit' });
await writeFile(resolve(staging, 'README.txt'), `ApplyMCP ${pkg.version} 开发预览版

Codex、Claude Code、Cursor、Kimi Code CLI、Hermes Agent、WorkBuddy、Trae、OpenCode、Gemini CLI 和其他 stdio MCP 客户端的接入方式见 docs/agent-clients.md。所有方式都应同时注册本地资料 MCP 和 ApplyMCP Browser。

WorkBuddy 必须同时安装 clients/workbuddy 下的两个连接器。其他没有原生插件入口的客户端，可运行 plugins/resume-companion/scripts/print-agent-config.mjs 生成当前安装目录对应的配置。

需要 Node.js 24 和 Chrome 116+。首次网页任务会打开 ApplyMCP 专用的持久 Chrome Profile，请在该窗口登录招聘网站一次。后续任务会复用该登录状态，无需安装扩展、Native Host 或开启远程调试。

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
