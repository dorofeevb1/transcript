import type { CaptionTrack, Segment } from '../../domain/types';
import { pickCaptionTrack } from './youtube-helpers';

const INNERTUBE_CONTEXT = {
  client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' },
};

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export function parseCaptionXml(xml: string): Segment[] {
  const segments: Segment[] = [];

  // format 3: <p t="1200" d="2160">
  const pRe = /<p\b[^>]*\bt="(\d+)"[^>]*\bd="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(xml)) !== null) {
    const text = decodeHtml(m[3].replace(/<[^>]+>/g, '').trim());
    if (!text) continue;
    const start = parseInt(m[1], 10) / 1000;
    const end = start + parseInt(m[2], 10) / 1000;
    segments.push({ start, end: Math.max(end, start + 0.1), text });
  }
  if (segments.length > 0) return segments;

  // classic: <text start="1.0" dur="2.0">
  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  while ((m = textRe.exec(xml)) !== null) {
    const attrs = m[1];
    const start = parseFloat(attrs.match(/\bstart="([^"]+)"/)?.[1] ?? '0');
    const dur = parseFloat(attrs.match(/\bdur="([^"]+)"/)?.[1] ?? '0');
    const text = decodeHtml(m[2].replace(/<[^>]+>/g, '').trim());
    if (text) segments.push({ start, end: start + (dur || 0.1), text });
  }

  return segments;
}

async function fetchCaptionUrl(url: string): Promise<Segment[]> {
  const clean = url.replace(/&fmt=\w+/g, '');
  const res = await fetch(clean);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  if (!raw.trim()) throw new Error('Пустой ответ субтитров');
  const segments = parseCaptionXml(raw);
  if (!segments.length) throw new Error('Не удалось разобрать субтитры');
  return segments;
}

interface InnertubePlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl: string;
        languageCode: string;
        kind?: string;
        name?: { simpleText?: string };
      }>;
    };
  };
}

export async function fetchCaptionsViaInnertube(
  videoId: string,
  apiKey: string,
  preferLang: 'ru' | 'en' | 'auto',
): Promise<{ segments: Segment[]; language: string; tracks: CaptionTrack[] }> {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Innertube player: HTTP ${res.status}`);
  }

  const raw = await res.text();
  if (!raw.trim()) throw new Error('Innertube: пустой ответ');
  let data: InnertubePlayerResponse;
  try {
    data = JSON.parse(raw) as InnertubePlayerResponse;
  } catch {
    throw new Error('Innertube: неверный JSON');
  }
  if (!data.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
    throw new Error('Innertube: субтитры недоступны через ANDROID API');
  }

  const rawTracks = data.captions.playerCaptionsTracklistRenderer.captionTracks;

  const tracks: CaptionTrack[] = rawTracks.map((t) => ({
    baseUrl: t.baseUrl.replace(/\\u0026/g, '&'),
    languageCode: t.languageCode,
    kind: t.kind,
    name: t.name,
  }));

  if (!tracks.length) {
    throw new Error('У этого видео нет субтитров');
  }

  const track = pickCaptionTrack(tracks, preferLang);
  if (!track) throw new Error('Нет подходящей дорожки субтитров');

  if (track.baseUrl.includes('&exp=xpe')) {
    throw new Error('Субтитры требуют токен YouTube — попробуйте обновить страницу');
  }

  const segments = await fetchCaptionUrl(track.baseUrl);
  return { segments, language: track.languageCode, tracks };
}

/** Самодостаточная функция для executeScript */
export function readInnertubeApiKeyInPage(): string | null {
  const win = window as unknown as {
    ytcfg?: { data_?: { INNERTUBE_API_KEY?: string } };
  };
  const fromCfg = win.ytcfg?.data_?.INNERTUBE_API_KEY;
  if (fromCfg) return fromCfg;
  // SECURITY: read-only access to the page's serialized HTML for regex
  // extraction of YouTube's public Innertube API key. Nothing is written
  // back; the value is used only to build subsequent in-extension calls.
  const html = document.documentElement.innerHTML;
  const m = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  return m?.[1] ?? null;
}

export async function getInnertubeApiKeyFromTab(tabId: number): Promise<string> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: readInnertubeApiKeyInPage,
  });
  const key = result?.result as string | null;
  if (!key) throw new Error('Не найден INNERTUBE_API_KEY на странице');
  return key;
}
