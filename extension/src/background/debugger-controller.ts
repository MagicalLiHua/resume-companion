import { publicBridgeError } from '../../../shared/browser-bridge.js';

const DEBUGGER_VERSION = '1.3';
type Debuggee = chrome.debugger.Debuggee;

export class DebuggerController {
  private readonly attached = new Set<number>();
  private readonly attaching = new Map<number, Promise<void>>();

  constructor() {
    chrome.debugger.onDetach.addListener(source => {
      if (source.tabId !== undefined) this.attached.delete(source.tabId);
    });
  }

  async ensureAttached(tabId: number): Promise<void> {
    if (this.attached.has(tabId)) return;
    const pending = this.attaching.get(tabId);
    if (pending) return pending;
    const task = chrome.debugger.attach({ tabId }, DEBUGGER_VERSION).then(() => {
      this.attached.add(tabId);
    }).catch(error => {
      const message = publicBridgeError(error).message;
      if (/another debugger|already attached|devtools/i.test(message)) throw new Error('debugger_attach_conflict: 目标标签页已被 DevTools 或其他调试器占用');
      if (/permission|not allowed|denied/i.test(message)) throw new Error('debugger_permission_denied: Chrome 拒绝扩展附加此标签页');
      throw new Error(`debugger_permission_denied: ${message}`);
    }).finally(() => this.attaching.delete(tabId));
    this.attaching.set(tabId, task);
    return task;
  }

  async click(tabId: number, x: number, y: number): Promise<void> {
    await this.ensureAttached(tabId);
    const target: Debuggee = { tabId };
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async pressKey(tabId: number, key: string): Promise<void> {
    await this.ensureAttached(tabId);
    const target: Debuggee = { tabId };
    const definition = keyDefinition(key);
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', ...definition });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', ...definition });
  }

  async detach(tabId: number): Promise<void> {
    this.attaching.delete(tabId);
    if (!this.attached.delete(tabId)) return;
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
  }

  async detachAll(): Promise<void> {
    await Promise.all([...this.attached].map(tabId => this.detach(tabId)));
  }

  isAttached(tabId: number): boolean { return this.attached.has(tabId); }
}

function keyDefinition(key: string): Record<string, string | number> {
  const values: Record<string, [string, number]> = {
    Escape: ['Escape', 27], ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38],
    ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], Home: ['Home', 36], End: ['End', 35],
  };
  const [code, windowsVirtualKeyCode] = values[key] ?? [key, 0];
  return { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode };
}
