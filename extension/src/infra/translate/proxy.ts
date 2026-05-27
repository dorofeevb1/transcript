import { translateTextsInPage } from '../../content/inject-page';
import { runPool } from '../../shared/async-pool';
import { parseBatchPostResponse, extractGtxText } from './gtx';

const GTX_SINGLE = 'https://translate.googleapis.com/translate_a/single';
const GTX_BATCH = 'https://translate.googleapis.com/translate_a/t';
const SEG_SEP = '\u2063';

const GTX_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.youtube.com/',
};

const SERVER_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 45_000;
const MAX_SERVER_CHUNK_ITEMS = 16;
const MAX_SERVER_CHUNK_CHARS = 10_000;
const MAX_GTX_ITEMS = 12;
const MAX_GTX_CHARS = 4500;
/** Параллельных под-пакетов внутри chunk. Сервер без rate-limit — выше; Google консервативнее. */
const SUB_PARALLEL_SERVER = 4;
const SUB_PARALLEL_GTX = 2;

let lastServerTranslateEngine: string | undefined;
let serverTranslateDisabled = false;

export function getLastServerTranslateEngine(): string | undefined {
  return lastServerTranslateEngine;
}

export function resetServerTranslateEngine(): void {
  lastServerTranslateEngine = undefined;
  serverTranslateDisabled = false;
}

function gtxBody(targetLang: string, sourceLang: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set('client', 'gtx');
  body.set('sl', sourceLang || 'auto');
  body.set('tl', targetLang);
  body.set('dt', 't');
  return body;
}

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function splitByLimits(chunk: string[], maxItems: number, maxChars: number): string[][] {
  const totalChars = chunk.reduce((s, t) => s + t.length, 0);
  if (chunk.length <= maxItems && totalChars <= maxChars) {
    return [chunk];
  }
  const parts: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of chunk) {
    const len = text.length;
    if (
      current.length > 0 &&
      (current.length >= maxItems || (chars + len > maxChars && current.length > 0))
    ) {
      parts.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += len;
  }
  if (current.length) parts.push(current);
  return parts;
}

function isGoogleBlockedResponse(res: Response): boolean {
  const url = res.url ?? '';
  return (
    !res.ok ||
    url.includes('google.com/sorry') ||
    url.includes('/sorry/') ||
    (res.redirected && url.includes('google.com') && !url.includes('translate.googleapis.com'))
  );
}

