import { once } from 'node:events';
import type { Writable } from 'node:stream';

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

type JsonRpcToolCall = {
  id: string | number;
};

export class McpToolLockGate {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private queue: Promise<void> = Promise.resolve();
  private lockAcquired = false;

  constructor(
    private readonly upstream: Writable,
    private readonly clientOutput: Writable,
    private readonly acquire: () => Promise<void>,
  ) {}

  push(chunk: Buffer): void {
    if (this.buffer.length + chunk.length > MAX_BUFFER_BYTES) {
      this.buffer = Buffer.alloc(0);
      throw new Error('mcp_input_too_large: MCP 输入超过安全上限');
    }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (true) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) break;
      const line = this.buffer.subarray(0, newline + 1);
      this.buffer = this.buffer.subarray(newline + 1);
      this.queue = this.queue.then(() => this.forward(line));
    }
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  async end(): Promise<void> {
    if (this.buffer.length) {
      const trailing = this.buffer;
      this.buffer = Buffer.alloc(0);
      this.queue = this.queue.then(() => this.forward(trailing));
    }
    await this.queue;
    this.upstream.end();
  }

  private async forward(line: Buffer): Promise<void> {
    const toolCall = parseToolCall(line);
    if (toolCall && !this.lockAcquired) {
      try {
        await this.acquire();
        this.lockAcquired = true;
      } catch (error) {
        await writeChunk(this.clientOutput, Buffer.from(`${JSON.stringify({
          jsonrpc: '2.0',
          id: toolCall.id,
          error: { code: -32000, message: safeLockError(error) },
        })}\n`));
        return;
      }
    }
    await writeChunk(this.upstream, line);
  }
}

function parseToolCall(line: Buffer): JsonRpcToolCall | null {
  try {
    const text = line.toString('utf8').replace(/[\r\n]+$/, '');
    const message = JSON.parse(text) as Record<string, unknown>;
    if (message.jsonrpc !== '2.0' || message.method !== 'tools/call') return null;
    if (typeof message.id !== 'string' && typeof message.id !== 'number') return null;
    return { id: message.id };
  } catch {
    return null;
  }
}

function safeLockError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('profile_in_use:')
    ? message
    : 'profile_lock_failed: 无法安全取得 Resume Companion 专用 Chrome 的实例锁';
}

async function writeChunk(stream: Writable, chunk: Buffer): Promise<void> {
  if (stream.write(chunk)) return;
  await once(stream, 'drain');
}
