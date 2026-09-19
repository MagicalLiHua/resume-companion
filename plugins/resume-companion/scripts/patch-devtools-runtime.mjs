import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Preserve Resume Companion's actionable stale-action errors across the fixed
 * upstream input handler. The exact source guard makes an upstream upgrade fail
 * at build time instead of silently applying an incompatible patch.
 */
export async function patchDevtoolsRuntime(runtimeRoot) {
  const inputPath = resolve(runtimeRoot, 'build/src/tools/input.js');
  const source = await readFile(inputPath, 'utf8');
  const original = `function handleActionError(error, uid) {
    logger?.('failed to act using a locator', error);
    throw new Error(\`Failed to interact with the element with uid \${uid}. The element did not become interactive within the configured timeout.\`, {
        cause: error,
    });
}`;
  const replacement = `function handleActionError(error, uid) {
    logger?.('failed to act using a locator', error);
    if (error instanceof Error && error.message.startsWith('stale_action_')) {
        throw error;
    }
    throw new Error(\`Failed to interact with the element with uid \${uid}. The element did not become interactive within the configured timeout.\`, {
        cause: error,
    });
}`;
  const occurrences = source.split(original).length - 1;
  if (occurrences !== 1) {
    throw new Error(`runtime_patch_incompatible: expected one Chrome DevTools MCP handleActionError block, found ${occurrences}`);
  }
  await writeFile(inputPath, source.replace(original, replacement));
}
