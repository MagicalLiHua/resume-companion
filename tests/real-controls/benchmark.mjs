import { mkdir, writeFile } from 'node:fs/promises';
import { harness, dataOf, textOf } from './harness.mjs';
import { cases } from './cases.mjs';
const baseline = process.argv.includes('--baseline');
const repeats = Number(process.env.RC_BENCH_RUNS || 20);
const family = process.env.RC_BENCH_FAMILY || 'ant5';
const selected = cases.filter((c) =>
  (process.env.RC_BENCH_CASES || 'D02,C02,V01').split(',').includes(c.id),
);
const browser = await harness({ baseline });
const results = [];
try {
  for (const item of selected)
    for (let i = 0; i < repeats; i++) {
      await browser.open(family, item.delay || 0);
      for (const mode of ['fresh_page', 'repeat_same_value']) {
        const args = {
          page_id: browser.pageId,
          field: item.field,
          scope: '组件测试',
          ...(item.path ? { path: item.path } : { value: item.value }),
          operation_id: `bench-${item.id}-${i}-${mode}`,
        };
        const start = performance.now();
        const result = await browser.call(item.tool, args);
        const elapsed = Math.round(performance.now() - start);
        let data;
        try {
          data = dataOf(result);
        } catch {
          data = { error: textOf(result) };
        }
        const oracle = await browser.evalPage('() => window.fixtureOracle()');
        const passed =
          Boolean(data.ok) &&
          JSON.stringify(oracle.values[item.field]) === JSON.stringify(item.expected);
        results.push({
          id: item.id,
          family,
          run: i,
          mode,
          passed,
          false_success: Boolean(data.ok) && !passed,
          elapsed_ms: elapsed,
          response_bytes: Buffer.byteLength(JSON.stringify(result)),
          text_response_bytes: Buffer.byteLength(textOf(result)),
          status: data.status || data.error?.code || 'unknown',
        });
        console.log(
          `${passed ? 'PASS' : 'FAIL'} ${family}/${item.id} ${i + 1}/${repeats} ${mode} ${elapsed}ms`,
        );
        if (mode === 'fresh_page' && !passed) {
          results.push({
            id: item.id,
            family,
            run: i,
            mode: 'repeat_same_value',
            skipped: 'fresh_page_did_not_verify',
          });
          break;
        }
      }
    }
} finally {
  await browser.close();
}
const summary = [];
for (const item of selected)
  for (const mode of ['fresh_page', 'repeat_same_value']) {
    const group = results.filter((r) => r.id === item.id && r.mode === mode);
    const samples = group.filter((r) => !r.skipped);
    const times = samples.map((r) => r.elapsed_ms).sort((a, b) => a - b);
    const quantile = (p) =>
      times.length ? times[Math.max(0, Math.ceil(times.length * p) - 1)] : null;
    summary.push({
      id: item.id,
      family,
      mode,
      samples: samples.length,
      skipped: group.length - samples.length,
      passed: samples.filter((r) => r.passed).length,
      false_success: samples.filter((r) => r.false_success).length,
      p50_ms: quantile(0.5),
      p95_ms: quantile(0.95),
      max_response_bytes: samples.length ? Math.max(...samples.map((r) => r.response_bytes)) : null,
    });
  }
await mkdir(`${import.meta.dirname}/results`, { recursive: true });
const file = `${import.meta.dirname}/results/benchmark-${baseline ? 'baseline' : 'current'}-${Date.now()}.json`;
await writeFile(
  file,
  JSON.stringify(
    {
      baseline,
      repeats,
      definition: {
        fresh_page: 'fresh document in a running browser; excludes navigation and browser startup',
        repeat_same_value: 'same verified value in the same document; no transport cache replay',
      },
      summary,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ report: file, summary }, null, 2));
if (!baseline && results.some((r) => !r.skipped && !r.passed)) process.exitCode = 1;
