import { build } from '../../plugins/resume-companion/node_modules/esbuild/lib/main.js';
import { mkdir, writeFile } from 'node:fs/promises';
const root = import.meta.dirname;
await mkdir(`${root}/dist`, { recursive: true });
for (const family of ['ant4', 'ant5', 'element', 'ud-contract', 'overwrite-contract', 'whole-resume', 'sd-resume', 'phoenix-resume', 'dayee-resume', 'job51-resume']) {
  await build({
    entryPoints: [`${root}/src/${family}.jsx`],
    bundle: true,
    format: 'iife',
    outfile: `${root}/dist/${family}.js`,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  await writeFile(`${root}/dist/${family}.css`, '', { flag: 'wx' }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  await writeFile(
    `${root}/dist/${family}.html`,
    `<!doctype html><html><meta charset="utf-8"><title>${family} controlled fixture</title><link rel="stylesheet" href="/${family}.css"><style>body{padding:24px;font:14px sans-serif} .row{padding:12px;margin:4px;max-width:620px}label{display:inline-block;min-width:160px} #root{max-width:900px}</style><body><div id="root"></div><script src="/${family}.js"></script></body></html>`,
  );
}
console.log('Built Ant 4/5, Element Plus, and React behavioral fixtures with captured UD shapes.');
