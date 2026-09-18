type PopupState = { ok: boolean; bridgeStatus: 'connecting' | 'connected' | 'disconnected'; paused: boolean; version: string };
const statusNode = document.querySelector<HTMLElement>('#status')!;
const detailNode = document.querySelector<HTMLElement>('#detail')!;
const dot = document.querySelector<HTMLElement>('#dot')!;
const toggle = document.querySelector<HTMLButtonElement>('#toggle')!;
const version = document.querySelector<HTMLElement>('#version')!;

async function render(): Promise<void> {
  const state = await chrome.runtime.sendMessage({ type: 'RESUME_COMPANION_BRIDGE_STATUS' }) as PopupState;
  dot.className = `dot ${state.paused ? '' : state.bridgeStatus}`;
  statusNode.textContent = state.paused ? '连接已暂停' : state.bridgeStatus === 'connected' ? '已连接本地 MCP' : state.bridgeStatus === 'connecting' ? '正在等待本地 MCP' : '本地 MCP 尚未连接';
  detailNode.textContent = state.paused ? '点击恢复后，AI 才能使用浏览器工具' : state.bridgeStatus === 'connected' ? '只在 AI 选择的标签页中执行受限动作' : '请启动 AI 客户端中的 Resume Companion MCP';
  toggle.textContent = state.paused || state.bridgeStatus !== 'connected' ? '重新连接' : '暂停浏览器连接';
  toggle.className = state.bridgeStatus === 'connected' && !state.paused ? 'pause' : '';
  toggle.dataset.action = state.bridgeStatus === 'connected' && !state.paused ? 'pause' : 'resume';
  version.textContent = `扩展 ${state.version} · 资料保存在 MCP 本地目录`;
}
toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  const type = toggle.dataset.action === 'pause' ? 'RESUME_COMPANION_BRIDGE_PAUSE' : 'RESUME_COMPANION_BRIDGE_RESUME';
  await chrome.runtime.sendMessage({ type });
  await new Promise(resolve => setTimeout(resolve, 120));
  await render();
  toggle.disabled = false;
});
void render();
