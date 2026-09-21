import { describe, expect, test } from 'vitest';
import {
  parseCalendarValue,
  readCalendarText,
  sameValue,
  samePath,
  sameSet,
  datePartNumber,
} from '../src/browser/controls/verify.js';
import { ControlTransaction } from '../src/browser/controls/transaction.js';
describe('strict control verification', () => {
  test('never treats substrings or different address parents as equal', () => {
    expect(sameValue('1000', '10000')).toBe(false);
    expect(sameValue('男', '女')).toBe(false);
    expect(samePath(['省甲', '同名区'], ['省乙', '同名区'])).toBe(false);
    expect(samePath(['北京市', '海淀区'], ['北京市', '市辖区', '海淀区'])).toBe(false);
    expect(sameSet(['Python', 'SQL'], ['SQL', 'Python'])).toBe(true);
    expect(sameSet(['Python', 'Python'], ['Python', 'SQL'])).toBe(false);
  });
  test('keeps month precision and rejects impossible Gregorian dates', () => {
    expect(parseCalendarValue('2024-06')?.precision).toBe('month');
    expect(parseCalendarValue('2024-02-29')?.iso).toBe('2024-02-29');
    expect(parseCalendarValue('2023-02-29')).toBeNull();
    expect(parseCalendarValue('2024-04-31')).toBeNull();
    expect(parseCalendarValue('2024-13')).toBeNull();
    expect(readCalendarText('2024年06月15日')).toBe('2024-06-15');
    expect(readCalendarText('2024/6')).toBe('2024-06');
    expect(readCalendarText('06/07/2024')).toBeNull();
  });
  test('normalizes only explicit year/month choices', () => {
    expect(datePartNumber('06月', 'month')).toBe(6);
    expect(datePartNumber('2024年', 'year')).toBe(2024);
    expect(datePartNumber('13月', 'month')).toBeNull();
    expect(datePartNumber('6至7月', 'month')).toBeNull();
    expect(datePartNumber('2024年', 'month')).toBeNull();
    expect(datePartNumber('6 months', 'month')).toBeNull();
  });
});
describe('bounded control transaction', () => {
  test('cancellation stops an active wait and prohibits further dispatch', async () => {
    const controller = new AbortController();
    const tx = new ControlTransaction(controller.signal, 1000);
    try {
      const pending = tx.wait(async () => false, Boolean, 'loading');
      controller.abort();
      await expect(pending).rejects.toThrow('operation_cancelled');
      expect(() => tx.start()).toThrow('operation_cancelled');
      expect(tx.dispatched).toBe(false);
    } finally {
      tx.close();
    }
  });
  test('one total budget bounds all phases', async () => {
    const tx = new ControlTransaction(undefined, 30);
    try {
      await expect(tx.wait(async () => false, Boolean, 'loading', 5000)).rejects.toThrow(
        'operation_timeout',
      );
      expect(tx.actions).toBe(0);
    } finally {
      tx.close();
    }
  });
});

describe('locator cancellation fence', () => {
  test('waits for an in-flight command before reporting cancellation', async () => {
    const { EventEmitter } = await import('node:events');
    const { fencedLocatorAction } = await import('../src/browser/controls/transaction.js');
    const events = Object.assign(new EventEmitter(), {
      timeout: 10,
      setTimeout(_ms: number) {
        return this;
      },
    });
    const controller = new AbortController();
    let finish!: () => void;
    let settled = false;
    const inFlight = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const pending = fencedLocatorAction(
      events,
      controller.signal,
      async (runner) => {
        runner.emit('action');
        await inFlight;
      },
      () => {},
    ).finally(() => {
      settled = true;
    });
    const outcome = pending.catch((error) => error);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);
    finish();
    expect(await outcome).toBe(controller.signal.reason);
    expect(events.listenerCount('action')).toBe(0);
  });
  test('cancels readiness before any action starts', async () => {
    const { EventEmitter } = await import('node:events');
    const { fencedLocatorAction } = await import('../src/browser/controls/transaction.js');
    const events = Object.assign(new EventEmitter(), {
      timeout: 100,
      setTimeout(_ms: number) {
        return this;
      },
    });
    const controller = new AbortController();
    let dispatched = false;
    const pending = fencedLocatorAction(
      events,
      controller.signal,
      async (_runner, options) =>
        new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        }),
      () => {
        dispatched = true;
      },
    );
    controller.abort();
    await expect(pending).rejects.toBe(controller.signal.reason);
    expect(dispatched).toBe(false);
  });
});

test('an unsubscribed locator still settles its owned handle command', async () => {
  const { EventEmitter } = await import('node:events');
  const { fencedLocatorAction } = await import('../src/browser/controls/transaction.js');
  const locator = new EventEmitter();
  const controller = new AbortController();
  let finish!: () => void;
  let settled = false;
  const original = async () =>
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  const handle = { click: original };
  const result = fencedLocatorAction(
    locator,
    controller.signal,
    async (runner, { signal }) => {
      runner.emit('action');
      await Promise.race([
        handle.click(),
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
      ]);
    },
    () => {},
    [handle],
  )
    .finally(() => {
      settled = true;
    })
    .catch((error) => error);
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(settled).toBe(false);
  finish();
  expect(await result).toBe(controller.signal.reason);
  expect(handle.click).toBe(original);
});

test('a locator timeout does not release an unfinished browser command', async () => {
  const { EventEmitter } = await import('node:events');
  const { fencedLocatorAction } = await import('../src/browser/controls/transaction.js');
  const locator = new EventEmitter();
  let finish!: () => void;
  let settled = false;
  const timeout = new Error('locator timeout');
  const handle = {
    click: async () =>
      await new Promise<void>((resolve) => {
        finish = resolve;
      }),
  };
  const result = fencedLocatorAction(
    locator,
    undefined,
    async (runner) => {
      runner.emit('action');
      await Promise.race([
        handle.click(),
        new Promise<void>((_resolve, reject) => setTimeout(() => reject(timeout), 10)),
      ]);
    },
    () => {},
    [handle],
  )
    .finally(() => {
      settled = true;
    })
    .catch((error) => error);
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(settled).toBe(false);
  finish();
  expect(await result).toBe(timeout);
});
