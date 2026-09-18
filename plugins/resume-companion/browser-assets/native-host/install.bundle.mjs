#!/usr/bin/env node

// native-host/src/install.ts
import { copyFile, chmod, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// shared/browser-bridge.ts
var BRIDGE_MAX_MESSAGE_BYTES = 512 * 1024;
var NATIVE_HOST_NAME = "com.resume_companion.bridge";
var RESUME_COMPANION_EXTENSION_ID = "feifaflnkjdihpbbhnihidjjkeapamnh";

// native-host/src/install.ts
var sourceDir = dirname(fileURLToPath(import.meta.url));
var extensionId = argument("--extension-id") ?? RESUME_COMPANION_EXTENSION_ID;
if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("--extension-id \u5FC5\u987B\u662F 32 \u4F4D Chrome \u6269\u5C55 ID");
var dataDir = resolveDataDir(argument("--data-dir"));
var installDir = join(dataDir, "native-host");
await mkdir(installDir, { recursive: true, mode: 448 });
var sourceHost = join(sourceDir, "host.bundle.mjs");
var installedHost = join(installDir, "host.bundle.mjs");
await copyFile(sourceHost, installedHost);
await chmod(installedHost, 448);
var launcher = join(installDir, "run-host");
var quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(launcher, `#!/bin/sh
export RESUME_COMPANION_DATA_DIR=${quote(dataDir)}
exec ${quote(process.execPath)} ${quote(installedHost)} "$@"
`, { mode: 448 });
await chmod(launcher, 448);
var manifest = { name: NATIVE_HOST_NAME, description: "Resume Companion local MCP bridge", path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] };
var manifestPath = nativeManifestPath();
await mkdir(dirname(manifestPath), { recursive: true, mode: 448 });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}
`, { mode: 384 });
if (process.platform === "win32") execFileSync("reg", ["add", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, "/ve", "/d", manifestPath, "/f"], { stdio: "ignore" });
console.log(JSON.stringify({ installed: true, manifest: manifestPath, data_dir: dataDir, extension_id: extensionId }, null, 2));
function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : void 0;
}
function resolveDataDir(value) {
  if (value) return resolve(value.replace(/^~(?=\/)/, homedir()));
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Resume Companion");
  if (process.platform === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Resume Companion");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "resume-companion");
}
function nativeManifestPath() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`);
  if (process.platform === "win32") return join(dataDir, `${NATIVE_HOST_NAME}.json`);
  return join(homedir(), ".config", "google-chrome", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`);
}
