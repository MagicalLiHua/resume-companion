import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const pluginRoot = resolve(root, 'plugins/resume-companion');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Invalid version');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: pluginRoot, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
const manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'));
if (manifest.version !== pkg.version || JSON.stringify(manifest.host_permissions)!==JSON.stringify(['http://*/*','https://*/*']) || manifest.content_scripts || manifest.side_panel || manifest.externally_connectable || manifest.options_page!=='options.html') throw new Error('Unexpected release manifest');
const name = `resume-companion-${pkg.version}`;
const staging = resolve(root, 'artifacts', name);
const archive = resolve(root, 'artifacts', `${name}.zip`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(resolve(root, 'dist'), resolve(staging, 'extension-fallback'), { recursive: true });
const packagedPlugin = resolve(staging, 'plugins/resume-companion');
await mkdir(packagedPlugin, { recursive: true });
for (const item of ['.codex-plugin', '.mcp.json', 'package.json', 'server.mjs', 'server.bundle.mjs', 'runtime', 'skills']) {
  await cp(resolve(pluginRoot, item), resolve(packagedPlugin, item), { recursive: true });
}
await cp(resolve(root, 'LICENSE'), resolve(staging, 'LICENSE'));
await cp(resolve(root, 'SECURITY.md'), resolve(staging, 'SECURITY.md'));
await cp(resolve(root, '.agents/plugins/marketplace.json'), resolve(staging, '.agents/plugins/marketplace.json'));
await cp(resolve(root, 'README.md'), resolve(staging, 'README.md'));
await cp(resolve(root, 'CONTRIBUTING.md'), resolve(staging, 'CONTRIBUTING.md'));
await cp(resolve(root, 'CHANGELOG.md'), resolve(staging, 'CHANGELOG.md'));
await mkdir(resolve(staging, 'docs'), { recursive: true });
for (const file of ['getting-started.md', 'mcp-tools.md', 'development.md', 'validation.md']) {
  await cp(resolve(root, 'docs', file), resolve(staging, 'docs', file));
}
execFileSync(process.execPath, [resolve(pluginRoot, 'scripts/package-smoke-test.mjs'), resolve(packagedPlugin, 'server.mjs')], { cwd: root, stdio: 'inherit' });
await writeFile(resolve(staging, 'README.txt'), `简历随行 ${pkg.version} 开发预览版

Codex：按 docs/getting-started.md 安装插件，或直接注册 plugins/resume-companion/server.mjs。
Chrome：默认连接当前已登录的 Chrome，无需安装扩展；首次连接时按 Chrome 提示点击 Allow。
回退：只有 DevTools 方式不可用时，才加载 extension-fallback 文件夹并开启本地桥接。

需要 Node.js 24 和 Chrome 144+。MCP 在本机管理多份简历，通过 Chrome DevTools 执行受限网页动作；最终申请提交由用户完成。
无需授予 ChatGPT 修改 macOS App 的权限。

发布包只包含程序和公开文档，不包含用户资料、密钥或内部调试记录。
`);
const notices = resolve(staging, '第三方许可');
await mkdir(notices, { recursive: true });
for (const dependency of ['react', 'react-dom', 'scheduler', 'zod']) {
  await cp(resolve(root, 'node_modules', dependency, 'LICENSE'), resolve(notices, `${dependency}.txt`));
}
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
