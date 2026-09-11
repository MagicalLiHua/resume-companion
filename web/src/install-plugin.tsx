import { useState } from 'react';
import { Modal, Notice } from '../../extension/src/shared/ui';
import manifest from '../../extension/public/manifest.json';

const version = manifest.version;
const filename = `resume-companion-${version}.zip`;
type Browser = 'Chrome' | 'Edge';

function currentBrowser(): Browser | null {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return null;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/(?:Chrome|Chromium)\//.test(ua) && !/OPR\/|Vivaldi\//.test(ua)) return 'Chrome';
  return null;
}

export function InstallPlugin({className = '', label = '安装浏览器插件'}: {className?: string; label?: string}) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}>{label}<span aria-hidden="true">↗</span></button>{open && <InstallGuide onClose={() => setOpen(false)}/>}</>;
}

function InstallGuide({onClose}: {onClose: () => void}) {
  const detected = currentBrowser();
  const [browser, setBrowser] = useState<Browser>(detected ?? 'Chrome');
  const [message, setMessage] = useState('');
  const address = browser === 'Edge' ? 'edge://extensions' : 'chrome://extensions';
  return <Modal title="安装简历随行插件" onClose={onClose}>
    <div className="install-intro"><span className="badge">版本 {version}</span><p>{detected ? `当前浏览器：${detected}。按下面三步完成安装。` : '请使用电脑上的 Chrome 或 Edge 安装插件。当前浏览器仍可维护网页简历。'}</p></div>
    <p>当前为内测版，下载后需手动加载。尚未上架扩展商店，无法在网页内一键安装。</p>
    <label className="form-field install-browser"><span>安装到哪个浏览器</span><select value={browser} onChange={e => {setBrowser(e.target.value as Browser); setMessage('');}}><option>Chrome</option><option>Edge</option></select></label>
    <ol className="install-steps">
      <li><h3>下载并解压安装包</h3><p>解压后找到里面的 <code>extension</code> 文件夹，并保存在固定位置。</p><a className="button-link primary" href={`/downloads/${filename}`} download={filename}>下载插件安装包 <span aria-hidden="true">↓</span></a></li>
      <li><h3>打开扩展管理页</h3><p>复制下方地址，粘贴到 {browser} 的地址栏并回车。</p><div className="install-address"><input aria-label="扩展管理页地址" value={address} readOnly onFocus={e => e.currentTarget.select()}/><button type="button" onClick={async () => {try {await navigator.clipboard.writeText(address); setMessage('地址已复制，请粘贴到浏览器地址栏并回车。');} catch {setMessage('未能自动复制，请选中上方地址手动复制。');}}}>复制地址</button></div>{message && <Notice>{message}</Notice>}</li>
      <li><h3>开启开发者模式，加载插件</h3><p>点击“加载已解压的扩展程序”（Edge 中为“加载解压缩的扩展”），选择刚才的 <code>extension</code> 文件夹。安装后，在浏览器扩展菜单中固定“简历随行”。</p></li>
    </ol>
    <div className="install-next"><strong>安装完成后</strong><p>登录工作台，在“连接插件”创建 API Key。打开插件的“连接网页账号与同步”，填入服务地址 <code>{location.origin}</code> 和密钥，再选择简历同步。</p></div>
    <details className="install-update"><summary>已经安装过，如何更新？</summary><p>先在插件中导出 JSON 备份，再用新包的 extension 内容替换原安装文件夹中的文件。在扩展管理页点击插件的“重新加载”，并刷新要填写的网页。保留原安装目录。</p></details>
    <div className="modal-actions"><button type="button" onClick={onClose}>关闭安装说明</button></div>
  </Modal>;
}
