# Real controlled component tests

These fixtures run real Ant Design 4.24.16 / 5.14.0 and Element Plus 2.14.6 with pinned React/Vue dependencies. They are built separately and served only on a random localhost port. They are never packaged into the runtime plugin.

See [the validation report](REPORT.md) for measured results, methodology and remaining coverage limits.

The separate [SD structure report](SD-REPORT.md) covers the unreleased Moka-driven parser correction and its original synthetic regression; it is not part of the pinned Ant/Element success-rate sample.

From the repository root:

```sh
npm ci --prefix tests/real-controls
npm run test:controls:build
npm run build
npm run test:controls
npm run test:controls:contracts
npm run test:controls:benchmark
```

`run.mjs` supports `RC_CASES=D02,C02`, `RC_FAMILIES=ant5`, and `RC_REPEAT=5`. Each normal scenario is checked against the fixture's independent controlled value, not only the visible input. Negative scenarios must not report success. The browser executor cannot access `fixtureOracle`; only the harness uses it to assert results.

`--baseline` uses the sealed `artifacts/resume-companion-0.16.2/plugins/resume-companion` package. Keep its SHA-256 recorded in the implementation plan. An older package is expected to reject the new range/multiple schemas; compare shared case IDs separately.

`benchmark.mjs` defaults to 20 samples each for D02/C02/V01 in Ant 5. It measures a fresh document in an already running browser and a repeated same-value request with a new operation ID. The latter is skipped if the first request did not verify. Browser startup and navigation are excluded. Failures remain in the report. This is an executor benchmark, not an end-to-end model comparison.

Generated bundles and raw synthetic results are ignored. The committed source, lockfile, summary and commands are the reproducible evidence. Chrome profiles are temporary and isolated from the user's recruitment browser.
