import {useEffect,useRef,useState} from 'react';
import {action,inExtension} from '../shared/client';
import {Notice,Modal} from '../shared/ui';
import {defaultModel,ModelInputSchema,modelOrigin,MODEL_KEY,type ModelState,type ModelConfig,type ModelInput} from '../domain/model';
import {testModel} from '../network/models';

export function ModelSettings(){
  const [state,setState]=useState<ModelState>({config:null,configured:false,revision:0});
  const [form,setForm]=useState<Omit<ModelInput,'key'>&{key:string}>({...defaultModel,key:''});
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const controller=useRef<AbortController|null>(null),configId=useRef<string|null>(null);
  function accept(s:ModelState){setState(s);configId.current=s.config?.id??null;const c=s.config??defaultModel;setForm({protocol:c.protocol,baseUrl:c.baseUrl,model:c.model,remember:c.remember,key:''});}
  async function load(){try{accept(await action<ModelState>('MODEL_STATE'));}catch(e){setError((e as Error).message);}}
  useEffect(()=>{
    void load();if(!inExtension)return;
    const changed=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
      if(area==='local'&&changes[MODEL_KEY]){const next=changes[MODEL_KEY].newValue as {config?:ModelConfig}|undefined;if(next?.config?.id!==configId.current)controller.current?.abort();}
    };
    chrome.storage.onChanged.addListener(changed);return()=>{controller.current?.abort();chrome.storage.onChanged.removeListener(changed);};
  },[]);
  function update(patch:Partial<typeof form>){controller.current?.abort();setForm({...form,...patch});setStatus('');}
  async function connect(){
    setError('');setStatus('');let input;
    try{input=ModelInputSchema.parse({...form,key:form.key||undefined});}catch{setError('请检查地址、模型名称和 Key 格式');return;}
    if(!inExtension){setError('请在实际插件中配置模型');return;}
    setBusy(true);
    try{
      const granted=await chrome.permissions.request({origins:[modelOrigin(input.baseUrl)]});
      if(!granted)throw new Error('未授权模型服务域名，本地填写仍可使用');
      const saved=await action<ModelState>('MODEL_SAVE',{input,expectedRevision:state.revision});accept(saved);
      const access=await action<{config:ModelConfig;key:string|null}|null>('MODEL_ACCESS');
      if(!access?.key)throw new Error('请重新配置 API Key');
      const abort=new AbortController();controller.current=abort;
      const reply=await testModel(access.config,access.key,abort.signal);
      const current=await action<ModelState>('MODEL_STATE');if(current.revision!==saved.revision||abort.signal.aborted)throw new Error('设置已变化，测试结果已作废');
      setStatus(`连接成功 · ${reply.model} · ${(reply.milliseconds/1000).toFixed(2)} 秒 · 输入 ${reply.usage.input} / 输出 ${reply.usage.output} tokens`);
    }catch(e){setError((e as Error).message);}finally{controller.current=null;setBusy(false);}
  }
  async function clear(){setBusy(true);try{controller.current?.abort();accept(await action<ModelState>('MODEL_CLEAR',{expectedRevision:state.revision}));setStatus('模型配置与 Key 已清除，简历资料保留');setConfirm(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="card model-settings"><h2>使用你自己的模型</h2><p className="muted">用于识别陌生的网页字段。简历维护与本地规则填写无需配置模型。</p>
    <div className="toolbar"><button onClick={()=>update({...defaultModel,key:''})}>DeepSeek · Anthropic</button><button onClick={()=>update({...defaultModel,protocol:'openai',baseUrl:'https://api.deepseek.com',key:''})}>DeepSeek · OpenAI</button></div>
    <div className="form-grid"><label className="form-field"><span>接口格式</span><select value={form.protocol} onChange={e=>update({protocol:e.target.value as 'anthropic',key:''})}><option value="anthropic">Anthropic Messages</option><option value="openai">OpenAI Chat Completions</option></select></label>
      <label className="form-field"><span>模型名称</span><input value={form.model} maxLength={120} onChange={e=>update({model:e.target.value})}/></label>
      <label className="form-field span-2"><span>提供商 Base URL</span><input type="url" value={form.baseUrl} onChange={e=>update({baseUrl:e.target.value,key:''})} maxLength={300}/></label>
      <label className="form-field span-2"><span>模型 API Key</span><input type="password" autoComplete="off" value={form.key} maxLength={1024} onChange={e=>update({key:e.target.value})} placeholder={state.configured?'已配置；留空保留当前地址的 Key':'粘贴你在提供商创建的 Key'}/></label>
    </div>
    <label className="check-line"><input type="checkbox" checked={form.remember} onChange={e=>update({remember:e.target.checked})}/>在本机记住 API Key</label><p className="subtle">默认仅保留到浏览器会话结束。本机记住使用插件本地存储；完整资料备份不含 Key。</p>
    <div className="toolbar"><button className="primary" disabled={busy} onClick={connect}>{busy?'连接测试中…':'连接并测试'}</button>{busy&&<button onClick={()=>controller.current?.abort()}>取消测试</button>}<button onClick={()=>void load()} disabled={busy}>重新读取设置</button><button className="danger-text" disabled={busy||!state.config} onClick={()=>setConfirm(true)}>清除模型配置</button></div>
    <p className="subtle">连接测试会发送一次小请求，不包含简历。网页匹配前会展示实际发送内容。其他提供商按其支持的接口格式填写地址和模型名。</p>
    {error&&<Notice error>{error}</Notice>}{status&&<Notice>{status}</Notice>}
    {confirm&&<Modal title="清除模型配置？" onClose={()=>setConfirm(false)}><p>将清除本机模型地址、模型 Key 和对应域名权限。简历、补充资料与备份保留。</p><div className="modal-actions"><button onClick={()=>setConfirm(false)}>取消</button><button onClick={clear} disabled={busy}>确认清除模型配置</button></div></Modal>}
  </section>;
}
