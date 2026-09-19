type Scalar = string | number | boolean | null | undefined;

export interface AccessibilityNodeLike {
  id?: string;
  role?: Scalar;
  name?: Scalar;
  value?: Scalar;
  description?: Scalar;
  placeholder?: Scalar;
  keyshortcuts?: Scalar;
  roledescription?: Scalar;
  readonly?: Scalar;
  required?: Scalar;
  disabled?: Scalar;
  children?: AccessibilityNodeLike[];
  elementHandle?: () => Promise<unknown | null>;
}

interface TextSnapshotLike {
  root: AccessibilityNodeLike;
  idToNode: Map<string, AccessibilityNodeLike>;
}

interface McpPageLike {
  id?: number;
  textSnapshot?: TextSnapshotLike;
  pptrPage: {
    accessibility: {
      snapshot(options: { includeIframes: boolean; interestingOnly: boolean }): Promise<AccessibilityNodeLike | null>;
    };
  };
}

interface McpPageConstructorLike {
  prototype: {
    getElementByUid(uid: string): Promise<unknown>;
    [installedSymbol]?: boolean;
  };
}

interface NodePath {
  node: AccessibilityNodeLike;
  ancestors: AccessibilityNodeLike[];
}

interface DebuggableHandle {
  evaluate?<T>(callback: (element: Element, ...args: never[]) => T, ...args: unknown[]): Promise<T>;
  asLocator?: () => LocatorLike;
  [Symbol.dispose]?: () => void;
}

interface LocatorLike {
  click?(options?: unknown): Promise<unknown>;
  fill?(value: unknown, options?: unknown): Promise<unknown>;
  hover?(options?: unknown): Promise<unknown>;
  on?(event: string, listener: () => void): unknown;
  off?(event: string, listener: () => void): unknown;
  [key: string]: unknown;
}

interface LocatorTransform {
  method: string;
  args: unknown[];
}

interface ResilientHandleState {
  page: McpPageLike;
  uid: string;
  expected: NodePath;
  current: DebuggableHandle;
  handles: Set<DebuggableHandle>;
  readRecoveryUsed: boolean;
  actionRecoveryUsed: boolean;
}

const installedSymbol = Symbol.for('resume-companion.stale-uid-recovery');
const comparableKeys = [
  'description',
  'placeholder',
  'keyshortcuts',
  'roledescription',
  'readonly',
  'required',
  'disabled',
] as const;

export type SemanticResolution =
  | { kind: 'resolved'; path: NodePath }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; candidateCount: number };

