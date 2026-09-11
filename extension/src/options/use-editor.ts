import {useEffect,useRef,useState} from 'react';
import {emptyProfile,type Profile} from '../domain/profile';
import {STATE_KEY,reconcileMetadata,type DateMetadata,type SourceDocument,type Draft,type LocalState} from '../domain/state';
import {action,inExtension,type ProfileState} from '../shared/client';
import {prepareProfile} from '../shared/profile-editor';

export function useEditor(){
  const [profile,setProfile]=useState<Profile>(emptyProfile),[markdown,setMarkdown]=useState(''),[metadata,setMetadata]=useState<DateMetadata>({}),[source,setSource]=useState<SourceDocument|null>(null);
  const [state,setState]=useState<LocalState|null>(null),[loaded,setLoaded]=useState(false),[locked,setLocked]=useState(false),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[draftStatus,setDraftStatus]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('');
  const owner=useRef(crypto.randomUUID()),stateRef=useRef(state),draft=useRef<Draft|null>(null),base=useRef(0),buffer=useRef({profile,markdown,metadata,source});
  const editVersion=useRef(0),persisted=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),queue=useRef(Promise.resolve()),isLocked=useRef(false);
  const writingFormal=useRef(false);
  buffer.current={profile,markdown,metadata,source};stateRef.current=state;isLocked.current=locked;
  function queueJob<T>(job:()=>Promise<T>):Promise<T>{const next=queue.current.then(job,job);queue.current=next.then(()=>{},()=>{});return next;}
  function accept(s:ProfileState){stateRef.current=s.state;setState(s.state);}
  function showFormal(s:ProfileState){
    accept(s);base.current=s.revision;draft.current=null;
    const p=s.profile??emptyProfile(),m=s.state.current?.fieldMetadata??{},doc=s.state.current?.sourceDocument??null;
    buffer.current={profile:p,markdown:'',metadata:m,source:doc};setProfile(p);setMarkdown('');setMetadata(m);setSource(doc);setDirty(false);setLocked(Boolean(s.state.draft));isLocked.current=Boolean(s.state.draft);editVersion.current=0;persisted.current=0;setDraftStatus('');setLoaded(true);
  }
  async function load(){try{showFormal(await action<ProfileState>('PROFILE_LOAD'));setError('');}catch(e){setError((e as Error).message);}}
  useEffect(()=>{
    void load();if(!inExtension)return;
    const changed=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
      if(area!=='local'||!changes[STATE_KEY])return;
      const next=changes[STATE_KEY].newValue as LocalState|undefined;if(!next)return;
      setState(next);stateRef.current=next;
      if(next.draft&&next.draft.ownerId!==owner.current){setLocked(true);isLocked.current=true;setDraftStatus('另一窗口持有草稿');}
      else if(!next.draft){setLocked(false);isLocked.current=false;}
      if(next.revision!==base.current&&editVersion.current>0&&!writingFormal.current)setError('正式资料已在其他窗口更新。本页修改已保留，请核对差异或导出本页草稿。');
    };
    const leaving=(event:BeforeUnloadEvent)=>{if(editVersion.current!==persisted.current){event.preventDefault();event.returnValue='';}};
    chrome.storage.onChanged.addListener(changed);window.addEventListener('beforeunload',leaving);
    return()=>{clearTimeout(timer.current);chrome.storage.onChanged.removeListener(changed);window.removeEventListener('beforeunload',leaving);};
  },[]);
  async function persist(){
    if(isLocked.current)throw new Error('请先恢复或接管草稿');
    if(!draft.current){const s=await action<ProfileState>('DRAFT_ACQUIRE',{ownerId:owner.current,expectedRevision:base.current});draft.current=s.state.draft;accept(s);}
    if(!draft.current)throw new Error('无法创建草稿');
    const version=editVersion.current,b=buffer.current;
    const next={...draft.current,profile:b.profile,markdown:b.markdown,fieldMetadata:reconcileMetadata(b.profile,b.metadata),sourceDocument:b.source};
    const s=await action<ProfileState>('DRAFT_SAVE',{draft:next,ownerId:owner.current,draftRevision:draft.current.revision});draft.current=s.state.draft;accept(s);persisted.current=version;setDraftStatus('草稿已保存');
  }
  function touch(){editVersion.current++;setDirty(true);setStatus('');setDraftStatus('草稿待保存');clearTimeout(timer.current);timer.current=setTimeout(()=>{void queueJob(persist).catch(e=>{setError(e.message);setDraftStatus('草稿保存失败');});},1000);}
  function changeProfile(p:Profile){const m=reconcileMetadata(p,buffer.current.metadata);buffer.current={...buffer.current,profile:p,metadata:m};setProfile(p);setMetadata(m);touch();}
  function changeMarkdown(text:string){buffer.current={...buffer.current,markdown:text};setMarkdown(text);touch();}
  function applyProfile(p:Profile,m:DateMetadata={},doc:SourceDocument|null=null){
    const next={...p,supplemental_fields:buffer.current.profile.supplemental_fields};
    buffer.current={...buffer.current,profile:next,metadata:m,source:doc};setProfile(next);setMetadata(m);setSource(doc);touch();
  }
  function applyDraft(p:Profile,md:string,m:DateMetadata,doc:SourceDocument|null){buffer.current={profile:p,markdown:md,metadata:m,source:doc};setProfile(p);setMarkdown(md);setMetadata(m);setSource(doc);touch();}
  async function save(){
    clearTimeout(timer.current);setBusy(true);setError('');
    try{await queueJob(async()=>{
      await persist();const b=buffer.current;
      writingFormal.current=true;
      const s=await action<ProfileState>('PROFILE_SAVE',{profile:prepareProfile(b.profile),fieldMetadata:b.metadata,sourceDocument:b.source,expectedRevision:base.current,ownerId:owner.current,draftRevision:draft.current?.revision});
      // Keep the input text visible after saving, even though the active editing draft is now closed.
      const md=b.markdown;showFormal(s);buffer.current.markdown=md;setMarkdown(md);setStatus('资料已保存到本机');
    });}catch(e){setError((e as Error).message);}finally{writingFormal.current=false;setBusy(false);}
  }
  async function restoreDraft(rebase=false){
    clearTimeout(timer.current);setBusy(true);setError('');
    try{await queueJob(async()=>{
      const current=await action<ProfileState>('PROFILE_LOAD');
      const s=await action<ProfileState>('DRAFT_ACQUIRE',{ownerId:owner.current,takeover:true,draftRevision:current.state.draft?.revision,rebase,expectedRevision:current.revision});
      const d=s.state.draft!;accept(s);draft.current=d;base.current=d.baseRevision;
      buffer.current={profile:d.profile,markdown:d.markdown,metadata:d.fieldMetadata,source:d.sourceDocument};setProfile(d.profile);setMarkdown(d.markdown);setMetadata(d.fieldMetadata);setSource(d.sourceDocument);
      editVersion.current=1;persisted.current=1;setDirty(true);setLocked(false);isLocked.current=false;setDraftStatus('草稿已恢复');setLoaded(true);
    });}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function mutate(type:'PROFILE_CLEAR'|'PROFILE_RESTORE'|'BACKUP_RESTORE',payload:Record<string,unknown>={}){
    clearTimeout(timer.current);setBusy(true);setError('');
    try{await queueJob(async()=>{
      const s=await action<ProfileState>(type,{...payload,expectedRevision:base.current,ownerId:owner.current,draftRevision:draft.current?.revision});showFormal(s);setStatus('本地资料已更新');
    });}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function discardDraft(){
    clearTimeout(timer.current);setBusy(true);
    try{await queueJob(async()=>{
      const current=await action<ProfileState>('PROFILE_LOAD');
      if(current.state.draft){const acquired=await action<ProfileState>('DRAFT_ACQUIRE',{ownerId:owner.current,takeover:true,draftRevision:current.state.draft.revision});await action('DRAFT_DROP',{ownerId:owner.current,draftRevision:acquired.state.draft?.revision});}
      showFormal(await action<ProfileState>('PROFILE_LOAD'));setError('');
    });}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function flush(){clearTimeout(timer.current);if(dirty&&!locked)await queueJob(persist);}
  return {profile,markdown,metadata,source,state,loaded,locked,busy,dirty,draftStatus,error,status,editVersion,base,changeProfile,changeMarkdown,applyProfile,applyDraft,save,restoreDraft,mutate,discardDraft,flush,load,setError};
}