/** Только для unit-тестов (в SW/popup даёт CORS на google.com/sorry). */
async function directPostBatch(
  chunk: string[],
  targetLang: string,
  sourceLang: string,
): Promise<string[] | null> {
  try {
    const body = gtxBody(targetLang, sourceLang);
    for (const t of chunk) body.append('q', t);
    const res = await fetchWithTimeout(GTX_BATCH, {
      method: 'POST',
      headers: {
        ...GTX_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });
    if (isGoogleBlockedResponse(res)) return null;
    return parseBatchPostResponse(await res.json(), chunk.length);
  } catch {
    return null;
  }
}

async function directSeparator(
  chunk: string[],
  targetLang: string,
  sourceLang: string,
): Promise<string[] | null> {
  try {
    const url = new URL(GTX_SINGLE);
    const params = gtxBody(targetLang, sourceLang);
    params.set('q', chunk.join(SEG_SEP));
    url.search = params.toString();
    const res = await fetchWithTimeout(url.toString(), { headers: GTX_HEADERS });
    if (isGoogleBlockedResponse(res)) return null;
    const parts = extractGtxText(await res.json()).split(SEG_SEP);
    return parts.length === chunk.length ? parts : null;
  } catch {
    return null;
  }
}

async function directOneByOne(
  chunk: string[],
  targetLang: string,
  sourceLang: string,
): Promise<string[] | null> {
  const out: string[] = [];
  for (const text of chunk) {
    try {
      const url = new URL(GTX_SINGLE);
      const params = gtxBody(targetLang, sourceLang);
      params.set('q', text);
      url.search = params.toString();
      const res = await fetchWithTimeout(url.toString(), { headers: GTX_HEADERS }, 25_000);
      if (isGoogleBlockedResponse(res)) return null;
      out.push(extractGtxText(await res.json()));
    } catch {
      return null;
    }
  }
  return out.length === chunk.length ? out : null;
}

export async function translateChunkViaServer(
  serverUrl: string,
  chunk: string[],
  targetLang: string,
  sourceLang: string,
): Promise<string[] | null> {
  if (serverTranslateDisabled) return null;
  try {
    const subChunks = splitByLimits(chunk, MAX_SERVER_CHUNK_ITEMS, MAX_SERVER_CHUNK_CHARS);
    const base = serverUrl.replace(/\/$/, '');
    const subResults = await runPool(subChunks, SUB_PARALLEL_SERVER, async (sub) => {
      const res = await fetchWithTimeout(
        `${base}/translate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: sub, target: targetLang, source: sourceLang }),
        },
        SERVER_TIMEOUT_MS,
      );
      if (!res.ok) {
        serverTranslateDisabled = true;
        return null;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        texts?: string[];
        engine?: string;
      };
      if (!data.ok || !Array.isArray(data.texts) || data.texts.length !== sub.length) {
        return null;
      }
      lastServerTranslateEngine = data.engine;
      return data.texts;
    });
    if (subResults.some((r) => r == null)) return null;
    const merged = subResults.flatMap((r) => r as string[]);
    return merged.length === chunk.length ? merged : null;
  } catch {
    serverTranslateDisabled = true;
    return null;
  }
}

export async function translateChunkViaTab(
  tabId: number,
  chunk: string[],
  targetLang: string,
  sourceLang: string,
): Promise<string[] | null> {
  try {
    let pageUrl = 'https://www.youtube.com/';
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && !tab.url.startsWith('chrome')) {
        pageUrl = tab.url;
      }
    } catch {
      /* keep default referer */
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: translateTextsInPage,
      args: [chunk, targetLang, sourceLang, pageUrl],
    });
    const data = result?.result;
    if (Array.isArray(data) && data.length === chunk.length) return data;
    return null;
  } catch {
    return null;
  }
}

export interface TranslateChunkOptions {
  serverUrl?: string;
  tabId?: number;
  /** Разрешить fetch к Google из service worker (только тесты). */
  allowDirectGoogle?: boolean;
}

async function tryTranslateChunkOnce(
  chunk: string[],
  targetLang: string,
  sourceLang: string,
  opts: TranslateChunkOptions,
): Promise<string[] | null> {
  if (opts.tabId != null) {
    const viaTab = await translateChunkViaTab(opts.tabId, chunk, targetLang, sourceLang);
    if (viaTab) return viaTab;
  }

  if (opts.serverUrl && !serverTranslateDisabled) {
    const viaServer = await translateChunkViaServer(
      opts.serverUrl,
      chunk,
      targetLang,
      sourceLang,
    );
    if (viaServer) return viaServer;
  }

  if (opts.allowDirectGoogle) {
    const direct =
      (await directPostBatch(chunk, targetLang, sourceLang)) ??
      (await directSeparator(chunk, targetLang, sourceLang)) ??
      (await directOneByOne(chunk, targetLang, sourceLang));
    if (direct) return direct;
  }

  return null;
}

export async function translateChunkWithFallbacks(
  chunk: string[],
  targetLang: string,
  sourceLang: string,
  opts: TranslateChunkOptions,
): Promise<string[]> {
  if (!chunk.length) return [];

  const parts = splitByLimits(chunk, MAX_GTX_ITEMS, MAX_GTX_CHARS);
  const subParallel = opts.serverUrl ? SUB_PARALLEL_SERVER : SUB_PARALLEL_GTX;
  const partResults = await runPool(parts, subParallel, (part) =>
    translateChunkWithFallbacksInner(part, targetLang, sourceLang, opts),
  );
  return partResults.flat();
}

async function translateChunkWithFallbacksInner(
  chunk: string[],
  targetLang: string,
  sourceLang: string,
  opts: TranslateChunkOptions,
): Promise<string[]> {
  const direct = await tryTranslateChunkOnce(chunk, targetLang, sourceLang, opts);
  if (direct) return direct;

  if (chunk.length > 1) {
    const mid = Math.ceil(chunk.length / 2);
    const a = await translateChunkWithFallbacksInner(
      chunk.slice(0, mid),
      targetLang,
      sourceLang,
      opts,
    );
    const b = await translateChunkWithFallbacksInner(chunk.slice(mid), targetLang, sourceLang, opts);
    return [...a, ...b];
  }

  const single = await tryTranslateChunkOnce([chunk[0]], targetLang, sourceLang, opts);
  if (single) return single;

  throw new Error(
    opts.tabId == null
      ? 'Перевод недоступен. Откройте вкладку с видео, обновите страницу (F5) и повторите. Либо запустите: cd whisper-server && python main.py'
      : 'Перевод недоступен (Google ограничил запросы). Подождите 1–2 мин, запустите whisper-server или смените сеть/VPN.',
  );
}