function normalized(value: Scalar): string {
  return value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function collectPaths(root: AccessibilityNodeLike): NodePath[] {
  const paths: NodePath[] = [];
  const visit = (node: AccessibilityNodeLike, ancestors: AccessibilityNodeLike[]): void => {
    paths.push({ node, ancestors });
    for (const child of node.children ?? []) visit(child, [...ancestors, node]);
  };
  visit(root, []);
  return paths;
}

function pathForUid(root: AccessibilityNodeLike, uid: string): NodePath | undefined {
  return collectPaths(root).find(path => path.node.id === uid);
}

function namedAncestors(path: NodePath): Array<{ role: string; name: string }> {
  return path.ancestors
    .map(node => ({ role: normalized(node.role), name: normalized(node.name) }))
    .filter(item => item.name.length > 0)
    .slice(-6)
    .reverse();
}

function contextualScore(expected: NodePath, candidate: NodePath): number {
  let score = 0;
  for (const key of comparableKeys) {
    const left = normalized(expected.node[key]);
    const right = normalized(candidate.node[key]);
    if (left && left === right) score += 3;
  }

  const expectedAncestors = namedAncestors(expected);
  const candidateAncestors = namedAncestors(candidate);
  for (let index = 0; index < expectedAncestors.length; index++) {
    const expectedAncestor = expectedAncestors[index];
    if (!expectedAncestor) continue;
    const matchingIndex = candidateAncestors.findIndex(candidateAncestor =>
      candidateAncestor.role === expectedAncestor.role && candidateAncestor.name === expectedAncestor.name,
    );
    if (matchingIndex === -1) continue;
    score += Math.max(2, 14 - index * 2 - matchingIndex);
  }
  return score;
}

export function resolveSemanticReplacement(expected: NodePath, currentRoot: AccessibilityNodeLike): SemanticResolution {
  const role = normalized(expected.node.role);
  const name = normalized(expected.node.name);
  const candidates = collectPaths(currentRoot).filter(path =>
    normalized(path.node.role) === role && normalized(path.node.name) === name,
  );
  if (candidates.length === 0) return { kind: 'missing' };
  if (candidates.length === 1) return { kind: 'resolved', path: candidates[0]! };

  const ranked = candidates
    .map(path => ({ path, score: contextualScore(expected, path) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (best && runnerUp && best.score >= 8 && best.score - runnerUp.score >= 4) {
    return { kind: 'resolved', path: best.path };
  }
  return { kind: 'ambiguous', candidateCount: candidates.length };
}

function isDetachedUidError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('no longer exists on the page');
}

function isDetachedHandleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('detached')
    || message.includes('no longer exists')
    || message.includes('could not find object with given id')
    || message.includes('js handle is disposed');
}

async function handleConnectionState(handle: unknown): Promise<'connected' | 'detached' | 'unknown'> {
  const debuggable = handle as DebuggableHandle;
  if (!debuggable.evaluate) return 'connected';
  try {
    return await debuggable.evaluate(element => element.isConnected) ? 'connected' : 'detached';
  } catch (error) {
    return isDetachedHandleError(error) ? 'detached' : 'unknown';
  }
}

async function recoverHandle(page: McpPageLike, uid: string, expected: NodePath): Promise<unknown> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const currentRoot = await page.pptrPage.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: true,
    });
    if (!currentRoot) continue;
    const resolution = resolveSemanticReplacement(expected, currentRoot);
    if (resolution.kind === 'ambiguous') {
      throw new Error(
        `stale_uid_ambiguous: Element uid ${uid} was replaced and ${resolution.candidateCount} current elements share its semantics. Take a fresh snapshot and narrow the control before retrying.`,
      );
    }
    if (resolution.kind === 'missing') continue;
    page.textSnapshot?.idToNode.set(uid, resolution.path.node);
    const handle = await resolution.path.node.elementHandle?.();
    if (handle) {
      console.error(`[resume-companion] stale_uid_recovered uid=${uid} attempt=${attempt}`);
      if (process.env.RESUME_COMPANION_DEBUG_STALE_UID === '1') {
        const debugHandle = handle as DebuggableHandle;
        const state = await debugHandle.evaluate?.(element => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            connected: element.isConnected,
            disabled: element instanceof HTMLInputElement || element instanceof HTMLButtonElement ? element.disabled : false,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
        console.error(`[resume-companion] stale_uid_debug ${JSON.stringify(state)}`);
      }
      return handle;
    }
  }
  throw new Error(
    `stale_uid_unresolved: Element uid ${uid} was replaced and no unique current semantic match could be focused. Take a fresh snapshot and inspect the current control.`,
  );
}

function locatorFrom(handle: DebuggableHandle, transforms: LocatorTransform[]): LocatorLike {
  if (!handle.asLocator) throw new Error('stale_action_incompatible: Element handle does not expose a locator');
  let locator = handle.asLocator();
  for (const transform of transforms) {
    const method = locator[transform.method];
    if (typeof method !== 'function') {
      throw new Error(`stale_action_incompatible: Locator method ${transform.method} is unavailable`);
    }
    locator = Reflect.apply(method, locator, transform.args) as LocatorLike;
  }
  return locator;
}

async function intendedValueIsPresent(handle: DebuggableHandle, expected: unknown): Promise<boolean> {
  if (!handle.evaluate) return false;
  try {
    return await handle.evaluate((element, rawExpected) => {
      const expectedText = String(rawExpected);
      const expectedBoolean = rawExpected === true || rawExpected === 'true';
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
        return element.checked === expectedBoolean;
      }
      const role = element.getAttribute('role');
      if (role === 'checkbox' || role === 'radio' || role === 'switch') {
        return element.getAttribute('aria-checked') === String(expectedBoolean);
      }
      if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value === expectedText;
      }
      if (element instanceof HTMLElement && element.isContentEditable) return element.innerText === expectedText;
      return false;
    }, expected);
  } catch {
    return false;
  }
}

