#!/usr/bin/env node

import { chmod, unlink } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { resolveChromeProfileDir } from './chrome-profile.js';
import { ResumeBrowserHost, ResumeBrowserServer } from './resume-browser-server.js';
import { SocketServerTransport } from './browser/socket-transport.js';
import { compareVersions, supervisorSocketPath, type SupervisorHello, type SupervisorReply } from './browser/supervisor-protocol.js';
import { BROWSER_SUPERVISOR_PROTOCOL, RUNTIME_PLUGIN_VERSION } from './version.js';

const profileDir = resolveChromeProfileDir();
const endpoint = supervisorSocketPath(profileDir);
const host = new ResumeBrowserHost();
const sessions = new Map<string, { server: ResumeBrowserServer; socket: Socket }>();
let listener: Server | undefined;
let closing = false;
let emptyTimer: NodeJS.Timeout | undefined;

function reply(socket: Socket, value: SupervisorReply): Promise<void> {
  return new Promise((resolveReply, reject) => {
    socket.write(`${JSON.stringify(value)}\n`, error => error ? reject(error) : resolveReply());
  });
}

async function endpointIsLive(): Promise<boolean> {
  return await new Promise(resolveLive => {
    const socket = createConnection(endpoint);
    const timer = setTimeout(() => { socket.destroy(); resolveLive(false); }, 250);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolveLive(true); });
    socket.once('error', () => { clearTimeout(timer); resolveLive(false); });
  });
}

async function prepareEndpoint(): Promise<boolean> {
  if (process.platform === 'win32') return true;
  if (await endpointIsLive()) return false;
  await unlink(endpoint).catch(() => undefined);
  return true;
}

function scheduleEphemeralShutdown(): void {
  if (process.env.RESUME_COMPANION_SUPERVISOR_EPHEMERAL !== '1' || sessions.size > 0 || closing) return;
  clearTimeout(emptyTimer);
  emptyTimer = setTimeout(() => { void shutdown(); }, 150);
}

async function attach(socket: Socket, hello: SupervisorHello): Promise<void> {
  clearTimeout(emptyTimer);
  const existing = sessions.get(hello.session_id);
  if (existing) {
    await existing.server.close();
    existing.socket.destroy();
    sessions.delete(hello.session_id);
  }
  const transport = new SocketServerTransport(socket);
  const server = await ResumeBrowserServer.create(host, hello.session_id);
  sessions.set(hello.session_id, { server, socket });
  socket.once('close', () => {
    const current = sessions.get(hello.session_id);
    if (current?.socket !== socket) return;
    sessions.delete(hello.session_id);
    host.releaseSession(hello.session_id);
    void server.close();
    scheduleEphemeralShutdown();
  });
  await reply(socket, {
    status: 'ready',
    supervisor_version: RUNTIME_PLUGIN_VERSION,
    protocol: BROWSER_SUPERVISOR_PROTOCOL,
  });
  await server.connect(transport);
}

async function handleHandshake(socket: Socket): Promise<void> {
  let buffer = Buffer.alloc(0);
  const timer = setTimeout(() => socket.destroy(), 5_000);
  const onData = (chunk: Buffer): void => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.byteLength > 16 * 1024) {
      clearTimeout(timer);
      socket.destroy();
      return;
    }
    const newline = buffer.indexOf(0x0a);
    if (newline === -1) return;
    clearTimeout(timer);
    socket.off('data', onData);
    if (newline !== buffer.length - 1) {
      socket.destroy(new Error('MCP payload arrived before supervisor handshake completed'));
      return;
    }
    void dispatchHandshake(socket, buffer.subarray(0, newline).toString('utf8'));
  };
  socket.on('data', onData);
}

async function dispatchHandshake(socket: Socket, line: string): Promise<void> {
  try {
    const hello = JSON.parse(line) as Partial<SupervisorHello>;
    if (hello.protocol !== BROWSER_SUPERVISOR_PROTOCOL) {
      await reply(socket, {
        status: 'protocol_mismatch', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL,
        message: 'browser supervisor protocol mismatch',
      });
      socket.end();
      return;
    }
    if (typeof hello.client_version !== 'string' || typeof hello.session_id !== 'string' || !hello.session_id) {
      await reply(socket, {
        status: 'error', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL,
        message: 'invalid supervisor handshake',
      });
      socket.end();
      return;
    }
    const newerClient = compareVersions(hello.client_version, RUNTIME_PLUGIN_VERSION) > 0;
    if (hello.kind === 'upgrade') {
      if (!newerClient) {
        await reply(socket, {
          status: 'error', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL,
          message: 'only a newer client can upgrade the browser supervisor',
        });
        socket.end();
        return;
      }
      await reply(socket, { status: 'shutting_down', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL });
      socket.end();
      return void setTimeout(() => { void shutdown(); }, 20);
    }
    if (hello.kind !== 'connect') {
      await reply(socket, { status: 'error', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL, message: 'unsupported supervisor command' });
      socket.end();
      return;
    }
    if (newerClient) {
      await reply(socket, { status: 'upgrade_required', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL });
      socket.end();
      return;
    }
    await attach(socket, hello as SupervisorHello);
  } catch (error) {
    await reply(socket, {
      status: 'error', supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }).catch(() => undefined);
    socket.end();
  }
}

async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  clearTimeout(emptyTimer);
  const active = [...sessions.values()];
  sessions.clear();
  await Promise.allSettled(active.map(async session => {
    await session.server.close();
    session.socket.destroy();
  }));
  await host.close();
  if (listener) await new Promise<void>(resolveClose => listener!.close(() => resolveClose()));
  if (process.platform !== 'win32') await unlink(endpoint).catch(() => undefined);
  process.exit(0);
}

if (!await prepareEndpoint()) process.exit(0);
listener = createServer(socket => { void handleHandshake(socket); });
listener.on('error', error => {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') process.exit(0);
  console.error(`Resume Browser supervisor failed: ${error.message}`);
  process.exit(1);
});
await new Promise<void>((resolveListen, reject) => {
  listener!.once('error', reject);
  listener!.listen(endpoint, () => {
    listener!.off('error', reject);
    resolveListen();
  });
});
if (process.platform !== 'win32') await chmod(endpoint, 0o600);
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
scheduleEphemeralShutdown();
