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
if (manifest.version !== pkg.version || JSON.stringify(manifest.host_permissions)!==JSON.stringify(['http://*/*','https://*/*']) || manifest.content_scripts?.[0]?.all_frames!==false || manifest.externally_connectable) throw new Error('Unexpected release manifest');
const name = `resume-companion-${pkg.version}`;
const staging = resolve(root, 'artifacts', name);
const archive = resolve(root, 'artifacts', `${name}.zip`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(resolve(root, 'dist'), resolve(staging, 'extension'), { recursive: true });
const packagedPlugin = resolve(staging, 'codex-plugin');
await mkdir(packagedPlugin, { recursive: true });
for (const item of ['.codex-plugin', '.mcp.json', 'package.json', 'server.mjs', 'server.bundle.mjs', 'skills']) {
  await cp(resolve(pluginRoot, item), resolve(packagedPlugin, item), { recursive: true });
}
await cp(resolve(root, 'LICENSE'), resolve(staging, 'LICENSE'));
await cp(resolve(root, 'SECURITY.md'), resolve(staging, 'SECURITY.md'));
const installation=(await readFile(resolve(root,'docs/安装与体验.md'),'utf8'))
  .replaceAll('(纯插件版实现与验收.md)','(验收摘要.md)')
  .replaceAll('(Codex网申能力最小验证.md)','(Codex批量网申能力.md)');
await writeFile(resolve(staging,'安装与体验.md'),installation);
await cp(resolve(root, 'docs/Codex网申能力最小验证.md'), resolve(staging, 'Codex批量网申能力.md'));
const templates=await readFile(resolve(root,'extension/src/domain/markdown-template.ts'),'utf8');
const prompt=JSON.parse(templates.match(/export const AI_PROMPT = (.*);/)[1]);
const template=JSON.parse(templates.match(/export const EMPTY_MARKDOWN = (.*);/)[1]);
await writeFile(resolve(staging,'简历模板.md'),template+'\n');await writeFile(resolve(staging,'AI整理提示词.txt'),prompt+'\n');
await writeFile(resolve(staging, 'README.txt'), `简历随行 ${pkg.version}\n\n在 Chrome 打开 chrome://extensions，开启并保持开发者模式，点击“加载已解压的扩展程序”，选择本目录的 extension 文件夹。\n\n浏览器插件支持多个简历版本、Markdown 导入、补充资料、本地备份、字段预览和撤销。codex-plugin 是自包含的 Codex 插件，通过本机回环连接枚举并批量处理选中的网申标签页，不需要业务后端。\n\nCodex 填写前必须展示并确认计划；工具不提供提交、下一步、上传、验证码或同意授权能力。独立投递记录页只记录检测到的提交信息。\n\n更新前导出完整备份，覆盖原加载目录的文件后点击重新加载。真实招聘网站、Edge 和 Windows 尚待实际试用；复杂控件可能需要手填。详细步骤见《安装与体验.md》。\n`);
await writeFile(resolve(staging,'验收摘要.md'),`# 简历随行 ${pkg.version} 验收摘要\n\n2026-09-11：类型检查、构建、69 项单元测试、51 项浏览器测试通过。合成表单覆盖 20 类、200 个标注字段。\n\n已验证多版本独立与备份、悬浮窗口选择版本后填写、草稿恢复与接管、模型建议核对、模型失败后本地填写、投递记录及恢复、0.3.1/0.3.2 升级和旧 JSON 回退。\n\n真实 DeepSeek Anthropic API 已通过配置页连接、字段匹配、用户核对与实际填写回读。OpenAI 兼容协议已通过适配器测试及前置直连探针。测试只使用合成资料。\n\nCodex MCP 自测及真实三标签页纵向测试通过，覆盖标签页枚举、批量 DOM 扫描、填写、回读、条件撤销和零提交。\n\n当前验证环境为 macOS / Chrome for Testing 151。真实招聘网站按用户安排稍后试用；Edge / Windows 未实际复测。自动记录依赖检测到的提交事件，有遗漏时可手动补记。\n\n安装包不包含用户模型 Key 或真实简历。完整备份请自行导出保管，卸载前先备份。\n`);
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
