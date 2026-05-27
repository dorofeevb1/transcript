import type { Segment } from '../../domain/types';

interface ServerCaptionsResponse {
  videoId: string;
  language: string;
  segments: Segment[];
  error?: string;
}

export async function fetchCaptionsViaWhisperServer(
  serverUrl: string,
  videoId: string,
  language: string,
): Promise<{ segments: Segment[]; language: string }> {
  const base = serverUrl.replace(/\/$/, '');
  const lang = language || 'auto';
  const res = await fetch(
    `${base}/youtube-captions/${encodeURIComponent(videoId)}?language=${encodeURIComponent(lang)}`,
    { method: 'GET' },
  );

  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error('Локальный сервер вернул пустой ответ. Запущен ли whisper-server?');
  }

  let data: ServerCaptionsResponse;
  try {
    data = JSON.parse(raw) as ServerCaptionsResponse;
  } catch {
    throw new Error(`Локальный сервер: неверный JSON (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Сервер: HTTP ${res.status}`);
  }

  if (!data.segments?.length) {
    throw new Error(data.error ?? 'Субтитры пустые');
  }

  return { segments: data.segments, language: data.language };
}

export async function isWhisperServerUp(serverUrl: string): Promise<boolean> {
  try {
    const base = serverUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/health`);
    const raw = await res.text();
    if (!raw.trim()) return false;
    const data = JSON.parse(raw) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}
