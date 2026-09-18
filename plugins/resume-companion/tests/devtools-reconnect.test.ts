import { describe, expect, test, vi } from 'vitest';
import { DevToolsDriver } from '../src/browser/devtools-driver.js';

describe('DevTools upstream lifecycle', () => {
  test('closes a failed client and creates a fresh client on retry', async () => {
    const closeFirst = vi.fn(async () => undefined);
    const closeSecond = vi.fn(async () => undefined);
    let clientsCreated = 0;
    const driver = new DevToolsDriver({
      dataDir: '/tmp/resume-companion-reconnect-test',
      runtimePath: import.meta.filename,
      profileMode: 'isolated',
      dependencies: {
        createTransport: () => ({ stderr: null }) as never,
        createClient: () => {
          clientsCreated += 1;
          if (clientsCreated === 1) {
            return {
              connect: async () => undefined,
              callTool: async () => { throw new Error('transport closed'); },
              close: closeFirst,
            };
          }
          return {
            connect: async () => undefined,
            callTool: async () => ({ structuredContent: { pages: [{ id: 7, title: '招聘页面', url: 'https://jobs.example/form' }] } }),
            close: closeSecond,
          };
        },
      },
    });

    await expect(driver.listTabs({})).rejects.toMatchObject({ code: 'browser_disconnected' });
    await expect(driver.listTabs({})).resolves.toMatchObject({ tabs: [{ tabId: 7 }] });
    expect(clientsCreated).toBe(2);
    expect(closeFirst).toHaveBeenCalledOnce();
    await driver.close();
    expect(closeSecond).toHaveBeenCalledOnce();
  });

  test('reports an ActivePort permission block without creating an upstream client', async () => {
    const createClient = vi.fn();
    const driver = new DevToolsDriver({
      dataDir: '/tmp/resume-companion-permission-test',
      runtimePath: import.meta.filename,
      profileMode: 'auto_connect',
      dependencies: {
        createClient,
        probeAutoConnect: async () => ({
          code: 'devtools_active_port_permission_denied',
          message: '当前 AI 客户端无权读取 Chrome 的 DevToolsActivePort；请使用 Resume Companion 专用 Profile',
          permission_state: 'blocked',
        }),
      },
    });

    const status = await driver.status();
    expect(status).toMatchObject({
      connected: false,
      permission_state: 'blocked',
      connection_error_code: 'devtools_active_port_permission_denied',
    });
    await expect(driver.listTabs({})).rejects.toMatchObject({ code: 'devtools_active_port_permission_denied' });
    expect(createClient).not.toHaveBeenCalled();
  });
});
