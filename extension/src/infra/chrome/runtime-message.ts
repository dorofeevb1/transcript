const NO_RECEIVER =
  /Receiving end does not exist|Could not establish connection|The message port closed before a response was received/i;

async function wakeServiceWorker(): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SW_PING' }, (response) => {
        const err = chrome.runtime.lastError;
        const errMsg = err?.message ?? '';
        if (err && NO_RECEIVER.test(errMsg)) {
          reject(new Error(errMsg));
          return;
        }
        if (err) {
          reject(new Error(errMsg || 'Ошибка расширения'));
          return;
        }
        if (response?.ok) resolve();
        else reject(new Error('Расширение не отвечает'));
      });
    });
  } catch {
    /* повторная попытка sendMessage ниже */
  }
}

function sendOnce<T>(message: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Нет ответа от расширения (${Math.round(timeoutMs / 1000)} с). Отмените или обновите страницу видео.`,
        ),
      );
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as T);
    });
  });
}

/** Как sendRuntimeMessage, но без исключения (для опроса прогресса). */
export async function tryRuntimeMessage<T>(
  message: unknown,
  timeoutMs: number,
): Promise<T | null> {
  try {
    return await sendRuntimeMessage<T>(message, timeoutMs);
  } catch {
    return null;
  }
}

export function sendRuntimeMessage<T>(message: unknown, timeoutMs: number): Promise<T> {
  return (async () => {
    await wakeServiceWorker().catch(() => {});
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await wakeServiceWorker();
        await new Promise((r) => setTimeout(r, 120 * attempt));
      }
      try {
        return await sendOnce<T>(message, timeoutMs);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (!NO_RECEIVER.test(lastErr.message)) throw lastErr;
      }
    }
    throw (
      lastErr ??
      new Error(
        'Нет связи с расширением. Откройте chrome://extensions → «Стенограмма видео» → Обновить (↻).',
      )
    );
  })();
}
