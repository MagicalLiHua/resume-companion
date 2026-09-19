import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// src/devtools-resilience-preload.ts
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// src/browser/stale-uid-recovery.ts
var installedSymbol = /* @__PURE__ */ Symbol.for("resume-companion.stale-uid-recovery");
var comparableKeys = [
  "description",
  "placeholder",
  "keyshortcuts",
  "roledescription",
  "readonly",
  "required",
  "disabled"
];
function normalized(value) {
  return value === void 0 || value === null ? "" : String(value).replace(/\s+/g, " ").trim();
}
function collectPaths(root) {
  const paths = [];
  const visit = (node, ancestors) => {
    paths.push({ node, ancestors });
    for (const child of node.children ?? []) visit(child, [...ancestors, node]);
  };
  visit(root, []);
  return paths;
}
function pathForUid(root, uid) {
  return collectPaths(root).find((path) => path.node.id === uid);
}
function namedAncestors(path) {
  return path.ancestors.map((node) => ({ role: normalized(node.role), name: normalized(node.name) })).filter((item) => item.name.length > 0).slice(-6).reverse();
}
function contextualScore(expected, candidate) {
  let score = 0;
  for (const key of comparableKeys) {
    const left = normalized(expected.node[key]);
    const right = normalized(candidate.node[key]);
    if (left && left === right) score += 3;
  }
  const expectedAncestors = namedAncestors(expected);
  const candidateAncestors = namedAncestors(candidate);
  for (let index = 0; index < expectedAncestors.length; index++) {
    const expectedAncestor = expectedAncestors[index];
    if (!expectedAncestor) continue;
    const matchingIndex = candidateAncestors.findIndex(
      (candidateAncestor) => candidateAncestor.role === expectedAncestor.role && candidateAncestor.name === expectedAncestor.name
    );
    if (matchingIndex === -1) continue;
    score += Math.max(2, 14 - index * 2 - matchingIndex);
  }
  return score;
}
function resolveSemanticReplacement(expected, currentRoot) {
  const role = normalized(expected.node.role);
  const name = normalized(expected.node.name);
  const candidates = collectPaths(currentRoot).filter(
    (path) => normalized(path.node.role) === role && normalized(path.node.name) === name
  );
  if (candidates.length === 0) return { kind: "missing" };
  if (candidates.length === 1) return { kind: "resolved", path: candidates[0] };
  const ranked = candidates.map((path) => ({ path, score: contextualScore(expected, path) })).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (best && runnerUp && best.score >= 8 && best.score - runnerUp.score >= 4) {
    return { kind: "resolved", path: best.path };
  }
  return { kind: "ambiguous", candidateCount: candidates.length };
}
function isDetachedUidError(error) {
  return error instanceof Error && error.message.includes("no longer exists on the page");
}
async function handleIsConnected(handle) {
  const debuggable = handle;
  if (!debuggable.evaluate) return true;
  try {
    return await debuggable.evaluate((element) => element.isConnected);
  } catch {
    return false;
  }
}
async function recoverHandle(page, uid, expected) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const currentRoot = await page.pptrPage.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: true
    });
    if (!currentRoot) continue;
    const resolution = resolveSemanticReplacement(expected, currentRoot);
    if (resolution.kind === "ambiguous") {
      throw new Error(
        `stale_uid_ambiguous: Element uid ${uid} was replaced and ${resolution.candidateCount} current elements share its semantics. Take a fresh snapshot and narrow the control before retrying.`
      );
    }
    if (resolution.kind === "missing") continue;
    page.textSnapshot?.idToNode.set(uid, resolution.path.node);
    const handle = await resolution.path.node.elementHandle?.();
    if (handle) {
      console.error(`[resume-companion] stale_uid_recovered uid=${uid} attempt=${attempt}`);
      if (process.env.RESUME_COMPANION_DEBUG_STALE_UID === "1") {
        const debugHandle = handle;
        const state = await debugHandle.evaluate?.((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            connected: element.isConnected,
            disabled: element instanceof HTMLInputElement || element instanceof HTMLButtonElement ? element.disabled : false,
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        });
        console.error(`[resume-companion] stale_uid_debug ${JSON.stringify(state)}`);
      }
      return handle;
    }
  }
  throw new Error(
    `stale_uid_unresolved: Element uid ${uid} was replaced and no unique current semantic match could be focused. Take a fresh snapshot and inspect the current control.`
  );
}
function installStaleUidRecovery(McpPage) {
  const prototype = McpPage.prototype;
  if (prototype[installedSymbol]) return;
  const original = prototype.getElementByUid;
  prototype.getElementByUid = async function getElementByUidWithRecovery(uid) {
    const snapshot = this.textSnapshot;
    const expected = snapshot ? pathForUid(snapshot.root, uid) : void 0;
    try {
      const handle = await original.call(this, uid);
      if (!expected || await handleIsConnected(handle)) return handle;
      handle[Symbol.dispose]?.();
      return await recoverHandle(this, uid, expected);
    } catch (error) {
      if (!expected || !isDetachedUidError(error)) throw error;
      return await recoverHandle(this, uid, expected);
    }
  };
  prototype[installedSymbol] = true;
}

// src/devtools-resilience-preload.ts
var runtimeEntry = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME_ENTRY;
if (!runtimeEntry) throw new Error("runtime_preload_missing_entry: Chrome DevTools MCP runtime entry is not configured");
var mcpPagePath = resolve(dirname(runtimeEntry), "../McpPage.js");
if (!existsSync(mcpPagePath)) throw new Error("runtime_preload_incompatible: Chrome DevTools MCP McpPage module is missing");
var runtimeModule = await import(pathToFileURL(mcpPagePath).href);
if (!runtimeModule.McpPage) throw new Error("runtime_preload_incompatible: Chrome DevTools MCP McpPage export is missing");
installStaleUidRecovery(runtimeModule.McpPage);
