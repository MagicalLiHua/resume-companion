import { describe, expect, test } from 'vitest';
import { assertSnapshotEntry, normalizeSnapshot, ReferenceBook, type AxNode } from '../src/browser/snapshot.js';

const tree: AxNode = {
  id: 'root', role: 'RootWebArea', name: '虚构招聘表单', children: [{
    id: 'form', role: 'form', name: '基本信息', children: [
      { id: 'name', role: 'textbox', name: '姓名', value: '', required: true },
      { id: 'agree', role: 'checkbox', name: '本人同意隐私条款', checked: false },
      { id: 'next', role: 'button', name: '下一步' },
      { id: 'submit', role: 'button', name: '确认并提交申请' },
    ],
  }],
};

describe('DevTools accessibility snapshot normalization', () => {
  test('creates opaque stable refs, value tokens and code-level safety metadata', () => {
    const references = new ReferenceBook();
    const first = normalizeSnapshot({ root: tree, pageId: 1, url: 'https://jobs.example/form', title: '表单', references });
    const second = normalizeSnapshot({ root: tree, pageId: 1, url: 'https://jobs.example/form', title: '表单', references });
    const name = [...first.entries.values()].find(entry => entry.public.name === '姓名')!;
    const next = [...first.entries.values()].find(entry => entry.public.name === '下一步')!;
    const submit = [...first.entries.values()].find(entry => entry.public.name === '确认并提交申请')!;
    const agree = [...first.entries.values()].find(entry => entry.public.name.includes('隐私条款'))!;
    expect(name.public.ref).toBe([...second.entries.values()].find(entry => entry.public.name === '姓名')?.public.ref);
    expect(name.public.allowed_actions).toContain('set_value');
    expect(next.public.effect_kind).toBe('advance_step');
    expect(submit.public.allowed_actions).toEqual([]);
    expect(submit.public.blocked_reason).toContain('final_submit');
    expect(agree.public.blocked_reason).toContain('declaration');
    first.exposed.add(name.public.ref);
    expect(assertSnapshotEntry(first, name.public.ref, name.public.expected_value_token).node.id).toBe('name');
  });

  test('uses ancestor context to block a disguised final-submit next button', () => {
    const snapshot = normalizeSnapshot({
      pageId: 1,
      url: 'https://jobs.example.test/review',
      title: 'Review',
      references: new ReferenceBook(),
      root: {
        id: 'root', role: 'RootWebArea', name: '招聘申请', children: [
          { id: 'review', role: 'region', name: '最终核对申请', children: [
            { id: 'next', role: 'button', name: '下一步' },
          ] },
        ],
      },
    });
    const next = [...snapshot.entries.values()].find(entry => entry.public.name === '下一步');
    expect(next?.public).toMatchObject({ effect_kind: 'final_submit', allowed_actions: [] });
  });
});
