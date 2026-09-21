import { chmod, unlink } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { profileHash } from '../chrome-profile.js';
import { ensureSupervisorRuntimeDir, supervisorRuntimeDir } from './supervisor-protocol.js';

type JsonRecord = Record<string, unknown>;

export function debugSocketPath(profileDir: string): string {
  const id = profileHash(profileDir);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\resume-companion-debug-${id}`
    : join(supervisorRuntimeDir(), `${id}.debug.sock`);
}

export class BrowserDebugBridge {
  readonly endpoint: string;
  private server: Server | undefined;

  constructor(profileDir: string, private readonly handle: (request: JsonRecord) => Promise<unknown>) {
    this.endpoint = debugSocketPath(profileDir);
  }

  async start(): Promise<void> {
    if (this.server) return;
    await ensureSupervisorRuntimeDir();
    if (process.platform !== 'win32') await unlink(this.endpoint).catch(() => undefined);
    const server = createServer(socket => this.accept(socket));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.endpoint, () => {
        server.off('error', reject);
        resolve();
      });
    });
    if (process.platform !== 'win32') await chmod(this.endpoint, 0o600);
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (process.platform !== 'win32') await unlink(this.endpoint).catch(() => undefined);
  }

  private accept(socket: Socket): void {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, 'utf8') > 64 * 1024) {
        socket.end(`${JSON.stringify({ ok: false, error: 'request_too_large' })}\n`);
        return;
      }
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = '';
      void this.dispatch(socket, line);
    });
  }

  private async dispatch(socket: Socket, line: string): Promise<void> {
    try {
      const request = JSON.parse(line) as JsonRecord;
      const result = await this.handle(request);
      socket.end(`${JSON.stringify({ ok: true, result })}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      socket.end(`${JSON.stringify({ ok: false, error: message.slice(0, 500) })}\n`);
    }
  }
}
