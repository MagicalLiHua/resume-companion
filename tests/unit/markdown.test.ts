import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseMarkdown,exportMarkdown} from '../../extension/src/domain/markdown';
import {AI_PROMPT,EMPTY_MARKDOWN} from '../../extension/src/domain/markdown-template';
import {demoProfile} from '../../extension/src/domain/profile';
const template=readFileSync('docs/Markdown简历模板与解析规范.md','utf8').match(/```markdown\n([\s\S]*?)\n```/)![1];
const basic='# 简历\n模板版本：resume-md/1\n## 基本信息\n- 姓名：张三\n- 邮箱：student@example.com\n';
describe('Markdown 导入的独立事实核对',()=>{
  it('标准模板字段、分组及状态准确，不丢多行事实',()=>{
    const r=parseMarkdown(template);expect(r.issues.filter(i=>i.severity==='error')).toEqual([]);
    expect(r.candidate.basic.full_name).toBe('示例同学');expect(r.candidate.education).toHaveLength(2);
    expect(r.candidate.education[0]).toMatchObject({school:'示例科技大学',degree:null,expected_degree:'工学硕士',completed:false,is_current:true,is_expected_end:true,start_month:'2024-09',end_month:'2027-06'});
    expect(r.candidate.education[1]).toMatchObject({completed:true,is_current:false,is_expected_end:false});
    expect(r.candidate.experience[0].facts.map(f=>f.text)).toEqual(['编写接口回归测试用例，整理测试结果。','使用 Python 汇总异常数据，并协助定位问题。']);
    expect(r.candidate.projects[0].technologies).toEqual(['Python','pytest']);
  });
  it('复制提示词包含同一空模板，空值不制造经历',()=>{expect(AI_PROMPT).toContain(EMPTY_MARKDOWN);const r=parseMarkdown(EMPTY_MARKDOWN);expect(r.candidate.education).toEqual([]);expect(r.candidate.experience).toEqual([]);expect(r.candidate.basic.full_name).toBeNull();});
  it('支持 BOM、CRLF、外层围栏、加粗标签和别名',()=>{
    const r=parseMarkdown('\ufeff```markdown\r\n# 简历\r\n模板版本：resume-md/1\r\n## 个人信息\r\n* **姓名**: 张三\r\n+ 电话：13800000000\r\n```');
    expect(r.issues).toEqual([]);expect(r.candidate.basic).toMatchObject({full_name:'张三',phone:'13800000000'});expect(r.sourceMap['basic.full_name']).toBe(5);
  });
  it.each([['2024',null,'year'],['2024年9月','2024-09','month'],['2024/9/15','2024-09','day']])('保留日期精度 %s',(date,normalized,precision)=>{
    const r=parseMarkdown(basic+`## 教育经历\n### 教育 1\n- 学校：大学\n- 开始时间：${date}`),record=r.candidate.education[0];
    expect(record.start_month).toBe(normalized);expect(r.fieldMetadata[`${record.id}.start_month`]).toMatchObject({raw:date,normalized,precision});
    expect(record.completed).toBeNull();expect(record.is_current).toBeNull();
  });
  it.each(['2024-02-30','2023-02-29','2024-13','foo'])('拒绝无效日期 %s',date=>{const r=parseMarkdown(basic+`## 教育经历\n### 教育 1\n- 学校：大学\n- 开始时间：${date}`);expect(r.issues.some(i=>i.code==='DATE_INVALID'&&i.severity==='error')).toBe(true);});
  it('重复字段和状态矛盾阻塞导入',()=>{
    expect(parseMarkdown(basic+'- 姓名：李四').issues.some(i=>i.code==='FIELD_CONFLICT'&&i.severity==='error')).toBe(true);
    const r=parseMarkdown(basic+'## 工作与实习\n### 经历1\n- 公司：甲公司\n- 结束时间：至今\n- 当前状态：已结束');expect(r.issues.some(i=>i.code==='STATUS_CONFLICT')).toBe(true);
  });
  it('未识别的内容可导出回看，不生成可执行字段',()=>{
    const r=parseMarkdown(basic+'## 其他内容\n<img src="https://example.invalid/tracker">\n### 意外标题\n|字段|值|');
    expect(r.sourceDocument.unmapped.map(u=>u.text).join('\n')).toContain('<img');expect(r.candidate.supplemental_fields).toEqual([]);
    const again=parseMarkdown(exportMarkdown(r.candidate,r.fieldMetadata,r.sourceDocument));expect(again.sourceDocument.unmapped.map(u=>u.text).join('\n')).toContain('<img');expect(again.candidate.basic).toEqual(r.candidate.basic);
  });
  it('多块、未来版本和超限输入明确拒绝',()=>{
    expect(parseMarkdown('解释\n```markdown\n'+basic+'\n```').issues.some(i=>i.severity==='error')).toBe(true);
    expect(parseMarkdown(basic.replace('resume-md/1','resume-md/9')).issues.some(i=>i.code==='TEMPLATE_VERSION_UNSUPPORTED')).toBe(true);
    expect(parseMarkdown('中'.repeat(90000)).issues[0].code).toBe('INPUT_TOO_LARGE');
  });
  it('现有资料导出后字段含义及日期原文保持',()=>{
    const p=demoProfile(),r=parseMarkdown(exportMarkdown(p));
    expect(r.issues.filter(i=>i.severity==='error')).toEqual([]);expect(r.candidate.basic).toEqual(p.basic);
    expect(r.candidate.education.map(({id,...rest})=>rest)).toEqual(p.education.map(({id,...rest})=>rest));
    expect(r.candidate.projects[0].facts.map(f=>f.text)).toEqual(p.projects[0].facts.map(f=>f.text));
  });
  it('多行事实的续行和嵌套列表层级往返保持',()=>{
    const r=parseMarkdown(basic+'## 项目经历\n### 项目1\n- 项目名称：工具\n- 项目内容：\n  - 第一要点\n    续行说明\n    - 子要点\n  - 第二要点');
    expect(r.candidate.projects[0].facts.map(f=>f.text)).toEqual(['第一要点\n续行说明\n  - 子要点','第二要点']);
    const again=parseMarkdown(exportMarkdown(r.candidate));expect(again.candidate.projects[0].facts.map(f=>f.text)).toEqual(r.candidate.projects[0].facts.map(f=>f.text));
  });
});
