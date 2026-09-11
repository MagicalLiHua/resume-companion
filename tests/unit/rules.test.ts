import { describe, expect, it } from 'vitest';
import { demoProfile } from '../../extension/src/domain/profile';
import { bindingKey, blockedLabel, matchDefinition, proposedValue, sources, suggestSource } from '../../extension/src/domain/rules';
import type { Field } from '../../extension/src/domain/types';
const makeField = (extra: Partial<Field> = {}): Field => ({ id: 'f1', label: '姓名', kind: 'text', groupId: 'g1', groupLabel: '个人信息', section: 'basic', currentValue: '', options: [], maxLength: -1, required: false, blocked: null, ...extra });
describe('字段的语义与取值', () => {
  const profile = demoProfile(); const all = sources(profile);
  it('识别公开申请页使用的实心必填星号，仍拒绝亲属字段', () => {
    for (const [label, ref] of [['Full name✱', 'basic/full_name'], ['Email✱', 'basic/email'], ['Phone ✱', 'basic/phone']]) {
      expect(suggestSource(makeField({label, section:'other'}), all, {})?.ref).toBe(ref);
    }
    expect(suggestSource(makeField({label:'Parent full name✱',section:'other'}), all, {})).toBeUndefined();
  });
  it('不同教育条目不依赖数组顺序', () => {
    const f = makeField({ label: '学校名称', section: 'education' });
    expect(suggestSource(f, all, {})).toBeUndefined();
    expect(suggestSource(f, all, { [bindingKey(f, 'education')]: 'edu-bachelor' })?.value).toBe('示例理工大学');
  });
  it('无分组的开始时间有歧义，应交给用户', () => { expect(matchDefinition(makeField({ label: '开始时间', section: 'other' }))).toBeUndefined(); });
  it('不把最高学历直接等同于某一段学历', () => { expect(matchDefinition(makeField({ label: '最高学历' }))).toBeUndefined(); });
  it('不推断亲属姓名、期望城市、缺失手机号', () => {
    for (const label of ['父亲姓名', '期望城市', '应急联系人姓名']) expect(matchDefinition(makeField({ label }))).toBeUndefined();
    const p = demoProfile(); p.basic.phone = null; const f = makeField({ label: '手机号' });
    expect(proposedValue(f, suggestSource(f, sources(p), {})).value).toBeNull();
  });
  it('不会把拟获学位当成已获学位', () => {
    const f = makeField({ label: '所获学位', section: 'education' });
    const source = suggestSource(f, all, { [bindingKey(f, 'education')]: 'edu-master' });
    expect(proposedValue(f, source).value).toBeNull();
  });
  it('资料中只有年月时不能填完整日期控件', () => {
    const f = makeField({ label: '入学时间', kind: 'date', section: 'education' });
    expect(proposedValue(f, all.find(s => s.ref === 'education/edu-bachelor/start_month')).value).toBeNull();
  });
  it('优先精确选项，其次已知别名，歧义时放弃', () => {
    const source = all.find(s => s.ref === 'education/edu-master/education_level');
    const f = makeField({ kind: 'select-one', options: [{ label: '硕士', value: '7' }] });
    expect(proposedValue(f, source).value).toBe('7');
    f.options.push({ label: '硕士', value: 'other' }); expect(proposedValue(f, source).value).toBeNull();
    f.options.push({ label: '硕士研究生', value: 'exact' }); expect(proposedValue(f, source).value).toBe('exact');
  });
  it('超长内容不会被静默截断', () => { expect(proposedValue(makeField({ maxLength: 2 }), all.find(s => s.ref === 'basic/full_name')).value).toBeNull(); });
  it.each(['身份证号码', '短信验证码', 'password', '同意隐私政策', '是否服从调剂'])('受限字段不能成为自动匹配来源：%s', label => { expect(blockedLabel(label)).toBe(true); expect(matchDefinition(makeField({ label }))).toBeUndefined(); });
  it('只勾选已保存的技能，协议复选框始终跳过', () => {
    const f = makeField({ kind: 'checkbox', label: 'Python', section: 'skills' });
    expect(proposedValue(f, suggestSource(f, all, {})).value).toBe(true);
    f.label = '未掌握的技能'; expect(proposedValue(f, suggestSource(f, all, {})).value).toBeNull();
    f.label = '同意授权'; f.blocked = '手动处理'; expect(proposedValue(f, all.find(s => s.ref === 'skills')).value).toBeNull();
  });
});