function observeLocatorAction(locator: LocatorLike): { didStart: () => boolean; stop: () => void } {
  let started = false;
  const listener = (): void => { started = true; };
  locator.on?.('action', listener);
  return {
    didStart: () => started,
    stop: () => { locator.off?.('action', listener); },
  };
}

async function replaceCurrentHandle(state: ResilientHandleState): Promise<DebuggableHandle> {
  const recovered = await recoverHandle(state.page, state.uid, state.expected) as DebuggableHandle;
  state.current = recovered;
  state.handles.add(recovered);
  return recovered;
}

async function replaceWithSettledHandle(state: ResilientHandleState, timeoutMs = 600): Promise<DebuggableHandle> {
  const deadline = Date.now() + timeoutMs;
  let recovered = await replaceCurrentHandle(state);
  while (Date.now() < deadline) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
    if (state.current === recovered && await handleConnectionState(recovered) !== 'detached') return recovered;
    recovered = await replaceCurrentHandle(state);
  }
  return recovered;
}

async function runLocatorAction(
  state: ResilientHandleState,
  transforms: LocatorTransform[],
  action: 'click' | 'fill' | 'hover',
  args: unknown[],
): Promise<unknown> {
  const attemptedHandle = state.current;
  const initialLocator = locatorFrom(attemptedHandle, transforms);
  const initialMethod = initialLocator[action];
  if (typeof initialMethod !== 'function') throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
  const observation = observeLocatorAction(initialLocator);
  try {
    const result = await Reflect.apply(initialMethod, initialLocator, args);
    if (action !== 'fill' || await handleConnectionState(attemptedHandle) !== 'detached' && await intendedValueIsPresent(attemptedHandle, args[0])) {
      return result;
    }
    if (state.actionRecoveryUsed) {
      throw new Error(`stale_action_retry_exhausted: Element uid ${state.uid} lost the filled value after recovery. Take a fresh snapshot before retrying.`);
    }
    state.actionRecoveryUsed = true;
    const recovered = await replaceWithSettledHandle(state);
    if (await intendedValueIsPresent(recovered, args[0])) return result;
    console.error(`[resume-companion] stale_action_postcheck_retry uid=${state.uid} action=fill`);
    let retryLocator = locatorFrom(recovered, transforms);
    if (typeof retryLocator.setWaitForStableBoundingBox === 'function') {
      retryLocator = Reflect.apply(retryLocator.setWaitForStableBoundingBox, retryLocator, [false]) as LocatorLike;
    }
    const retryMethod = retryLocator.fill;
    if (typeof retryMethod !== 'function') throw new Error('stale_action_incompatible: Locator action fill is unavailable');
    const retryResult = await Reflect.apply(retryMethod, retryLocator, args);
    const verified = await handleConnectionState(recovered) === 'detached' ? await replaceWithSettledHandle(state) : recovered;
    if (!await intendedValueIsPresent(verified, args[0])) {
      throw new Error(`stale_action_retry_exhausted: Element uid ${state.uid} did not retain the filled value after one semantic recovery. Take a fresh snapshot before retrying.`);
    }
    return retryResult;
  } catch (originalError) {
    if (await handleConnectionState(attemptedHandle) !== 'detached') throw originalError;
    if (state.actionRecoveryUsed) {
      throw new Error(
        `stale_action_retry_exhausted: Element uid ${state.uid} was replaced again during ${action}. Take a fresh snapshot before retrying.`,
        { cause: originalError },
      );
    }
    state.actionRecoveryUsed = true;
    const actionStarted = observation.didStart();
    const recovered = action === 'fill' ? await replaceWithSettledHandle(state) : await replaceCurrentHandle(state);

    if (action === 'fill' && await intendedValueIsPresent(recovered, args[0])) {
      console.error(`[resume-companion] stale_action_already_applied uid=${state.uid} action=fill`);
      return undefined;
    }
    if (action === 'click' && actionStarted) {
      throw new Error(
        `stale_action_result_unknown: Element uid ${state.uid} was replaced after the click began. Take a fresh snapshot and verify the page before retrying.`,
        { cause: originalError },
      );
    }

    console.error(`[resume-companion] stale_action_retry uid=${state.uid} action=${action}`);
    let retryLocator = locatorFrom(recovered, transforms);
    if (typeof retryLocator.setWaitForStableBoundingBox === 'function') {
      retryLocator = Reflect.apply(retryLocator.setWaitForStableBoundingBox, retryLocator, [false]) as LocatorLike;
    }
    const retryMethod = retryLocator[action];
    if (typeof retryMethod !== 'function') throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
    const retryObservation = observeLocatorAction(retryLocator);
    try {
      return await Reflect.apply(retryMethod, retryLocator, args);
    } catch (retryError) {
      const uncertain = action === 'click' && retryObservation.didStart();
      throw new Error(
        uncertain
          ? `stale_action_result_unknown: Element uid ${state.uid} was replaced during the recovery click. Take a fresh snapshot and verify the page before retrying.`
          : `stale_action_retry_exhausted: Element uid ${state.uid} could not complete ${action} after one semantic recovery. Take a fresh snapshot before retrying.`,
        { cause: retryError },
      );
    } finally {
      retryObservation.stop();
    }
  } finally {
    observation.stop();
  }
}

