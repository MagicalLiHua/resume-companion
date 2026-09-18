export const BRIDGE_PROTOCOL_VERSION = '1.0';
export const BRIDGE_MAX_MESSAGE_BYTES = 512 * 1024;
export const NATIVE_HOST_NAME = 'com.resume_companion.bridge';
export const RESUME_COMPANION_EXTENSION_ID = 'feifaflnkjdihpbbhnihidjjkeapamnh';

export type BridgeMethod = 'status' | 'tabs' | 'activate_tab' | 'observe' | 'act' | 'wait' | 'undo_operations';
export type BridgeRequest = { kind: 'request'; protocol: string; id: string; method: BridgeMethod; params: unknown; deadline: number };
export type BridgeCancel = { kind: 'cancel'; protocol: string; id: string };
export type BridgeResponse = { kind: 'response'; protocol: string; id: string; ok: true; result: unknown } | { kind: 'response'; protocol: string; id: string; ok: false; error: { code: string; message: string } };
export type BridgeHello = { kind: 'hello'; protocol: string; token: string; extension_origin: string; extension_version: string; host_pid: number };
export type ExtensionHello = { kind: 'extension_hello'; protocol: string; extension_version: string };
export type BridgeReady = { kind: 'bridge_ready'; protocol: string };
export type BridgeWireMessage = BridgeRequest | BridgeCancel | BridgeResponse | BridgeHello | ExtensionHello | BridgeReady;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function assertBridgeMessage(value: unknown): asserts value is BridgeWireMessage {
  if (!isRecord(value) || value.protocol !== BRIDGE_PROTOCOL_VERSION || typeof value.kind !== 'string') throw new Error('invalid bridge message');
  if (byteSize(value) > BRIDGE_MAX_MESSAGE_BYTES) throw new Error('bridge message exceeds 512 KiB');
  if (value.kind === 'request' && !(typeof value.id === 'string' && value.id.length <= 160 && typeof value.method === 'string' && ['status','tabs','activate_tab','observe','act','wait','undo_operations'].includes(value.method) && typeof value.deadline === 'number')) throw new Error('invalid bridge request');
  if (value.kind === 'cancel' && !(typeof value.id === 'string' && value.id.length <= 160)) throw new Error('invalid bridge cancel');
  if (value.kind === 'response' && !(typeof value.id === 'string' && typeof value.ok === 'boolean' && (value.ok || isRecord(value.error)))) throw new Error('invalid bridge response');
  if (value.kind === 'hello' && !(typeof value.token === 'string' && typeof value.extension_origin === 'string' && typeof value.extension_version === 'string' && typeof value.host_pid === 'number')) throw new Error('invalid bridge hello');
  if (value.kind === 'extension_hello' && typeof value.extension_version !== 'string') throw new Error('invalid extension hello');
  if (!['request','cancel','response','hello','extension_hello','bridge_ready'].includes(value.kind)) throw new Error('unknown bridge message');
}

export function publicBridgeError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^([a-z_]+):\s*(.*)$/s.exec(raw);
  return { code: match?.[1] ?? 'bridge_error', message: (match?.[2] || '浏览器扩展执行失败').slice(0, 800) };
}
