import WebSocket, { WebSocketServer, type VerifyClientCallbackAsync } from 'ws';
import { PROTOCOL_VERSION, type ObserveParams, type ResolvedActParams, type UndoParams, type WaitParams } from '../protocol.js';
import { BrowserError } from './errors.js';
import type { ActivateTabInput, BrowserDriver, DriverStatus, ListTabsInput } from './types.js';

type ExtensionInfo = { extensionId: string; version: string; epoch: unknown; protocolVersion: unknown };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export class ExtensionDriver implements BrowserDriver {
  readonly kind = 'extension' as const;
  private readonly port: number;
  private readonly extensionId: string;
  private readonly expectedOrigin: string;
  private readonly timeoutMs: number;
  private readonly bridge: WebSocketServer;
  private extension: WebSocket | null = null;
  private extensionInfo: ExtensionInfo | null = null;
  private sequence = 0;
  private readonly pending = new Map<string, Pending>();

  constructor(options: { port?: number; extensionId?: string; timeoutMs?: number } = {}) {
    this.port = options.port ?? parsePort(process.env.RESUME_COMPANION_BRIDGE_PORT ?? '43117');
    this.extensionId = options.extensionId ?? process.env.RESUME_COMPANION_EXTENSION_ID ?? 'feifaflnkjdihpbbhnihidjjkeapamnh';
    this.expectedOrigin = `chrome-extension://${this.extensionId}`;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    const verifyClient: VerifyClientCallbackAsync = (info, done) => {
      const accepted = info.origin === this.expectedOrigin;
      done(accepted, accepted ? 101 : 403, 'Forbidden');
    };
    this.bridge = new WebSocketServer({ host: '127.0.0.1', port: this.port, verifyClient });
    this.bridge.on('connection', socket => this.onConnection(socket));
    this.bridge.on('error', error => console.error(`[resume-companion] extension bridge error: ${error.message}`));
  }

  async status(signal?: AbortSignal): Promise<DriverStatus> {
    const base: DriverStatus = {
      kind: this.kind,
      ready: true,
      connected: false,
      compatible: false,
      profile_mode: 'extension',
      permission_state: 'not_required',
      bridgePort: this.port,
      capabilities: { coreProtocol: PROTOCOL_VERSION, trustedEvents: false, frames: 'top-only', shadowDOM: false },
      message: 'Chrome 扩展尚未连接；本地资料工具仍可使用',
    };
    if (!this.extension || this.extension.readyState !== WebSocket.OPEN || !this.extensionInfo) return base;
    try {
      const remote = await this.call('status', {}, signal) as Record<string, unknown>;
      return {
        ...base,
        ...remote,
        kind: this.kind,
        ready: true,
        connected: true,
        compatible: this.extensionInfo.protocolVersion === PROTOCOL_VERSION,
        protocolVersion: this.extensionInfo.protocolVersion,
        expectedProtocolVersion: PROTOCOL_VERSION,
        bridgeEpoch: this.extensionInfo.epoch,
        profile_mode: 'extension',
        permission_state: 'not_required',
        message: this.extensionInfo.protocolVersion === PROTOCOL_VERSION ? '扩展回退驱动已连接' : '扩展与 MCP 协议版本不一致',
      };
    } catch (error) {
      return { ...base, connected: true, message: error instanceof Error ? error.message : '浏览器状态读取失败' };
    }
  }

  listTabs(input: ListTabsInput, signal?: AbortSignal): Promise<unknown> { return this.call('tabs', input, signal); }
  activateTab(input: ActivateTabInput, signal?: AbortSignal): Promise<unknown> { return this.call('activate_tab', input, signal); }
  observe(input: ObserveParams, signal?: AbortSignal): Promise<unknown> { return this.call('observe', input, signal); }
  act(input: ResolvedActParams, signal?: AbortSignal): Promise<unknown> { return this.call('act', input, signal); }
  wait(input: WaitParams, signal?: AbortSignal): Promise<unknown> { return this.call('wait', input, signal); }
  undo(input: UndoParams, signal?: AbortSignal): Promise<unknown> { return this.call('undo_operations', input, signal); }

  async close(): Promise<void> {
    this.failPending(new BrowserError('browser_disconnected', 'MCP 服务正在关闭'));
    for (const socket of this.bridge.clients) socket.close(1001, 'Server shutdown');
    await new Promise<void>(resolve => this.bridge.close(() => resolve()));
  }

  private onConnection(socket: WebSocket): void {
    if (this.extension?.readyState === WebSocket.OPEN) {
      socket.close(1013, 'Another browser is already connected');
      return;
    }
    this.extension = socket;
    this.extensionInfo = null;
    socket.on('message', raw => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (message.type === 'hello' && message.extensionId === this.extensionId) {
        this.extensionInfo = {
          extensionId: this.extensionId,
          version: String(message.version ?? 'unknown'),
          epoch: message.epoch ?? null,
          protocolVersion: message.protocolVersion ?? null,
        };
        return;
      }
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (typeof message.id !== 'string') return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.ok) request.resolve(message.result);
      else request.reject(new BrowserError('browser_disconnected', typeof message.error === 'string' ? message.error : 'Chrome 扩展执行失败'));
    });
    socket.on('close', () => {
      if (this.extension !== socket) return;
      this.extension = null;
      this.extensionInfo = null;
      this.failPending(new BrowserError('browser_disconnected', 'Chrome 扩展已断开'));
    });
  }

  private call(method: string, params: unknown = {}, signal?: AbortSignal): Promise<unknown> {
    if (!this.extension || this.extension.readyState !== WebSocket.OPEN || !this.extensionInfo) {
      throw new BrowserError('driver_unavailable', 'Chrome 扩展未连接；可切换到 DevTools 驱动或开启扩展桥接');
    }
    if (method !== 'status' && this.extensionInfo.protocolVersion !== PROTOCOL_VERSION) {
      throw new BrowserError('unsupported_capability', '浏览器扩展与 MCP 协议版本不一致，请重新加载配套扩展');
    }
    const socket = this.extension;
    const id = `mcp-${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const cleanup = (): void => signal?.removeEventListener('abort', abort);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        cleanup();
        if (this.extension?.readyState === WebSocket.OPEN) this.extension.send(JSON.stringify({ type: 'cancel', id }));
        reject(new BrowserError('timeout', 'Chrome 扩展响应超时，请保持目标标签页打开后重试'));
      }, this.timeoutMs);
      const abort = (): void => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(timer);
        cleanup();
        if (this.extension?.readyState === WebSocket.OPEN) this.extension.send(JSON.stringify({ type: 'cancel', id }));
        reject(new BrowserError('cancelled', '请求已取消；请先回读已派发动作的结果'));
      };
      this.pending.set(id, {
        resolve: value => { cleanup(); resolve(value); },
        reject: error => { cleanup(); reject(error); },
        timer,
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  private failPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('RESUME_COMPANION_BRIDGE_PORT 不是有效端口');
  return port;
}
