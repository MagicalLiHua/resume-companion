#!/usr/bin/env node
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// src/chrome-launcher.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname as dirname2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/chrome-profile.ts
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readlink, unlink } from "node:fs/promises";
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
function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}
async function chromeProfileIsBusy(profileDir2) {
  const singletonLock = join(profileDir2, "SingletonLock");
  try {
    const metadata = await lstat(singletonLock);
    if (!metadata.isSymbolicLink()) return true;
    const target = await readlink(singletonLock);
    const pid = /-(\d+)$/.exec(target)?.[1];
    return pid ? processExists(Number(pid)) : true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code === "ENOENT") return false;
    return true;
  }
}
var ChromeProfileLock = class {
  lockPath;
  profileDir;
  token = randomUUID();
  held = false;
  constructor(profileDir2) {
    this.profileDir = profileDir2;
    this.lockPath = join(dirname(profileDir2), "chrome-mcp.lock");
  }
  async acquire() {
    await mkdir(this.profileDir, { recursive: true, mode: 448 });
    await mkdir(dirname(this.lockPath), { recursive: true, mode: 448 });
    const record = {
      format: "resume-companion-chrome-lock",
      pid: process.pid,
      token: this.token,
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      profile_hash: profileHash(this.profileDir)
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lockPath, "wx", 384);
        await handle.writeFile(`${JSON.stringify(record)}
`, "utf8");
        await handle.sync();
        await handle.close();
        this.held = true;
        return;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
        if (code !== "EEXIST") throw error;
        const existing = await this.readExisting();
        if (!existing || processExists(existing.pid)) {
          throw new Error("profile_in_use: Resume Companion \u4E13\u7528 Chrome \u6B63\u7531\u53E6\u4E00\u4E2A\u4EFB\u52A1\u4F7F\u7528\uFF1B\u8BF7\u5173\u95ED\u90A3\u4E2A\u4EFB\u52A1\u540E\u91CD\u8BD5");
        }
        if (await chromeProfileIsBusy(this.profileDir)) {
          throw new Error("profile_in_use: \u4E0A\u4E00\u4E2A MCP \u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF0C\u4F46\u4E13\u7528 Chrome \u4ECD\u5728\u4F7F\u7528 Profile\uFF1B\u8BF7\u5148\u5173\u95ED\u8BE5 Chrome \u7A97\u53E3");
        }
        await unlink(this.lockPath).catch(() => void 0);
      }
    }
    throw new Error("profile_in_use: \u65E0\u6CD5\u5B89\u5168\u53D6\u5F97 Resume Companion \u4E13\u7528 Chrome \u7684\u5B9E\u4F8B\u9501");
  }
  async release() {
    if (!this.held) return;
    const existing = await this.readExisting();
    if (existing?.token === this.token) await unlink(this.lockPath).catch(() => void 0);
    this.held = false;
  }
  async readExisting() {
    try {
      const raw = JSON.parse(await readFile(this.lockPath, "utf8"));
      if (raw.format !== "resume-companion-chrome-lock" || typeof raw.pid !== "number" || typeof raw.token !== "string") return null;
      return raw;
    } catch {
      return null;
    }
  }
};

// src/chrome-launcher.ts
var moduleDirectory = dirname2(fileURLToPath(import.meta.url));
var runtimePath = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
  resolve2(moduleDirectory, "runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"),
  resolve2(moduleDirectory, "../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"),
  resolve2(moduleDirectory, "../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js")
].find(existsSync) ?? resolve2(moduleDirectory, "runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js");
var profileDir = resolveChromeProfileDir();
var lock = new ChromeProfileLock(profileDir);
if (!existsSync(runtimePath)) {
  console.error("runtime_missing: \u56FA\u5B9A\u7248\u672C\u7684 Chrome DevTools MCP \u8FD0\u884C\u5305\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5\u5B8C\u6574\u63D2\u4EF6");
  process.exit(1);
}
try {
  await lock.acquire();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
var upstreamArgs = [
  runtimePath,
  "--channel=stable",
  `--user-data-dir=${profileDir}`,
  "--no-usage-statistics",
  "--no-performance-crux",
  "--redact-network-headers",
  "--no-category-performance",
  "--no-category-emulation",
  "--screenshot-format=webp",
  "--screenshot-quality=80",
  "--screenshot-max-width=1440",
  "--screenshot-max-height=1200"
];
if (process.env.RESUME_COMPANION_CHROME_HEADLESS === "1") upstreamArgs.push("--headless");
var child = spawn(process.execPath, upstreamArgs, {
  cwd: dirname2(runtimePath),
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...stringEnvironment(),
    CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1"
  }
});
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => process.stderr.write(redactDiagnostic(chunk)));
var closing = false;
function requestClose(signal) {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) child.kill(signal);
}
child.once("error", (error) => {
  console.error(`upstream_start_failed: ${redactDiagnostic(error.message)}`);
  void lock.release().finally(() => process.exit(1));
});
child.once("exit", (code, signal) => {
  void lock.release().finally(() => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => requestClose(signal));
}
function redactDiagnostic(value) {
  return value.replaceAll(profileDir, `<chrome-profile:${profileHash(profileDir)}>`).replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>").replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?<redacted>");
}
function stringEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string"));
}
