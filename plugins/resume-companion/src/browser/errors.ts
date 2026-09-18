export type ErrorCode = 'blocked' | 'browser_disconnected' | 'browser_permission_required' | 'cancelled'
  | 'driver_unavailable' | 'internal_error' | 'invalid_request' | 'operation_conflict'
  | 'stale' | 'timeout' | 'unknown' | 'unsupported_capability';

export class BrowserError extends Error {
  constructor(public readonly code: ErrorCode, message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
    this.name = 'BrowserError';
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeBrowserError(error: unknown): BrowserError {
  if (error instanceof BrowserError) return error;
  const message = messageOf(error);
  if (/permission|Allow|remote debugging|chrome:\/\/inspect/i.test(message)) return new BrowserError('browser_permission_required', '请在 chrome://inspect/#remote-debugging 启用远程调试，并在 Chrome 的本次连接提示中点击 Allow', { cause: error });
  if (/disconnected|closed|ECONN|transport|Not connected|TargetClose/i.test(message)) return new BrowserError('browser_disconnected', 'Chrome 连接已断开，请重新连接后观察页面', { cause: error });
  return new BrowserError('driver_unavailable', message || '浏览器驱动不可用', { cause: error });
}
