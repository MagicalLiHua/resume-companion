import { defineConfig } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results/web-runs', globalSetup: './tests/setup.ts',
  testDir: './tests/web', timeout: 45000, workers: 1,
  reporter: [['list'], ['json', {outputFile: 'artifacts/web-browser-results.json'}]],
  use: {baseURL: 'http://127.0.0.1:4180', headless: true, launchOptions: {executablePath: process.env.RESUME_TEST_BROWSER}, trace: 'retain-on-failure'},
  webServer: [{command: 'backend/.venv/bin/python scripts/web-test-server.py', url: 'http://127.0.0.1:4180/healthz', reuseExistingServer: !process.env.CI}, {command: 'node scripts/lab-server.mjs', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI}],
});
