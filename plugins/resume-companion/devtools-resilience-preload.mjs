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
function isDetachedHandleError(error) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("detached") || message.includes("no longer exists") || message.includes("could not find object with given id") || message.includes("js handle is disposed");
}
async function handleConnectionState(handle) {
  const debuggable = handle;
  if (!debuggable.evaluate) return "connected";
  try {
    return await debuggable.evaluate((element) => element.isConnected) ? "connected" : "detached";
  } catch (error) {
    return isDetachedHandleError(error) ? "detached" : "unknown";
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
function locatorFrom(handle, transforms) {
  if (!handle.asLocator) throw new Error("stale_action_incompatible: Element handle does not expose a locator");
  let locator = handle.asLocator();
  for (const transform of transforms) {
    const method = locator[transform.method];
    if (typeof method !== "function") {
      throw new Error(`stale_action_incompatible: Locator method ${transform.method} is unavailable`);
    }
    locator = Reflect.apply(method, locator, transform.args);
  }
  return locator;
}
async function intendedValueIsPresent(handle, expected) {
  if (!handle.evaluate) return false;
  try {
    return await handle.evaluate((element, rawExpected) => {
      const expectedText = String(rawExpected);
      const expectedBoolean = rawExpected === true || rawExpected === "true";
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        return element.checked === expectedBoolean;
      }
      const role = element.getAttribute("role");
      if (role === "checkbox" || role === "radio" || role === "switch") {
        return element.getAttribute("aria-checked") === String(expectedBoolean);
      }
      if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value === expectedText;
      }
      if (element instanceof HTMLElement && element.isContentEditable) return element.innerText === expectedText;
      return false;
    }, expected);
  } catch {
    return false;
  }
}
function observeLocatorAction(locator) {
  let started = false;
  const listener = () => {
    started = true;
  };
  locator.on?.("action", listener);
  return {
    didStart: () => started,
    stop: () => {
      locator.off?.("action", listener);
    }
  };
}
async function replaceCurrentHandle(state) {
  const recovered = await recoverHandle(state.page, state.uid, state.expected);
  state.current = recovered;
  state.handles.add(recovered);
  return recovered;
}
async function runLocatorAction(state, transforms, action, args) {
  const attemptedHandle = state.current;
  const initialLocator = locatorFrom(attemptedHandle, transforms);
  const initialMethod = initialLocator[action];
  if (typeof initialMethod !== "function") throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
  const observation = observeLocatorAction(initialLocator);
  try {
    return await Reflect.apply(initialMethod, initialLocator, args);
  } catch (originalError) {
    if (await handleConnectionState(attemptedHandle) !== "detached") throw originalError;
    if (state.actionRecoveryUsed) {
      throw new Error(
        `stale_action_retry_exhausted: Element uid ${state.uid} was replaced again during ${action}. Take a fresh snapshot before retrying.`,
        { cause: originalError }
      );
    }
    state.actionRecoveryUsed = true;
    const actionStarted = observation.didStart();
    const recovered = await replaceCurrentHandle(state);
    if (action === "fill" && await intendedValueIsPresent(recovered, args[0])) {
      console.error(`[resume-companion] stale_action_already_applied uid=${state.uid} action=fill`);
      return void 0;
    }
    if (action === "click" && actionStarted) {
      throw new Error(
        `stale_action_result_unknown: Element uid ${state.uid} was replaced after the click began. Take a fresh snapshot and verify the page before retrying.`,
        { cause: originalError }
      );
    }
    console.error(`[resume-companion] stale_action_retry uid=${state.uid} action=${action}`);
    let retryLocator = locatorFrom(recovered, transforms);
    if (typeof retryLocator.setWaitForStableBoundingBox === "function") {
      retryLocator = Reflect.apply(retryLocator.setWaitForStableBoundingBox, retryLocator, [false]);
    }
    const retryMethod = retryLocator[action];
    if (typeof retryMethod !== "function") throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
    const retryObservation = observeLocatorAction(retryLocator);
    try {
      return await Reflect.apply(retryMethod, retryLocator, args);
    } catch (retryError) {
      const uncertain = action === "click" && retryObservation.didStart();
      throw new Error(
        uncertain ? `stale_action_result_unknown: Element uid ${state.uid} was replaced during the recovery click. Take a fresh snapshot and verify the page before retrying.` : `stale_action_retry_exhausted: Element uid ${state.uid} could not complete ${action} after one semantic recovery. Take a fresh snapshot before retrying.`,
        { cause: retryError }
      );
    } finally {
      retryObservation.stop();
    }
  } finally {
    observation.stop();
  }
}
function resilientLocator(state, transforms = []) {
  const chainMethods = /* @__PURE__ */ new Set([
    "setTimeout",
    "setVisibility",
    "setWaitForEnabled",
    "setEnsureElementIsInTheViewport",
    "setWaitForStableBoundingBox"
  ]);
  return new Proxy({}, {
    get(_target, property) {
      if (typeof property !== "string") return void 0;
      if (chainMethods.has(property)) {
        return (...args) => resilientLocator(state, [...transforms, { method: property, args }]);
      }
      if (property === "click" || property === "fill" || property === "hover") {
        return (...args) => runLocatorAction(state, transforms, property, args);
      }
      const locator = locatorFrom(state.current, transforms);
      const value = locator[property];
      return typeof value === "function" ? value.bind(locator) : value;
    }
  });
}
function resilientHandle(page, uid, expected, initial) {
  const initialHandle = initial;
  const state = {
    page,
    uid,
    expected,
    current: initialHandle,
    handles: /* @__PURE__ */ new Set([initialHandle]),
    readRecoveryUsed: false,
    actionRecoveryUsed: false
  };
  return new Proxy(initialHandle, {
    get(_target, property) {
      if (property === Symbol.dispose) {
        return () => {
          for (const handle of state.handles) handle[Symbol.dispose]?.();
        };
      }
      if (property === "asLocator") return () => resilientLocator(state);
      const current = state.current;
      const value = Reflect.get(current, property, current);
      if (property === "evaluate" && typeof value === "function") {
        return async (...args) => {
          const attemptedHandle = state.current;
          try {
            return await Reflect.apply(value, attemptedHandle, args);
          } catch (error) {
            if (state.readRecoveryUsed || await handleConnectionState(attemptedHandle) !== "detached") throw error;
            state.readRecoveryUsed = true;
            const recovered = await replaceCurrentHandle(state);
            const recoveredEvaluate = recovered.evaluate;
            if (!recoveredEvaluate) throw error;
            return await Reflect.apply(recoveredEvaluate, recovered, args);
          }
        };
      }
      return typeof value === "function" ? value.bind(state.current) : value;
    }
  });
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
      if (!expected) return handle;
      const state = await handleConnectionState(handle);
      if (state !== "detached") return resilientHandle(this, uid, expected, handle);
      handle[Symbol.dispose]?.();
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
    } catch (error) {
      if (!expected || !isDetachedUidError(error)) throw error;
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
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
