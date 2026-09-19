#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const command = process.env.RESUME_COMPANION_CODEX_BIN || 'codex';
const proxy = spawn(command, ['app-server', 'proxy'], { stdio: ['pipe', 'pipe', 'pipe'] });
const lines = createInterface({ input: proxy.stdout });
let stderr = '';
let finished = false;

proxy.stderr.setEncoding('utf8');
proxy.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2_000); });

function send(message) {
  proxy.stdin.write(`${JSON.stringify(message)}\n`);
}

const timeout = setTimeout(() => finish(new Error('Timed out while asking Codex to reload MCP servers')), 10_000);

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  lines.close();
  proxy.stdin.end();
  if (!proxy.killed) proxy.kill('SIGTERM');
  if (error) {
    const detail = stderr.trim().split('\n').slice(-3).join(' ');
    console.error(`codex_mcp_reload_failed: ${error.message}${detail ? ` (${detail})` : ''}`);
    process.exitCode = 1;
  } else {
    console.log('Codex MCP configuration reloaded; loaded tasks were queued for refresh.');
  }
}

lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id === 1) {
    if (message.error) return finish(new Error(message.error.message || 'Codex initialization failed'));
    send({ jsonrpc: '2.0', method: 'initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'config/mcpServer/reload', params: {} });
    return;
  }
  if (message.id === 2) {
    if (message.error) return finish(new Error(message.error.message || 'MCP reload failed'));
    finish();
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
  params: {
    clientInfo: { name: 'resume_companion_updater', title: 'Resume Companion updater', version: '0.16.0' },
    capabilities: {},
  },
});
