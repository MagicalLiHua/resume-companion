import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PROTOCOL_VERSION, type ObserveParams, type ResolvedActParams, type UndoParams, type WaitParams } from '../protocol.js';
import { BrowserError } from './errors.js';
import { NativeBridgeServer } from './native-bridge-server.js';
import type { ActivateTabInput, BrowserDriver, DriverStatus, ListTabsInput } from './types.js';

export class ExtensionDriver implements BrowserDriver {
  readonly kind = 'extension' as const;
  private readonly bridge: NativeBridgeServer;
  private readonly extensionPath: string;
  private readonly installerPath: string;

  constructor(options: { dataDir: string; timeoutMs?: number }) {
    this.bridge = new NativeBridgeServer(options.dataDir, options.timeoutMs);
    this.extensionPath = [resolve(import.meta.dirname, 'browser-assets/extension'), resolve(import.meta.dirname, '../../browser-assets/extension')].find(existsSync) ?? resolve(import.meta.dirname, 'browser-assets/extension');
    this.installerPath = [resolve(import.meta.dirname, 'browser-assets/native-host/install.bundle.mjs'), resolve(import.meta.dirname, '../../browser-assets/native-host/install.bundle.mjs')].find(existsSync) ?? resolve(import.meta.dirname, 'browser-assets/native-host/install.bundle.mjs');
  }

  async status(signal?: AbortSignal): Promise<DriverStatus> {
    let bridgeStartError = false;
    try { await this.bridge.ensureStarted(); } catch { bridgeStartError = true; }
    const state = this.bridge.state();
    let remote: Record<string, unknown> = {};
    if (state.connected) {
      try { remote = await this.bridge.request('status', {}, signal) as Record<string, unknown>; }
      catch { remote = {}; }
    }
    const assetsReady = existsSync(this.extensionPath) && existsSync(this.installerPath);
    const nativeHostInstalled = existsSync(nativeHostManifestPath());
    const remoteCapabilities = isRecord(remote.capabilities) ? remote.capabilities : {};
    const protocolCompatible = !state.connected || remoteCapabilities.coreProtocol === PROTOCOL_VERSION;
    return {
      kind: this.kind,
      ready: assetsReady,
      connected: state.connected,
      compatible: assetsReady && protocolCompatible,
      profile_mode: 'extension',
      permission_state: state.connected ? 'granted' : 'unknown',
      protocol_version: PROTOCOL_VERSION,
      bridge_protocol_version: state.protocol,
      ...(state.extension_version ? { extension_version: state.extension_version } : {}),
      setup: { extension_path: this.extensionPath, native_host_installer: this.installerPath, native_host_installed: nativeHostInstalled },
      capabilities: Object.keys(remoteCapabilities).length ? remoteCapabilities : { coreProtocol: PROTOCOL_VERSION, continuousForms: true, finalSubmit: false, trustedEvents: true, activateTab: true },
      ...(Array.isArray(remote.recentUnconfirmedOperations) ? { recent_unconfirmed_operations: remote.recentUnconfirmedOperations } : {}),
      ...(!assetsReady ? { connection_error_code: 'extension_not_installed' } : !nativeHostInstalled ? { connection_error_code: 'native_host_missing' } : bridgeStartError ? { connection_error_code: 'bridge_disconnected', connection_error_message: '当前 AI 宿主无法创建本地扩展 IPC' } : !state.connected ? { connection_error_code: 'bridge_disconnected' } : !protocolCompatible ? { connection_error_code: 'unsupported_capability' } : {}),
      message: !assetsReady ? '浏览器扩展发行资源缺失，请重新构建或安装完整发行包' : !nativeHostInstalled ? 'Native Host 尚未安装；请运行 setup 中的安装器，然后重新加载扩展' : bridgeStartError ? '当前 AI 宿主无法创建本地扩展 IPC；本地资料工具仍可使用，可改用 DevTools 专用 Profile' : state.connected && protocolCompatible ? '已连接日常 Chrome Profile 中的简历随行扩展' : state.connected ? '扩展与 MCP 工具协议不兼容，请同步升级' : '等待 Chrome 扩展连接；请确认扩展已启用，必要时点击扩展图标重连',
      recommended_fallback: state.connected ? undefined : 'devtools',
    };
  }

  listTabs(input: ListTabsInput, signal?: AbortSignal): Promise<unknown> { return this.bridge.request('tabs', input, signal); }
  activateTab(input: ActivateTabInput, signal?: AbortSignal): Promise<unknown> { return this.bridge.request('activate_tab', input, signal); }
  observe(input: ObserveParams, signal?: AbortSignal): Promise<unknown> { return this.bridge.request('observe', input, signal); }
  act(input: ResolvedActParams, signal?: AbortSignal): Promise<unknown> {
    if (input.action.kind === 'click' && input.action.effect_kind === 'final_submit') throw new BrowserError('blocked', '最终申请提交必须由用户完成');
    return this.bridge.request('act', input, signal);
  }
  wait(input: WaitParams, signal?: AbortSignal): Promise<unknown> { return this.bridge.request('wait', input, signal); }
  undo(input: UndoParams, signal?: AbortSignal): Promise<unknown> { return this.bridge.request('undo_operations', input, signal); }
  close(): Promise<void> { return this.bridge.close(); }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function nativeHostManifestPath(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.resume_companion.bridge.json');
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Resume Companion', 'com.resume_companion.bridge.json');
  return join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts', 'com.resume_companion.bridge.json');
}
