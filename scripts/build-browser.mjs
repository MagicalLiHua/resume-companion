import { build } from 'esbuild';
import { chmod, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const extensionDist = resolve(root, 'dist');
const nativeDist = resolve(root, 'native-host');
await rm(extensionDist, { recursive: true, force: true });
await mkdir(extensionDist, { recursive: true });
await cp(resolve(root, 'extension/public/manifest.json'), resolve(extensionDist, 'manifest.json'));
await cp(resolve(root, 'extension/public/popup.html'), resolve(extensionDist, 'popup.html'));
await cp(resolve(root, 'extension/public/popup.css'), resolve(extensionDist, 'popup.css'));
const browser = { bundle: true, minify: true, target: 'chrome116', sourcemap: false, logLevel: 'warning' };
await Promise.all([
  build({ ...browser, entryPoints: [resolve(root, 'extension/src/background/index.ts')], outfile: resolve(extensionDist, 'background.js'), format: 'esm' }),
  build({ ...browser, entryPoints: [resolve(root, 'extension/src/content/index.ts')], outfile: resolve(extensionDist, 'content.js'), format: 'iife' }),
  build({ ...browser, entryPoints: [resolve(root, 'extension/src/wake.ts')], outfile: resolve(extensionDist, 'wake.js'), format: 'iife' }),
  build({ ...browser, entryPoints: [resolve(root, 'extension/src/popup.ts')], outfile: resolve(extensionDist, 'popup.js'), format: 'iife' }),
  build({ entryPoints: [resolve(root, 'native-host/src/host.ts')], outfile: resolve(nativeDist, 'host.bundle.mjs'), bundle: true, platform: 'node', target: 'node24', format: 'esm', banner: { js: '#!/usr/bin/env node' }, logLevel: 'warning' }),
  build({ entryPoints: [resolve(root, 'native-host/src/install.ts')], outfile: resolve(nativeDist, 'install.bundle.mjs'), bundle: true, platform: 'node', target: 'node24', format: 'esm', banner: { js: '#!/usr/bin/env node' }, logLevel: 'warning' }),
]);
await chmod(resolve(nativeDist, 'host.bundle.mjs'), 0o700);
await chmod(resolve(nativeDist, 'install.bundle.mjs'), 0o700);
const assets = resolve(root, 'plugins/resume-companion/browser-assets');
await rm(assets, { recursive: true, force: true });
await mkdir(resolve(assets, 'native-host'), { recursive: true });
await cp(extensionDist, resolve(assets, 'extension'), { recursive: true });
await cp(resolve(nativeDist, 'host.bundle.mjs'), resolve(assets, 'native-host/host.bundle.mjs'));
await cp(resolve(nativeDist, 'install.bundle.mjs'), resolve(assets, 'native-host/install.bundle.mjs'));
const manifest = JSON.parse(await readFile(resolve(extensionDist, 'manifest.json'), 'utf8'));
console.log(`浏览器执行器 ${manifest.version} 与 Native Host 已生成`);
