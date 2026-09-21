import { describe, expect, test } from 'vitest';
import {
  installStaleUidRecovery,
  resolveSemanticReplacement,
  type AccessibilityNodeLike,
} from '../src/browser/stale-uid-recovery.js';

function pathFor(root: AccessibilityNodeLike, id: string) {
  type TestPath = { node: AccessibilityNodeLike; ancestors: AccessibilityNodeLike[] };
  const walk = (node: AccessibilityNodeLike, ancestors: AccessibilityNodeLike[]): TestPath | undefined => {
    if (node.id === id) return { node, ancestors };
    for (const child of node.children ?? []) {
      const found = walk(child, [...ancestors, node]);
      if (found) return found;
    }
    return undefined;
  };
  const found = walk(root, []);
  if (!found) throw new Error(`missing test node ${id}`);
  return found;
}

describe('stale UID semantic recovery', () => {
  test('never searches unnamed replacements when upstream wrapped a context timeout as a stale UID', async () => {
    let snapshots = 0;
    class BrokenPage {
      textSnapshot = {root:{id:'root',children:[{id:'old',role:'textbox',name:''}]},idToNode:new Map()};
      pptrPage = {accessibility:{snapshot:async()=>{snapshots++;return {role:'RootWebArea',children:[{role:'textbox',name:''},{role:'textbox',name:''}]};}}};
      async getElementByUid(_uid:string):Promise<unknown> {throw new Error('Element uid old no longer exists on the page.',{cause:new Error('Timed out after waiting 5000ms')});}
    }
    installStaleUidRecovery(BrokenPage);
    await expect(new BrokenPage().getElementByUid('old')).rejects.toThrow('page_context_unavailable');
    expect(snapshots).toBe(0);
  });
  test('resolves a unique replacement while allowing its value to change', () => {
    const oldRoot = { role: 'RootWebArea', children: [{ id: 'old', role: 'textbox', name: '姓名', value: '' }] };
    const newNode = { role: 'textbox', name: '姓名', value: '部分写入' };
    const result = resolveSemanticReplacement(pathFor(oldRoot, 'old'), { role: 'RootWebArea', children: [newNode] });
    expect(result).toEqual({ kind: 'resolved', path: { node: newNode, ancestors: [expect.objectContaining({ role: 'RootWebArea' })] } });
  });

  test('uses named ancestor context to distinguish duplicate controls', () => {
    const oldRoot = {
      role: 'RootWebArea',
      children: [{ role: 'region', name: '教育信息', children: [{ id: 'old', role: 'button', name: '保存' }] }],
    };
    const basicSave = { role: 'button', name: '保存' };
    const educationSave = { role: 'button', name: '保存' };
    const currentRoot = {
      role: 'RootWebArea',
      children: [
        { role: 'region', name: '基本信息', children: [basicSave] },
        { role: 'region', name: '教育信息', children: [educationSave] },
      ],
    };
    const result = resolveSemanticReplacement(pathFor(oldRoot, 'old'), currentRoot);
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.path.node).toBe(educationSave);
  });

  test('refuses indistinguishable duplicate controls', () => {
    const oldRoot = { role: 'RootWebArea', children: [{ id: 'old', role: 'textbox', name: '学校名称' }] };
    const result = resolveSemanticReplacement(pathFor(oldRoot, 'old'), {
      role: 'RootWebArea',
      children: [
        { role: 'textbox', name: '学校名称' },
        { role: 'textbox', name: '学校名称' },
      ],
    });
    expect(result).toEqual({ kind: 'ambiguous', candidateCount: 2 });
  });

  test('retries a click once when the old locator detached before dispatch', async () => {
    let oldConnected = true;
    let replacementClicks = 0;
    const oldLocator = fakeLocator({
      onClick: () => {
        oldConnected = false;
        throw new Error('Timed out after waiting 5000ms');
      },
    });
    const replacementLocator = fakeLocator({ onClick: () => { replacementClicks += 1; } });
    const oldHandle = fakeHandle(() => oldConnected, oldLocator);
    const replacementHandle = fakeHandle(() => true, replacementLocator);
    const page = fakePage(oldHandle, replacementHandle);

    const handle = await page.getElementByUid('old') as { asLocator(): { click(): Promise<void> } };
    await handle.asLocator().click();

    expect(replacementClicks).toBe(1);
  });

  test('does not repeat a click after locator dispatch has started', async () => {
    let oldConnected = true;
    let replacementClicks = 0;
    const oldLocator = fakeLocator({
      emitAction: true,
      onClick: () => {
        oldConnected = false;
        throw new Error('Node is detached from document');
      },
    });
    const replacementLocator = fakeLocator({ onClick: () => { replacementClicks += 1; } });
    const page = fakePage(fakeHandle(() => oldConnected, oldLocator), fakeHandle(() => true, replacementLocator));

    const handle = await page.getElementByUid('old') as { asLocator(): { click(): Promise<void> } };
    await expect(handle.asLocator().click()).rejects.toThrow('stale_action_result_unknown');
    expect(replacementClicks).toBe(0);
  });
});

interface FakeLocatorOptions {
  emitAction?: boolean;
  onClick: () => void;
}

function fakeLocator(options: FakeLocatorOptions) {
  const listeners = new Set<() => void>();
  return {
    on(event: string, listener: () => void) {
      if (event === 'action') listeners.add(listener);
    },
    off(event: string, listener: () => void) {
      if (event === 'action') listeners.delete(listener);
    },
    setWaitForStableBoundingBox() { return this; },
    async click() {
      if (options.emitAction) for (const listener of listeners) listener();
      options.onClick();
    },
  };
}

function fakeHandle(isConnected: () => boolean, locator: ReturnType<typeof fakeLocator>) {
  return {
    async evaluate() { return isConnected(); },
    asLocator() { return locator; },
    [Symbol.dispose]() {},
  };
}

function fakePage(oldHandle: ReturnType<typeof fakeHandle>, replacementHandle: ReturnType<typeof fakeHandle>) {
  const oldNode = { id: 'old', role: 'button', name: '添加教育信息' };
  const replacementNode = {
    role: 'button',
    name: '添加教育信息',
    elementHandle: async () => replacementHandle,
  };
  class FakeMcpPage {
    textSnapshot = {
      root: { role: 'RootWebArea', children: [oldNode] },
      idToNode: new Map([['old', oldNode]]),
    };
    pptrPage = {
      accessibility: {
        snapshot: async () => ({ role: 'RootWebArea', children: [replacementNode] }),
      },
    };
    async getElementByUid(_uid: string) { return oldHandle; }
  }
  installStaleUidRecovery(FakeMcpPage);
  return new FakeMcpPage();
}
