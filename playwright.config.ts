import { defineConfig } from '@playwright/test';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
// Reuse an installed Chrome for Testing when the exact Playwright download is absent.
if(!process.env.RESUME_TEST_BROWSER&&process.platform==='darwin'){
  const cache=join(homedir(),'Library/Caches/ms-playwright');
  if(existsSync(cache))for(const folder of readdirSync(cache).filter(n=>/^chromium-\d+$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))){
    const executable=join(cache,folder,'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');if(existsSync(executable)){process.env.RESUME_TEST_BROWSER=executable;break;}
  }
}
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4174', headless: true, launchOptions: { executablePath: process.env.RESUME_TEST_BROWSER }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/lab-server.mjs', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
  globalSetup: './tests/setup.ts',
});
