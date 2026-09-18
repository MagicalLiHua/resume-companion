import { readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
let child;
let pending = false;
let stopping = false;
let polling = false;
let fingerprint;

function rebuild() {
  if (stopping) return;
  if (child) { pending = true; return; }
  pending = false;
  console.log('\n正在构建开发版扩展…');
  child = spawn(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
  child.once('error', error => console.error(`无法启动构建：${error.message}`));
  child.once('close', code => {
    child = undefined;
    if (stopping) return;
    if (code === 0) console.log('构建完成。请在 chrome://extensions 重新加载简历随行；处理未保存内容后刷新测试网页。');
    else console.error('构建失败，请先修复错误；暂勿重新加载扩展。');
    if (pending) rebuild();
  });
}

async function sourceFingerprint() {
  const entries = await readdir(join(root, 'extension'), { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
  files.push(join(root, 'vite.config.ts'), join(root, 'scripts/build.mjs'));
  return (await Promise.all(files.sort().map(async file => {
    const info = await stat(file);
    return `${file}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }))).join('\n');
}

// Poll a small source tree to avoid macOS file-watcher limits in sandboxed runs.
fingerprint = await sourceFingerprint();
const timer = setInterval(async () => {
  if (polling || stopping) return;
  polling = true;
  try {
    const next = await sourceFingerprint();
    if (next !== fingerprint) { fingerprint = next; rebuild(); }
  } catch (error) {
    // Editors may briefly rename a file while saving; retry on the next tick.
    if (error.code !== 'ENOENT') console.error(`检查源码失败：${error.message}`);
  } finally { polling = false; }
}, 1000);

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  if (child) {
    child.once('close', () => process.exit(code));
    child.kill('SIGTERM');
  } else process.exit(code);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('监听 extension/ 源码变更。开发版加载目录：dist/。按 Ctrl+C 停止。');
rebuild();
