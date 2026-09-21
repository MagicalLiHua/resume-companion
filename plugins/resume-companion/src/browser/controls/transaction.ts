export class ControlFailure extends Error {
  constructor(
    readonly code: string,
    readonly phase: string,
  ) {
    super(`${code}: phase=${phase}`);
  }
}
export class ControlTransaction {
  readonly signal: AbortSignal;
  readonly deadline: number;
  phase = 'resolve';
  dispatched = false;
  actions = 0;
  progress: string[] = [];
  wake: (() => Promise<void>) | undefined;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly abort = (): void =>
    this.controller.abort(new ControlFailure('operation_cancelled', this.phase));
  constructor(
    private readonly external?: AbortSignal,
    timeout = 30_000,
  ) {
    this.deadline = Date.now() + timeout;
    this.signal = this.controller.signal;
    if (external?.aborted) this.abort();
    external?.addEventListener('abort', this.abort, { once: true });
    this.timer = setTimeout(
      () => this.controller.abort(new ControlFailure('operation_timeout', this.phase)),
      timeout,
    );
  }
  check(phase = this.phase): void {
    this.phase = phase;
    if (this.signal.aborted) throw this.signal.reason;
    if (Date.now() >= this.deadline) throw new ControlFailure('operation_timeout', phase);
  }
  start(): void {
    this.check();
    if (++this.actions > 80) throw new ControlFailure('action_budget_exceeded', this.phase);
    this.dispatched = true;
  }
  async pause(ms = 60): Promise<void> {
    this.check();
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        this.signal.removeEventListener('abort', abort);
        resolve();
      };
      const timer = setTimeout(finish, Math.min(ms, this.deadline - Date.now()));
      const abort = (): void => {
        clearTimeout(timer);
        reject(this.signal.reason);
      };
      this.signal.addEventListener('abort', abort, { once: true });
    });
    this.check();
  }
  async wait<T>(
    read: () => Promise<T>,
    accept: (value: T) => boolean,
    phase: string,
    timeout = 5_000,
  ): Promise<T> {
    this.check(phase);
    const deadline = Math.min(this.deadline, Date.now() + timeout);
    do {
      this.check();
      try {
        const value = await read();
        if (accept(value)) return value;
      } catch (error) {
        if (!(error instanceof ControlFailure) || error.code !== 'target_unresolved') throw error;
        // A detached render is read again; no action is replayed by this wait.
      }
      if (this.wake) await this.wake();
      else await this.pause();
    } while (Date.now() < deadline);
    throw new ControlFailure('postcondition_timeout', phase);
  }
  close(): void {
    clearTimeout(this.timer);
    this.external?.removeEventListener('abort', this.abort);
  }
}

// Locator cancellation/timeout can unsubscribe from a still-running promise.
// Track commands on the owned ElementHandle instance and settle them before the
// lease is released. No upstream module or global prototype is modified.
export async function fencedLocatorAction(
  locator: any,
  signal: AbortSignal | undefined,
  action: (runner: any, options: { signal: AbortSignal }) => Promise<void>,
  onStart: () => void,
  handles: any[] = [],
): Promise<void> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const pending = new Set<Promise<unknown>>();
  const restore: Array<() => void> = [];
  let started = false;
  const cancel = (): void => controller.abort(signal?.reason);
  const dispatch = (): void => {
    try {
      signal?.throwIfAborted();
      if (started) throw new ControlFailure('action_result_unknown', 'action_retry');
      onStart();
      started = true;
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  };
  for (const handle of handles)
    for (const method of [
      'evaluate',
      'focus',
      'type',
      'click',
      'select',
      'hover',
      'press',
      'scrollIntoView',
    ]) {
      const original = handle[method];
      if (typeof original !== 'function') continue;
      const descriptor = Object.getOwnPropertyDescriptor(handle, method);
      Object.defineProperty(handle, method, {
        configurable: true,
        writable: true,
        value: function (...args: unknown[]) {
          let command: Promise<unknown>;
          try {
            command = Promise.resolve(original.apply(this, args));
          } catch (error) {
            if (started) controller.abort(error);
            throw error;
          }
          pending.add(command);
          void command.then(
            () => pending.delete(command),
            (error) => {
              pending.delete(command);
              if (started) controller.abort(error);
            },
          );
          return command;
        },
      });
      restore.push(() => {
        if (descriptor) Object.defineProperty(handle, method, descriptor);
        else delete handle[method];
      });
    }
  signal?.addEventListener('abort', cancel, { once: true });
  locator.on?.('action', dispatch);
  try {
    await action(locator, { signal: controller.signal });
    signal?.throwIfAborted();
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw error;
  } finally {
    // The locator is now completed or unsubscribed. Commands already dispatched
    // may still finish, but no new locator step is allowed to begin.
    while (pending.size) await Promise.allSettled([...pending]);
    locator.off?.('action', dispatch);
    signal?.removeEventListener('abort', cancel);
    for (const reset of restore.reverse()) reset();
  }
}
