import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
};

await build({
  ...common,
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'server.bundle.mjs'),
});

await build({
  ...common,
  entryPoints: [resolve(root, 'src/chrome-launcher.ts')],
  outfile: resolve(root, 'chrome-launcher.bundle.mjs'),
});

const runtimeRoot = resolve(root, 'runtime');
await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });
await cp(resolve(root, 'node_modules/chrome-devtools-mcp'), resolve(runtimeRoot, 'chrome-devtools-mcp'), { recursive: true });

console.log('Profile MCP, Resume Browser MCP and pinned Chrome DevTools MCP runtime generated.');
