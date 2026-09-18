import { describe, expect, test, vi } from 'vitest';
import { OperationJournal } from '../src/browser/operation-journal.js';

describe('operation journal', () => {
  test('deduplicates an identical operation while preserving its first result', async () => {
    const journal = new OperationJournal();
    const job = vi.fn(async () => ({ operation_id: 'same', status: 'applied' }));
    const first = await journal.run('same', { value: 'one' }, job);
    const replay = await journal.run('same', { value: 'one' }, job);
    expect(replay).toEqual(first);
    expect(job).toHaveBeenCalledTimes(1);
  });

  test('rejects reuse of an operation id with different parameters', async () => {
    const journal = new OperationJournal();
    await journal.run('conflict', { value: 'one' }, async () => ({ operation_id: 'conflict', status: 'applied' }));
    await expect(journal.run('conflict', { value: 'two' }, async () => ({ operation_id: 'conflict', status: 'applied' })))
      .rejects.toMatchObject({ code: 'operation_conflict' });
  });

  test('marks prior writes as non-reversible after a save boundary', async () => {
    const journal = new OperationJournal();
    await journal.run('write', {}, async record => {
      record.changes.push({ ref: 'e1', before: '', written: 'value', reversible: true });
      return { operation_id: 'write', status: 'applied' };
    });
    journal.markBoundary();
    expect(journal.verify(['write'])[0]).toMatchObject({
      status: 'applied',
      values: [{ ref: 'e1', reversible: false }],
    });
  });
});
