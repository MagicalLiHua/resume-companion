const BRIDGE_URL = 'ws://127.0.0.1:43117';
const RECONNECT_MS = 1500;
const KEEPALIVE_MS = 20_000;

type BridgeRequest = { id: string; method: string; params?: unknown };
type Handler = (method: string, params: unknown) => Promise<unknown>;

export function startCodexBridge(handler: Handler) {
  let socket: WebSocket | null = null;
  let retry: number | null = null;
  let keepalive: number | null = null;

  const clearTimers = () => {
    if (retry !== null) clearTimeout(retry);
    if (keepalive !== null) clearInterval(keepalive);
    retry = null;
    keepalive = null;
  };

  const reconnect = () => {
    if (retry === null) retry = setTimeout(connect, RECONNECT_MS) as unknown as number;
  };

  const connect = () => {
    clearTimers();
    try { socket = new WebSocket(BRIDGE_URL); } catch { reconnect(); return; }

    socket.addEventListener('open', () => {
      socket?.send(JSON.stringify({ type: 'hello', extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version }));
      keepalive = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
      }, KEEPALIVE_MS) as unknown as number;
    });

    socket.addEventListener('message', event => {
      let request: BridgeRequest;
      try { request = JSON.parse(String(event.data)) as BridgeRequest; } catch { return; }
      if (!request || typeof request.id !== 'string' || typeof request.method !== 'string') return;
      void handler(request.method, request.params ?? {}).then(
        result => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ id: request.id, ok: true, result })),
        error => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ id: request.id, ok: false, error: error instanceof Error ? error.message : '插件执行失败' })),
      );
    });

    socket.addEventListener('close', () => { clearTimers(); reconnect(); });
    socket.addEventListener('error', () => socket?.close());
  };

  connect();
}
