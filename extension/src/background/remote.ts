import { z } from 'zod';
import { serviceOrigin, ResumeListSchema, type Connection } from '../domain/connection';
import { ProfileSchema } from '../domain/profile';
const Member = z.object({user: z.object({id: z.string().uuid(), username: z.string().regex(/^[a-z][a-z0-9_.-]{2,31}$/)}), auth_kind: z.literal('key'), scopes: z.array(z.string())});
const Resume = z.object({id: z.string().uuid(), name: z.string().min(1).max(80), revision: z.number().int().min(1), profile: ProfileSchema});
export async function getRemote(origin: string, key: string, path: string) {
  origin = serviceOrigin(origin);
  if (!/^rck_[A-Za-z0-9_-]{40,90}$/.test(key)) throw new Error('API Key 格式不正确，请粘贴网页端创建的个人密钥。');
  if (!/^\/v1\/(me|resumes(?:\/[A-Za-z0-9_-]{1,100})?)$/.test(path)) throw new Error('不支持此远端请求');
  if (!await chrome.permissions.contains({origins: [origin + '/*']})) throw new Error('尚未获得该服务地址的访问权限，请重新连接。');
  try {
    const response = await fetch(origin + path, {headers: {Authorization: `Bearer ${key}`}, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!response.ok) {
      if (response.status === 401) throw new Error('API Key 已过期、撤销或账号已停用，请在网页重新创建密钥。');
      if (response.status === 403) throw new Error('访问权限不足，请检查密钥权限和后端允许的插件来源。');
      if (response.status === 404) throw new Error('服务或简历不存在，请刷新列表并检查服务地址。');
      if (response.status === 429) throw new Error('请求过于频繁，请稍后重试。');
      throw new Error('服务暂时不可用，已同步的本地简历仍可使用。');
    }
    if (!response.headers.get('content-type')?.startsWith('application/json') || !response.body) throw new Error('服务返回格式不正确');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try {while (true) {const {value, done} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 1150000) throw new Error('服务返回内容过大'); chunks.push(value);}} finally {await reader.cancel();}
    const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) {buffer.set(chunk, offset); offset += chunk.length;}
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer));
  } catch(e) {if (e instanceof TypeError || e instanceof DOMException) throw new Error('无法连接服务，请检查网络、地址或 HTTPS 证书。已同步的本地简历仍可使用。'); throw e;}
}
export async function checkRemote(origin: string, key: string) {
  const me = Member.safeParse(await getRemote(origin, key, '/v1/me'));
  if (!me.success || !me.data.scopes.includes('resumes:read')) throw new Error('需要具有简历读取权限的个人 API Key。');
  const list = ResumeListSchema.parse(await getRemote(origin, key, '/v1/resumes'));
  return {user: me.data.user, ...list};
}
export async function remoteList(connection: Connection) {return ResumeListSchema.parse(await getRemote(connection.origin, connection.key, '/v1/resumes'));}
export async function remoteResume(connection: Connection, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error('简历标识不正确');
  const response = Resume.safeParse(await getRemote(connection.origin, connection.key, '/v1/resumes/' + id));
  if (!response.success || response.data.id !== id || response.data.profile.profile_id !== id || response.data.profile.revision !== response.data.revision) throw new Error('简历格式或修订号不一致，请刷新后重试。');
  return response.data;
}
