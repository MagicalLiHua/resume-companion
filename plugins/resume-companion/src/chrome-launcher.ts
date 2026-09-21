#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createConnection, type Socket } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileHash, resolveChromeProfileDir } from './chrome-profile.js';
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

async function open(kind: SupervisorHello['kind'], address = endpoint): Promise<{ socket: Socket; reply: SupervisorReply }> {
  return await new Promise((resolveConnection, reject) => {
    const socket = createConnection(address);
    let buffer = '';
    const fail = (error: Error): void => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer=setTimeout(()=>fail(new Error('browser_supervisor_handshake_timeout')),2500);
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
      clearTimeout(timer);
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

async function legacyEndpoints():Promise<string[]> {
  if(process.platform==='win32')return [];
  const directories=[tmpdir(),'/tmp'];
  if(process.platform==='darwin') {
    // SDK subprocesses may omit TMPDIR. macOS still knows the user's system
    // temporary directory; only probe our exact per-profile socket name there.
    const directory=await new Promise<string>(resolveDirectory=>execFile('/usr/bin/getconf',['DARWIN_USER_TEMP_DIR'],{timeout:1500},(error,stdout)=>resolveDirectory(error?'':stdout.trim())));
    if(directory)directories.push(directory);
  }
  // An old Unix socket cannot exist beyond sockaddr_un's pathname capacity.
  // Do not let an unusually long TMPDIR turn an optional legacy probe into EINVAL.
  const maximum=process.platform==='darwin'?103:107;
  return [...new Set(directories.map(directory=>join(directory,`rc-browser-${profileHash(profileDir)}.sock`)))].filter(path=>Buffer.byteLength(path)<=maximum);
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
  const addresses=[endpoint,...await legacyEndpoints()];
  for (let attempt = 0; attempt < 150; attempt++) {
    let connection:Awaited<ReturnType<typeof open>>|undefined;
    let address=endpoint;
    for(const candidate of addresses) {
      try {connection=await open('connect',candidate);address=candidate;break;}
      catch(error) {
        lastError=error;
        const code=(error as NodeJS.ErrnoException).code;
        if(code!=='ENOENT' && code!=='ECONNREFUSED')throw error;
      }
    }
    if(connection) {
      if (connection.reply.status === 'ready') return connection.socket;
      connection.socket.destroy();
      if (connection.reply.status === 'upgrade_required') {
        if(process.env.RESUME_COMPANION_ALLOW_BROWSER_RESTART!=='1')
          throw new Error(`browser_upgrade_pending: dedicated browser version ${connection.reply.supervisor_version} is preserved. Review unsaved work before explicitly authorizing a restart; an authorized launcher can set RESUME_COMPANION_ALLOW_BROWSER_RESTART=1.`);
        const upgrade = await open('upgrade',address);
        upgrade.socket.destroy();
        if (upgrade.reply.status !== 'shutting_down') throw new Error(upgrade.reply.message ?? 'supervisor upgrade was rejected');
        started = false;
      } else {
        throw new Error(connection.reply.message ?? `browser supervisor returned ${connection.reply.status}`);
      }
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
