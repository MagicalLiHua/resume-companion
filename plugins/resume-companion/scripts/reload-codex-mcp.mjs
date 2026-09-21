#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(scriptDirectory, '../.codex-plugin/plugin.json'), 'utf8'));
const pluginVersion = typeof manifest.version === 'string' ? manifest.version : 'unknown';

function profileDirectory() {
  const configured = process.env.RESUME_COMPANION_CHROME_DATA_DIR;
  if (configured) {
    const expanded = configured === '~' ? homedir() : configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured;
    return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Resume Companion', 'chrome-profile');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Resume Companion', 'chrome-profile');
  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'resume-companion', 'chrome-profile');
}

function supervisorEndpoints() {
  const id = createHash('sha256').update(profileDirectory()).digest('hex').slice(0, 12);
  if(process.platform === 'win32')return [String.raw`\\.\pipe\resume-companion-browser-${id}`];
  const folders=[tmpdir(),'/tmp'];
  if(process.platform==='darwin')try {folders.push(execFileSync('/usr/bin/getconf',['DARWIN_USER_TEMP_DIR'],{encoding:'utf8',timeout:1500}).trim());}catch{}
  return [...new Set([`/tmp/resume-companion-${process.getuid()}/${id}.sock`,...folders.filter(Boolean).map(folder=>join(folder,`rc-browser-${id}.sock`))])]
    .filter(path=>Buffer.byteLength(path)<=(process.platform==='darwin'?103:107));
}

async function stopBrowserSupervisorAt(endpoint) {
  return await new Promise(resolveStop => {
    const socket = createConnection(endpoint);
    let output = '';
    const finish = value => {
      clearTimeout(timer);
      socket.destroy();
      resolveStop(value);
    };
    const timer = setTimeout(() => finish('unavailable'), 1_000);
    socket.setEncoding('utf8');
    socket.once('error', error => finish(error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ? 'absent' : 'unavailable'));
    socket.once('connect', () => {
      socket.write(`${JSON.stringify({
        kind: 'shutdown',
        client_version: pluginVersion,
        protocol: 1,
        session_id: randomUUID(),
      })}\n`);
    });
    socket.on('data', chunk => {
      output += chunk;
      const newline = output.indexOf('\n');
      if (newline === -1) return;
      try {
        const reply = JSON.parse(output.slice(0, newline));
        finish(reply.status === 'shutting_down' ? 'stopped' : 'unsupported');
      } catch {
        finish('unavailable');
      }
    });
  });
}

async function stopBrowserSupervisor() {
  for(const endpoint of supervisorEndpoints()) {
    const result=await stopBrowserSupervisorAt(endpoint);
    if(result!=='absent')return result;
  }
  return 'absent';
}

async function reloadCodexMcp() {
  const command = process.env.RESUME_COMPANION_CODEX_BIN || 'codex';
  const proxy = spawn(command, ['app-server', 'proxy'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: proxy.stdout });
  let stderr = '';
  let finished = false;

  proxy.stderr.setEncoding('utf8');
  proxy.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4_000); });
  const send = message => proxy.stdin.write(`${JSON.stringify(message)}\n`);

  return await new Promise((resolveReload, rejectReload) => {
    const timeout = setTimeout(() => finish(new Error('Timed out while asking Codex to reload MCP servers')), 10_000);
    const finish = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      lines.close();
      proxy.stdin.end();
      if (!proxy.killed) proxy.kill('SIGTERM');
      if (!error) return resolveReload(true);
      const detail = stderr.trim().split('\n').slice(-4).join(' ');
      if (/failed to connect to socket|No such file or directory/i.test(`${error.message} ${detail}`)) return resolveReload(false);
      rejectReload(new Error(`${error.message}${detail ? ` (${detail})` : ''}`));
    };

    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id === 1) {
        if (message.error) return finish(new Error(message.error.message || 'Codex initialization failed'));
        send({ jsonrpc: '2.0', method: 'initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'config/mcpServer/reload', params: {} });
      } else if (message.id === 2) {
        finish(message.error ? new Error(message.error.message || 'MCP reload failed') : undefined);
      }
    });
    proxy.once('error', finish);
    proxy.once('exit', code => {
      if (!finished) finish(new Error(`Codex app-server proxy exited with code ${code ?? 'unknown'}`));
    });
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'resume_companion_updater', title: 'ApplyMCP updater', version: pluginVersion }, capabilities: {} },
    });
  });
}

try {
  const restartAllowed=process.argv.includes('--restart-browser');
  const supervisor = restartAllowed ? await stopBrowserSupervisor() : 'preserved';
  const reloaded = await reloadCodexMcp();
  if(supervisor==='preserved')console.log('Preserved the dedicated browser and unsaved pages. A version change remains pending until you authorize --restart-browser.');
  if (supervisor === 'stopped') console.log('Stopped the previous Resume Browser supervisor and revoked its browser sessions.');
  else if (supervisor === 'unsupported') console.log('The previous Resume Browser supervisor predates graceful shutdown; start a new task after this one-time migration.');
  if (reloaded) console.log('Codex MCP configuration reloaded; loaded tasks were queued for refresh.');
  else console.log('Codex desktop control socket is unavailable; start a new task to load the installed plugin. Restarting Codex is not required.');
} catch (error) {
  console.error(`codex_mcp_reload_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
