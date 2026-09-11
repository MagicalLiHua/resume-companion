import { useEffect, useState } from 'react';
import { Notice } from '../../extension/src/shared/ui';
import { api, date } from './api';

export interface ModelSettings {
  configured: boolean; protocol: 'anthropic' | 'openai'; base_url: string;
  model: string; revision: number; updated_at: number | null; personal_models: boolean;
}

export function ModelSettingsPage({onDirty}: {onDirty: (value: boolean) => void}) {
  const [saved, setSaved] = useState<ModelSettings | null>(null);
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>('anthropic');
  const [base, setBase] = useState('https://api.deepseek.com/anthropic'), [model, setModel] = useState('deepseek-v4-flash');
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  function changed() {setDirty(true); onDirty(true); setStatus('');}
  function accept(data: ModelSettings) {setSaved(data); setProtocol(data.protocol); setBase(data.base_url); setModel(data.model); setKey(''); setDirty(false); onDirty(false);}
  async function run(fn: () => Promise<void>) {if (busy) return; setBusy(true); setError(''); try {await fn();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}}
  useEffect(() => {void run(async () => accept(await api('/v1/model-settings')));}, []);
  const destinationChanged = saved?.configured && (saved.base_url !== base.trim().replace(/\/$/, '') || saved.protocol !== protocol);
  return <><header className="web-heading"><div><span className="eyebrow">YOUR MODEL, YOUR CHOICE</span><h1>模型设置<span className="title-dot">.</span></h1><p>使用你自己的模型 API，费用由对应的提供商账户承担。</p></div></header>
    {error && <Notice error>{error}</Notice>}{status && <Notice>{status}</Notice>}
    <section className="card"><div className="section-heading"><h2>我的模型提供商</h2><span>{saved?.configured ? `已配置 · ${date(saved.updated_at)}` : '尚未配置'}</span></div>
      <p className="muted">模型用于整理 PDF 简历。手动编辑、保存简历和插件填写无需调用模型。</p>
      <form onSubmit={e => {e.preventDefault(); void run(async () => {accept(await api('/v1/model-settings', 'PUT', {protocol, base_url: base.trim(), model: model.trim(), api_key: key || null, expected_revision: saved!.revision})); setStatus('模型设置已保存，可以测试连接。');});}}>
        <fieldset className="model-fields" disabled={busy || !saved}>
          <div className="model-presets"><span>快速配置</span><button type="button" onClick={() => {setProtocol('anthropic'); setBase('https://api.deepseek.com/anthropic'); setModel('deepseek-v4-flash'); setKey(''); changed();}}>DeepSeek · Anthropic</button><button type="button" onClick={() => {setProtocol('openai'); setBase('https://api.deepseek.com'); setModel('deepseek-v4-flash'); setKey(''); changed();}}>DeepSeek · OpenAI</button></div>
          <div className="form-grid"><label className="form-field"><span>接口格式</span><select value={protocol} onChange={e => {setProtocol(e.target.value as 'anthropic' | 'openai'); setKey(''); changed();}}><option value="anthropic">Anthropic Messages</option><option value="openai">OpenAI Chat Completions</option></select></label><label className="form-field"><span>模型名称</span><input required maxLength={120} value={model} onChange={e => {setModel(e.target.value); changed();}} placeholder="提供商文档中的模型名称"/></label><label className="form-field span-2"><span>提供商 Base URL</span><input required type="url" maxLength={300} value={base} onChange={e => {setBase(e.target.value); setKey(''); changed();}} placeholder="https://api.example.com"/></label><label className="form-field span-2"><span>模型 API Key</span><input type="password" autoComplete="off" maxLength={1024} required={!saved?.configured || Boolean(destinationChanged)} value={key} onChange={e => {setKey(e.target.value); changed();}} placeholder={saved?.configured && !destinationChanged ? '已保存密钥；留空保留，填写新值则替换' : '粘贴你在模型提供商创建的 API Key'}/></label></div>
          {destinationChanged && <Notice>你更换了提供商地址或接口格式，请填写对应的新 Key。</Notice>}
          <p className="model-note">使用提供商的 HTTPS 基础地址，可包含 /v1 或 /anthropic 前缀。密钥加密保存在你的账号中，保存后不显示完整值。此处的 Key 与连接插件使用的 Key 分开管理。</p>
          <div className="model-actions"><button className="primary" disabled={!dirty}>保存模型设置</button><button type="button" disabled={!saved?.configured || dirty} onClick={() => run(async () => {await api('/v1/model-settings/test', 'POST', {expected_revision: saved!.revision}, {timeoutMs: 180000}); setStatus('连接成功，模型已返回有效的结构化结果。');})}>测试已保存的连接</button>{saved?.configured && <button className="danger-text" type="button" onClick={() => {if (window.confirm('删除模型 Key 和连接配置？已保存的简历仍可使用。')) void run(async () => {accept(await api('/v1/model-settings', 'DELETE', {expected_revision: saved.revision})); setStatus('模型 Key 已删除。');});}}>删除模型 Key</button>}</div>
        </fieldset>
      </form>
      {!saved && !busy && <button onClick={() => run(async () => accept(await api('/v1/model-settings')))}>重新读取设置</button>}
      {busy && <Notice>正在处理，请稍候…</Notice>}
      <p className="model-note">测试连接会发送一条不含简历的简短请求，可能产生少量 API 费用。修改设置后请先保存，再测试。</p>
    </section>
    <section className="connection-guide"><h2>由你决定何时使用模型</h2><p className="model-note">上传 PDF 时，勾选使用模型后才会将提取的文字发送到上方提供商。解析结果始终需要你核对确认；也可以只提取文字，手动整理。</p></section>
  </>;
}
