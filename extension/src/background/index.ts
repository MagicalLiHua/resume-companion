import { z } from 'zod';
import { startCodexBridge } from './codex-bridge';
import { CodexTools } from './codex-tools';

const SETTINGS_KEY = 'resume_bridge_settings';
const SettingsSchema = z.strictObject({ version: z.literal(1), bridgeEnabled: z.boolean() });
type Settings = z.infer<typeof SettingsSchema>;

const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
let queue = Promise.resolve<unknown>(undefined);
function serialized<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

async function loadSettings(): Promise<Settings> {
  await ready;
  const stored = await chrome.storage.local.get([SETTINGS_KEY, 'resume_state']);
  const parsed = SettingsSchema.safeParse(stored[SETTINGS_KEY]);
  if (parsed.success) return parsed.data;
  const legacy = stored.resume_state as { preferences?: { codexBridgeEnabled?: unknown } } | undefined;
  const settings: Settings = {
    version: 1,
    bridgeEnabled: legacy?.preferences?.codexBridgeEnabled === true,
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

async function saveSettings(enabled: unknown) {
  const settings = SettingsSchema.parse({ version: 1, bridgeEnabled: enabled });
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

const codexTools = new CodexTools();
let bridgeStatus: import('./codex-bridge').BridgeStatus = 'disconnected';
const refreshCodexBridge = startCodexBridge(
  (method, params, context) => codexTools.handle(method, params, context),
  async () => (await loadSettings()).bridgeEnabled,
  status => { bridgeStatus = status; },
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) refreshCodexBridge();
});
chrome.runtime.onInstalled.addListener(() => { void loadSettings(); });
chrome.runtime.onStartup.addListener(() => { void loadSettings(); });
chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
chrome.tabs.onRemoved.addListener(tabId => {
  codexTools.forgetTab(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const trusted = sender.id === chrome.runtime.id
    && typeof sender.url === 'string'
    && sender.url.startsWith(chrome.runtime.getURL(''));
  if (!trusted || !['BRIDGE_SETTINGS_LOAD', 'BRIDGE_SETTINGS_SAVE'].includes(message?.type)) return false;
  serialized(async () => {
    if (message.type === 'BRIDGE_SETTINGS_LOAD') return { ...(await loadSettings()), bridgeStatus };
    return { ...(await saveSettings(message.bridgeEnabled)), bridgeStatus };
  }).then(
    data => respond({ ok: true, data }),
    error => respond({ ok: false, error: error instanceof Error ? error.message : '设置保存失败' }),
  );
  return true;
});
