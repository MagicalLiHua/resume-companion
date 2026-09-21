import { describe, expect, test } from 'vitest';
import { maskSensitiveValue } from '../src/browser/form-engine.js';
import { redactBrowserText } from '../src/browser/privacy.js';

describe('Resume Browser privacy serialization', () => {
  test('masks common personal identifiers before they can enter tool output', () => {
    expect(maskSensitiveValue('手机号', '13800001234')).toBe('138****1234');
    expect(maskSensitiveValue('电子邮箱', 'semantic@example.test')).toBe('se******@example.test');
    expect(maskSensitiveValue('身份证号', '110101200001011234')).toBe('110***********1234');
    expect(maskSensitiveValue('家庭地址', '杭州市西湖区示例路 1 号')).toBe('杭州市西湖区示例路 1 号'.slice(0, 2) + '***' + '杭州市西湖区示例路 1 号'.slice(-2));
  });

  test('does not expose short sensitive values', () => {
    expect(maskSensitiveValue('账号', '1234')).toBe('<masked>');
  });

  test('redacts identifiers and birth dates from raw accessibility snapshots', () => {
    const snapshot = [
      'textbox "手机号" disabled value="13800001234"',
      'textbox "身份证号码" readonly value="11010120000101123X"',
      'textbox "电子邮箱" value="person@example.com"',
      'textbox "出生日期" disabled value="2000-01-02"',
      'textbox "银行卡" value="6222021234567890123"',
    ].join('\n');
    const redacted = redactBrowserText(snapshot);
    expect(redacted).toContain('138****1234');
    expect(redacted).toContain('110***********123X');
    expect(redacted).toContain('pe******@example.com');
    expect(redacted).toContain('出生日期" disabled value="<masked>"');
    expect(redacted).not.toContain('6222021234567890123');
    expect(redacted).not.toContain('11010120000101123X');
  });

  test('masks malformed values by label, including adjacent unnamed AX controls', () => {
    const malformed = '1380000123413900005678';
    const snapshot = `textbox "手机号" value="${malformed}"\nStaticText "电子邮箱"\ntextbox "" value="bad-address + more"\ntextbox "专业" value="计算机科学"`;
    const redacted = redactBrowserText(snapshot);
    expect(redacted).not.toContain(malformed);
    expect(redacted).not.toContain('bad-address');
    expect(redacted).toContain('计算机科学');
    expect(redactBrowserText(`textbox "" value="${malformed}"`)).not.toContain(malformed);
  });
});

// The retry must use the new main frame after an SPA navigation destroys the old
// execution context; reloading would discard the user's unsaved form.
describe('semantic scan recovery', () => {
  test('reports a scanner exception as evaluation failure without disguising it as a timeout', async () => {
    const {FormEngine} = await import('../src/browser/form-engine.js');
    let calls = 0;
    const engine = new FormEngine(() => ({pptrPage:{frames:()=>[{evaluate:async()=>{calls++;throw new Error('Synthetic scanner reference error');}}]}}));
    const result = await engine.observe({page_id:1,mode:'overview'});
    expect(result.structuredContent.error.code).toBe('observe_evaluation_failed');
    expect(result.structuredContent.error.message).toContain('Synthetic scanner reference error');
    expect(calls).toBe(1);
  });
  test('retries once against the current main frame without reloading', async () => {
    const { FormEngine } = await import('../src/browser/form-engine.js');
    let frameReads = 0;
    let scans = 0;
    const oldFrame = { evaluate: async () => { scans++; throw new Error('Execution context was destroyed'); } };
    const newFrame = { evaluate: async () => { scans++; return { fields: [], overlays: [], sections: ['基本信息'], validations: [] }; } };
    const engine = new FormEngine(() => ({ pptrPage: {
      frames: () => ++frameReads === 1 ? [oldFrame] : [newFrame],
      url: () => 'https://example.test/resume', title: async () => 'Synthetic resume',
    } }));
    const result = await engine.observe({ page_id: 1, mode: 'overview' });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.sections).toEqual(['基本信息']);
    expect(scans).toBe(2);
  });
});

