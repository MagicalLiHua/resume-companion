// Compatibility boundary for the pinned Puppeteer runtime. A live AX tree does
// not imply that Puppeteer still has the document's execution contexts.
type RuntimePage = Record<string, any>;

export function runtimeState(page: RuntimePage): {frame: number; main: boolean; utility: boolean}[] {
  return page.frames().map((frame: RuntimePage, index: number) => ({
    frame: index,
    main: frame.mainRealm?.().hasContext?.() ?? true,
    utility: frame.isolatedRealm?.().hasContext?.() ?? true,
  }));
}

export async function ensurePageRuntime(page: RuntimePage): Promise<void> {
  const missing = () => runtimeState(page).some(frame => !frame.main || !frame.utility);
  if (!missing()) return;
  // Ordinary navigation can briefly remove contexts. Let its events arrive first.
  await new Promise(resolve => setTimeout(resolve, 100));
  if (!missing()) return;
  const clients = new Set<RuntimePage>();
  for (const frame of page.frames()) {
    if (frame.mainRealm?.().hasContext?.() === false || frame.isolatedRealm?.().hasContext?.() === false) {
      if (frame.client?.send) clients.add(frame.client);
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        // Use the SAME session that owns Puppeteer's frame manager. Enabling a
        // separate CDP session cannot repopulate its lost context references.
        for (const client of clients) {
          await client.send('Runtime.disable');
          await client.send('Runtime.enable');
        }
        for (let attempt = 0; attempt < 20 && missing(); attempt++) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (missing()) throw new Error('execution contexts remain unavailable');
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('runtime resynchronization timed out')), 1500);
      }),
    ]);
  } catch {
    throw new Error('page_context_unavailable: Browser execution contexts could not be synchronized. No input was dispatched. Preserve this tab and inspect browser runtime status before retrying; do not reload an unsaved form automatically.');
  } finally {
    clearTimeout(timer);
  }
}
