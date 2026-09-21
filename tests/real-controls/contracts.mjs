import assert from 'node:assert/strict';
import { harness, dataOf } from './harness.mjs';
const browser = await harness();
let count = 0;
const call = async (name, args, options) =>
  dataOf(
    await browser.call(name, { page_id: browser.pageId, scope: '组件测试', ...args }, options),
  );
const oracle = () => browser.evalPage('() => window.fixtureOracle()');
const pass = (name) => {
  count++;
  console.log(`PASS ${name}`);
};
try {
  await browser.open('ant5');
  const first = await call('form_select_option', {
    field: '多选技能',
    values: ['TypeScript', 'Python'],
    operation_id: 'contract-multi-add',
  });
  assert.equal(first.status, 'verified_ui', JSON.stringify(first));
  const preserved = await call('form_select_option', {
    field: '多选技能',
    values: ['SQL'],
    selection_mode: 'replace',
  });
  assert.equal(preserved.status, 'preserved');
  assert.equal(preserved.verification.matched, false);
  const replace = await call('form_select_option', {
    field: '多选技能',
    values: ['SQL'],
    selection_mode: 'replace',
    overwrite: true,
  });
  assert.equal(replace.status, 'verified_ui', JSON.stringify(replace));
  assert.deepEqual((await oracle()).values['多选技能'], ['SQL']);
  pass('set addition, preservation and explicit replacement');
  const idempotent = await call('form_set_date', {
    field: '只读日期',
    value: '2024-06-15',
    operation_id: 'contract-same',
  });
  assert.equal(idempotent.ok, true);
  const before = (await oracle()).clicks;
  const repeat = await call('form_set_date', {
    field: '只读日期',
    value: '2024-06-15',
    operation_id: 'contract-same',
  });
  assert.deepEqual(repeat, idempotent);
  assert.equal((await oracle()).clicks, before);
  assert.equal(
    (
      await call('form_set_date', {
        field: '只读日期',
        value: '2024-07-15',
        operation_id: 'contract-same',
      })
    ).error.code,
    'operation_id_conflict',
  );
  pass('exact retry and parameter conflict');
  const keep = await call('form_set_date', { field: '只读日期', value: '2025-06-15' });
  assert.equal(keep.status, 'preserved');
  assert.equal((await oracle()).clicks, before);
  pass('existing value preserved without events');
  await browser.open('ant5');
  assert.equal(
    (
      await call('form_set_date', {
        field: '只读日期',
        value: '2024-06-15',
        operation_id: 'contract-same',
      })
    ).error.code,
    'operation_id_conflict',
  );
  pass('document epoch prevents cross-navigation replay');
  const amount = await call('form_fill_fields', {
    fields: [{ field: '普通金额', scope: '组件测试', value: '10000', overwrite: true }],
  });
  assert.equal(amount.ok, true);
  assert.equal((await oracle()).values['普通金额'], '10000');
  pass('numeric substring is not an unchanged value');
  const saved = await call('form_activate', { target: '保存', intent: 'save_record' });
  assert.equal(saved.result, 'action_dispatched');
  assert.equal(saved.persistence, 'unknown');
  assert.notEqual(saved.result, 'completed');
  pass('save dispatch does not claim persistence');
  const overview = await call('form_observe', { mode: 'overview' });
  const bad = await call('form_activate', { target: '不存在', intent: 'save_record' });
  assert.equal(bad.error.generation, overview.generation);
  assert.equal(bad.error.side_effects, 'none');
  pass('resolution failure leaves generation and events alone');
  await browser.open('ant5', 2500);
  const cancel = new AbortController();
  const pending = call(
    'form_select_path',
    { field: '异步地址', path: ['浙江省', '杭州市'], operation_id: 'cancel-active' },
    { signal: cancel.signal },
  ).catch((error) => ({ cancelled: true, message: error.message }));
  setTimeout(() => cancel.abort(), 850);
  await pending;
  await call('form_observe', { mode: 'overview' });
  const cancelledState = await oracle();
  await new Promise((r) => setTimeout(r, 2800));
  const settled = await oracle();
  assert.equal(settled.clicks, cancelledState.clicks);
  assert.equal(settled.values['异步地址'], undefined);
  pass('active cancellation leaves no delayed dispatch');
  await browser.open('ant5', 2500);
  const slow = call('form_select_path', { field: '异步地址', path: ['浙江省', '杭州市'] });
  const queuedController = new AbortController();
  const queued = call(
    'form_set_date',
    { field: '只读日期', value: '2024-06-15' },
    { signal: queuedController.signal },
  ).catch(() => null);
  setTimeout(() => queuedController.abort(), 100);
  await queued;
  assert.equal((await slow).ok, true);
  assert.equal((await oracle()).values['只读日期'], undefined);
  pass('queued cancellation never writes after acquiring the lock');
  assert.equal(
    await browser.evalPage(
      "() => window[Symbol.for('resume-companion.control-dom.v1')]?.watchers || 0",
    ),
    0,
  );
  pass('local observers are cleaned up');
  await browser.open('ant5');
  const prefix = await call('form_select_path', {
    field: '三层地址',
    path: ['北京市', '不存在'],
    operation_id: 'path-prefix',
  });
  assert.equal(prefix.ok, false);
  const opened = (await oracle()).triggers['三层地址'];
  const resumed = await call('form_select_path', {
    field: '三层地址',
    path: ['北京市', '市辖区', '海淀区'],
    operation_id: 'path-resume',
  });
  assert.equal(resumed.status, 'verified_ui', JSON.stringify(resumed));
  assert.equal((await oracle()).triggers['三层地址'], opened);
  pass('partial cascader resumes without reopening');
  await call('form_select_path', { field: '两层地址', path: ['省甲', '同名区'] });
  assert.equal(
    (await call('form_select_path', { field: '两层地址', path: ['省乙', '同名区'] })).status,
    'preserved',
  );
  assert.equal(
    (
      await call('form_select_path', {
        field: '两层地址',
        path: ['省乙', '同名区'],
        overwrite: true,
      })
    ).status,
    'verified_ui',
  );
  assert.deepEqual((await oracle()).values['两层地址'], ['b', 'bb']);
  pass('same leaf never substitutes for the requested parent');
  const precision = await call('form_set_date', { field: '入学月份', value: '2024-06-15' });
  assert.equal(precision.ok, false);
  assert.equal((await oracle()).values['入学月份'], undefined);
  pass('date precision mismatch does not select a partial value');
  await browser.open('ant5');
  await browser.evalPage(
    '() => {document.getElementById("输入日期").value="2024-06-15";return true}',
  );
  const ghost = await call('form_set_date', { field: '输入日期', value: '2024-06-15' });
  assert.equal(ghost.ok, false, JSON.stringify(ghost));
  assert.equal((await oracle()).values['输入日期'], undefined);
  pass('matching display alone is not accepted as a committed date');
  await browser.open('ant5');
  const dateCancel = new AbortController();
  const datePending = call(
    'form_set_date',
    { field: '只读日期', value: '2000-01-02', operation_id: 'date-interrupted' },
    { signal: dateCancel.signal },
  ).catch(() => null);
  setTimeout(() => dateCancel.abort(), 600);
  await datePending;
  await call('form_observe', { mode: 'overview' });
  const dateResume = await call('form_set_date', {
    field: '只读日期',
    value: '2000-01-02',
    operation_id: 'date-resume',
    overwrite: true,
  });
  assert.equal(dateResume.status, 'verified_ui', JSON.stringify(dateResume));
  assert.equal((await oracle()).values['只读日期'], '2000-01-02');
  pass('date resumes from an intermediate calendar panel');
  const generationBefore = await call('form_observe', { mode: 'overview' });
  await browser.open('ant5');
  const staleGeneration = await call('form_set_date', {
    field: '只读日期',
    value: '2024-06-15',
    expected_generation: generationBefore.generation,
  });
  assert.equal(staleGeneration.error.code, 'generation_conflict');
  assert.equal((await oracle()).values['只读日期'], undefined);
  pass('generation cannot be reused after same-URL document replacement');
  console.log(JSON.stringify({ contracts_passed: count }));
} finally {
  await browser.close();
}
