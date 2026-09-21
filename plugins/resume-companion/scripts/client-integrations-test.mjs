#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const suppliedRoot = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const pluginRoot = resolve(suppliedRoot ?? resolve(scriptDirectory, '..'));
const releaseRoot = resolve(pluginRoot, '../..');
const packaged = process.argv.includes('--packaged');
const packageJson = await json(resolve(pluginRoot, 'package.json'));
const version = packageJson.version;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function exists(path) {
  await access(path);
  return path;
}

function assertTwoServers(config, label) {
  const servers = config.mcpServers;
  assert(servers && Object.keys(servers).length === 2, `${label} must declare exactly two MCP servers`);
  assert(servers.resume_companion, `${label} is missing resume_companion`);
  assert(servers.resume_browser, `${label} is missing resume_browser`);
}

for (const entry of ['server.bundle.mjs', 'chrome-launcher.bundle.mjs', 'browser-supervisor.bundle.mjs', 'skills/resume-autofill/SKILL.md']) {
  await exists(resolve(pluginRoot, entry));
}

const codex = await json(resolve(pluginRoot, '.codex-plugin/plugin.json'));
assert(codex.name === 'applymcp', 'Codex plugin id mismatch');
assert(codex.mcpServers === './.mcp.json', 'Codex manifest must keep its policy-aware MCP config');
assertTwoServers(await json(resolve(pluginRoot, '.mcp.json')), 'Codex config');

const codexMarketplace = await json(resolve(releaseRoot, '.agents/plugins/marketplace.json'));
assert(codexMarketplace.name === 'applymcp', 'Codex marketplace id mismatch');
assert(codexMarketplace.interface?.displayName === 'ApplyMCP', 'Codex marketplace display name mismatch');
assert(codexMarketplace.plugins?.length === 1 && codexMarketplace.plugins[0].name === 'applymcp', 'Codex marketplace plugin id mismatch');

const claude = await json(resolve(pluginRoot, '.claude-plugin/plugin.json'));
assert(claude.name === 'applymcp' && claude.version === version, 'Claude Code manifest metadata mismatch');
assert(claude.mcpServers === './client-configs/claude-code.mcp.json', 'Claude Code config path mismatch');
const claudeMcp = await json(resolve(pluginRoot, 'client-configs/claude-code.mcp.json'));
assertTwoServers(claudeMcp, 'Claude Code config');
assert(claudeMcp.mcpServers.resume_browser.args[0].includes('${CLAUDE_PLUGIN_ROOT}'), 'Claude Code must use CLAUDE_PLUGIN_ROOT');

const cursor = await json(resolve(pluginRoot, '.cursor-plugin/plugin.json'));
assert(cursor.name === 'applymcp' && cursor.version === version, 'Cursor manifest metadata mismatch');
assert(cursor.mcpServers === './client-configs/cursor.mcp.json', 'Cursor config path mismatch');
const cursorMcp = await json(resolve(pluginRoot, 'client-configs/cursor.mcp.json'));
assertTwoServers(cursorMcp, 'Cursor config');
assert(cursorMcp.mcpServers.resume_browser.args[0].includes('${CURSOR_PLUGIN_ROOT}'), 'Cursor must use CURSOR_PLUGIN_ROOT');

const portable = await json(resolve(pluginRoot, 'plugin.json'));
assert(portable.name === 'applymcp' && portable.version === version, 'Agent Plugin metadata mismatch');
assertTwoServers(await json(resolve(pluginRoot, 'mcp.json')), 'Agent Plugin config');

const kimi = await json(resolve(releaseRoot, 'kimi.plugin.json'));
assert(kimi.name === 'applymcp' && kimi.version === version, 'Kimi Code manifest metadata mismatch');
assertTwoServers(kimi, 'Kimi Code plugin');

for (const marketplacePath of ['.claude-plugin/marketplace.json', '.cursor-plugin/marketplace.json']) {
  const marketplace = await json(resolve(releaseRoot, marketplacePath));
  assert(marketplace.name === 'applymcp', `${marketplacePath} name mismatch`);
  assert(marketplace.plugins?.length === 1 && marketplace.plugins[0].version === version, `${marketplacePath} version mismatch`);
}

const workbuddy = [
  ['applymcp-profile', 'resume_companion'],
  ['applymcp-browser', 'resume_browser'],
];
for (const [directory, serverName] of workbuddy) {
  const connectorRoot = resolve(releaseRoot, 'clients/workbuddy', directory);
  const metadata = await json(resolve(connectorRoot, 'connector-meta.json'));
  const mcp = await json(resolve(connectorRoot, 'mcp.json'));
  assert(metadata.version === version, `${directory} version mismatch`);
  assert(Object.keys(mcp.mcpServers).length === 1 && mcp.mcpServers[serverName], `${directory} must contain only ${serverName}`);
  await exists(resolve(connectorRoot, 'icon.svg'));
  if (packaged) {
    if (serverName === 'resume_companion') {
      await exists(resolve(connectorRoot, 'server.bundle.mjs'));
      await exists(resolve(connectorRoot, 'skills/resume-autofill/SKILL.md'));
    } else {
      await exists(resolve(connectorRoot, 'chrome-launcher.bundle.mjs'));
      await exists(resolve(connectorRoot, 'browser-supervisor.bundle.mjs'));
      await exists(resolve(connectorRoot, 'runtime/chrome-devtools-mcp/package.json'));
    }
  }
}

const printer = resolve(pluginRoot, 'scripts/print-agent-config.mjs');
for (const client of ['claude-code', 'cursor', 'gemini-cli', 'generic', 'kimi-code', 'trae']) {
  const output = execFileSync(process.execPath, [printer, client, '--plugin-root', pluginRoot], { encoding: 'utf8' });
  const config = JSON.parse(output);
  assertTwoServers(config, `${client} generated config`);
  assert(config.mcpServers.resume_companion.args[0] === resolve(pluginRoot, 'server.bundle.mjs'), `${client} profile entry mismatch`);
}

const openCode = JSON.parse(execFileSync(process.execPath, [printer, 'opencode', '--plugin-root', pluginRoot], { encoding: 'utf8' }));
assert(openCode.mcp.resume_companion.command[1] === resolve(pluginRoot, 'server.bundle.mjs'), 'OpenCode profile entry mismatch');
assert(openCode.mcp.resume_browser.command[1] === resolve(pluginRoot, 'chrome-launcher.bundle.mjs'), 'OpenCode browser entry mismatch');

for (const client of ['hermes-agent', 'trae-cli']) {
  const output = execFileSync(process.execPath, [printer, client, '--plugin-root', pluginRoot], { encoding: 'utf8' });
  assert(output.includes('resume_companion') && output.includes('resume_browser'), `${client} output is incomplete`);
  assert(output.includes(resolve(pluginRoot, 'server.bundle.mjs')), `${client} output uses the wrong root`);
}

const workbuddyOutput = JSON.parse(execFileSync(process.execPath, [printer, 'workbuddy', '--plugin-root', pluginRoot], { encoding: 'utf8' }));
assert(workbuddyOutput.install_both_connectors.length === 2, 'WorkBuddy generator must return both connectors');
assert(workbuddyOutput.packaged_release_ready === packaged, 'WorkBuddy readiness must distinguish source templates from a packaged release');

console.log(`Agent client compatibility passed for ApplyMCP ${version}${packaged ? ' package' : ''}.`);
