import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Profile } from '../domain/profile';
import { bindingKey, matchDefinition, proposedValue, sectionNames, sources, suggestSource, sourceCompatible } from '../domain/rules';
import type { FieldResult, Snapshot, Value } from '../domain/types';
import { inExtension, openOptions, openModelSettings, openJournal, profileAction, action, STATE_KEY, widgetMode, widgetToken } from '../shared/client';
import { Brand, Notice, Modal } from '../shared/ui';
import {MODEL_KEY, modelOrigin, type ModelState, type ModelConfig} from '../domain/model';
import {prepareDisclosure,ModelFieldMatcher,type Disclosure,type MatchDecision} from '../domain/matcher';
import type {LocalState} from '../domain/state';
import '../shared/style.css';

interface Session { tabId: number; documentId: string; snapshot: Snapshot }
function App() {
  const [modelState,setModelState]=useState<ModelState>({config:null,configured:false,revision:0});
  const [disclosure,setDisclosure]=useState<Disclosure|null>(null),[modelBusy,setModelBusy]=useState(false),[modelDecisions,setModelDecisions]=useState<MatchDecision[]>([]),[modelInfo,setModelInfo]=useState('');
  const [modelSelected,setModelSelected]=useState<Record<string,boolean>>({});
  const modelController=useRef<AbortController|null>(null),modelEpoch=useRef(0);
  const invalidateAI=()=>{modelEpoch.current++;modelController.current?.abort();setDisclosure(null);setModelDecisions([]);};
  const [profile, setProfile] = useState<Profile | null>(null);
  const [versions,setVersions]=useState<{id:string;name:string}[]>([]),[versionId,setVersionId]=useState('');const versionRef=useRef('');
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [chosenSources, setChosenSources] = useState<Record<string, string>>({});
  const [editedValues, setEditedValues] = useState<Record<string, Value>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [overwrite, setOverwrite] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<FieldResult[]>([]);
  useEffect(() => {
    profileAction('PROFILE_LOAD').then(s => {setProfile(s.profile);setVersions(s.state.versions.map(v=>({id:v.id,name:v.name})));setVersionId(s.state.activeVersionId??'');versionRef.current=s.state.activeVersionId??'';if(widgetMode)void scan(s.state.activeVersionId??'');}).catch(e => setError(e.message));
    if (!inExtension) return;
    action<ModelState>('MODEL_STATE').then(setModelState).catch(e=>setError(e.message));
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if(area==='local'&&changes[MODEL_KEY]){invalidateAI();setStale(true);action<ModelState>('MODEL_STATE').then(setModelState).catch(e=>setError(e.message));}
      const change=changes[STATE_KEY];
      if (area === 'local' && change && (change.newValue as LocalState)?.revision!==(change.oldValue as LocalState)?.revision) {
        invalidateAI();
        setStale(true);
        profileAction('PROFILE_LOAD').then(async s => {setVersions(s.state.versions.map(v=>({id:v.id,name:v.name})));if(versionRef.current){try{const chosen=await action<{profile:Profile}>('VERSION_READ',{id:versionRef.current});setProfile(chosen.profile);}catch{setProfile(null);}}else setProfile(s.profile);}).catch(e => setError(e.message));
      }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {modelController.current?.abort();chrome.storage.onChanged.removeListener(changed);};
  }, []);
  useEffect(() => {
    if (!inExtension || !session) return;
    const activated = ({ tabId }: chrome.tabs.OnActivatedInfo) => { if (tabId !== session.tabId) {setStale(true);invalidateAI();} };
    const updated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => { if (tabId === session.tabId && (change.status === 'loading' || change.url)) {setStale(true);invalidateAI();} };
    chrome.tabs.onActivated.addListener(activated); chrome.tabs.onUpdated.addListener(updated);
    return () => { chrome.tabs.onActivated.removeListener(activated); chrome.tabs.onUpdated.removeListener(updated); };
  }, [session]);
  const allSources = useMemo(() => profile ? sources(profile) : [], [profile]);
  const rows = (session?.snapshot.fields ?? []).map(field => {
    const source = chosenSources[field.id] !== undefined ? allSources.find(s => s.ref === chosenSources[field.id]) : suggestSource(field, allSources, bindings);
    const proposed = source && !sourceCompatible(field,source,bindings) ? {value:null,reason:'资料来源与字段分组不一致，请核对'} : proposedValue(field, source);
    const value = field.blocked ? null : editedValues[field.id] ?? proposed.value;
    const hasExisting = field.currentValue !== null && field.currentValue !== '' && field.currentValue !== false;
    const allowed = value !== null && value !== '' && !field.blocked && (!hasExisting || Boolean(overwrite[field.id]));
    const checked = allowed && (selected[field.id] ?? !hasExisting);
    return { field, source, value, reason: proposed.reason, hasExisting, allowed, checked };
  });
  const checkedRows = rows.filter(r => r.checked);
  const bindingGroups = useMemo(() => {
    const groups = new Map<string, { title: string; records: { id: string; title: string }[] }>();
    for (const field of session?.snapshot.fields ?? []) {
      const def = matchDefinition(field);
      const section=def?.section??field.section;
      if (!['education', 'experience', 'projects'].includes(section)) continue;
      const records = [...new Map(allSources.filter(s => s.definition.section === section && s.recordId).map(s => [s.recordId!, { id: s.recordId!, title: s.recordTitle! }])).values()];
      if (records.length > 1) groups.set(bindingKey(field, section), { title: `${field.groupLabel} · ${sectionNames[section]}`, records });
    }
    return groups;
  }, [session, allSources]);
  async function scan(requestedVersion?:string) {
    if (!inExtension) { setError('请先在 Chrome 中加载插件，再打开需要填写的网页。'); return; }
    invalidateAI();setModelInfo('');setModelSelected({});
    setBusy(true); setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !/^https?:\/\//.test(tab.url ?? '')) throw new Error('请打开普通招聘网页，并点击工具栏中的“简历随行”后再扫描。');
      const state = await profileAction('PROFILE_LOAD');setVersions(state.state.versions.map(v=>({id:v.id,name:v.name})));
      const id=requestedVersion??versionRef.current??state.state.activeVersionId??'';const selectedId=id||state.state.activeVersionId||'';
      const selected=selectedId?await action<{profile:Profile}>('VERSION_READ',{id:selectedId}):{profile:state.profile};setProfile(selected.profile);setVersionId(selectedId);versionRef.current=selectedId;
      const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      const documentId = injected.find(r => r.frameId === 0)?.documentId;
      if (!documentId) throw new Error('无法确认当前页面，请更新 Chrome 后重试');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN',widgetToken }, { documentId });
      if (!response?.ok) throw new Error(response?.error ?? '网页未响应');
      await action('JOURNAL_ARM',{tabId:tab.id,documentId,sessionKey:response.data.sessionId});
      await chrome.tabs.sendMessage(tab.id,{type:'JOURNAL_ARM',sessionKey:response.data.sessionId,widgetToken},{documentId});
      setSession({ tabId: tab.id, documentId, snapshot: response.data });
      setBindings({}); setChosenSources({}); setEditedValues({}); setSelected({}); setOverwrite({}); setResults([]); setStale(false); setFinished(false);
    } catch (e) {
      const text = (e as Error).message;
      setError(/Cannot access|permission|extensions gallery/i.test(text) ? '当前网页尚未授权或不允许扩展访问。请回到该网页，点击工具栏插件后重试。' : text);
      setSession(null);
    } finally { setBusy(false); }
  }
  async function send(type: 'FILL' | 'UNDO' | 'FOCUS' | 'VALIDATE', extra = {}) {
    if (!session || stale) throw new Error('页面或资料已变化，请重新扫描');
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active.id !== session.tabId) { setStale(true); throw new Error('当前标签页已改变，请重新扫描'); }
    const result = await chrome.tabs.sendMessage(session.tabId, { type, widgetToken, sessionId: session.snapshot.sessionId, pageToken: session.snapshot.pageToken, ...extra }, { documentId: session.documentId });
    if (!result?.ok) throw new Error(result?.error ?? '网页没有响应，请重新扫描');
    return result.data;
  }
  async function fill() {
    if (!checkedRows.length || busy || finished) return;
    invalidateAI();setBusy(true); setError('');
    try {
      const current = versionRef.current?await action<{profile:Profile}>('VERSION_READ',{id:versionRef.current}):await profileAction('PROFILE_LOAD');
      if (current.profile?.revision !== profile?.revision) { setStale(true); throw new Error('简历已经更新，请重新扫描'); }
      const data = await send('FILL', { operationId: crypto.randomUUID(), operations: checkedRows.map(r => ({ fieldId: r.field.id, value: r.value, expectedValue: r.field.currentValue })) });
      setResults(data); setFinished(true); setSelected({});
    } catch (e) { setError((e as Error).message); setStale(true); } finally { setBusy(false); }
  }
  async function undo() {
    setBusy(true); setError('');
    try { setResults(await send('UNDO')); setFinished(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function recordApplication(){
    if(!session||stale)return;
    try{const result=await chrome.tabs.sendMessage(session.tabId,{type:'JOB_METADATA',widgetToken},{documentId:session.documentId});if(!result?.ok)throw new Error('无法读取岗位信息，请在记录页手动填写');const entry=await action<{id:string}>('JOURNAL_CAPTURE',{metadata:result.data});openJournal(entry.id);}catch(e){setError((e as Error).message);}
  }
  async function previewModel(){
    setError('');
    try{
      const state=await action<ModelState>('MODEL_STATE');setModelState(state);
      if(!state.configured)throw new Error('请先在模型设置中配置并测试你的 API Key');
      if(stale||!session||!profile)throw new Error('请保存资料并重新扫描');
      const targets=rows.filter(r=>!r.field.blocked&&r.field.kind!=='checkbox'&&!r.source&&(modelSelected[r.field.id]??true)).map(r=>r.field);
      const preview=prepareDisclosure(targets,allSources,bindings);setDisclosure(preview);
    }catch(e){setError((e as Error).message);}
  }
  async function runModel(){
    if(!disclosure||!session||stale)return;
    const epoch=++modelEpoch.current,controller=new AbortController();modelController.current=controller;setModelBusy(true);setError('');
    try{
      const access=await action<{config:ModelConfig;key:string|null}|null>('MODEL_ACCESS');
      if(!access?.key||access.config.revision!==modelState.revision)throw new Error('模型设置已变化，请重新预览');
      if(!await chrome.permissions.contains({origins:[modelOrigin(access.config.baseUrl)]}))throw new Error('模型域名未授权，请在模型设置中重新连接');
      const answer=await new ModelFieldMatcher(access.config,access.key).matchDisclosure(disclosure,session.snapshot.fields,allSources,bindings,controller.signal);
      const current=versionRef.current?await action<{profile:Profile;revision:number}>('VERSION_READ',{id:versionRef.current}):await profileAction('PROFILE_LOAD'),latest=await action<ModelState>('MODEL_STATE');
      if(controller.signal.aborted||epoch!==modelEpoch.current||current.revision!==profile?.revision||latest.revision!==access.config.revision)return;
      // Ask the engine to verify the original scan's targets before accepting asynchronous advice.
      await send('VALIDATE');
      setModelDecisions(answer.decisions);setDisclosure(null);setModelInfo(`${answer.reply.model} · ${(answer.reply.milliseconds/1000).toFixed(2)} 秒 · 输入 ${answer.reply.usage.input} / 输出 ${answer.reply.usage.output} tokens`);
    }catch(e){if(epoch===modelEpoch.current)setError((e as Error).message);}finally{if(modelController.current===controller){modelController.current=null;setModelBusy(false);}}
  }
  return <main className={widgetMode?"panel widget-panel":"panel"}><header className="panel-header"><Brand small/><span className="local-badge"><span className="status-dot"/>本地资料</span></header>
    <section className="panel-intro"><span className="eyebrow">让重复填写，少一点。</span><h1>把时间留给<br/>更重要的机会<span className="title-dot">.</span></h1><p>选择资料，检查预览，填写当前页。</p></section>
    <section className="version-choice"><label className="form-field"><span>本次填写使用的简历版本</span><select aria-label="本次填写的简历版本" value={versionId} disabled={busy||modelBusy} onChange={event=>{invalidateAI();void scan(event.target.value);}}><option value="" disabled>请先在资料页保存一个版本</option>{versions.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label><p className="subtle">选择版本后核对可填内容，确认即可开始填写。</p></section>
    <button className="profile-strip" onClick={openOptions}><span className="avatar">{profile?.basic.full_name?.slice(-2) || '你'}</span><span><strong>{profile?.basic.full_name || '建立你的第一份资料'}</strong><small>{profile ? `${profile.education.length} 段教育 · ${profile.projects.length} 个项目` : '只需整理一次，之后反复使用'}</small></span><span className="arrow">↗</span></button>
    <button className="sync-link" onClick={openModelSettings}>模型设置 {modelState.configured ? '· 已配置' : '· 可选'} ↗</button>
    <div className="toolbar"><button onClick={()=>openJournal()}>投递记录与统计 ↗</button>{session&&<button disabled={stale||busy} onClick={recordApplication}>记录这次投递</button>}</div>
    {error && <Notice error>{error}</Notice>}
    <button className="primary scan-button" disabled={busy} onClick={()=>void scan()}>{busy ? '正在处理…' : session ? '重新扫描当前页' : '扫描当前页'} <span aria-hidden="true">↗</span></button>
    {stale && session && <Notice error>页面或资料已变化。请重新扫描后再填写。</Notice>}
    {!session ? <section className="how-it-works"><span className="eyebrow">三步，轻装上阵</span>{[['01','准备资料','在编辑页保存基本信息与经历。'],['02','扫描与预览','检查字段来源，选择需要填写的内容。'],['03','确认后填写','填写完成后，由你检查并提交申请。']].map(([n,t,d]) => <div key={n}><b>{n}</b><span><strong>{t}</strong><p>{d}</p></span></div>)}<p className="subtle">当前支持普通输入、原生选择与年月控件。复杂控件会提示手动处理。</p></section>
    : <><div className="scan-summary"><div><span className="eyebrow">当前页面</span><strong>{new URL(session.snapshot.url).hostname}</strong></div><div><b>{rows.length}</b><small>个字段</small></div></div>
      {session.snapshot.notices.map(n => <Notice key={n}>{n}</Notice>)}
      {rows.length === 0 && <Notice>没有找到可见表单，请先展开需要填写的栏目。</Notice>}
      {!profile && <Notice>还没有保存资料。可以先编辑简历，再重新扫描。</Notice>}
      {bindingGroups.size > 0 && <section className="binding-card"><h2>先对应每一段经历</h2><p>网站顺序可能不同，请明确选择。</p>{[...bindingGroups].map(([key, group]) => <label className="form-field" key={key}><span>{group.title}</span><select aria-label={group.title} disabled={busy || stale || finished} value={bindings[key] ?? ''} onChange={e => {invalidateAI();setBindings({ ...bindings, [key]: e.target.value });}}><option value="">选择本地经历</option>{group.records.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>)}</section>}
      {profile&&!finished&&rows.some(r=>!r.field.blocked&&r.field.kind!=='checkbox'&&!r.source)&&<section className="binding-card"><h2>陌生字段，让模型帮你对应</h2><p>先核对发送的字段描述，返回后选择资料来源。每次最多 20 项。</p>
        {rows.filter(r=>!r.field.blocked&&r.field.kind!=='checkbox'&&!r.source).map(r=><label className="check-line" key={r.field.id}><input type="checkbox" checked={modelSelected[r.field.id]??true} disabled={modelBusy||stale} onChange={event=>{invalidateAI();setModelSelected({...modelSelected,[r.field.id]:event.target.checked});}}/>{r.field.label}</label>)}
        <button disabled={busy||modelBusy||stale} onClick={previewModel}>用模型辅助匹配</button>{modelBusy&&<button onClick={()=>{invalidateAI();setModelBusy(false);}}>取消模型请求</button>}{modelInfo&&<p>{modelInfo}</p>}
      </section>}
      <div className="preview-heading"><h2>填写预览</h2><span>{finished ? '本次结果' : `${checkedRows.length} 项已选`}</span></div>
      <div className="field-list">{rows.map(row => {
        const { field, source, value, hasExisting, allowed, checked, reason } = row;
        const result = results.find(r => r.fieldId === field.id);
        return <article key={field.id} className={`field-card ${field.blocked ? 'blocked' : ''} ${result?.status === 'filled' ? 'success' : ''}`}>
          <div className="field-title"><label><input type="checkbox" aria-label={`填写 ${field.label}`} checked={!finished && checked} disabled={busy || stale || finished || !allowed} onChange={e => setSelected({ ...selected, [field.id]: e.target.checked })}/><strong>{field.label}</strong>{field.required && <small>必填</small>}</label><button className="locate" disabled={busy || stale} onClick={() => send('FOCUS', { fieldId: field.id }).catch(e => setError(e.message))}>定位 ↗</button></div>
          <p className="field-context">{field.groupLabel}</p>
          {modelDecisions.find(d=>d.fieldId===field.id)&&<div className="model-advice"><strong>模型建议 · 请核对</strong>{modelDecisions.find(d=>d.fieldId===field.id)!.candidates.map(c=><div key={c.sourceRef}><span>{allSources.find(s=>s.ref===c.sourceRef)?.definition.label} · {c.reason}</span><button disabled={stale||busy} onClick={()=>{modelEpoch.current++;modelController.current?.abort();setDisclosure(null);setModelDecisions(items=>items.filter(d=>d.fieldId!==field.id));setChosenSources(previous=>({...previous,[field.id]:c.sourceRef}));}}>使用此来源</button></div>)}{!modelDecisions.find(d=>d.fieldId===field.id)!.candidates.length&&<p>未能确定，请手动选择来源。</p>}</div>}
          {field.blocked ? <p className="field-reason">{field.blocked}</p> : <>
            <label className="source-select"><span>资料来源</span><select aria-label={`${field.label} 的资料来源`} disabled={busy || stale || finished} value={source?.ref ?? ''} onChange={e => { invalidateAI();setChosenSources(previous=>({ ...previous, [field.id]: e.target.value })); const next = { ...editedValues }; delete next[field.id]; setEditedValues(next); }}><option value="">手动选择来源</option>{allSources.filter(s=>sourceCompatible(field,s,bindings)).map(s => <option key={s.ref} value={s.ref}>{s.recordTitle ? `${s.recordTitle} · ` : ''}{s.definition.label}{!s.value ? '（未填写）' : ''}</option>)}</select></label>
            {field.kind === 'select-one' || field.kind === 'radio' ? <select className="preview-value" aria-label={`${field.label} 的拟填内容`} disabled={busy || stale || finished} value={typeof value === 'string' ? value : ''} onChange={e => { invalidateAI();setEditedValues({ ...editedValues, [field.id]: e.target.value || '' }); setSelected({ ...selected, [field.id]: Boolean(e.target.value) }); }}><option value="">选择网页已有选项</option>{field.options.map((o, i) => <option key={i} value={o.value}>{o.label}</option>)}</select>
              : field.kind === 'checkbox' ? <div className="preview-value">{value === true ? '将勾选此项技能' : '没有匹配的已确认技能'}</div>
              : <textarea className="preview-value" aria-label={`${field.label} 的拟填内容`} rows={field.kind === 'textarea' ? 3 : 1} disabled={busy || stale || finished} placeholder="尚无可填内容，可手动输入" value={typeof value === 'string' ? value : ''} onChange={e => {invalidateAI();setEditedValues({ ...editedValues, [field.id]: e.target.value });}}/>}
            <p className="field-reason">{reason}</p>
            {hasExisting && <div className="existing-value"><span>网页已有：{String(field.currentValue).slice(0, 160)}</span><label><input type="checkbox" disabled={busy || stale || finished} checked={Boolean(overwrite[field.id])} onChange={e => { setOverwrite({ ...overwrite, [field.id]: e.target.checked }); setSelected({ ...selected, [field.id]: e.target.checked }); }}/>允许覆盖这一项</label></div>}
          </>}
          {result && <p role="status" className={`result ${result.status}`}>{result.status === 'filled' ? '✓ ' : ''}{result.message}</p>}
        </article>;
      })}</div>
      {session && <footer className="panel-actions">{finished ? <><strong>{results.filter(r => r.status === 'filled').length} 项填写成功</strong><button disabled={busy || stale} onClick={undo}>撤销本次填写</button><small>撤销仅尝试恢复当前页面的值，无法回滚网站自动保存。</small></> : <><button className="primary" disabled={busy || stale || !profile || !checkedRows.length} onClick={fill}>{widgetMode?'确认填写':'填写选中的'} {checkedRows.length} 项 <span aria-hidden="true">{widgetMode?'✓':'→'}</span></button><small>只填写选中内容，不会点击提交或下一步。</small></>}</footer>}
    </>}
    {disclosure&&<Modal title="检查模型发送内容" onClose={()=>{invalidateAI();setModelBusy(false);}}><p>发送至 {modelState.config?.baseUrl} · {modelState.config?.model}。仅含字段与来源说明，不含简历实际值。可以修改标签和说明，或取消后减少字段。</p><textarea aria-label="模型发送内容" className="markdown-input" value={disclosure.text} disabled={modelBusy} onChange={event=>{modelEpoch.current++;setDisclosure({...disclosure,text:event.target.value});}}/><div className="modal-actions"><button onClick={()=>{invalidateAI();setModelBusy(false);}}>取消</button><button className="primary" disabled={modelBusy||stale} onClick={runModel}>{modelBusy?'模型匹配中…':'确认发送并匹配'}</button></div></Modal>}
    <div className="panel-bottom">由你掌握每一次填写</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
