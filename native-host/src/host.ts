import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection, type Socket } from 'node:net';
import { BRIDGE_MAX_MESSAGE_BYTES, BRIDGE_PROTOCOL_VERSION, RESUME_COMPANION_EXTENSION_ID, assertBridgeMessage, isRecord, type ExtensionHello } from '../../shared/browser-bridge.js';

type Descriptor = { protocol: string; token: string; socket_path: string; pid: number; expires_at: number };
const expectedOrigin = `chrome-extension://${RESUME_COMPANION_EXTENSION_ID}/`;
const sourceOrigin = process.argv.find(value => value.startsWith('chrome-extension://')) ?? '';
let extensionHello: ExtensionHello | null = null;
let socket: Socket | null = null;
let socketBuffer = '';
let connecting = false;
let closed = false;
let nativeBuffer = Buffer.alloc(0);

if (sourceOrigin !== expectedOrigin) fail('origin_rejected');
process.stdin.on('data', chunk => { nativeBuffer = Buffer.concat([nativeBuffer, chunk]); readNativeFrames(); });
process.stdin.on('end', () => { closed = true; socket?.destroy(); });
process.stdin.on('error', () => { closed = true; socket?.destroy(); });
process.on('uncaughtException', () => fail('uncaught_exception'));
process.on('unhandledRejection', () => fail('unhandled_rejection'));

function readNativeFrames(): void {
  while (nativeBuffer.byteLength >= 4) {
    const length = nativeBuffer.readUInt32LE(0);
    if (length > BRIDGE_MAX_MESSAGE_BYTES) fail('native_message_too_large');
    if (nativeBuffer.byteLength < length + 4) return;
    const body = nativeBuffer.subarray(4, 4 + length);
    nativeBuffer = nativeBuffer.subarray(4 + length);
    let message: unknown;
    try { message = JSON.parse(body.toString('utf8')); assertBridgeMessage(message); }
    catch { fail('invalid_native_message'); return; }
    if (message.kind === 'extension_hello') {
      extensionHello = message;
      void connectBridge();
      continue;
    }
    if (!socket?.writable) continue;
    socket.write(`${JSON.stringify(message)}\n`);
  }
}

async function connectBridge(): Promise<void> {
  if (connecting || socket || closed || !extensionHello) return;
  connecting = true;
  try {
    const deadline = Date.now() + 65_000;
    while (!closed && !socket && Date.now() < deadline) {
      try {
        const descriptor = await loadDescriptor();
        await openSocket(descriptor);
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!socket && !closed) fail('bridge_descriptor_unavailable');
  } finally { connecting = false; }
}

async function loadDescriptor(): Promise<Descriptor> {
  const dataDir = process.env.RESUME_COMPANION_DATA_DIR || defaultDataDir();
  const path = process.env.RESUME_COMPANION_BRIDGE_DESCRIPTOR || join(dataDir, 'bridge', 'active.json');
  const metadata = await stat(path);
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) throw new Error('descriptor_permissions');
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed) || parsed.protocol !== BRIDGE_PROTOCOL_VERSION || typeof parsed.token !== 'string' || parsed.token.length < 32 || typeof parsed.socket_path !== 'string' || typeof parsed.pid !== 'number' || typeof parsed.expires_at !== 'number' || parsed.expires_at <= Date.now()) throw new Error('descriptor_invalid');
  return parsed as Descriptor;
}

function openSocket(descriptor: Descriptor): Promise<void> {
  return new Promise((resolve, reject) => {
    const candidate = createConnection(descriptor.socket_path);
    const failed = (error: Error): void => { candidate.destroy(); reject(error); };
    candidate.once('error', failed);
    candidate.once('connect', () => {
      candidate.off('error', failed);
      socket = candidate;
      socketBuffer = '';
      candidate.on('data', readSocketLines);
      candidate.on('error', () => candidate.destroy());
      candidate.on('close', () => {
        if (socket === candidate) socket = null;
        if (!closed) setTimeout(() => { void connectBridge(); }, 400);
      });
      candidate.write(`${JSON.stringify({ kind: 'hello', protocol: BRIDGE_PROTOCOL_VERSION, token: descriptor.token, extension_origin: sourceOrigin, extension_version: extensionHello?.extension_version ?? 'unknown', host_pid: process.pid })}\n`);
      resolve();
    });
  });
}

function readSocketLines(chunk: Buffer): void {
  socketBuffer += chunk.toString('utf8');
  if (Buffer.byteLength(socketBuffer, 'utf8') > BRIDGE_MAX_MESSAGE_BYTES * 2) fail('socket_message_too_large');
  for (;;) {
    const newline = socketBuffer.indexOf('\n');
    if (newline < 0) return;
    const line = socketBuffer.slice(0, newline);
    socketBuffer = socketBuffer.slice(newline + 1);
    if (!line) continue;
    let message: unknown;
    try { message = JSON.parse(line); assertBridgeMessage(message); }
    catch { fail('invalid_socket_message'); return; }
    writeNative(message);
  }
}

function writeNative(message: unknown): void {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.byteLength > BRIDGE_MAX_MESSAGE_BYTES) fail('outbound_message_too_large');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.byteLength, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function defaultDataDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Resume Companion');
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Resume Companion');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'resume-companion');
}

function fail(code: string): never {
  process.stderr.write(`[resume-companion-native-host] ${code}\n`);
  process.exit(1);
}
