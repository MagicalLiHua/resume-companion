import {describe, expect, it} from 'vitest';
import {serviceOrigin, publicConnection, ConnectionSchema} from '../../extension/src/domain/connection';
describe('账号同步的服务边界', () => {
  it('只接受具体 HTTPS 或回环地址，拒绝凭证、额外路径和宽泛权限', () => {
    expect(serviceOrigin(' https://resume.example.com/ ')).toBe('https://resume.example.com');
    expect(serviceOrigin('http://127.0.0.1:18080')).toBe('http://127.0.0.1:18080');
    for (const value of ['http://example.com', 'http://10.160.108.2', 'https://user:secret@example.com', 'https://example.com/api', 'https://example.com?key=abc', 'https://example.com#x', 'https://*', 'file:///tmp/a']) expect(() => serviceOrigin(value)).toThrow();
  });
  it('返回给界面的连接信息不包含密钥', () => {
    const connection = ConnectionSchema.parse({id:'00000000-0000-4000-8000-000000000001',origin:'https://resume.example.com',key:'rck_'+'s'.repeat(43),userId:'00000000-0000-4000-8000-000000000002',username:'student',resumeId:null,resumeName:null,remoteRevision:0,syncedAt:null,locallyModified:false});
    expect(publicConnection(connection)).not.toHaveProperty('key');
    expect(JSON.stringify(publicConnection(connection))).not.toContain(connection.key);
  });
});
