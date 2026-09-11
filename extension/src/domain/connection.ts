import { z } from 'zod';
export function serviceOrigin(value: string): string {
  let url: URL;
  try {url = new URL(value.trim());} catch {throw new Error('请输入完整服务地址，例如 https://resume.example.com');}
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!(url.protocol === 'https:' || local) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('服务地址需使用 HTTPS，或本机 localhost / 127.0.0.1 的 HTTP 地址；不能包含账号、路径或查询参数。');
  if (url.hostname.includes('*') || url.origin.length > 512) throw new Error('请填写一个具体的服务地址。');
  return url.origin;
}
export const ConnectionSchema = z.strictObject({
  id: z.string().uuid(), origin: z.string().transform(serviceOrigin), key: z.string().regex(/^rck_[A-Za-z0-9_-]{40,90}$/),
  userId: z.string().uuid(), username: z.string().max(32),
  resumeId: z.string().uuid().nullable(), resumeName: z.string().max(80).nullable(), remoteRevision: z.number().int().min(0), syncedAt: z.number().nonnegative().nullable(), locallyModified: z.boolean(),
});
export type Connection = z.infer<typeof ConnectionSchema>;
export type ConnectionInfo = Omit<Connection, 'key'>;
const MetaSchema = z.strictObject({id: z.string().uuid(), name: z.string().max(80), revision: z.number().int().min(1), created_at: z.number(), updated_at: z.number(), deleted_at: z.null()});
export const ResumeListSchema = z.strictObject({resumes: z.array(MetaSchema).max(30), default_resume_id: z.string().uuid().nullable()});
export type ResumeList = z.infer<typeof ResumeListSchema>;
export const RemoteResumeMetaSchema = MetaSchema;
export function publicConnection(connection: Connection | null): ConnectionInfo | null {
  if (!connection) return null;
  const {key: _key, ...info} = connection;
  return info;
}
