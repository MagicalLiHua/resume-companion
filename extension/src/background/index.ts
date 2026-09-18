import {z} from 'zod';
import {parseProfile,emptyProfile} from '../domain/profile';
import {trustedPage} from '../domain/types';
import {STATE_KEY,StateSchema,SnapshotSchema,DraftSchema,BackupSchema,ResumeVersionSchema,enforceBudget,migrateLegacy,newDraft,reconcileMetadata,syncActiveVersion,type LocalState,type FormalSnapshot} from '../domain/state';
import {modelAccess,modelState,saveModel,clearModel,restoreModelSettings} from './model-storage';
import {JournalEntrySchema,JobMetadataSchema,applicationUrl,type JournalEntry} from '../domain/journal';
import {startCodexBridge} from './codex-bridge';
import {CodexTools} from './codex-tools';

const protect=()=>Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
const ready=protect();let queue=Promise.resolve<unknown>(undefined);
function serialized<T>(job:()=>Promise<T>):Promise<T>{const next=queue.then(job,job);queue=next.catch(()=>undefined);return next;}
const revision=(expected:unknown,actual:number)=>{if(expected!==actual)throw new Error('资料已在其他窗口更新，请重新加载后再保存');};
async function commit(state:LocalState){syncActiveVersion(state);await chrome.storage.local.set({[STATE_KEY]:enforceBudget(state)});return publicState(state);}
const publicState=(state:LocalState)=>({profile:state.current?.profile??null,hasBackup:Boolean(state.previous),revision:state.revision,state});
async function cleanupLegacy(values:Record<string,unknown>){
  const connection=values.resume_connection as {origin?:unknown}|undefined;
  await chrome.storage.local.remove(['resume_profile','resume_backup','resume_revision','resume_connection']);
  if(typeof connection?.origin==='string')try{
    const old=new URL(connection.origin),current=await modelState();
    if(current.config&&new URL(current.config.baseUrl).hostname===old.hostname)return;
    const origins=(await chrome.permissions.getAll()).origins??[];
    const remove=origins.filter(p=>{try{const u=new URL(p.replace(/:\*\//,'/'));return u.hostname===old.hostname&&u.protocol===old.protocol;}catch{return false;}});
    if(remove.length)await chrome.permissions.remove({origins:remove});
  }catch{/* Revocation does not undo verified data migration. */}
}
async function load():Promise<LocalState>{
  await ready;const values=await chrome.storage.local.get([STATE_KEY,'resume_profile','resume_backup','resume_revision','resume_connection']);
  if(values[STATE_KEY]!==undefined){
    const parsed=StateSchema.safeParse(values[STATE_KEY]);if(!parsed.success)throw new Error('本地资料格式异常或版本过新。请先导出原始数据或恢复上一份；现有数据未改动。');
    if(parsed.data.current&&!parsed.data.versions.length)await commit(parsed.data);
    if(values.resume_connection!==undefined||values.resume_profile!==undefined)await cleanupLegacy(values);
    return parsed.data;
  }
  const state=migrateLegacy(values);await commit(state);
  const verified=StateSchema.parse((await chrome.storage.local.get(STATE_KEY))[STATE_KEY]);
  if(JSON.stringify(state)!==JSON.stringify(verified))throw new Error('资料迁移核对失败，旧数据已保留');
  await cleanupLegacy(values);return state;
}
const codexTools=new CodexTools(load);
const refreshCodexBridge=startCodexBridge((method,params,context)=>codexTools.handle(method,params,context),async()=>{
  await ready;const stored=(await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
  return StateSchema.safeParse(stored).data?.preferences.codexBridgeEnabled===true;
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[STATE_KEY])refreshCodexBridge();});
function owns(state:LocalState,message:Record<string,unknown>){
  if(state.draft&&(state.draft.ownerId!==message.ownerId||state.draft.revision!==message.draftRevision))throw new Error('草稿已在另一窗口编辑，请恢复或接管最新草稿后再操作');
}
chrome.runtime.onInstalled.addListener(()=>{void protect();});
chrome.runtime.onStartup.addListener(()=>{void protect();});
chrome.action.onClicked.addListener(tab=>{if(tab.id!==undefined)void chrome.sidePanel.open({tabId:tab.id});});
chrome.tabs.onRemoved.addListener(tabId=>{codexTools.forgetTab(tabId);void chrome.storage.session.remove([`widget_${tabId}`,`journal_arm_${tabId}`]);});
const messages=['PROFILE_LOAD','PROFILE_SAVE','PROFILE_RESTORE','PROFILE_CLEAR','PROFILE_EXPORT','PROFILE_EXPORT_RAW','BACKUP_RESTORE','DRAFT_ACQUIRE','DRAFT_SAVE','DRAFT_DROP','MODEL_STATE','MODEL_ACCESS','MODEL_SAVE','MODEL_CLEAR','JOURNAL_LIST','JOURNAL_SAVE','JOURNAL_DELETE','JOURNAL_ARM','JOURNAL_CAPTURE','VERSION_READ','VERSION_CREATE','VERSION_SELECT','VERSION_RENAME','VERSION_DELETE','PREFS_SET'];
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type==='WIDGET_REGISTER'&&sender.id===chrome.runtime.id&&sender.tab?.id!==undefined&&sender.frameId===0&&/^https?:/.test(sender.url??'')){
    serialized(async()=>{const state=await load(),token=crypto.randomUUID();await chrome.storage.session.set({[`widget_${sender.tab!.id}`]:{token,documentId:sender.documentId}});return {enabled:state.preferences.floatingEnabled,token};}).then(data=>respond({ok:true,data}),()=>respond({ok:false}));return true;
  }
  if(message?.type==='JOURNAL_SIGNAL'&&sender.id===chrome.runtime.id&&sender.tab?.id!==undefined&&sender.frameId===0){
    serialized(async()=>{
      await ready;const arm=(await chrome.storage.session.get(`journal_arm_${sender.tab!.id}`))[`journal_arm_${sender.tab!.id}`] as {sessionKey:string;documentId:string}|undefined;
      if(!arm||arm.sessionKey!==message.sessionKey||arm.documentId!==sender.documentId||!['submit_detected','success_detected'].includes(message.evidence))throw new Error('投递记录会话无效');
      const metadata=JobMetadataSchema.parse(message.metadata);if(metadata.url!==applicationUrl(sender.url!))throw new Error('投递页面已变化');
      const state=await load(),old=state.applicationJournal.find(e=>e.sessionKey===arm.sessionKey);
      if(old){if(message.evidence==='success_detected'){old.evidence='success_detected';old.updatedAt=Date.now();}else return {recorded:true};}
      else state.applicationJournal.push({...metadata,id:crypto.randomUUID(),status:'recorded',appliedDate:new Date().toLocaleDateString('sv-SE'),notes:'',createdAt:Date.now(),updatedAt:Date.now(),evidence:message.evidence,sessionKey:arm.sessionKey});
      state.journalRevision++;await commit(state);return {recorded:true};
    }).then(data=>respond({ok:true,data}),()=>respond({ok:false,error:'投递记录未保存，请打开记录页手动登记'}));return true;
  }
  const widgetCandidate=sender.id===chrome.runtime.id&&sender.tab?.id!==undefined&&sender.url?.startsWith(chrome.runtime.getURL('sidepanel.html')+'?widget=');
  if((!trustedPage(sender)&&!widgetCandidate)||!message||!messages.includes(message.type))return false;
  serialized(async()=>{
    await ready;
    if(widgetCandidate){const registered=(await chrome.storage.session.get(`widget_${sender.tab!.id}`))[`widget_${sender.tab!.id}`] as {token?:string}|undefined;if(!registered?.token||message.widgetToken!==registered.token)throw new Error('悬浮窗口会话已失效，请关闭后重新打开');}
    if(message.type==='MODEL_STATE')return modelState();
    if(message.type==='MODEL_ACCESS')return modelAccess();
    if(message.type==='MODEL_SAVE')return saveModel(message.input,message.expectedRevision);
    if(message.type==='MODEL_CLEAR')return clearModel(message.expectedRevision);
    if(message.type==='PROFILE_EXPORT_RAW')return (await chrome.storage.local.get([STATE_KEY,'resume_profile','resume_backup']));
    if(message.type==='PROFILE_RESTORE'){
      let state:LocalState;
      try{state=await load();}catch{
        const raw=(await chrome.storage.local.get(STATE_KEY))[STATE_KEY] as LocalState|undefined;
        if(!raw||raw.storageSchemaVersion!==2||!raw.previous)throw new Error('没有可恢复的有效上一份，请先导出原始数据');
        const previous=SnapshotSchema.parse(raw.previous);
        if(message.expectedRevision!==0)revision(message.expectedRevision,raw.revision);
        await chrome.storage.local.set({resume_recovery:raw});
        const versions=(Array.isArray(raw.versions)?raw.versions:[]).flatMap(v=>{const parsed=ResumeVersionSchema.safeParse(v);return parsed.success?[parsed.data]:[];});
        state={storageSchemaVersion:2,revision:raw.revision,current:null,previous,draft:null,preferences:{floatingEnabled:true,codexBridgeEnabled:false},applicationJournal:raw.applicationJournal??[],journalRevision:raw.journalRevision??0,versions,activeVersionId:raw.activeVersionId??previous.profile.profile_id};
      }
      revision(message.expectedRevision===0&&state.current===null?state.revision:message.expectedRevision,state.revision);owns(state,message);
      if(!state.previous)throw new Error('没有可恢复的上一份');
      const target=state.previous;state.previous=state.current;state.revision++;state.current={...target,profile:{...target.profile,revision:state.revision}};state.draft=null;return commit(state);
    }
    const state=await load();
    if(message.type==='PREFS_SET'){
      let changed=false;
      if(message.floatingEnabled!==undefined){state.preferences.floatingEnabled=z.boolean().parse(message.floatingEnabled);changed=true;}
      if(message.codexBridgeEnabled!==undefined){state.preferences.codexBridgeEnabled=z.boolean().parse(message.codexBridgeEnabled);changed=true;}
      if(!changed)throw new Error('没有可更新的偏好设置');
      await commit(state);
      if(message.floatingEnabled!==undefined)for(const tab of await chrome.tabs.query({}))if(tab.id!==undefined)void chrome.tabs.sendMessage(tab.id,{type:'WIDGET_VISIBILITY',enabled:state.preferences.floatingEnabled},{frameId:0}).catch(()=>{});
      return publicState(state);
    }
    if(message.type==='VERSION_READ'){
      const v=state.versions.find(v=>v.id===message.id);if(!v)throw new Error('这个简历版本已不存在，请重新选择');
      return {profile:v.current.profile,revision:v.current.profile.revision,name:v.name,id:v.id};
    }
    if(message.type.startsWith('VERSION_')){
      revision(message.expectedRevision,state.revision);if(state.draft)throw new Error('请先保存资料或放弃草稿，再管理简历版本');
      const index=state.versions.findIndex(v=>v.id===message.id);
      if(message.type==='VERSION_CREATE'){
        if(state.versions.length>=30)throw new Error('最多保存 30 份简历，请导出并整理后再创建');
        const name=z.string().trim().min(1).max(80).parse(message.name);if(state.versions.some(v=>v.name===name))throw new Error('简历版本名已存在');
        const snapshot:FormalSnapshot=message.clone&&state.current?structuredClone(state.current):{profile:emptyProfile(),fieldMetadata:{},sourceDocument:null};
        const id=crypto.randomUUID();state.revision++;snapshot.profile={...snapshot.profile,profile_id:id,revision:state.revision};state.versions.push({id,name,current:snapshot,previous:null});state.activeVersionId=id;state.current=snapshot;state.previous=null;
      }else{
        if(index<0)throw new Error('简历版本已不存在');
        if(message.type==='VERSION_RENAME'){
          const name=z.string().trim().min(1).max(80).parse(message.name);if(state.versions.some(v=>v.name===name&&v.id!==message.id))throw new Error('简历版本名已存在');state.versions[index].name=name;state.revision++;
        }else if(message.type==='VERSION_SELECT'){
          const version=state.versions[index];state.revision++;state.activeVersionId=version.id;state.current=structuredClone(version.current);state.current.profile.revision=state.revision;state.previous=version.previous;
        }else if(message.type==='VERSION_DELETE'){
          state.versions.splice(index,1);state.revision++;
          if(state.activeVersionId===message.id){const next=state.versions[0];state.activeVersionId=next?.id??null;state.current=next?structuredClone(next.current):null;state.previous=next?.previous??null;if(state.current)state.current.profile.revision=state.revision;}
        }
      }
      return commit(state);
    }
    if(message.type==='JOURNAL_LIST')return {entries:state.applicationJournal,revision:state.journalRevision};
    if(message.type==='JOURNAL_ARM'){
      if(!Number.isInteger(message.tabId)||typeof message.documentId!=='string'||typeof message.sessionKey!=='string')throw new Error('无法确认投递页面');
      await chrome.storage.session.set({[`journal_arm_${message.tabId}`]:{sessionKey:message.sessionKey,documentId:message.documentId}});return {armed:true};
    }
    if(message.type==='JOURNAL_CAPTURE'){
      const metadata=JobMetadataSchema.parse(message.metadata),entry:JournalEntry={...metadata,id:crypto.randomUUID(),status:'recorded',appliedDate:new Date().toLocaleDateString('sv-SE'),notes:'',createdAt:Date.now(),updatedAt:Date.now(),evidence:'manual',sessionKey:null};
      state.applicationJournal.push(entry);state.journalRevision++;await commit(state);return {id:entry.id};
    }
    if(message.type==='JOURNAL_SAVE'||message.type==='JOURNAL_DELETE'){
      if(message.expectedRevision!==state.journalRevision)throw new Error('投递记录已更新，请重新载入后再保存');
      if(message.type==='JOURNAL_SAVE'){
        const entry=JournalEntrySchema.parse(message.entry),i=state.applicationJournal.findIndex(e=>e.id===entry.id);
        if(i>=0)state.applicationJournal[i]={...entry,createdAt:state.applicationJournal[i].createdAt,updatedAt:Date.now()};else state.applicationJournal.push({...entry,createdAt:Date.now(),updatedAt:Date.now()});
      }else state.applicationJournal=state.applicationJournal.filter(e=>e.id!==message.id);
      state.journalRevision++;await commit(state);return {entries:state.applicationJournal,revision:state.journalRevision};
    }
    if(message.type==='PROFILE_LOAD')return publicState(state);
    if(message.type==='PROFILE_EXPORT'){
      const m=await modelState();return BackupSchema.parse({format:'resume-companion-backup',version:2,exportedAt:new Date().toISOString(),state,modelSettings:m.config?{protocol:m.config.protocol,baseUrl:m.config.baseUrl,model:m.config.model,revision:m.revision}:null});
    }
    if(message.type==='DRAFT_ACQUIRE'){
      if(message.expectedRevision!==undefined)revision(message.expectedRevision,state.revision);
      const ownerId=z.string().min(1).max(100).parse(message.ownerId);
      if(state.draft&&state.draft.ownerId!==ownerId){if(message.takeover!==true||message.draftRevision!==state.draft.revision)throw new Error('已有草稿，请先恢复或明确接管');}
      if(!state.draft)state.draft=newDraft(state,ownerId);
      else state.draft={...state.draft,ownerId,revision:state.draft.revision+1,updatedAt:Date.now()};
      if(message.rebase===true){revision(message.expectedRevision,state.revision);state.draft.baseRevision=state.revision;}
      return commit(state);
    }
    if(message.type==='DRAFT_SAVE'){
      owns(state,message);if(!state.draft)throw new Error('草稿会话已结束，请重新打开资料页');
      const incoming=DraftSchema.parse(message.draft);
      if(incoming.id!==state.draft.id||incoming.baseRevision!==state.draft.baseRevision)throw new Error('草稿版本不一致，请重新接管');
      state.draft={...incoming,ownerId:state.draft.ownerId,revision:state.draft.revision+1,updatedAt:Date.now()};return commit(state);
    }
    if(message.type==='DRAFT_DROP'){owns(state,message);state.draft=null;return commit(state);}
    revision(message.expectedRevision,state.revision);owns(state,message);
    if(message.type==='PROFILE_CLEAR'){
      state.current=null;state.previous=null;state.draft=null;state.versions=[];state.activeVersionId=null;state.applicationJournal=[];state.journalRevision++;state.revision++;await chrome.storage.local.remove('resume_recovery');return commit(state);
    }
    if(message.type==='BACKUP_RESTORE'){
      const backup=BackupSchema.parse(message.backup),target=message.snapshot==='previous'?backup.state.previous:backup.state.current;
      if(!target)throw new Error('所选备份没有正式资料');
      state.previous=state.current;state.revision++;state.current={...target,profile:{...target.profile,revision:state.revision}};
      state.draft=backup.state.draft?{...backup.state.draft,ownerId:'restored-backup',revision:0,baseRevision:state.revision,updatedAt:Date.now()}:null;
      state.applicationJournal=backup.state.applicationJournal;state.journalRevision++;
      state.versions=backup.state.versions.map(v=>({...v,current:{...v.current,profile:{...v.current.profile,revision:state.revision}}}));state.activeVersionId=backup.state.activeVersionId??target.profile.profile_id;
      state.preferences=backup.state.preferences;
      await commit(state);
      await restoreModelSettings(backup.modelSettings);
      return publicState(state);
    }
    const profile=parseProfile(message.profile);state.revision++;
    const snapshot:FormalSnapshot=SnapshotSchema.parse({profile:{...profile,profile_id:state.activeVersionId??profile.profile_id,revision:state.revision},fieldMetadata:reconcileMetadata(profile,message.fieldMetadata??state.current?.fieldMetadata??{}),sourceDocument:message.sourceDocument===undefined?state.current?.sourceDocument??null:message.sourceDocument});
    if(snapshot.sourceDocument&&snapshot.sourceDocument.profileRevision===0)snapshot.sourceDocument.profileRevision=state.revision;
    state.previous=state.current??state.previous;state.current=snapshot;state.draft=null;return commit(state);
  }).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error instanceof z.ZodError?'资料格式或设置不正确，请检查输入':error instanceof Error?error.message:'资料操作失败'}));
  return true;
});
