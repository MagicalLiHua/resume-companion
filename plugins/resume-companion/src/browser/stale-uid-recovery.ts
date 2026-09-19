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
  evaluate?<T>(callback: (element: Element) => T): Promise<T>;
  [Symbol.dispose]?: () => void;
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

async function handleIsConnected(handle: unknown): Promise<boolean> {
  const debuggable = handle as DebuggableHandle;
  if (!debuggable.evaluate) return true;
  try {
    return await debuggable.evaluate(element => element.isConnected);
  } catch {
    return false;
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

export function installStaleUidRecovery(McpPage: McpPageConstructorLike): void {
  const prototype = McpPage.prototype;
  if (prototype[installedSymbol]) return;
  const original = prototype.getElementByUid;
  prototype.getElementByUid = async function getElementByUidWithRecovery(this: McpPageLike, uid: string): Promise<unknown> {
    const snapshot = this.textSnapshot;
    const expected = snapshot ? pathForUid(snapshot.root, uid) : undefined;
    try {
      const handle = await original.call(this, uid);
      if (!expected || await handleIsConnected(handle)) return handle;
      (handle as DebuggableHandle)[Symbol.dispose]?.();
      return await recoverHandle(this, uid, expected);
    } catch (error) {
      if (!expected || !isDetachedUidError(error)) throw error;
      return await recoverHandle(this, uid, expected);
    }
  };
  prototype[installedSymbol] = true;
}
