import {describe,it,expect} from 'vitest';
import {JournalEntrySchema,applicationUrl,journalStats,type JournalEntry} from '../../extension/src/domain/journal';
const entry:JournalEntry={id:'one',company:'示例公司',role:'测试岗位',url:'https://jobs.example.com/role?id=123',status:'recorded',appliedDate:null,notes:'',createdAt:1,updatedAt:1,evidence:'submit_detected',sessionKey:'s'};
describe('投递记录的事实和统计',()=>{
  it('记录直接计入统计，无需确认；空公司名称不算一家新公司',()=>{expect(journalStats([entry,{...entry,id:'two',company:''}])).toMatchObject({total:2,companies:1});});
  it('允许信息未识别的记录直接保存，用户可稍后编辑；日期必须有效',()=>{expect(JournalEntrySchema.safeParse({...entry,company:'',role:''}).success).toBe(true);expect(JournalEntrySchema.safeParse({...entry,appliedDate:'2026-02-30'}).success).toBe(false);});
  it('记录可用岗位参数，去掉网址中的登录令牌，拒绝脚本链接',()=>{expect(applicationUrl('https://jobs.example.com/apply?jobId=123&access_token=private&utm_source=a#/job')).toBe('https://jobs.example.com/apply?jobId=123#/job');expect(()=>applicationUrl('javascript:alert(1)')).toThrow();});
});
