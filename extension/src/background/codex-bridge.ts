import type {BridgeContext} from './automation-tools';
import {PROTOCOL_VERSION} from '../../../plugins/resume-companion/protocol';
const BRIDGE_URL = 'ws://127.0.0.1:43117';
const RECONNECT_MS = 1500;
const KEEPALIVE_MS = 20_000;

type BridgeRequest = { id: string; method: string; params?: unknown; type?: string };
type Handler = (method: string, params: unknown, context: BridgeContext) => Promise<unknown>;

export type BridgeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected';
export function startCodexBridge(handler: Handler, enabled: () => Promise<boolean>, onStatus: (status: BridgeStatus) => void = () => {}) {
  let socket: WebSocket | null = null;
  let generation = 0;
  let retry: number | null = null;
  let keepalive: number | null = null;
  const active = new Map<string, AbortController>();
  const cancelAll = () => { for (const controller of active.values()) controller.abort(); active.clear(); };

  const clearTimers = () => {
    if (retry !== null) clearTimeout(retry);
    if (keepalive !== null) clearInterval(keepalive);
    retry = null;
    keepalive = null;
  };

  const reconnect = () => {
    if (retry === null) retry = setTimeout(connect, RECONNECT_MS) as unknown as number;
  };

  const connect = async () => {
    const current = ++generation;
    if (retry !== null) { clearTimeout(retry); retry = null; }
    let allowed = false;
    try { allowed = await enabled(); } catch { /* Invalid storage never enables access. */ }
    if (current !== generation) return;
    if (!allowed) { onStatus('disabled'); cancelAll(); clearTimers(); const old = socket; socket = null; old?.close(); return; }
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
    clearTimers();
    let channel: WebSocket;
    try { channel = new WebSocket(BRIDGE_URL); socket = channel; onStatus('connecting'); } catch { onStatus('disconnected'); reconnect(); return; }

    const epoch = crypto.randomUUID();
    channel.addEventListener('open', () => {
      if (socket !== channel) { channel.close(); return; }
      onStatus('connected');
      channel.send(JSON.stringify({ type: 'hello', epoch, protocolVersion:PROTOCOL_VERSION, extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version }));
      keepalive = setInterval(() => {
        if (channel.readyState === WebSocket.OPEN) channel.send(JSON.stringify({ type: 'ping' }));
      }, KEEPALIVE_MS) as unknown as number;
    });

    channel.addEventListener('message', event => {
      if (socket !== channel) return;
      let request: BridgeRequest;
      try { request = JSON.parse(String(event.data)) as BridgeRequest; } catch { return; }
      if (request?.type === 'cancel' && typeof request.id === 'string') { active.get(request.id)?.abort(); return; }
      if (!request || typeof request.id !== 'string' || typeof request.method !== 'string' || active.has(request.id)) return;
      const controller = new AbortController(); active.set(request.id,controller);
      void handler(request.method, request.params ?? {}, {epoch,requestId:request.id,signal:controller.signal}).then(
        result => channel.readyState === WebSocket.OPEN && channel.send(JSON.stringify({ id: request.id, ok: true, result })),
        error => channel.readyState === WebSocket.OPEN && channel.send(JSON.stringify({ id: request.id, ok: false, error: error instanceof Error ? error.message : '插件执行失败' })),
      ).finally(()=>active.delete(request.id));
    });

    channel.addEventListener('close', () => { if (socket === channel) { onStatus('disconnected'); cancelAll(); socket = null; clearTimers(); reconnect(); } });
    channel.addEventListener('error', () => channel.close());
  };

  void connect();
  return () => { void connect(); };
}
