import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer, type Server, type Socket } from 'node:net';
import { BRIDGE_MAX_MESSAGE_BYTES, BRIDGE_PROTOCOL_VERSION, RESUME_COMPANION_EXTENSION_ID, assertBridgeMessage, isRecord, type BridgeMethod, type BridgeRequest } from '../../../../shared/browser-bridge.js';
import { BrowserError } from './errors.js';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; abort?: () => void };
export type NativeBridgeState = { started: boolean; connected: boolean; extension_version?: string; protocol: string; descriptor_path: string };
let socketSequence = 0;

export class NativeBridgeServer {
  private readonly bridgeDir: string;
  private readonly socketPath: string;
  readonly descriptorPath: string;
  private readonly token = randomBytes(32).toString('base64url');
  private server: Server | null = null;
  private starting: Promise<void> | null = null;
  private socket: Socket | null = null;
  private extensionVersion: string | undefined;
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly dataDir: string, private readonly timeoutMs = 60_000) {
    this.bridgeDir = join(dataDir, 'bridge');
    const sequence = socketSequence++;
    this.socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\resume-companion-${process.pid}-${randomUUID()}` : join(this.bridgeDir, `mcp-${process.pid}-${sequence.toString(36)}.sock`);
    this.descriptorPath = join(this.bridgeDir, 'active.json');
  }

  async ensureStarted(): Promise<void> {
    if (this.server) { await this.writeDescriptor(); return; }
    if (this.starting) return this.starting;
    this.starting = this.start();
    try { await this.starting; } finally { this.starting = null; }
  }

  state(): NativeBridgeState {
    return { started: Boolean(this.server), connected: Boolean(this.socket?.writable), ...(this.extensionVersion ? { extension_version: this.extensionVersion } : {}), protocol: BRIDGE_PROTOCOL_VERSION, descriptor_path: this.descriptorPath };
  }

  async request(method: BridgeMethod, params: unknown, signal?: AbortSignal): Promise<unknown> {
    try { await this.ensureStarted(); }
    catch { throw new BrowserError('bridge_disconnected', '当前 AI 宿主无法启动本地扩展 IPC；可检查宿主权限或改用 DevTools 专用 Profile'); }
    const socket = await this.waitForConnection(signal);
    const id = randomUUID();
    const deadline = Date.now() + this.timeoutMs;
    const message: BridgeRequest = { kind: 'request', protocol: BRIDGE_PROTOCOL_VERSION, id, method, params, deadline };
    if (Buffer.byteLength(JSON.stringify(message), 'utf8') > BRIDGE_MAX_MESSAGE_BYTES) throw new BrowserError('invalid_request', '浏览器请求超过 512 KiB 上限');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        socket.write(`${JSON.stringify({ kind: 'cancel', protocol: BRIDGE_PROTOCOL_VERSION, id })}\n`);
        reject(new BrowserError('timeout', 'Chrome 扩展响应超时；请先观察页面结果再决定是否重试'));
      }, this.timeoutMs);
      const abort = (): void => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        socket.write(`${JSON.stringify({ kind: 'cancel', protocol: BRIDGE_PROTOCOL_VERSION, id })}\n`);
        reject(new BrowserError('cancelled', '请求已取消；请先回读已派发动作的结果'));
      };
      this.pending.set(id, { resolve, reject, timer, ...(signal ? { abort } : {}) });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      socket.write(`${JSON.stringify(message)}\n`);
    });
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.failPending(new BrowserError('bridge_disconnected', 'MCP 服务正在关闭'));
    this.socket?.destroy();
    this.socket = null;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await Promise.all([this.removeDescriptorIfOwned(), process.platform === 'win32' ? Promise.resolve() : rm(this.socketPath, { force: true })]);
  }

  private async start(): Promise<void> {
    await mkdir(this.bridgeDir, { recursive: true, mode: 0o700 });
    await chmod(this.bridgeDir, 0o700).catch(() => undefined);
    if (process.platform !== 'win32') await rm(this.socketPath, { force: true });
    const server = createServer(socket => this.accept(socket));
    server.on('error', () => { /* The next request reports availability without exposing paths. */ });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => { reject(error); };
      server.once('error', onError);
      server.listen(this.socketPath, () => { server.off('error', onError); resolve(); });
    });
    this.server = server;
    if (process.platform !== 'win32') await chmod(this.socketPath, 0o600).catch(() => undefined);
    await this.writeDescriptor();
  }

  private async writeDescriptor(): Promise<void> {
    const descriptor = { protocol: BRIDGE_PROTOCOL_VERSION, token: this.token, socket_path: this.socketPath, pid: process.pid, expires_at: Date.now() + 12 * 60 * 60 * 1_000 };
    await writeFile(this.descriptorPath, `${JSON.stringify(descriptor)}\n`, { mode: 0o600 });
    await chmod(this.descriptorPath, 0o600).catch(() => undefined);
  }

  private accept(candidate: Socket): void {
    let authenticated = false;
    let localBuffer = '';
    const reject = (): void => { candidate.destroy(); };
    candidate.on('data', chunk => {
      localBuffer += chunk.toString('utf8');
      if (Buffer.byteLength(localBuffer, 'utf8') > BRIDGE_MAX_MESSAGE_BYTES * 2) { reject(); return; }
      for (;;) {
        const newline = localBuffer.indexOf('\n');
        if (newline < 0) return;
        const line = localBuffer.slice(0, newline);
        localBuffer = localBuffer.slice(newline + 1);
        if (!line) continue;
        let message: unknown;
        try { message = JSON.parse(line); assertBridgeMessage(message); } catch { reject(); return; }
        if (!authenticated) {
          if (message.kind !== 'hello' || message.token !== this.token || message.protocol !== BRIDGE_PROTOCOL_VERSION || message.extension_origin !== `chrome-extension://${RESUME_COMPANION_EXTENSION_ID}/`) { reject(); return; }
          authenticated = true;
          this.socket?.destroy();
          this.socket = candidate;
          this.extensionVersion = message.extension_version;
          candidate.write(`${JSON.stringify({ kind: 'bridge_ready', protocol: BRIDGE_PROTOCOL_VERSION })}\n`);
          continue;
        }
        this.handle(message);
      }
    });
    candidate.on('error', () => candidate.destroy());
    candidate.on('close', () => {
      if (this.socket !== candidate) return;
      this.socket = null;
      this.extensionVersion = undefined;
      this.failPending(new BrowserError('bridge_disconnected', 'Chrome 扩展与 MCP 的本地桥接已断开'));
    });
  }

  private handle(message: unknown): void {
    if (!isRecord(message) || message.kind !== 'response' || typeof message.id !== 'string') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok === true) pending.resolve(message.result);
    else {
      const remote = isRecord(message.error) ? message.error : {};
      pending.reject(new BrowserError(errorCode(remote.code), typeof remote.message === 'string' ? remote.message : 'Chrome 扩展执行失败'));
    }
  }

  private async waitForConnection(signal?: AbortSignal): Promise<Socket> {
    // Chrome extension service workers wake on a periodic alarm. Waiting for a
    // full alarm interval lets the first browser tool connect without asking
    // the user to reload the extension or click its popup.
    const deadline = Date.now() + Math.min(35_000, this.timeoutMs);
    while (!this.socket?.writable && Date.now() < deadline) {
      if (signal?.aborted) throw new BrowserError('cancelled', '请求已取消');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!this.socket?.writable) throw new BrowserError('bridge_disconnected', 'Chrome 扩展尚未连接。请确认扩展和 Native Host 已安装，然后点击扩展图标重连');
    return this.socket;
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  private async removeDescriptorIfOwned(): Promise<void> {
    try {
      const descriptor = JSON.parse(await readFile(this.descriptorPath, 'utf8')) as Record<string, unknown>;
      if (descriptor.token === this.token && descriptor.socket_path === this.socketPath) await rm(this.descriptorPath, { force: true });
    } catch {
      // The descriptor may already be gone or may belong to a newer MCP task.
    }
  }
}

function errorCode(value: unknown): import('./errors.js').ErrorCode {
  const known = new Set(['blocked','browser_disconnected','bridge_disconnected','cancelled','debugger_attach_conflict','debugger_permission_denied','driver_unavailable','extension_disabled','extension_not_installed','invalid_request','native_host_missing','operation_conflict','stale','timeout','unknown','unsupported_capability']);
  return typeof value === 'string' && known.has(value) ? value as import('./errors.js').ErrorCode : 'unknown';
}