describe('complete catalog and independent run ledger', () => {
  test('display mode changes do not produce business deltas; masked values still detect edits', async () => {
    const {FormEngine} = await import('../src/browser/form-engine.js');
    let phone = '13800001234';
    const frame = {evaluate:async()=>({documentId:'stable', fields:[{frame:0,index:0,identity:'phone',tag:'input',role:'',type:'tel',label:'手机号',scope:'基本信息',value:phone,checked:null,disabled:false,readonly:false,required:false,visible:true,options:[],constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:''}],overlays:[],sections:['基本信息'],validations:[]})};
    const engine = new FormEngine(()=>({pptrPage:{frames:()=>[frame],url:()=> 'https://example.test/resume',title:async()=> 'Form'}}));
    const baseline = (await engine.observe({page_id:1,mode:'overview',include_values:'state'})).structuredContent;
    const display = (await engine.observe({page_id:1,mode:'delta',include_values:'masked',since_observation_id:baseline.observation_id})).structuredContent;
    expect(display.changes.fields).toEqual([]);
    const focus = (await engine.observe({page_id:1,mode:'focus',scope:'教育经历',include_values:'needed'})).structuredContent;
    expect(focus.locality.changed_outside_scope).toBe(0);
    phone = '13899991234'; // same masked display, different business value
    const edit = (await engine.observe({page_id:1,mode:'delta',include_values:'masked',since_observation_id:baseline.observation_id})).structuredContent;
    expect(edit.changes.fields).toHaveLength(1);
    expect(JSON.stringify(edit)).not.toContain(phone);
  });
  test('143 fields remain pageable with 177 operations; cursors expire on document changes', async () => {
    const {FormEngine} = await import('../src/browser/form-engine.js');
    let documentId = 'one';
    const fields = Array.from({length:143},(_,index)=>({frame:0,index,identity:`field-${index}`,tag:'input',role:'',type:'text',label:`字段${index}`,scope:'基本信息',value:'',checked:null,disabled:false,readonly:false,required:false,visible:true,options:[],constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:''}));
    const frame = {evaluate:async()=>({documentId,fields,overlays:[],sections:['基本信息'],validations:[]})};
    const engine = new FormEngine(()=>({pptrPage:{frames:()=>[frame],url:()=> 'https://example.test/resume',title:async()=> 'Form'}}));
    for(let i=0;i<177;i++)engine.recordLowLevelOperation(1,'fill',`test-${i}`,'description','unverified');
    const first=(await engine.observe({page_id:1,mode:'overview',max_bytes:4000,include_test_ledger:true})).structuredContent;
    expect(first.test_run.total_operations).toBe(177);
    expect(first.test_ledger).toBeUndefined();
    expect(first.coverage.complete).toBe(false);
    const refs=first.fields.map((f:any)=>f.ref);
    let cursor=first.coverage.next_cursor;
    for(let page=0;cursor&&page<30;page++){
      const result=(await engine.observe({page_id:1,mode:'overview',max_bytes:4000,cursor})).structuredContent;
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(4000);
      refs.push(...result.fields.map((f:any)=>f.ref));cursor=result.coverage.next_cursor;
    }
    expect(cursor).toBeUndefined();expect(new Set(refs).size).toBe(143);expect(refs.length).toBe(143);
    const log=(await engine.observe({page_id:1,mode:'overview',include_test_ledger:true,ledger_cursor:100,ledger_limit:25})).structuredContent;
    expect(log.test_ledger).toHaveLength(25);expect(log.test_ledger[0].operation_id).toBe('test-100');
    expect(log.test_run.next_cursor).toBe(125);
    documentId='two';
    const expired=await engine.observe({page_id:1,mode:'overview',cursor:first.coverage.next_cursor});
    expect(expired.structuredContent.error.code).toBe('observation_cursor_expired');
  });
});
