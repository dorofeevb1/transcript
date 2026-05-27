const RECORDER_PORT = 'yt-transcript-recorder';

const blobs: Blob[] = [];
let mediaRecorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let recordStartMs = 0;
let totalSecTarget = 0;
let activePort: chrome.runtime.Port | null = null;

function releaseCapture(): void {
  if (progressTimer) clearInterval(progressTimer);
  if (stopTimer) clearTimeout(stopTimer);
  if (watchdogTimer) clearTimeout(watchdogTimer);
  progressTimer = null;
  stopTimer = null;
  watchdogTimer = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  mediaRecorder = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  activePort = null;
  blobs.length = 0;
}

function cleanup(): void {
  releaseCapture();
}

function post(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
  try {
    port.postMessage(msg);
  } catch {
    /* port closed */
  }
}

function postProgress(port: chrome.runtime.Port): void {
  const elapsed = Math.min((Date.now() - recordStartMs) / 1000, totalSecTarget);
  post(port, { type: 'RECORD_PROGRESS', recordedSec: elapsed });
}

async function startRecord(
  port: chrome.runtime.Port,
  streamId: string,
  totalSec: number,
): Promise<void> {
  cleanup();
  blobs.length = 0;
  activePort = port;
  totalSecTarget = totalSec;
  recordStartMs = Date.now();

  const mediaPromise = navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
    video: false,
  });
  const mediaTimeout = new Promise<MediaStream>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            'Нет доступа к звуку вкладки (таймаут). Закройте popup, подождите 2 с, снова «Из аудио».',
          ),
        ),
      20_000,
    );
  });
  stream = await Promise.race([mediaPromise, mediaTimeout]);

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType: mime });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) blobs.push(e.data);
  };

  mediaRecorder.onstop = () => {
    cleanup();
    post(port, { type: 'RECORD_DONE', blobs: [...blobs] });
  };

  mediaRecorder.onerror = () => {
    cleanup();
    post(port, { type: 'RECORD_ERROR', error: 'Ошибка MediaRecorder' });
  };

  // Таймслайс 1 с — прогресс в UI, чанки для Whisper соберём в background
  mediaRecorder.start(1000);

  progressTimer = setInterval(() => postProgress(port), 1000);
  postProgress(port);

  watchdogTimer = setTimeout(() => {
    const totalBytes = blobs.reduce((s, b) => s + b.size, 0);
    if (totalBytes < 100) {
      const rec = mediaRecorder;
      cleanup();
      if (rec && rec.state !== 'inactive') rec.stop();
      post(port, {
        type: 'RECORD_ERROR',
        error:
          'Нет звука с вкладки. Включите воспроизведение видео (не на паузе, звук не выключен).',
      });
    }
  }, 15000);

  stopTimer = setTimeout(() => {
    const rec = mediaRecorder;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }, totalSec * 1000 + 1000);
}

function stopRecordEarly(port: chrome.runtime.Port): void {
  const rec = mediaRecorder;
  if (rec && rec.state !== 'inactive') {
    rec.stop();
  } else {
    cleanup();
    post(port, { type: 'RECORD_DONE', blobs: [...blobs] });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== RECORDER_PORT) return;

  port.onMessage.addListener((message: { type: string; streamId?: string; totalSec?: number }) => {
    if (message.type === 'STOP_RECORD') {
      stopRecordEarly(port);
      return;
    }
    if (message.type === 'START_RECORD' && message.streamId) {
      startRecord(port, message.streamId, message.totalSec ?? 120).catch((e) => {
        cleanup();
        post(port, {
          type: 'RECORD_ERROR',
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_PING') {
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'RELEASE_TAB_CAPTURE' || message.type === 'OFFSCREEN_RELEASE_CAPTURE') {
    releaseCapture();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
