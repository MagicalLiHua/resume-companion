export type ErrorCode = 'blocked' | 'browser_approval_required' | 'browser_disconnected' | 'browser_permission_required' | 'cancelled'
  | 'devtools_active_port_invalid' | 'devtools_active_port_missing' | 'devtools_active_port_permission_denied'
  | 'driver_unavailable' | 'internal_error' | 'invalid_request' | 'operation_conflict'
  | 'permission_proxy_unsupported' | 'remote_debugging_disabled' | 'stale' | 'timeout' | 'unknown' | 'unsupported_capability';

export class BrowserError extends Error {
  constructor(public readonly code: ErrorCode, message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
    this.name = 'BrowserError';
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeBrowserError(error: unknown, context?: { endpointReady?: boolean }): BrowserError {
  if (error instanceof BrowserError) return error;
  const message = causeMessages(error).join('\n');
  if (/(?:\b(?:EPERM|EACCES)\b|operation not permitted|permission denied)/i.test(message) && /DevToolsActivePort|Chrome/i.test(message)) {
    return new BrowserError('devtools_active_port_permission_denied', '当前 AI 客户端无权读取 Chrome 的 DevToolsActivePort；请使用 Resume Companion 专用 Profile', { cause: error });
  }
  if (/DevToolsActivePort/i.test(message) && /invalid|format/i.test(message)) {
    return new BrowserError('devtools_active_port_invalid', 'Chrome 的 DevToolsActivePort 格式无效；请重启 Chrome 后重试', { cause: error });
  }
  if (/DevToolsActivePort/i.test(message) && /ENOENT|not found|Could not find/i.test(message)) {
    return new BrowserError('devtools_active_port_missing', '没有找到 Chrome 的 DevToolsActivePort；请确认远程调试已开启，或使用专用 Profile', { cause: error });
  }
  if (/\/json\/version|HTTP Not Found|HTTP 404/i.test(message)) {
    return new BrowserError('permission_proxy_unsupported', '该端口是 Chrome 权限代理，不能作为普通 browser URL 使用；请改用 auto_connect 或专用 Profile', { cause: error });
  }
  if (context?.endpointReady && /permission|\bAllow\b|approve|unauthori[sz]ed/i.test(message)) {
    return new BrowserError('browser_approval_required', '远程调试已开启；请在 Chrome 的本次连接提示中点击 Allow', { cause: error });
  }
  if (/remote debugging|chrome:\/\/inspect/i.test(message)) {
    return new BrowserError('remote_debugging_disabled', '当前未发现可连接的远程调试端点；请开启 Chrome 远程调试，或使用专用 Profile', { cause: error });
  }
  if (/disconnected|closed|ECONN|transport|Not connected|TargetClose|Could not connect/i.test(message)) {
    return new BrowserError('browser_disconnected', 'Chrome transport 已断开；下一次调用会创建新的连接', { cause: error });
  }
  return new BrowserError('driver_unavailable', safeFallbackMessage(message), { cause: error });
}

export function isConnectionError(code: ErrorCode): boolean {
  return [
    'browser_approval_required', 'browser_disconnected', 'browser_permission_required',
    'devtools_active_port_invalid', 'devtools_active_port_missing', 'devtools_active_port_permission_denied',
    'driver_unavailable', 'permission_proxy_unsupported', 'remote_debugging_disabled',
  ].includes(code);
}

function causeMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current) && messages.length < 6) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else {
      messages.push(String(current));
      break;
    }
  }
  return messages;
}

function safeFallbackMessage(message: string): string {
  if (!message) return '浏览器驱动不可用';
  return '浏览器驱动返回了未分类错误；原始内容未向 MCP 响应公开，请查看安全诊断码或重新连接';
}
