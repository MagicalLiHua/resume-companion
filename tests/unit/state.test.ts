import {describe,it,expect} from 'vitest';
import {demoProfile,newRecord,parseProfile} from '../../extension/src/domain/profile';
import {demoProfile as legacyProfile} from '../../extension/src/domain/profile-v1';
import {migrateLegacy,enforceBudget,freshState,parseBackup,reconcileMetadata,BackupSchema} from '../../extension/src/domain/state';
describe('本地正式资料与迁移',()=>{
  it('严格迁移旧版明确状态与上一份，不重新猜测事实',()=>{
    const p=legacyProfile(),s=migrateLegacy({resume_profile:p,resume_backup:p,resume_revision:7});
    expect(s.revision).toBe(7);expect(s.current?.profile.schema_version).toBe('1.1');expect(s.current?.profile.education[0].completed).toBe(false);expect(s.previous?.profile.basic).toEqual(p.basic);expect(s.current?.profile.supplemental_fields).toEqual([]);
    expect(()=>migrateLegacy({resume_profile:{...p,schema_version:'future'}})).toThrow();
  });
  it('新建经历的缺失状态保持未知',()=>{expect(newRecord('education')).toMatchObject({completed:null,is_current:null,is_expected_end:null});expect(newRecord('experience').kind).toBeNull();});
  it('完整备份包含补充资料，拒绝凭证或未知属性混入',()=>{
    const s=freshState(),p=demoProfile();p.supplemental_fields=[{...newRecord('supplemental_fields'),label:'籍贯',value:'示例地区'}];s.current={profile:p,fieldMetadata:{},sourceDocument:null};
    const b={format:'resume-companion-backup',version:2,exportedAt:'2026-09-11',state:s,modelSettings:null};
    const round=parseBackup(JSON.stringify(b));expect('format'in round&&round.format==='resume-companion-backup'&&round.state.current?.profile.supplemental_fields[0].value).toBe('示例地区');
    expect(BackupSchema.safeParse({...b,apiKey:'do-not-save'}).success).toBe(false);expect(()=>parseBackup(JSON.stringify({...b,version:9}))).toThrow();
  });
  it('仅保留仍对应当前字段的日期精度',()=>{const p=demoProfile(),id=p.education[0].id,metadata={[`${id}.start_month`]:{raw:'2024-09-15',normalized:'2024-09',precision:'day' as const}};expect(reconcileMetadata(p,metadata)).toEqual(metadata);p.education[0].start_month='2025-01';expect(reconcileMetadata(p,metadata)).toEqual({});});
  it('单份正式资料超限时不截断原内容',()=>{const s=freshState(),p=demoProfile();p.projects=Array.from({length:45},(_,i)=>({...newRecord('projects'),id:`p${i}`,facts:Array.from({length:5},(_,j)=>({id:`f${i}_${j}`,text:'中'.repeat(5000)}))}));s.current={profile:p,fieldMetadata:{},sourceDocument:null};expect(()=>enforceBudget(s)).toThrow('1 MiB');expect(p.projects[0].facts[0].text.length).toBe(5000);});
  it('补充字段名称、稳定标识和条目 ID 有校验',()=>{const p=demoProfile();p.supplemental_fields=[newRecord('supplemental_fields')];expect(()=>parseProfile(p)).toThrow();p.supplemental_fields[0].label='籍贯';expect(parseProfile(p).supplemental_fields[0].id).toBe(p.supplemental_fields[0].id);});
  it('本页草稿可以导回编辑区，未完成的邮箱输入不冒充正式资料',()=>{const p=demoProfile();p.basic.email='unfinished@';const draft=parseBackup(JSON.stringify({format:'resume-companion-editor-draft',version:1,profile:p,markdown:'正在编辑',fieldMetadata:{},sourceDocument:null}));expect('format'in draft&&draft.format==='resume-companion-editor-draft'&&draft.markdown).toBe('正在编辑');expect(()=>parseProfile(p)).toThrow('邮箱');});
});
