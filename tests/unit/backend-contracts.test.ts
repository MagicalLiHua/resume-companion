import { describe, it, expect } from 'vitest';
import { buildDraftRequest, buildResolveRequest, parseDraftResponse, parseResolveResponse, restoreDraftPlaceholders } from '../../contracts/api/requests';

const field = { id: 'f-one', label: '姓名', groupLabel: '基本资料', section: 'basic', kind: 'text', required: true, options: [] };
describe('后端契约与最小请求', () => {
  it('只构造元数据，快照当前值、URL、简历和选项值不进入请求', () => {
    const source = { ...field, currentValue: 'SYNTHETIC-NAME', url: 'https://example.com?token=SYNTHETIC-TOKEN',
      profile: { phone: '13800138000' }, options: [{ label: '本科', value: 'SYNTHETIC-OPTION' }] };
    const body = buildResolveRequest('req-one', [source]);
    expect(JSON.stringify(body)).not.toContain('SYNTHETIC-');
    expect(JSON.stringify(body)).not.toContain('13800138000');
    expect(body.fields[0].option_labels).toEqual(['本科']);
  });
  it('在出网前清理标签、分组和选项内的联系信息', () => {
    const body = buildResolveRequest('req-one', [{ ...field, label: '邮箱 student@example.com',
      groupLabel: '１３８００１３８０００', options: [{ label: '110101200001011234' }] }]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('student@example.com'); expect(raw).not.toContain('13800138000'); expect(raw).not.toContain('110101200001011234');
  });
  it('过滤受限控件，处理项目分组，并拒绝重复标识', () => {
    const body = buildResolveRequest('req-one', [{ ...field, id: 'blocked', blocked: '密码' }, { ...field, section: 'projects' }]);
    expect(body.fields).toHaveLength(1); expect(body.fields[0].group).toBe('project');
    expect(() => buildResolveRequest('req-one', [field, field])).toThrow();
  });
  it('草稿只发送选中的事实并先清理联系信息', () => {
    const selected = { question: '请介绍项目', jobRequirements: [], facts: [{ id: 'fact-a', text: '联系 student@example.com，编写测试用例' }],
      maxCharacters: 300, entireProfile: 'SYNTHETIC-SECRET' };
    const body = buildDraftRequest('req-one', selected);
    expect(JSON.stringify(body)).not.toContain('student@example.com'); expect(JSON.stringify(body)).not.toContain('SYNTHETIC-SECRET');
  });
  it('拒绝越界、缺失或重复的字段结果', () => {
    const request = buildResolveRequest('req-one', [field]);
    const result = { protocol_version: '1.0', request_id: 'req-one', results: [{ field_id: 'f-one', status: 'suggested',
      source_path: 'basic.full_name', confidence: 0.9, reason_code: 'ALIAS_MATCH' }] };
    expect(parseResolveResponse(result, request).results[0].source_path).toBe('basic.full_name');
    expect(() => parseResolveResponse({ ...result, results: [] }, request)).toThrow();
    expect(() => parseResolveResponse({ ...result, results: result.results.concat(result.results) }, request)).toThrow();
    expect(() => parseResolveResponse({ ...result, results: [{ ...result.results[0], source_path: 'education[].degree' }] }, request)).toThrow();
  });
  it('拒绝错误请求、未知事实和未知占位符，长度按码点检查', () => {
    const request = buildDraftRequest('req-one', { question: '项目', jobRequirements: [], facts: [{ id: 'fact-a', text: '在 [[ORG_1]] 编写用例' }], maxCharacters: 20 });
    const response = { protocol_version: '1.0', request_id: 'req-one', status: 'needs_review', text: '在 [[ORG_1]] 编写用例', used_fact_ids: ['fact-a'], warnings: [] };
    expect(parseDraftResponse(response, request).status).toBe('needs_review');
    expect(() => parseDraftResponse({ ...response, used_fact_ids: ['unknown'] }, request)).toThrow();
    expect(() => parseDraftResponse({ ...response, request_id: 'old' }, request)).toThrow();
    expect(() => parseDraftResponse({ ...response, text: '[[ORG_2]]' }, request)).toThrow();
  });
  it('占位符在本地恢复，恢复后重新校验长度，保留正常中文标点', () => {
    expect(restoreDraftPlaceholders('在 [[ORG_1]] 工作', { '[[ORG_1]]': '示例公司' }, 30)).toBe('在 示例公司 工作');
    expect(() => restoreDraftPlaceholders('[[ORG_2]]', { '[[ORG_1]]': '示例公司' }, 30)).toThrow();
    expect(() => restoreDraftPlaceholders('[[ORG_1]]', { '[[ORG_1]]': '一个很长的单位名称' }, 4)).toThrow();
    const request = buildDraftRequest('req-one', { question: '项目', jobRequirements: [], facts: [{ id: 'fact-a', text: '编写用例' }], maxCharacters: 20 });
    expect(parseDraftResponse({ protocol_version: '1.0', request_id: 'req-one', status: 'needs_review', text: '编写用例，核对结果。', used_fact_ids: ['fact-a'], warnings: [] }, request).text).toContain('，');
  });
});
