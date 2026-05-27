import { safeResponseJson } from '../../shared/safe-json';
import type { Segment } from '../../domain/types';

export interface HealthResponse {
  ok: boolean;
  model?: string;
  translate?: 'argos' | 'google' | string;
  translatePairs?: string[];
}

export interface TranscribeResponse {
  segments: Segment[];
}

export async function checkServerHealth(
  serverUrl: string,
  timeoutMs = 5000,
): Promise<HealthResponse> {
  const base = serverUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(`${base}/health`, {
    method: 'GET',
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
  const data = await safeResponseJson<HealthResponse>(res);
  if (!data) throw new Error('Пустой ответ сервера');
  return data;
}

export async function transcribeChunk(
  serverUrl: string,
  blob: Blob,
  language: string,
  signal?: AbortSignal,
): Promise<Segment[]> {
  const base = serverUrl.replace(/\/$/, '');
  const form = new FormData();
  form.append('file', blob, 'chunk.webm');
  const lang = language === 'auto' ? 'auto' : language;
  const res = await fetch(`${base}/transcribe?language=${encodeURIComponent(lang)}`, {
    method: 'POST',
    body: form,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ошибка распознавания: ${res.status} ${text}`);
  }
  const data = await safeResponseJson<TranscribeResponse>(res);
  if (!data?.segments) throw new Error('Пустой ответ распознавания');
  return data.segments;
}

export function offsetSegments(segments: Segment[], offsetSec: number): Segment[] {
  return segments.map((s) => ({
    start: s.start + offsetSec,
    end: s.end + offsetSec,
    text: s.text,
  }));
}
