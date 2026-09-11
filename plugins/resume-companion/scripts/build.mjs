import { build } from 'esbuild';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

await build({
  entryPoints: [resolve(root, 'server.mjs')],
  outfile: resolve(root, 'server.bundle.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

console.log('Self-contained MCP server generated: server.bundle.mjs');
