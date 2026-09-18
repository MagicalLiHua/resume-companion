import { readFile } from 'node:fs/promises';
import { homedir, platform as currentPlatform } from 'node:os';
import { join } from 'node:path';

export type ConnectionDiagnosticCode =
  | 'endpoint_ready'
  | 'remote_debugging_disabled'
  | 'devtools_active_port_missing'
  | 'devtools_active_port_permission_denied'
  | 'devtools_active_port_invalid'
  | 'permission_proxy_unsupported'
  | 'explicit_endpoint_ready';

export type ConnectionDiagnostic = {
  code: ConnectionDiagnosticCode;
  message: string;
  permission_state: 'unknown' | 'required' | 'blocked';
};

type FileReader = (path: string, encoding: BufferEncoding) => Promise<string>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>;

export type ProbeDependencies = {
  readText?: FileReader;
  fetch?: Fetcher;
  platform?: NodeJS.Platform;
  homeDir?: string;
  localAppData?: string;
  timeoutMs?: number;
};

export function chromeUserDataDir(dependencies: ProbeDependencies = {}): string | null {
  const platform = dependencies.platform ?? currentPlatform();
  const home = dependencies.homeDir ?? homedir();
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  if (platform === 'win32') {
    const localAppData = dependencies.localAppData ?? process.env.LOCALAPPDATA;
    return localAppData ? join(localAppData, 'Google', 'Chrome', 'User Data') : null;
  }
  if (platform === 'linux') return join(home, '.config', 'google-chrome');
  return null;
}

export async function probeAutoConnect(dependencies: ProbeDependencies = {}): Promise<ConnectionDiagnostic> {
  const userDataDir = chromeUserDataDir(dependencies);
  if (!userDataDir) {
    return diagnostic('devtools_active_port_missing', '无法确定当前平台的 Chrome 数据目录；请改用专用 Profile 或明确配置 WebSocket endpoint', 'blocked');
  }
  const readText = dependencies.readText ?? ((path, encoding) => readFile(path, encoding));
  try {
    const value = await readText(join(userDataDir, 'DevToolsActivePort'), 'utf8');
    return validActivePort(value)
      ? diagnostic('endpoint_ready', '远程调试端点已就绪；连接请求出现时请在 Chrome 点击 Allow', 'required')
      : diagnostic('devtools_active_port_invalid', 'Chrome 的 DevToolsActivePort 格式无效；请重启 Chrome 后重新开启远程调试', 'blocked');
  } catch (error) {
    const code = fileErrorCode(error);
    if (code === 'EACCES' || code === 'EPERM') {
      return diagnostic(
        'devtools_active_port_permission_denied',
        '当前 AI 客户端无权读取 Chrome 的 DevToolsActivePort；请使用 Resume Companion 专用 Profile，或在允许读取该文件的客户端中使用 current-profile 模式',
        'blocked',
      );
    }
    if (code !== 'ENOENT') {
      return diagnostic('devtools_active_port_missing', '无法读取 Chrome 的 DevToolsActivePort；请使用专用 Profile 或检查 Chrome 安装', 'blocked');
    }
  }

  const endpoint = await probeHttpEndpoint('http://127.0.0.1:9222', dependencies);
  if (endpoint === 'permission_proxy') {
    return diagnostic(
      'permission_proxy_unsupported',
      'Chrome 权限代理正在监听，但当前连接环境没有可读的 DevToolsActivePort，不能通过 HTTP discovery 代替；请使用专用 Profile',
      'blocked',
    );
  }
  if (endpoint === 'standard') {
    return diagnostic(
      'devtools_active_port_missing',
      'Chrome 调试端口可访问，但 DevToolsActivePort 缺失；请明确配置 RESUME_COMPANION_DEVTOOLS_BROWSER_URL',
      'blocked',
    );
  }
  return diagnostic(
    'remote_debugging_disabled',
    '当前未发现可连接的 Chrome 远程调试端点；如需使用当前 Profile，请先在 chrome://inspect/#remote-debugging 开启远程调试',
    'required',
  );
}

export async function probeBrowserUrl(browserUrl: string, dependencies: ProbeDependencies = {}): Promise<ConnectionDiagnostic> {
  const endpoint = await probeHttpEndpoint(browserUrl, dependencies);
  if (endpoint === 'permission_proxy') {
    return diagnostic(
      'permission_proxy_unsupported',
      '配置的 browser URL 是 Chrome 权限代理，它不会提供 /json/version；请使用 auto_connect 或非默认 Profile 的标准调试端口',
      'blocked',
    );
  }
  if (endpoint === 'standard') {
    return diagnostic('explicit_endpoint_ready', '明确配置的 Chrome 调试端点已就绪', 'unknown');
  }
  return diagnostic('remote_debugging_disabled', '明确配置的 Chrome 调试端点不可访问', 'blocked');
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/wss?:\/\/[^\s"']+/gi, '[redacted-websocket]')
    .replace(/https?:\/\/[^\s"']+/gi, '[redacted-url]')
    .replace(/("?(?:cookie|authorization|headers?|value)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1[redacted]')
    .replace(/\/devtools\/browser\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+/g, '/devtools/browser/[redacted]')
    .slice(0, 500);
}

export function safeDiagnosticFromText(value: string): string | null {
  const sanitized = sanitizeDiagnosticText(value);
  if (/\b(?:EPERM|EACCES)\b|operation not permitted|permission denied/i.test(sanitized)) return 'DevToolsActivePort read denied by host permissions';
  if (/DevToolsActivePort/i.test(sanitized) && /ENOENT|not found|could not find/i.test(sanitized)) return 'DevToolsActivePort was not found';
  if (/disconnected|connection closed|transport closed|TargetClose/i.test(sanitized)) return 'Chrome transport disconnected';
  if (/permission|\bAllow\b/i.test(sanitized)) return 'Chrome connection approval is required';
  return null;
}

function diagnostic(code: ConnectionDiagnosticCode, message: string, permission_state: ConnectionDiagnostic['permission_state']): ConnectionDiagnostic {
  return { code, message, permission_state };
}

function validActivePort(value: string): boolean {
  const [rawPort, rawPath] = value.split('\n').map(line => line.trim()).filter(Boolean);
  const port = Number(rawPort);
  return Number.isInteger(port) && port > 0 && port <= 65_535 && Boolean(rawPath?.startsWith('/devtools/browser/'));
}

async function probeHttpEndpoint(browserUrl: string, dependencies: ProbeDependencies): Promise<'standard' | 'permission_proxy' | 'unavailable'> {
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const timeoutMs = dependencies.timeoutMs ?? 600;
  try {
    const endpoint = new URL('/json/version', browserUrl).toString();
    const response = await fetcher(endpoint, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 404) return 'permission_proxy';
    return response.ok ? 'standard' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function fileErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
