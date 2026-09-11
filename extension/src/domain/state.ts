import { z } from 'zod';
import { DraftProfileSchema, ProfileSchema, emptyProfile, parseProfile, type Profile } from './profile';
import {JournalEntrySchema} from './journal';
import {modelBase} from './model';

export const STATE_KEY = 'resume_state';
export const MAX_STATE_BYTES = 8 * 1024 * 1024;
export const bytes = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
export const DateMetadataSchema = z.record(z.string().max(180), z.strictObject({raw:z.string().max(80), precision:z.enum(['year','month','day']), normalized:z.string().nullable()}));
export type DateMetadata = z.infer<typeof DateMetadataSchema>;
export const DocumentSchema = z.strictObject({text:z.string().refine(s=>bytes(s)<=262144,'Markdown 超过 256 KiB'),templateVersion:z.literal('resume-md/1'),importedAt:z.number(),profileRevision:z.number().int().nonnegative(),unmapped:z.array(z.strictObject({line:z.number().int().positive(),text:z.string()})).max(10000)});
export type SourceDocument = z.infer<typeof DocumentSchema>;
export const SnapshotSchema = z.strictObject({profile:ProfileSchema,fieldMetadata:DateMetadataSchema,sourceDocument:DocumentSchema.nullable()});
export type FormalSnapshot = z.infer<typeof SnapshotSchema>;
export const ResumeVersionSchema=z.strictObject({id:z.string().max(100),name:z.string().trim().min(1).max(80),current:SnapshotSchema,previous:SnapshotSchema.nullable()});
export type ResumeVersion=z.infer<typeof ResumeVersionSchema>;
export const DraftSchema = z.strictObject({id:z.string(),ownerId:z.string(),revision:z.number().int().nonnegative(),baseRevision:z.number().int().nonnegative(),updatedAt:z.number(),profile:DraftProfileSchema,markdown:z.string().refine(s=>bytes(s)<=262144,'Markdown 超过 256 KiB'),fieldMetadata:DateMetadataSchema,sourceDocument:DocumentSchema.nullable()});
export type Draft = z.infer<typeof DraftSchema>;
export const PublicModelSchema = z.strictObject({protocol:z.enum(['anthropic','openai']),baseUrl:z.string().max(300).transform(modelBase),model:z.string().max(120),revision:z.number().int().nonnegative()});
export const StateSchema = z.strictObject({storageSchemaVersion:z.literal(2),revision:z.number().int().nonnegative(),current:SnapshotSchema.nullable(),previous:SnapshotSchema.nullable(),draft:DraftSchema.nullable(),preferences:z.strictObject({floatingEnabled:z.boolean().default(true),codexBridgeEnabled:z.boolean().default(false)}).default({floatingEnabled:true,codexBridgeEnabled:false}),applicationJournal:z.array(JournalEntrySchema).max(1000).default([]),journalRevision:z.number().int().nonnegative().default(0),versions:z.array(ResumeVersionSchema).max(30).default([]),activeVersionId:z.string().nullable().default(null)});
export type LocalState = z.infer<typeof StateSchema>;
export const freshState = (): LocalState => ({storageSchemaVersion:2,revision:0,current:null,previous:null,draft:null,preferences:{floatingEnabled:true,codexBridgeEnabled:false},applicationJournal:[],journalRevision:0,versions:[],activeVersionId:null});
export function syncActiveVersion(state:LocalState):LocalState{
  if(state.current){
    const id=state.activeVersionId??state.current.profile.profile_id,index=state.versions.findIndex(v=>v.id===id),name=index>=0?state.versions[index].name:'默认简历';
    state.activeVersionId=id;state.current.profile.profile_id=id;
    const version={id,name,current:state.current,previous:state.previous};if(index<0)state.versions.push(version);else state.versions[index]=version;
  }
  return state;
}
export function enforceBudget(state: LocalState) {
  if (state.current && bytes(state.current.profile)>1048576) throw new Error('正式资料超过 1 MiB，请减少内容后再保存');
  const ids=new Set<string>();
  for(const version of state.versions){if(ids.has(version.id)||version.current.profile.profile_id!==version.id)throw new Error('简历版本标识重复或不一致');ids.add(version.id);if(bytes(version.current.profile)>1048576)throw new Error('某个简历版本超过 1 MiB');}
  if(state.activeVersionId&&(!ids.has(state.activeVersionId)||state.current?.profile.profile_id!==state.activeVersionId))throw new Error('当前简历版本与版本列表不一致');
  const records=new Set<string>();for(const record of state.applicationJournal){if(records.has(record.id))throw new Error('投递记录标识重复');records.add(record.id);}
  if (bytes(state)>MAX_STATE_BYTES) throw new Error('本地资料超过 8 MiB，请先导出并整理内容；现有资料未改动');
  return StateSchema.parse(state);
}
export function migrateLegacy(values: Record<string, unknown>): LocalState {
  const state=freshState();
  if (values.resume_profile!==undefined) state.current={profile:parseProfile(values.resume_profile),fieldMetadata:{},sourceDocument:null};
  if (values.resume_backup!==undefined) state.previous={profile:parseProfile(values.resume_backup),fieldMetadata:{},sourceDocument:null};
  state.revision=Math.max(state.current?.profile.revision??0,Number.isSafeInteger(values.resume_revision)?Number(values.resume_revision):0);
  return enforceBudget(state);
}
export const BackupSchema=z.strictObject({format:z.literal('resume-companion-backup'),version:z.literal(2),exportedAt:z.string(),state:StateSchema,modelSettings:PublicModelSchema.nullable()});
export type Backup=z.infer<typeof BackupSchema>;
export const EditorExportSchema=z.strictObject({format:z.literal('resume-companion-editor-draft'),version:z.literal(1).default(1),profile:DraftProfileSchema,markdown:z.string().refine(s=>bytes(s)<=262144),fieldMetadata:DateMetadataSchema,sourceDocument:DocumentSchema.nullable()});
export type EditorExport=z.infer<typeof EditorExportSchema>;
export function parseBackup(raw:string): Backup | Profile | EditorExport {
  if(bytes(raw)>MAX_STATE_BYTES) throw new Error('备份超过 8 MiB');
  let value:unknown; try{value=JSON.parse(raw);}catch{throw new Error('不是有效的 JSON 备份');}
  if(value&&typeof value==='object'&&'format' in value) {
    if(value.format==='resume-companion-editor-draft'){const d=EditorExportSchema.safeParse(value);if(!d.success)throw new Error('草稿文件格式或版本不支持');return d.data;}
    const b=BackupSchema.safeParse(value); if(!b.success)throw new Error('备份格式损坏或版本不支持；现有资料未改动');
    enforceBudget(b.data.state);return b.data;
  }
  return parseProfile(value);
}
export function reconcileMetadata(profile:Profile, metadata:DateMetadata):DateMetadata {
  const result:DateMetadata={};
  for(const record of [...profile.education,...profile.experience,...profile.projects,...profile.certificates]) {
    for(const field of ['start_month','end_month','obtained_month']) {
      const key=`${record.id}.${field}`, meta=metadata[key];
      if(meta&&meta.normalized===(record as Record<string,unknown>)[field]) result[key]=meta;
    }
  }
  return result;
}
export function newDraft(state:LocalState, ownerId:string):Draft {
  return {id:crypto.randomUUID(),ownerId,revision:0,baseRevision:state.revision,updatedAt:Date.now(),profile:state.current?.profile??emptyProfile(),markdown:'',fieldMetadata:state.current?.fieldMetadata??{},sourceDocument:state.current?.sourceDocument??null};
}
