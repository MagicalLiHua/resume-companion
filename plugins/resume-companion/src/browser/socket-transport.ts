import type { Socket } from 'node:net';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export class SocketServerTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private readonly buffer = new ReadBuffer();
  private started = false;
  private closed = false;

  constructor(private readonly socket: Socket) {}

  async start(): Promise<void> {
    if (this.started) throw new Error('SocketServerTransport already started');
    this.started = true;
    this.socket.on('data', this.handleData);
    this.socket.on('error', this.handleError);
    this.socket.on('close', this.handleClose);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error('socket transport is closed');
    const payload = serializeMessage(message);
    await new Promise<void>((resolve, reject) => {
      this.socket.write(payload, error => error ? reject(error) : resolve());
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.buffer.clear();
    await new Promise<void>(resolve => {
      if (this.socket.destroyed) return resolve();
      this.socket.end(() => resolve());
    });
    this.onclose?.();
  }

  private readonly handleData = (chunk: Buffer): void => {
    try {
      this.buffer.append(chunk);
      while (true) {
        const message = this.buffer.readMessage();
        if (message === null) break;
        this.onmessage?.(message);
      }
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  private readonly handleError = (error: Error): void => {
    this.onerror?.(error);
  };

  private readonly handleClose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.buffer.clear();
    this.onclose?.();
  };

  private detach(): void {
    this.socket.off('data', this.handleData);
    this.socket.off('error', this.handleError);
    this.socket.off('close', this.handleClose);
  }
}
