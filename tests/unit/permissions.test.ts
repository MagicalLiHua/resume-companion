import {afterEach, describe, expect, it, vi} from 'vitest';
import {releasePreviousServer} from '../../extension/src/background/permissions';

afterEach(() => vi.unstubAllGlobals());
describe('更换服务器的权限清理', () => {
  it('确认新服务器后撤销旧主机权限，浏览器拒绝清理时不撤销新连接', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const getAll = vi.fn().mockResolvedValue({origins: ['https://old.example.com/*', 'https://old.example.com:9443/*', 'https://new.example.com/*', 'https://old.example.com.evil.invalid/*']});
    vi.stubGlobal('chrome', {permissions: {getAll, remove}});
    await releasePreviousServer('https://old.example.com:8443', 'https://new.example.com');
    expect(remove).toHaveBeenCalledWith({origins: ['https://old.example.com/*', 'https://old.example.com:9443/*']});
    remove.mockRejectedValueOnce(new Error('Permission is already absent'));
    await expect(releasePreviousServer('https://old.example.com', 'https://new.example.com')).resolves.toBeUndefined();
  });
  it('初次连接和同一主机换账号或端口不删除仍可能需要的授权', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', {permissions: {remove}});
    await releasePreviousServer(null, 'https://new.example.com');
    await releasePreviousServer('https://same.example.com', 'https://same.example.com');
    await releasePreviousServer('http://127.0.0.1:18080', 'http://127.0.0.1:18081');
    expect(remove).not.toHaveBeenCalled();
  });
});
