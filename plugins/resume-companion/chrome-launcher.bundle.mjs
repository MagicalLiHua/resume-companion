#!/usr/bin/env node
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// src/chrome-launcher.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";
import { dirname as dirname3, join as join3, resolve as resolve3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/chrome-profile.ts
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
function resolveChromeProfileDir(value = process.env.RESUME_COMPANION_CHROME_DATA_DIR) {
  if (value) {
    const expanded = value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
    return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Resume Companion", "chrome-profile");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Resume Companion", "chrome-profile");
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "resume-companion", "chrome-profile");
}
function profileHash(profileDir2) {
  return createHash("sha256").update(profileDir2).digest("hex").slice(0, 12);
}

// src/version.ts
import { readFileSync } from "node:fs";
import { dirname as dirname2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_VERSION = "0.24.0";
var BROWSER_SUPERVISOR_PROTOCOL = 1;
function resolveRuntimePluginVersion(moduleUrl) {
  const directory = dirname2(fileURLToPath(moduleUrl));
  for (const manifest of [
    resolve2(directory, ".codex-plugin/plugin.json"),
    resolve2(directory, "../.codex-plugin/plugin.json")
  ]) {
    try {
      const value = JSON.parse(readFileSync(manifest, "utf8"));
      if (typeof value.version === "string" && value.version.trim()) return value.version.trim();
    } catch {
    }
  }
  return PLUGIN_VERSION;
}
var RUNTIME_PLUGIN_VERSION = resolveRuntimePluginVersion(import.meta.url);

// src/browser/supervisor-protocol.ts
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
function supervisorSocketPath(profileDir2) {
  const id = profileHash(profileDir2);
  return process.platform === "win32" ? `\\\\.\\pipe\\resume-companion-browser-${id}` : join2(supervisorRuntimeDir(), `${id}.sock`);
}
function supervisorRuntimeDir() {
  return process.platform === "win32" ? join2(process.env.LOCALAPPDATA || join2(homedir2(), "AppData", "Local"), "Resume Companion", "runtime") : `/tmp/resume-companion-${process.getuid()}`;
}

// src/chrome-launcher.ts
var moduleDirectory = dirname3(fileURLToPath2(import.meta.url));
var supervisorEntry = [
  resolve3(moduleDirectory, "browser-supervisor.bundle.mjs"),
  resolve3(moduleDirectory, "../browser-supervisor.bundle.mjs")
].find(existsSync) ?? resolve3(moduleDirectory, "browser-supervisor.bundle.mjs");
var profileDir = resolveChromeProfileDir();
var endpoint = supervisorSocketPath(profileDir);
var sessionId = randomUUID2();
async function open(kind, address = endpoint) {
  return await new Promise((resolveConnection, reject) => {
    const socket = createConnection(address);
    let buffer = "";
    const fail = (error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("browser_supervisor_handshake_timeout")), 2500);
    socket.setEncoding("utf8");
    socket.once("error", fail);
    socket.once("connect", () => {
      const hello = {
        kind,
        client_version: RUNTIME_PLUGIN_VERSION,
        protocol: BROWSER_SUPERVISOR_PROTOCOL,
        session_id: sessionId
      };
      socket.write(`${JSON.stringify(hello)}
`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      clearTimeout(timer);
      socket.off("error", fail);
      socket.removeAllListeners("data");
      try {
        const reply = JSON.parse(buffer.slice(0, newline));
        resolveConnection({ socket, reply });
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}
async function legacyEndpoints() {
  if (process.platform === "win32") return [];
  const directories = [tmpdir(), "/tmp"];
  if (process.platform === "darwin") {
    const directory = await new Promise((resolveDirectory) => execFile("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], { timeout: 1500 }, (error, stdout) => resolveDirectory(error ? "" : stdout.trim())));
    if (directory) directories.push(directory);
  }
  const maximum = process.platform === "darwin" ? 103 : 107;
  return [...new Set(directories.map((directory) => join3(directory, `rc-browser-${profileHash(profileDir)}.sock`)))].filter((path) => Buffer.byteLength(path) <= maximum);
}
function startSupervisor() {
  const child = spawn(process.execPath, [supervisorEntry], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      RESUME_COMPANION_CHROME_DATA_DIR: profileDir,
      RESUME_COMPANION_SUPERVISOR_VERSION: RUNTIME_PLUGIN_VERSION
    }
  });
  child.unref();
}
async function connectWithRetry() {
  let started = false;
  let lastError;
  const addresses = [endpoint, ...await legacyEndpoints()];
  for (let attempt = 0; attempt < 150; attempt++) {
    let connection;
    let address = endpoint;
    for (const candidate of addresses) {
      try {
        connection = await open("connect", candidate);
        address = candidate;
        break;
      } catch (error) {
        lastError = error;
        const code = error.code;
        if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error;
      }
    }
    if (connection) {
      if (connection.reply.status === "ready") return connection.socket;
      connection.socket.destroy();
      if (connection.reply.status === "upgrade_required") {
        if (process.env.RESUME_COMPANION_ALLOW_BROWSER_RESTART !== "1")
          throw new Error(`browser_upgrade_pending: dedicated browser version ${connection.reply.supervisor_version} is preserved. Review unsaved work before explicitly authorizing a restart; an authorized launcher can set RESUME_COMPANION_ALLOW_BROWSER_RESTART=1.`);
        const upgrade = await open("upgrade", address);
        upgrade.socket.destroy();
        if (upgrade.reply.status !== "shutting_down") throw new Error(upgrade.reply.message ?? "supervisor upgrade was rejected");
        started = false;
      } else {
        throw new Error(connection.reply.message ?? `browser supervisor returned ${connection.reply.status}`);
      }
    }
    if (!started) {
      startSupervisor();
      started = true;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`browser_supervisor_unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
try {
  const socket = await connectWithRetry();
  socket.setNoDelay(true);
  process.stdin.pipe(socket);
  socket.pipe(process.stdout, { end: false });
  socket.once("error", (error) => console.error(`Resume Browser supervisor connection failed: ${error.message}`));
  socket.once("close", () => process.exit(0));
  process.once("SIGTERM", () => socket.end());
  process.once("SIGINT", () => socket.end());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
