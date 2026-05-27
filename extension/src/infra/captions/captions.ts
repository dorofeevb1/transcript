import { normalizeRollingSubtitles } from './caption-normalize';
import type { CaptionTrack, Segment } from '../../domain/types';
import { pickCaptionTrack } from './youtube-helpers';

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

interface Json3Body {
  events?: Json3Event[];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function mergeAdjacentSegments(segments: Segment[]): Segment[] {
  if (segments.length === 0) return [];
  const out: Segment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const prev = out[out.length - 1];
    const cur = segments[i];
    if (cur.start - prev.end < 0.05 && prev.text === cur.text) {
      prev.end = cur.end;
      continue;
    }
    out.push({ ...cur });
  }
  return out;
}

function parseJson3(data: Json3Body): Segment[] {
  const segments: Segment[] = [];
  for (const ev of data.events ?? []) {
    if (ev.segs == null) continue;
    const text = ev.segs.map((s) => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim();
    if (!text) continue;
    const start = (ev.tStartMs ?? 0) / 1000;
    const end = start + (ev.dDurationMs ?? 0) / 1000;
    segments.push({
      start,
      end: Math.max(end, start + 0.1),
      text: decodeHtmlEntities(text),
    });
  }
  return mergeAdjacentSegments(segments);
}

function parseXmlTimedtext(xml: string): Segment[] {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = doc.querySelectorAll('text');
    const segments: Segment[] = [];
    nodes.forEach((node) => {
      const start = parseFloat(node.getAttribute('start') ?? '0');
      const dur = parseFloat(node.getAttribute('dur') ?? '0');
      const text = (node.textContent ?? '').replace(/\n/g, ' ').trim();
      if (!text) return;
      segments.push({
        start,
        end: start + (dur || 0.1),
        text: decodeHtmlEntities(text),
      });
    });
    if (segments.length > 0) return mergeAdjacentSegments(segments);
  }

  const segments: Segment[] = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const startM = attrs.match(/\bstart="([^"]+)"/);
    const durM = attrs.match(/\bdur="([^"]+)"/);
    const start = parseFloat(startM?.[1] ?? '0');
    const dur = parseFloat(durM?.[1] ?? '0');
    const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim());
    if (!text) continue;
    segments.push({ start, end: start + (dur || 0.1), text });
  }
  return mergeAdjacentSegments(segments);
}

async function parseJson3Response(res: Response): Promise<Segment[] | null> {
  if (!res.ok) return null;
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    const data = JSON.parse(raw) as Json3Body;
    const segments = parseJson3(data);
    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
}

function captionUrls(baseUrl: string): string[] {
  const u = baseUrl.replace(/&fmt=\w+/g, '');
  const sep = u.includes('?') ? '&' : '?';
  return [
    `${u}${sep}fmt=json3`,
    `${u}${sep}fmt=srv3`,
    u,
  ];
}

export async function fetchCaptionText(baseUrl: string): Promise<Segment[]> {
  const urls = captionUrls(baseUrl);
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (url.includes('json3')) {
        const fromJson = await parseJson3Response(res);
        if (fromJson?.length) return fromJson;
        continue;
      }
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (!text.trim()) continue;
      const segments = parseXmlTimedtext(text);
      if (segments.length > 0) return segments;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(
    lastError
      ? `Не удалось загрузить субтитры: ${lastError}`
      : 'Субтитры пустые или недоступны',
  );
}

function parseTimedTextBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  const body = text.startsWith('WEBVTT') ? text.replace(/^WEBVTT[^\n]*\n+/, '') : text;
  const blocks = body.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [a, b] = timeLine.split('-->').map((s) => s.trim());
    const start = vttTimestamp(a);
    const end = vttTimestamp(b);
    const textBody = lines
      .filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()))
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!textBody) continue;
    segments.push({
      start,
      end: Math.max(end, start + 0.1),
      text: decodeHtmlEntities(textBody),
    });
  }
  return mergeAdjacentSegments(segments);
}

/** Парсинг WebVTT / SRT. */
export function parseVttOrSrt(raw: string): Segment[] {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  if (text.startsWith('WEBVTT') || /-->\s*/.test(text)) {
    return parseTimedTextBlocks(text);
  }

  return parseXmlTimedtext(text);
}

function vttTimestamp(ts: string): number {
  const p = ts.trim().split(':');
  if (p.length === 3) {
    return (
      parseInt(p[0], 10) * 3600 +
      parseInt(p[1], 10) * 60 +
      parseFloat(p[2].replace(',', '.'))
    );
  }
  if (p.length === 2) {
    return parseInt(p[0], 10) * 60 + parseFloat(p[1].replace(',', '.'));
  }
  return parseFloat(ts) || 0;
}

export async function loadCaptions(
  tracks: CaptionTrack[],
  preferLang: 'ru' | 'en' | 'auto',
): Promise<{ segments: Segment[]; language: string }> {
  const track = pickCaptionTrack(tracks, preferLang);
  if (!track) throw new Error('У этого видео нет субтитров');

  const segments = await fetchCaptionText(track.baseUrl);
  if (segments.length === 0) throw new Error('Субтитры пустые');

  return { segments, language: track.languageCode };
}

/** @deprecated используйте loadCaptions из content script */
export async function loadCaptionsInWorker(
  tracks: CaptionTrack[],
  preferLang: 'ru' | 'en' | 'auto',
): Promise<{ segments: Segment[]; language: string }> {
  return loadCaptions(tracks, preferLang);
}
