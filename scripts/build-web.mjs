import { createHash } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'extension/public/manifest.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Invalid extension version');
const filename = `resume-companion-${manifest.version}.zip`;
const source = resolve(root, 'artifacts', filename);
const expected = (await readFile(`${source}.sha256`, 'utf8')).trim().split(/\s+/)[0];
const actual = createHash('sha256').update(await readFile(source)).digest('hex');
if (expected !== actual) throw new Error('Extension archive checksum mismatch; run npm run package to prepare a verified package.');
const bundled = JSON.parse(execFileSync('unzip', ['-p', source, `resume-companion-${manifest.version}/extension/manifest.json`], {encoding: 'utf8'}));
if (bundled.version !== manifest.version || bundled.key !== manifest.key) throw new Error('Extension archive identity mismatch');
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.web.config.ts'], {cwd: root, stdio: 'inherit'});
await mkdir(resolve(root, 'backend/web/downloads'), {recursive: true});
await cp(source, resolve(root, 'backend/web/downloads', filename));
console.log(`Bundled plugin download: ${filename} (${actual})`);
