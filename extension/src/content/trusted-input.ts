export async function trustedClick(node: HTMLElement): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) { node.click(); return; }
  node.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) throw new Error('blocked: 目标没有可点击区域');
  const response = await chrome.runtime.sendMessage({ type: 'RESUME_COMPANION_TRUSTED_INPUT', action: 'click', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  if (!response?.ok) throw new Error(response?.error ?? '可信点击失败');
}

export async function trustedKey(node: HTMLElement, key: string): Promise<void> {
  node.focus({ preventScroll: true });
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    node.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: 'RESUME_COMPANION_TRUSTED_INPUT', action: 'key', key });
  if (!response?.ok) throw new Error(response?.error ?? '可信按键失败');
}
