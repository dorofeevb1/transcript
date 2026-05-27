/** Освобождает захват вкладки в offscreen (иначе «active stream»). */
export async function releaseTabCapture(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'RELEASE_TAB_CAPTURE' });
  } catch {
    /* offscreen может быть закрыт */
  }
  await new Promise((r) => setTimeout(r, 100));
}

function getMediaStreamIdWithTimeout(
  targetTabId: number,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          'Таймаут захвата звука (12 с). Закройте popup, нажмите Play на видео и повторите «Из аудио».',
        ),
      );
    }, timeoutMs);

    chrome.tabCapture.getMediaStreamId({ targetTabId }, (id) => {
      clearTimeout(timer);
      const msg = chrome.runtime.lastError?.message;
      if (msg || !id) {
        const hint = msg?.includes('active stream')
          ? ' Подождите 2 с без popup и повторите (видео на паузе, без PiP).'
          : msg?.includes('Cannot capture')
            ? ' Включите Play на вкладке Rutube/YouTube и повторите.'
            : '';
        reject(new Error((msg ?? 'Не удалось захватить звук вкладки') + hint));
        return;
      }
      resolve(id);
    });
  });
}

/**
 * Захват streamId сразу после клика (без создания offscreen в popup).
 * Offscreen создаётся в service worker перед записью.
 */
export async function acquireTabCaptureStreamId(targetTabId: number): Promise<string> {
  void releaseTabCapture();
  return getMediaStreamIdWithTimeout(targetTabId, 12_000);
}
