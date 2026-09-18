import { build } from 'esbuild';
export default async function setup() {
  await build({ entryPoints: ['tests/browser-entry.ts'], outfile: 'test-results/test-engine.js', bundle: true, format: 'iife', target: 'chrome116' });
  await build({entryPoints:['tests/fixtures/agent-controlled.tsx'],outfile:'test-results/agent-controlled.js',bundle:true,format:'iife',target:'chrome116'});
  await build({ entryPoints: ['tests/fixtures/controlled.tsx'], outfile: 'test-results/controlled.js', bundle: true, format: 'iife', target: 'chrome116' });
}
