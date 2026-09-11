import type { Profile } from '../../extension/src/domain/profile-v1';
export interface User { id: string; username: string; role: 'admin' | 'user'; default_resume_id: string | null; daily_requests: number; requests_per_minute: number }
export interface ResumeMeta {id: string; name: string; revision: number; created_at: number; updated_at: number; deleted_at: number | null}
export interface Resume extends ResumeMeta {profile: Profile}
export interface ImportJob {id: string; filename: string; status: string; created_at: number; expires_at: number; draft?: Profile | null; extracted_text?: string | null; warnings: string[]; error_code: string | null; resume_id: string | null; provider_label?: string | null}
export class APIError extends Error { constructor(message: string, public status: number, public code: string) {super(message);} }
let csrf = '';
export function setCSRF(value: string) {csrf = value;}
export async function api<T>(path: string, method = 'GET', body?: unknown, options: {headers?: Record<string,string>; timeoutMs?: number} = {}): Promise<T> {
  const headers: Record<string, string> = {...options.headers};
  if (method !== 'GET') {headers['X-CSRF-Token'] = csrf; headers['Content-Type'] = 'application/json';}
  const isFile = body instanceof File;
  if (isFile) {headers['Content-Type'] = 'application/pdf'; headers['X-File-Name'] = encodeURIComponent(body.name);}
  let response: Response;
  try {response = await fetch(path, {method, headers, body: isFile ? body : body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(options.timeoutMs ?? 25000)});}
  catch {throw new Error('暂时无法连接服务，请检查网络后重试；未确认的修改仍在当前页面。');}
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new APIError(data?.error?.message ?? '服务暂时不可用，请稍后重试。', response.status, data?.error?.code ?? 'UNKNOWN');
  if (!data) throw new Error('服务返回了无法读取的内容。');
  return data as T;
}
export const date = (value: number | null) => value ? new Date(value * 1000).toLocaleString('zh-CN', {hour12: false}) : '尚无';
