#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPluginRoot = resolve(scriptDirectory, '..');
const args = process.argv.slice(2);
const client = args.shift();
const rootFlag = args.indexOf('--plugin-root');
const pluginRoot = resolve(rootFlag === -1 ? defaultPluginRoot : args[rootFlag + 1] ?? '');

const clients = [
  'claude-code',
  'cursor',
  'gemini-cli',
  'generic',
  'hermes-agent',
  'kimi-code',
  'opencode',
  'trae',
  'trae-cli',
  'workbuddy',
];

if (!client || !clients.includes(client) || (rootFlag !== -1 && !args[rootFlag + 1])) {
  console.error(`Usage: node scripts/print-agent-config.mjs <${clients.join('|')}> [--plugin-root PATH]`);
  process.exit(2);
}

const profileEntry = resolve(pluginRoot, 'server.bundle.mjs');
const browserEntry = resolve(pluginRoot, 'chrome-launcher.bundle.mjs');

function standardServer(entry) {
  return {
    command: 'node',
    args: [entry],
    cwd: pluginRoot,
  };
}

function standardConfig() {
  const config = {
    mcpServers: {
      resume_companion: standardServer(profileEntry),
      resume_browser: standardServer(browserEntry),
    },
  };
  if (client === 'claude-code' || client === 'cursor' || client === 'trae') {
    config.mcpServers.resume_companion.type = 'stdio';
    config.mcpServers.resume_browser.type = 'stdio';
  }
  if (client === 'kimi-code') {
    Object.assign(config.mcpServers.resume_companion, { startupTimeoutMs: 30_000, toolTimeoutMs: 60_000 });
    Object.assign(config.mcpServers.resume_browser, {
      startupTimeoutMs: 30_000,
      toolTimeoutMs: 120_000,
      disabledTools: ['upload_file', 'lighthouse_audit'],
    });
  }
  return config;
}

function tomlString(value) {
  return JSON.stringify(value);
}

if (client === 'opencode') {
  console.log(JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      resume_companion: {
        type: 'local',
        command: ['node', profileEntry],
        cwd: pluginRoot,
        enabled: true,
        timeout: 30_000,
      },
      resume_browser: {
        type: 'local',
        command: ['node', browserEntry],
        cwd: pluginRoot,
        enabled: true,
        timeout: 30_000,
      },
    },
  }, null, 2));
} else if (client === 'trae-cli') {
  console.log([
    '[mcp_servers.resume_companion]',
    'command = "node"',
    `args = [${tomlString(profileEntry)}]`,
    '',
    '[mcp_servers.resume_browser]',
    'command = "node"',
    `args = [${tomlString(browserEntry)}]`,
  ].join('\n'));
} else if (client === 'hermes-agent') {
  console.log([
    'mcp_servers:',
    '  resume_companion:',
    '    command: node',
    `    args: [${JSON.stringify(profileEntry)}]`,
    '  resume_browser:',
    '    command: node',
    `    args: [${JSON.stringify(browserEntry)}]`,
  ].join('\n'));
} else if (client === 'workbuddy') {
  const releaseRoot = resolve(pluginRoot, '../..');
  const connectors = [
    resolve(releaseRoot, 'clients/workbuddy/applymcp-profile'),
    resolve(releaseRoot, 'clients/workbuddy/applymcp-browser'),
  ];
  console.log(JSON.stringify({
    install_both_connectors: connectors,
    packaged_release_ready: existsSync(resolve(connectors[0], 'server.bundle.mjs'))
      && existsSync(resolve(connectors[1], 'browser-supervisor.bundle.mjs')),
    reason: 'WorkBuddy connector packages accept one MCP server each.',
  }, null, 2));
} else {
  console.log(JSON.stringify(standardConfig(), null, 2));
}