function resilientLocator(state: ResilientHandleState, transforms: LocatorTransform[] = []): LocatorLike {
  const chainMethods = new Set([
    'setTimeout',
    'setVisibility',
    'setWaitForEnabled',
    'setEnsureElementIsInTheViewport',
    'setWaitForStableBoundingBox',
  ]);
  return new Proxy({} as LocatorLike, {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      if (chainMethods.has(property)) {
        return (...args: unknown[]) => resilientLocator(state, [...transforms, { method: property, args }]);
      }
      if (property === 'click' || property === 'fill' || property === 'hover') {
        return (...args: unknown[]) => runLocatorAction(state, transforms, property, args);
      }
      const locator = locatorFrom(state.current, transforms);
      const value = locator[property];
      return typeof value === 'function' ? value.bind(locator) : value;
    },
  });
}

function resilientHandle(page: McpPageLike, uid: string, expected: NodePath, initial: unknown): unknown {
  const initialHandle = initial as DebuggableHandle;
  const state: ResilientHandleState = {
    page,
    uid,
    expected,
    current: initialHandle,
    handles: new Set([initialHandle]),
    readRecoveryUsed: false,
    actionRecoveryUsed: false,
  };
  return new Proxy(initialHandle as object, {
    get(_target, property) {
      if (property === Symbol.dispose) {
        return (): void => {
          for (const handle of state.handles) handle[Symbol.dispose]?.();
        };
      }
      if (property === 'asLocator') return () => resilientLocator(state);
      const current = state.current as Record<PropertyKey, unknown>;
      const value = Reflect.get(current, property, current);
      if (property === 'evaluate' && typeof value === 'function') {
        return async (...args: unknown[]): Promise<unknown> => {
          const attemptedHandle = state.current;
          try {
            return await Reflect.apply(value, attemptedHandle, args);
          } catch (error) {
            if (state.readRecoveryUsed || await handleConnectionState(attemptedHandle) !== 'detached') throw error;
            state.readRecoveryUsed = true;
            const recovered = await replaceCurrentHandle(state);
            const recoveredEvaluate = recovered.evaluate;
            if (!recoveredEvaluate) throw error;
            return await Reflect.apply(recoveredEvaluate, recovered, args);
          }
        };
      }
      return typeof value === 'function' ? value.bind(state.current) : value;
    },
  });
}

export function installStaleUidRecovery(McpPage: McpPageConstructorLike): void {
  const prototype = McpPage.prototype;
  if (prototype[installedSymbol]) return;
  const original = prototype.getElementByUid;
  prototype.getElementByUid = async function getElementByUidWithRecovery(this: McpPageLike, uid: string): Promise<unknown> {
    const snapshot = this.textSnapshot;
    const expected = snapshot ? pathForUid(snapshot.root, uid) : undefined;
    try {
      const handle = await original.call(this, uid);
      if (!expected) return handle;
      const state = await handleConnectionState(handle);
      if (state !== 'detached') return resilientHandle(this, uid, expected, handle);
      (handle as DebuggableHandle)[Symbol.dispose]?.();
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
    } catch (error) {
      if (!expected || !isDetachedUidError(error)) throw error;
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
    }
  };
  prototype[installedSymbol] = true;
}
