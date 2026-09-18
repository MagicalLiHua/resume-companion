import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodexTools } from '../../extension/src/background/codex-tools';

const tab = { id: 11, windowId: 22, url: 'https://jobs.example/apply' };
let api: any;
const tools = () => new CodexTools();
beforeEach(() => {
  vi.useFakeTimers();
  api = {
    tabs: { get: vi.fn().mockResolvedValue(tab), update: vi.fn().mockResolvedValue(tab), query: vi.fn().mockResolvedValue([tab]),
      sendMessage: vi.fn().mockResolvedValue({ ok: true, data: { visibility: 'visible', focused: true } }) },
    windows: { get: vi.fn().mockResolvedValue({ state: 'normal' }), update: vi.fn().mockResolvedValue({}) },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ frameId: 0, documentId: 'document-1' }]) },
    storage: { session: { get: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined) } },
    runtime: { getManifest: () => ({ version: '0.7.0' }) },
  };
  vi.stubGlobal('chrome', api);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('恢复最小化目标窗口并激活指定标签页，回读真实可见状态', async () => {
  api.windows.get.mockResolvedValue({ state: 'minimized' });
  expect(await tools().handle('activate_tab', { tab_id: 11 })).toMatchObject({ tabId: 11, status: 'visible' });
  expect(api.windows.update.mock.calls).toEqual([[22, { state: 'normal' }], [22, { focused: true }]]);
  expect(api.tabs.update).toHaveBeenCalledWith(11, { active: true });
  expect(api.tabs.sendMessage).toHaveBeenCalledWith(11, { type: 'PAGE_STATE', codexBridge: true }, { documentId: 'document-1' });
});
it('系统仍隐藏窗口时有界返回 hidden，不把激活成功等同页面可见', async () => {
  api.tabs.sendMessage.mockResolvedValue({ ok: true, data: { visibility: 'hidden', focused: false } });
  const result = tools().handle('activate_tab', { tab_id: 11 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toMatchObject({ status: 'hidden', pageState: { visibility: 'hidden' } });
  expect(api.windows.update).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('激活过程中页面导航时停止，不向新的文档发送操作', async () => {
  api.tabs.get.mockResolvedValueOnce(tab).mockResolvedValue({ ...tab, url: 'https://jobs.example/other' });
  await expect(tools().handle('activate_tab', { tab_id: 11 })).rejects.toThrow('页面已变化');
  expect(api.tabs.sendMessage).not.toHaveBeenCalled();
});
it('无效 ID 和非网页标签不会激活窗口', async () => {
  await expect(tools().handle('activate_tab', { tab_id: -1 })).rejects.toThrow();
  api.tabs.get.mockResolvedValue({ ...tab, url: 'chrome://extensions/' });
  await expect(tools().handle('activate_tab', { tab_id: 11 })).rejects.toThrow('不是普通网页');
  expect(api.windows.update).not.toHaveBeenCalled();
  expect(api.scripting.executeScript).not.toHaveBeenCalled();
});
