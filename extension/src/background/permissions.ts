// Keep the current connection usable when Chrome grants several ports as one host permission.
export async function releasePreviousServer(previous: string | null, current: string) {
  if (!previous) return;
  const before = new URL(previous), after = new URL(current);
  if (before.protocol === after.protocol && before.hostname === after.hostname) return;
  // Remove the actual granted patterns, which may cover more ports than the entered URL.
  // The new account has already been saved. A browser refusal must not undo that switch.
  try {
    const granted = (await chrome.permissions.getAll()).origins ?? [];
    const obsolete = granted.filter(pattern => {
      try {
        const url = new URL(pattern.replace(/:\*\//, '/'));
        return url.protocol === before.protocol && url.hostname === before.hostname;
      } catch {return false;}
    });
    if (obsolete.length) await chrome.permissions.remove({origins: obsolete});
  } catch { /* The browser may have already revoked the optional permission. */ }
}
