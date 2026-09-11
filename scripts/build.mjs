import { build as buildPages } from 'vite';
import { build } from 'esbuild';
import {readFile} from 'node:fs/promises';
await buildPages({ configFile: 'vite.config.ts' });
const manifest=JSON.parse(await readFile('extension/public/manifest.json','utf8'));
await build({ entryPoints: ['extension/src/background/index.ts'], outfile: `dist/${manifest.background.service_worker}`, bundle: true, format: 'esm', target: 'chrome116' });
await build({ entryPoints: ['extension/src/content/index.ts'], outfile: 'dist/content.js', bundle: true, format: 'iife', target: 'chrome116' });
console.log('可加载扩展已生成：dist/');
