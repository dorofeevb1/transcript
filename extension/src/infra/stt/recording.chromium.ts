import { releaseTabCapture } from './tab-capture.chromium';
import { mergeBlobsIntoChunks } from './recording-merge';

const RECORDER_PORT = 'yt-transcript-recorder';

export { releaseTabCapture, mergeBlobsIntoChunks };

export async function waitForOffscreenReady(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' });
      if (resp?.ok) return;
    } catch {
      /* offscreen ещё грузится */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Модуль записи не отвечает. Обновите расширение (chrome://extensions → ↻).');
}

export interface RecordProgress {
  recordedSec: number;
}

/** Остановить текущую запись в offscreen (отмена). */
export function stopTabRecording(): void {
  try {
    const port = chrome.runtime.connect({ name: RECORDER_PORT });
    port.postMessage({ type: 'STOP_RECORD' });
    setTimeout(() => {
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
    }, 500);
  } catch {
    /* ignore */
  }
}

export function recordTabAudio(params: {
  streamId: string;
  totalSec: number;
  onProgress: (p: RecordProgress) => void;
  signal?: AbortSignal;
}): Promise<Blob[]> {
  const { streamId, totalSec, onProgress, signal } = params;

  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: RECORDER_PORT });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
      fn();
    };

    const hardTimeout = setTimeout(
      () => {
        finish(() =>
          reject(
            new Error(
              `Запись превысила лимит (${Math.ceil(totalSec / 60)} мин). Проверьте воспроизведение.`,
            ),
          ),
        );
      },
      (totalSec + 90) * 1000,
    );

    const onAbort = () => {
      port.postMessage({ type: 'STOP_RECORD' });
      finish(() => reject(new Error('Отменено')));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    port.onMessage.addListener(
      (msg: { type: string; blobs?: Blob[]; error?: string; recordedSec?: number }) => {
        if (msg.type === 'RECORD_PROGRESS' && msg.recordedSec != null) {
          onProgress({ recordedSec: msg.recordedSec });
        }
        if (msg.type === 'RECORD_DONE') {
          signal?.removeEventListener('abort', onAbort);
          finish(() => resolve(msg.blobs ?? []));
        }
        if (msg.type === 'RECORD_ERROR') {
          signal?.removeEventListener('abort', onAbort);
          finish(() => reject(new Error(msg.error ?? 'Ошибка записи')));
        }
      },
    );

    port.onDisconnect.addListener(() => {
      if (!settled && chrome.runtime.lastError) {
        finish(() => reject(new Error(chrome.runtime.lastError?.message ?? 'Запись прервана')));
      }
    });

    port.postMessage({
      type: 'START_RECORD',
      streamId,
      totalSec,
    });
  });
}
