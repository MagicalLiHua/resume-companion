import { describe, expect, test } from 'vitest';
import { resolveSemanticReplacement, type AccessibilityNodeLike } from '../src/browser/stale-uid-recovery.js';

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
});
