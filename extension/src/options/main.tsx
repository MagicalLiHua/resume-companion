import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type BridgeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected';
type Settings = { bridgeEnabled: boolean; bridgeStatus: BridgeStatus };

async function request(type: string, payload: Record<string, unknown> = {}): Promise<Settings> {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) throw new Error(response?.error ?? '扩展后台没有响应，请重新加载扩展');
  return response.data;
}

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try { setSettings(await request('BRIDGE_SETTINGS_LOAD')); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '读取设置失败'); }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2_000);
    return () => clearInterval(timer);
  }, []);

  async function toggle(enabled: boolean) {
    const previous = settings;
    if (settings) setSettings({ ...settings, bridgeEnabled: enabled, bridgeStatus: enabled ? 'connecting' : 'disabled' });
    setBusy(true);
    setError('');
    try {
      await request('BRIDGE_SETTINGS_SAVE', { bridgeEnabled: enabled });
      await load();
    } catch (reason) {
      setSettings(previous);
      setError(reason instanceof Error ? reason.message : '保存设置失败');
    } finally { setBusy(false); }
  }

  const labels: Record<BridgeStatus, string> = {
    disabled: '桥接已关闭',
    connecting: '正在连接本地 MCP',
    connected: '已连接本地 MCP',
    disconnected: '等待本地 MCP 启动',
  };
  const state = settings?.bridgeStatus ?? 'disconnected';

  return <main>
    <header>
      <span className="mark">简</span>
      <div><strong>简历随行</strong><small>Resume Companion Browser Bridge</small></div>
    </header>
    <section className="hero">
      <p className="eyebrow">LOCAL MCP BRIDGE</p>
      <h1>浏览器执行桥</h1>
      <p>简历和补充资料现在由本地 MCP 管理。这个扩展只在 AI 明确调用工具时观察和操作招聘网页。</p>
    </section>
    {error && <p role="alert" className="notice error">{error}</p>}
    <section className="card">
      <div className="setting">
        <div>
          <h2>本地桥接</h2>
          <p>允许本机的 Resume Companion MCP 通过 <code>127.0.0.1:43117</code> 连接扩展。</p>
        </div>
        <label className="switch">
          <input aria-label="开启本地桥接" type="checkbox" disabled={busy || !settings} checked={settings?.bridgeEnabled ?? false} onChange={event => void toggle(event.target.checked)}/>
          <span/>
        </label>
      </div>
      <div className={`status ${state}`}><i/>{labels[state]}</div>
      {settings?.bridgeEnabled && state !== 'connected' && <p className="hint">在支持 MCP 的 AI 软件中启动 Resume Companion 后，此处会自动变为已连接。</p>}
    </section>
    <section className="card">
      <h2>资料放在哪里？</h2>
      <p>资料保存在 MCP 的本地数据目录，不写入浏览器。可在 MCP 配置中通过 <code>RESUME_COMPANION_DATA_DIR</code> 指定目录。</p>
      <p className="hint">在 AI 中发送简历或补充信息，然后让 AI 调用 <code>resume_profile_save</code>。无需在扩展里再次导入。</p>
    </section>
    <section className="card">
      <h2>操作边界</h2>
      <ul>
        <li>最终投递、声明确认、验证码、密码和附件上传仍由你处理。</li>
        <li>AI 只能使用扩展返回的页面引用执行有限动作，不能运行任意网页脚本。</li>
        <li>关闭上面的开关会立即断开本地 MCP。</li>
      </ul>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
