import { mkdir, writeFile } from 'node:fs/promises';
import { harness, dataOf, textOf } from './harness.mjs';
import { cases } from './cases.mjs';
const baseline = process.argv.includes('--baseline');
const repeat = Number(process.env.RC_REPEAT || 1);
const chosen = process.env.RC_CASES?.split(',');
const families = (process.env.RC_FAMILIES || 'ant4,ant5,element').split(',');
const results = [];
const browser = await harness({ baseline });
try {
  for (const family of families)
    for (const entry of cases.filter(
      (c) => (!chosen || chosen.includes(c.id)) && (!c.families || c.families.includes(family)),
    ))
      for (let run = 0; run < repeat; run++) {
        await browser.open(family, entry.delay);
        const args = {
          page_id: browser.pageId,
          field: entry.field,
          scope: '组件测试',
          ...(entry.args ?? (entry.path ? { path: entry.path } : { value: entry.value })),
          ...(entry.overwrite ? { overwrite: true } : {}),
          test_mode: true,
          operation_id: `${family}-${entry.id}-${run}`,
        };
        const start = performance.now();
        const result = await browser.call(entry.tool, args);
        let data;
        try {
          data = dataOf(result);
        } catch {
          data = { error: textOf(result) };
        }
        const elapsed = Math.round(performance.now() - start);
        const oracle = await browser.evalPage('() => window.fixtureOracle()');
        const actual = oracle.values[entry.field];
        const matched =
          JSON.stringify(actual) === JSON.stringify(entry.expected) &&
          Object.entries(entry.extraExpected || {}).every(
            ([key, value]) => JSON.stringify(oracle.values[key]) === JSON.stringify(value),
          );
        const reported = Boolean(data.ok);
        const passed = entry.blocked
          ? !reported &&
            Object.entries(entry.unchanged || {}).every(
              ([key, value]) => JSON.stringify(oracle.values[key]) === JSON.stringify(value),
            )
          : reported && matched;
        const falseSuccess =
          (!entry.blocked && reported && !matched) || Boolean(entry.blocked && reported);
        results.push({
          family,
          id: entry.id,
          run,
          passed,
          falseSuccess,
          elapsed_ms: elapsed,
          response_bytes: Buffer.byteLength(JSON.stringify(result)),
          text_response_bytes: Buffer.byteLength(textOf(result)),
          actual: actual ?? null,
          result: data,
        });
        console.log(
          `${passed ? 'PASS' : 'FAIL'} ${family}/${entry.id} ${elapsed}ms ${data.status || data.error?.code || ''}`,
        );
      }
} finally {
  await browser.close();
}
await mkdir(`${import.meta.dirname}/results`, { recursive: true });
const filename = `${import.meta.dirname}/results/${baseline ? 'baseline' : 'current'}-${Date.now()}.json`;
await writeFile(filename, JSON.stringify({ baseline, repeat, results }, null, 2));
console.log(
  JSON.stringify({
    report: filename,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    false_success: results.filter((r) => r.falseSuccess).length,
  }),
);
if (!baseline && results.some((r) => !r.passed)) process.exitCode = 1;
