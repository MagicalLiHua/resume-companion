import { describe, expect, it } from 'vitest';
import { demoProfile, emptyProfile, parseProfile, parseProfileFile } from '../../extension/src/domain/profile';

describe('用户资料的导入与事实边界', () => {
  it('空资料可以保存，缺失字段保持 null', () => { expect(parseProfile(emptyProfile()).basic.phone).toBeNull(); });
  it('备份往返不改变事实和条目 ID', () => { const p = demoProfile(); expect(parseProfileFile(JSON.stringify(p))).toEqual(p); });
  it('拒绝未知版本，不尝试补成当前版本', () => { expect(() => parseProfile({ ...demoProfile(), schema_version: '9.0' })).toThrow(); });
  it('拒绝多段经历间重复的事实 ID', () => {
    const p = demoProfile(); p.projects[0].facts[0].id = p.experience[0].facts[0].id;
    expect(() => parseProfile(p)).toThrow('ID 不能重复');
  });
  it('拒绝倒置时间和不存在的月份', () => {
    const p = demoProfile(); p.education[0].start_month = '2028-01';
    expect(() => parseProfile(p)).toThrow('结束时间');
    p.education[0].start_month = '2024-13'; expect(() => parseProfile(p)).toThrow();
  });
  it('在读可有预计学位，不能同时标记已完成', () => {
    const p = demoProfile(); expect(p.education[0].degree).toBeNull();
    p.education[0].completed = true; expect(() => parseProfile(p)).toThrow('已完成');
  });
  it('拒绝额外敏感属性以及非法 email', () => {
    const p = demoProfile(); expect(() => parseProfile({ ...p, password: 'secret' })).toThrow();
    p.basic.email = 'not-an-email'; expect(() => parseProfile(p)).toThrow();
  });
  it('文件上限按 UTF-8 字节计算，并拒绝非法 JSON', () => {
    expect(() => parseProfileFile('坏')).toThrow('JSON');
    expect(() => parseProfileFile('中'.repeat(400000))).toThrow('1 MiB');
  });
  it('排序不会修改稳定 ID', () => { const p = demoProfile(); const ids = p.education.map(e => e.id); p.education.reverse(); expect(parseProfile(p).education.map(e => e.id)).toEqual(ids.reverse()); });
});
