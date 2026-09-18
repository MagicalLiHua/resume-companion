import { build } from 'esbuild';
export default async function setup() {
  await build({ entryPoints: ['tests/browser-entry.ts'], outfile: 'test-results/test-engine.js', bundle: true, format: 'iife', target: 'chrome116' });
}
