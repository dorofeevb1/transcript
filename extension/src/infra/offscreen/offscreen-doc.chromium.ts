const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen/offscreen.html');

export async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Захват звука вкладки YouTube для локального распознавания речи',
  });
}

export async function closeOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

export async function releaseOffscreenCapture(): Promise<void> {
  const offscreens = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (offscreens.length > 0) {
    try {
      await chrome.runtime.sendMessage({ type: 'OFFSCREEN_RELEASE_CAPTURE' });
    } catch {
      /* offscreen закрывается */
    }
  }
}
