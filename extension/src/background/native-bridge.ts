import { BRIDGE_PROTOCOL_VERSION, NATIVE_HOST_NAME, assertBridgeMessage, publicBridgeError, type BridgeRequest, type BridgeResponse } from '../../../shared/browser-bridge.js';
import type { BridgeContext } from './automation-tools.js';

export type NativeBridgeStatus = 'connecting' | 'connected' | 'disconnected';
type Handler = (method: string, params: unknown, context: BridgeContext) => Promise<unknown>;

export function startNativeBridge(handler: Handler, onStatus: (status: NativeBridgeStatus) => void = () => {}, onDisconnect: () => void = () => {}) {
  let port: chrome.runtime.Port | null = null;
  let generation = 0;
  const active = new Map<string, AbortController>();

  const cancelAll = () => {
    for (const controller of active.values()) controller.abort();
    active.clear();
  };

  const connect = (): void => {
    if (port) return;
    const current = ++generation;
    onStatus('connecting');
    let channel: chrome.runtime.Port;
    try { channel = chrome.runtime.connectNative(NATIVE_HOST_NAME); }
    catch { onStatus('disconnected'); return; }
    port = channel;
    channel.onMessage.addListener((value: unknown) => {
      if (port !== channel || current !== generation) return;
      try { assertBridgeMessage(value); } catch { return; }
      if (value.kind === 'bridge_ready') { onStatus('connected'); return; }
      if (value.kind === 'cancel') { active.get(value.id)?.abort(); return; }
      if (value.kind !== 'request' || active.has(value.id)) return;
      const request = value as BridgeRequest;
      const controller = new AbortController();
      active.set(request.id, controller);
      const timeout = setTimeout(() => controller.abort(), Math.max(0, request.deadline - Date.now()));
      const context: BridgeContext = { epoch: `${current}`, requestId: request.id, signal: controller.signal };
      void handler(request.method, request.params, context).then(
        result => send(channel, { kind: 'response', protocol: BRIDGE_PROTOCOL_VERSION, id: request.id, ok: true, result }),
        error => send(channel, { kind: 'response', protocol: BRIDGE_PROTOCOL_VERSION, id: request.id, ok: false, error: publicBridgeError(error) }),
      ).finally(() => { clearTimeout(timeout); active.delete(request.id); });
    });
    channel.onDisconnect.addListener(() => {
      // Reading lastError in the callback prevents Chrome from reporting a
      // misleading "Unchecked runtime.lastError" for expected host exits.
      void chrome.runtime.lastError?.message;
      if (port !== channel) return;
      port = null;
      cancelAll();
      onStatus('disconnected');
      onDisconnect();
    });
    // Register both listeners before the first write. A local native host can
    // finish its handshake quickly enough for bridge_ready to otherwise race
    // past the service worker's onMessage listener.
    try {
      channel.postMessage({ kind: 'extension_hello', protocol: BRIDGE_PROTOCOL_VERSION, extension_version: chrome.runtime.getManifest().version });
    } catch {
      port = null;
      cancelAll();
      try { channel.disconnect(); } catch { /* The channel may already be gone. */ }
      onStatus('disconnected');
    }
  };

  return { connect, disconnect: () => { generation += 1; const current = port; port = null; cancelAll(); current?.disconnect(); onStatus('disconnected'); } };
}

function send(port: chrome.runtime.Port, message: BridgeResponse): void {
  try { port.postMessage(message); } catch { /* Disconnect handling owns recovery. */ }
}
