import type { ConnectionInfo } from '../domain/connection';
import type { ProfileState } from './client';
export interface RemoteState extends ProfileState {connection: ConnectionInfo | null}
export async function remoteAction<T>(type: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!globalThis.chrome?.runtime?.id) throw new Error('请在 Chrome 插件内打开连接设置。');
  const response = await chrome.runtime.sendMessage({type, ...body});
  if (!response?.ok) throw new Error(response?.error ?? '插件后台没有响应');
  return response.data;
}
export function openConnection() {if (globalThis.chrome?.runtime?.id) void chrome.tabs.create({url: chrome.runtime.getURL('connection.html')});}
