#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromeProfileDir } from './chrome-profile.js';
import { BROWSER_SUPERVISOR_PROTOCOL, RUNTIME_PLUGIN_VERSION } from './version.js';
import { supervisorSocketPath, type SupervisorHello, type SupervisorReply } from './browser/supervisor-protocol.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const supervisorEntry = [
  resolve(moduleDirectory, 'browser-supervisor.bundle.mjs'),
  resolve(moduleDirectory, '../browser-supervisor.bundle.mjs'),
].find(existsSync) ?? resolve(moduleDirectory, 'browser-supervisor.bundle.mjs');
const profileDir = resolveChromeProfileDir();
const endpoint = supervisorSocketPath(profileDir);
const sessionId = randomUUID();

async function open(kind: SupervisorHello['kind']): Promise<{ socket: Socket; reply: SupervisorReply }> {
  return await new Promise((resolveConnection, reject) => {
    const socket = createConnection(endpoint);
    let buffer = '';
    const fail = (error: Error): void => {
      socket.destroy();
      reject(error);
    };
    socket.setEncoding('utf8');
    socket.once('error', fail);
    socket.once('connect', () => {
      const hello: SupervisorHello = {
        kind,
        client_version: RUNTIME_PLUGIN_VERSION,
        protocol: BROWSER_SUPERVISOR_PROTOCOL,
        session_id: sessionId,
      };
      socket.write(`${JSON.stringify(hello)}\n`);
    });
    socket.on('data', chunk => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      socket.off('error', fail);
      socket.removeAllListeners('data');
      try {
        const reply = JSON.parse(buffer.slice(0, newline)) as SupervisorReply;
        resolveConnection({ socket, reply });
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function startSupervisor(): void {
  const child = spawn(process.execPath, [supervisorEntry], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      RESUME_COMPANION_CHROME_DATA_DIR: profileDir,
      RESUME_COMPANION_SUPERVISOR_VERSION: RUNTIME_PLUGIN_VERSION,
    },
  });
  child.unref();
}

async function connectWithRetry(): Promise<Socket> {
  let started = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const connection = await open('connect');
      if (connection.reply.status === 'ready') return connection.socket;
      connection.socket.destroy();
      if (connection.reply.status === 'upgrade_required') {
        const upgrade = await open('upgrade');
        upgrade.socket.destroy();
        if (upgrade.reply.status !== 'shutting_down') throw new Error(upgrade.reply.message ?? 'supervisor upgrade was rejected');
        started = false;
      } else {
        throw new Error(connection.reply.message ?? `browser supervisor returned ${connection.reply.status}`);
      }
    } catch (error) {
      lastError = error;
    }
    if (!started) {
      startSupervisor();
      started = true;
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error(`browser_supervisor_unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

try {
  const socket = await connectWithRetry();
  socket.setNoDelay(true);
  process.stdin.pipe(socket);
  socket.pipe(process.stdout, { end: false });
  socket.once('error', error => console.error(`Resume Browser supervisor connection failed: ${error.message}`));
  socket.once('close', () => process.exit(0));
  process.once('SIGTERM', () => socket.end());
  process.once('SIGINT', () => socket.end());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
