/**
 * Функции для chrome.scripting.executeScript — вся логика ВНУТРИ экспортируемых
 * функций (Chrome сериализует только тело func, без соседних хелперов модуля).
 *
 * SECURITY NOTE
 * HTML structure is read via the live DOM (`document.querySelectorAll`) rather
 * than by regexing a serialized `innerHTML` blob. Regex is still used to pull
 * URLs out of inline <script> bodies (non-HTML JS/JSON payloads) and m3u8
 * playlists. No setter form of `innerHTML` is used anywhere in this file.
 * See SECURITY.md for the full threat model.
 */

export function getPageInfoInPage(): {
  platform?: 'youtube' | 'rutube' | 'vk';
  videoId?: string;
  title?: string;
  durationSec: number;
  captionTracks: Array<{ baseUrl: string; languageCode: string; kind?: string }>;
  isLive?: boolean;
  error?: string;
} {
  const decodeCaptionUrl = (url: string) =>
    url.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').trim();

  const href = window.location.href;
  let platform: 'youtube' | 'rutube' | 'vk' | null = null;
  let videoId: string | null = null;

  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, '');

    if (host.includes('youtube.com')) {
      platform = 'youtube';
      videoId = u.searchParams.get('v');
      const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) videoId = shorts[1];
    } else if (host === 'rutube.ru' || host.endsWith('.rutube.ru')) {
      platform = 'rutube';
      const m =
        u.pathname.match(/\/video\/([0-9a-f-]{32,36})/i) ??
        u.pathname.match(/\/play\/embed\/([0-9a-f-]{32,36})/i);
      videoId = m?.[1] ?? null;
    } else if (host === 'vk.com' || host === 'vkvideo.ru' || host.endsWith('.vk.com')) {
      platform = 'vk';
      const m = u.pathname.match(/video(-?\d+)_(\d+)/i);
      if (m) videoId = `${m[1]}_${m[2]}`;
      else {
        const z = u.searchParams.get('z');
        const zm = z?.match(/video(-?\d+)_(\d+)/i);
        if (zm) videoId = `${zm[1]}_${zm[2]}`;
      }
    }
  } catch {
    /* ignore */
  }

  if (!platform || !videoId) {
    return {
      durationSec: 0,
      captionTracks: [],
      error: 'Откройте страницу видео: YouTube, Rutube или VK Видео',
    };
  }

  const video = document.querySelector('video') as HTMLVideoElement | null;
  const durationFromTag =
    video?.duration && Number.isFinite(video.duration) ? video.duration : 0;
  const ogTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    document.querySelector('title')?.textContent ??
    undefined;

  if (platform === 'rutube' || platform === 'vk') {
    return {
      platform,
      videoId,
      title: ogTitle?.trim(),
      durationSec: durationFromTag,
      captionTracks: [],
      isLive: false,
    };
  }

  let player: {
    videoDetails?: { title?: string; lengthSeconds?: string; isLiveContent?: boolean };
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: Array<{ baseUrl: string; languageCode: string; kind?: string }>;
      };
    };
  } | null = null;

  const win = window as unknown as { ytInitialPlayerResponse?: typeof player };
  player = win.ytInitialPlayerResponse ?? null;

  if (!player) {
    const scripts = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const text = scripts[i].textContent;
      if (!text?.includes('ytInitialPlayerResponse')) continue;
      const idx = text.indexOf('ytInitialPlayerResponse');
      const start = text.indexOf('{', idx);
      if (start === -1) continue;
      let depth = 0;
      for (let j = start; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') {
          depth--;
          if (depth === 0) {
            try {
              player = JSON.parse(text.slice(start, j + 1));
              break;
            } catch {
              break;
            }
          }
        }
      }
      if (player) break;
    }
  }

  let durationSec = durationFromTag;
  let title: string | undefined;
  let isLive = false;
  let captionTracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> = [];

  if (player?.videoDetails) {
    title = player.videoDetails.title;
    isLive = Boolean(player.videoDetails.isLiveContent);
    const len = parseInt(player.videoDetails.lengthSeconds ?? '0', 10);
    if (len > 0) durationSec = len;
  }

  captionTracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map((t) => ({
      baseUrl: decodeCaptionUrl(t.baseUrl),
      languageCode: t.languageCode,
      kind: t.kind,
    })) ?? [];

  if (!title) {
    const h1 = document.querySelector('h1');
    title = h1?.textContent?.trim() ?? undefined;
  }

  return { platform: 'youtube', videoId, title, durationSec, captionTracks, isLive };
}

/** Субтитры Rutube через play/options (cookies и ?p= для приватных видео). */
export async function fetchRutubeCaptionsInPage(
  videoId: string,
  preferLang: string,
): Promise<{
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
  title?: string;
  durationSec: number;
  error?: string;
}> {
  const decodeHtml = (text: string) =>
    text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');

  const parseVtt = (raw: string) => {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    const body = raw.replace(/^\uFEFF/, '').trim();
    const text = body.startsWith('WEBVTT') ? body.replace(/^WEBVTT[^\n]*\n+/, '') : body;
    const blocks = text.split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const [a, b] = timeLine.split('-->').map((s) => s.trim());
      const parseTs = (ts: string) => {
        const p = ts.split(':');
        if (p.length === 3) {
          return (
            parseInt(p[0], 10) * 3600 +
            parseInt(p[1], 10) * 60 +
            parseFloat(p[2].replace(',', '.'))
          );
        }
        if (p.length === 2) return parseInt(p[0], 10) * 60 + parseFloat(p[1].replace(',', '.'));
        return parseFloat(ts) || 0;
      };
      const start = parseTs(a);
      const end = parseTs(b);
      const lineText = lines
        .filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()))
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!lineText) continue;
      segments.push({ start, end: Math.max(end, start + 0.1), text: decodeHtml(lineText) });
    }
    return segments;
  };

  const video = document.querySelector('video') as HTMLVideoElement | null;
  const durationSec =
    video?.duration && Number.isFinite(video.duration) ? video.duration : 0;
  const title =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    document.querySelector('h1')?.textContent?.trim();

  const headers = { Referer: 'https://rutube.ru/', Accept: 'application/json' };
  const qs = new URLSearchParams({ format: 'json' });
  const p = new URL(window.location.href).searchParams.get('p');
  if (p) qs.set('p', p);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const loadOptions = async (id: string) => {
    const res = await fetch(`https://rutube.ru/api/play/options/${id}/?${qs}`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      captions?: Array<{ code?: string; lang?: string; file?: string; url?: string }>;
      effective_video?: string;
      duration?: number;
    };
  };

  const scrapeSubtitleUrls = () => {
    // Scan inline <script> bodies (non-HTML JS payloads — regex is appropriate)
    // plus URL-bearing DOM attributes (parsed via the structured DOM, no HTML
    // string regexing).
    const urls: string[] = [];
    const patterns = [
      /https?:\/\/pic\.rtbcdn\.ru\/subtitle\/[^"'\\\s]+\.(?:srt|vtt)/gi,
      /https?:\\?\/\\?\/pic\.rtbcdn\.ru\\?\/subtitle\\?\/[^"'\\\s]+\.(?:srt|vtt)/gi,
      /https?:\/\/[^"'\\\s]*subtitle[^"'\\\s]*\.(?:srt|vtt)/gi,
      /https?:\\?\/\\?\/[^"'\s]+\.(?:vtt|srt)/gi,
    ];
    const sample = (text: string) => {
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const url = m[0].replace(/\\\//g, '/');
          if (!urls.includes(url)) urls.push(url);
        }
      }
    };
    document.querySelectorAll('script').forEach((s) => {
      const t = s.textContent;
      if (t) sample(t);
    });
    document.querySelectorAll('[src], [href], [data-src]').forEach((node) => {
      const el = node as Element;
      for (const attr of ['src', 'href', 'data-src']) {
        const v = el.getAttribute(attr);
        if (v) sample(v);
      }
    });
    return urls;
  };

  const tryClickCc = () => {
    const selectors = [
      'button[aria-label*="убтитр" i]',
      'button[title*="убтитр" i]',
      '[class*="subtitle" i] button',
      '[class*="caption" i] button',
      '[data-testid*="subtitle" i]',
      '[class*="Subtitles" i]',
      '.vjs-subtitles-button',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        el.click();
        return true;
      }
    }
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      try {
        const doc = iframes[i].contentDocument;
        if (!doc) continue;
        for (const sel of selectors) {
          const el = doc.querySelector(sel);
          if (el instanceof HTMLElement) {
            el.click();
            return true;
          }
        }
      } catch {
        /* cross-origin */
      }
    }
    return false;
  };

  const readTextTrackCues = async (): Promise<
    Array<{ start: number; end: number; text: string }>
  > => {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    const videos: HTMLVideoElement[] = [];
    document.querySelectorAll('video').forEach((v) => videos.push(v as HTMLVideoElement));

    const loadTrack = (track: TextTrack) =>
      new Promise<void>((resolve) => {
        if (track.cues && track.cues.length > 0) {
          resolve();
          return;
        }
        const done = () => resolve();
        track.addEventListener('load', done, { once: true });
        track.mode = 'hidden';
        setTimeout(done, 1500);
      });

    for (const v of videos) {
      const tracks = v.textTracks;
      if (!tracks?.length) continue;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.kind === 'metadata') continue;
        track.mode = 'hidden';
        await loadTrack(track);
        const cues = track.cues;
        if (!cues) continue;
        for (let j = 0; j < cues.length; j++) {
          const cue = cues[j];
          if (!cue) continue;
          const text = (cue as VTTCue).text?.replace(/\n/g, ' ').trim();
          if (!text) continue;
          segments.push({
            start: cue.startTime,
            end: Math.max(cue.endTime, cue.startTime + 0.1),
            text: decodeHtml(text),
          });
        }
      }
    }
    segments.sort((a, b) => a.start - b.start);
    return segments;
  };

  const scrapeSubtitleUrlsFromScripts = () => {
    const urls: string[] = [];
    const re = /https?:\/\/pic\.rtbcdn\.ru\/subtitle\/[a-zA-Z0-9/_.-]+\.(?:srt|vtt)/gi;
    document.querySelectorAll('script').forEach((node) => {
      const t = node.textContent;
      if (!t?.includes('subtitle')) return;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) {
        if (!urls.includes(m[0])) urls.push(m[0]);
      }
    });
    return urls;
  };

  try {
    let options = await loadOptions(videoId);
    if (!options) throw new Error('play/options недоступен');

    const collectTracks = async () => {
      const list = [...(options?.captions ?? [])];
      const effective = options?.effective_video;
      if (!list.length && effective && effective !== videoId) {
        const alt = await loadOptions(effective);
        if (alt?.captions?.length) {
          options = alt;
          return alt.captions;
        }
      }
      if (!list.length) {
        const subsRes = await fetch(
          `https://rutube.ru/api/video/${videoId}/subtitles/?format=json`,
          { credentials: 'include', headers },
        );
        if (subsRes.ok) {
          const subsBody: unknown = await subsRes.json();
          const legacy = Array.isArray(subsBody)
            ? subsBody
            : ((subsBody as { results?: typeof list }).results ?? []);
          list.push(...legacy);
        }
      }
      return list;
    };

    let tracks = await collectTracks();
    if (!tracks.length && tryClickCc()) {
      await sleep(500);
      options = (await loadOptions(videoId)) ?? options;
      tracks = await collectTracks();
    }

    if (!tracks.length) {
      tryClickCc();
      await sleep(800);
      const trackCues = await readTextTrackCues();
      if (trackCues.length) {
        return {
          segments: trackCues,
          language: preferLang || 'ru',
          title,
          durationSec: options.duration ?? durationSec,
        };
      }

      const scriptUrls = scrapeSubtitleUrlsFromScripts();
      const vttUrls = [...scrapeSubtitleUrls(), ...scriptUrls].filter(
        (u, i, a) => a.indexOf(u) === i,
      );
      if (vttUrls.length) {
        let picked = vttUrls[0];
        if (preferLang === 'ru') {
          picked = vttUrls.find((u) => /[/_-]ru[./_-]/i.test(u)) ?? vttUrls[0];
        } else if (preferLang === 'en') {
          picked = vttUrls.find((u) => /[/_-]en[./_-]/i.test(u)) ?? vttUrls[0];
        }
        const fileRes = await fetch(picked, { credentials: 'include' });
        if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
        const segments = parseVtt(await fileRes.text());
        if (!segments.length) throw new Error('пустой файл субтитров');
        const langMatch = picked.match(/[/_-](ru|en|uk)[./_-]/i);
        return {
          segments,
          language: langMatch?.[1] ?? preferLang ?? 'ru',
          title,
          durationSec: options.duration ?? durationSec,
        };
      }

      return {
        segments: [],
        language: 'ru',
        title,
        durationSec: options.duration ?? durationSec,
        error:
          'У этого ролика нет дорожки субтитров на Rutube (в API пусто). Это не голос: Rutube просто не отдал файл .srt/.vtt. Попробуйте другой ролик с CC в плеере или канал с автосубтитрами. «Из аудио» — только распознавание речи через Whisper.',
      };
    }

    const code = (t: (typeof tracks)[0]) => (t.code ?? t.lang ?? 'ru').split('-')[0];
    let track = tracks[0];
    if (preferLang === 'ru') track = tracks.find((t) => code(t) === 'ru') ?? tracks[0];
    else if (preferLang === 'en') track = tracks.find((t) => code(t) === 'en') ?? tracks[0];
    else track = tracks.find((t) => code(t) === 'ru') ?? tracks.find((t) => code(t) === 'en') ?? tracks[0];

    const fileUrl = track.file ?? track.url;
    if (!fileUrl) throw new Error('нет URL субтитров');

    const fileRes = await fetch(fileUrl, { credentials: 'include', headers });
    if (!fileRes.ok) throw new Error(`файл субтитров HTTP ${fileRes.status}`);
    const segments = parseVtt(await fileRes.text());
    if (!segments.length) throw new Error('пустые субтитры');

    return {
      segments,
      language: track.code ?? track.lang ?? 'ru',
      title,
      durationSec: options.duration ?? durationSec,
    };
  } catch (e) {
    return {
      segments: [],
      language: 'ru',
      title,
      durationSec,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Субтитры VK: API al_video (subs), playerParams, textTracks, okcdn. */
export async function fetchVkCaptionsInPage(
  videoId: string,
  preferLang: string,
): Promise<{
  segments: Array<{ start: number; end: number; text: string }>;
  tracks?: Array<{ url: string; lang: string }>;
  language: string;
  title?: string;
  durationSec: number;
  error?: string;
}> {
  const decodeHtml = (text: string) =>
    text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');

  const parseTimedText = (raw: string) => {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    const body = raw.replace(/^\uFEFF/, '').trim();
    const text = body.startsWith('WEBVTT') ? body.replace(/^WEBVTT[^\n]*\n+/, '') : body;
    const blocks = text.split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const [a, b] = timeLine.split('-->').map((s) => s.trim());
      const parseTs = (ts: string) => {
        const p = ts.split(':');
        if (p.length === 3) {
          return (
            parseInt(p[0], 10) * 3600 +
            parseInt(p[1], 10) * 60 +
            parseFloat(p[2].replace(',', '.'))
          );
        }
        if (p.length === 2) return parseInt(p[0], 10) * 60 + parseFloat(p[1].replace(',', '.'));
        return parseFloat(ts) || 0;
      };
      const start = parseTs(a);
      const end = parseTs(b);
      const lineText = lines
        .filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()))
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!lineText) continue;
      segments.push({ start, end: Math.max(end, start + 0.1), text: decodeHtml(lineText) });
    }
    return segments;
  };

  const video = document.querySelector('video') as HTMLVideoElement | null;
  const durationSec =
    video?.duration && Number.isFinite(video.duration) ? video.duration : 0;
  const title =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    document.querySelector('h1')?.textContent?.trim();

  type SubTrack = { url: string; lang: string };

  const pickTrack = (tracks: SubTrack[]) => {
    if (!tracks.length) return null;
    const code = (t: SubTrack) => t.lang.split(/[._-]/)[0].toLowerCase();
    if (preferLang === 'ru') return tracks.find((t) => code(t) === 'ru') ?? tracks[0];
    if (preferLang === 'en') return tracks.find((t) => code(t) === 'en') ?? tracks[0];
    return tracks.find((t) => code(t) === 'ru') ?? tracks.find((t) => code(t) === 'en') ?? tracks[0];
  };

  const pushSub = (out: SubTrack[], o: Record<string, unknown>) => {
    const url = typeof o.url === 'string' ? o.url : '';
    if (!url) return;
    const lang =
      (typeof o.lang === 'string' && o.lang) ||
      (typeof o.title === 'string' && o.title) ||
      'ru';
    out.push({ url, lang });
  };

  const subsFromPlayerParams = (params: Record<string, unknown>): SubTrack[] => {
    const out: SubTrack[] = [];
    const subs = params.subs;
    if (Array.isArray(subs)) {
      for (const s of subs) {
        if (!s || typeof s !== 'object') continue;
        pushSub(out, s as Record<string, unknown>);
      }
    } else if (subs && typeof subs === 'object') {
      for (const val of Object.values(subs as Record<string, unknown>)) {
        if (val && typeof val === 'object') pushSub(out, val as Record<string, unknown>);
      }
    }
    return out;
  };

  const extractParamsFromPayloadRoot = (root: unknown): Record<string, unknown> | null => {
    let data: unknown = root;
    if (data && typeof data === 'object' && data !== null && 'payload' in data) {
      data = (data as { payload: unknown }).payload;
    }
    if (!Array.isArray(data)) return null;
    for (let i = data.length - 1; i >= 0; i--) {
      const item = data[i];
      if (!item || typeof item !== 'object') continue;
      const player = (item as { player?: { params?: unknown[] } }).player;
      const p0 = player?.params?.[0];
      if (p0 && typeof p0 === 'object') return p0 as Record<string, unknown>;
    }
    return null;
  };

  const parseM3u8SubtitleTracks = async (masterUrl: string): Promise<SubTrack[]> => {
    const out: SubTrack[] = [];
    try {
      const res = await fetch(masterUrl, { credentials: 'include' });
      if (!res.ok) return out;
      const text = await res.text();
      const base = masterUrl.replace(/[^/]+$/, '');
      for (const line of text.split('\n')) {
        if (!line.includes('TYPE=SUBTITLES') && !line.includes('TYPE=CLOSED-CAPTIONS')) continue;
        const uri = line.match(/URI="([^"]+)"/)?.[1];
        const lang = line.match(/LANGUAGE="([^"]+)"/)?.[1] ?? 'ru';
        if (!uri) continue;
        const url = uri.startsWith('http') ? uri : new URL(uri, base).href;
        out.push({ url, lang });
      }
    } catch {
      /* ignore */
    }
    return out;
  };

  const subsFromHlsInParams = async (params: Record<string, unknown>): Promise<SubTrack[]> => {
    const out: SubTrack[] = [];
    for (const [key, val] of Object.entries(params)) {
      if (typeof val === 'string' && (key.startsWith('hls') || val.includes('.m3u8'))) {
        out.push(...(await parseM3u8SubtitleTracks(val)));
      }
    }
    return out;
  };

  const getNetworkSubtitleUrls = (): string[] => {
    const w = window as { __vkSubtitleUrls?: string[] };
    const urls = [...(w.__vkSubtitleUrls ?? [])];
    try {
      const perf = performance.getEntriesByType('resource');
      for (const e of perf) {
        const name = (e as PerformanceResourceTiming).name;
        if (/okcdn\.ru|subId=|subtitle|\.vtt|\.srt/i.test(name)) urls.push(name);
      }
    } catch {
      /* ignore */
    }
    return urls.filter((u, i, a) => a.indexOf(u) === i);
  };

  const parsePlayerParamsJson = (text: string): Record<string, unknown> | null => {
    const m = text.match(/var\s+playerParams\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:\n|var\s)/);
    if (!m) return null;
    try {
      return JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseAlVideoPayload = (text: string): Record<string, unknown> | null => {
    try {
      const root = JSON.parse(text) as unknown;
      const fromPayload = extractParamsFromPayloadRoot(root);
      if (fromPayload) return fromPayload;
    } catch {
      /* ignore */
    }
    return parsePlayerParamsJson(text);
  };

  const fetchVkAlVideo = async (videoKey: string): Promise<SubTrack[]> => {
    const body = new URLSearchParams({ act: 'show', al: '1', video: videoKey });
    const hosts = ['https://vk.com/al_video.php', 'https://vkvideo.ru/al_video.php'];
    for (const endpoint of hosts) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: window.location.href,
          },
          body: body.toString(),
        });
        if (!res.ok) continue;
        const text = await res.text();
        const params = parseAlVideoPayload(text);
        if (!params) continue;
        const tracks = subsFromPlayerParams(params);
        if (tracks.length) return tracks;
        const hlsTracks = await subsFromHlsInParams(params);
        if (hlsTracks.length) return hlsTracks;
      } catch {
        /* next host */
      }
    }
    return [];
  };

  const fetchVideoExtParams = async (videoKey: string): Promise<Record<string, unknown> | null> => {
    const m = videoKey.match(/(-?\d+)_(\d+)/);
    if (!m) return null;
    const oid = m[1];
    const id = m[2];
    // 1) Look for a structured iframe/link that already contains video_ext URL.
    let hash: string | undefined;
    const linkSelectors = ['iframe[src*="video_ext.php"]', 'a[href*="video_ext.php"]'];
    for (const sel of linkSelectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      const href = el?.getAttribute('src') ?? el?.getAttribute('href');
      if (!href) continue;
      try {
        const u = new URL(href, location.href);
        if (u.searchParams.get('oid') === oid && u.searchParams.get('id') === id) {
          const h = u.searchParams.get('hash');
          if (h && /^[a-f0-9]+$/i.test(h)) {
            hash = h;
            break;
          }
        }
      } catch {
        /* malformed href — ignore */
      }
    }
    // 2) Fallback: scan inline scripts (non-HTML JS payload — regex appropriate).
    if (!hash) {
      const re = new RegExp(
        `video_ext\\.php[^"']*oid=${oid}[^"']*id=${id}[^"']*hash=([a-f0-9]+)`,
        'i',
      );
      const looseRe = /hash=([a-f0-9]{8,})/i;
      const scripts = document.querySelectorAll('script');
      for (let i = 0; i < scripts.length && !hash; i++) {
        const t = scripts[i].textContent ?? '';
        hash = t.match(re)?.[1] ?? t.match(looseRe)?.[1];
      }
    }
    const url = hash
      ? `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hash=${hash}`
      : `https://vk.com/video_ext.php?oid=${oid}&id=${id}`;
    try {
      const res = await fetch(url, { credentials: 'include', headers: { Referer: location.href } });
      if (!res.ok) return null;
      return parsePlayerParamsJson(await res.text());
    } catch {
      return null;
    }
  };

  const collectAllTracks = async (): Promise<SubTrack[]> => {
    const merged: SubTrack[] = [];
    const add = (list: SubTrack[]) => {
      for (const t of list) {
        if (!merged.some((x) => x.url === t.url)) merged.push(t);
      }
    };
    const safe = async (fn: () => Promise<SubTrack[]>) => {
      try {
        add(await fn());
      } catch {
        /* отдельный источник не критичен */
      }
    };

    // `var playerParams = {...}` lives inside inline <script> bodies (a JS
    // payload, not HTML) — iterate scripts and parse each body in turn rather
    // than regexing the whole document HTML string.
    const scripts = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const body = scripts[i].textContent;
      if (!body || !body.includes('playerParams')) continue;
      const inline = parsePlayerParamsJson(body);
      if (!inline) continue;
      add(subsFromPlayerParams(inline));
      await safe(() => subsFromHlsInParams(inline));
      break;
    }

    await safe(() => fetchVkAlVideo(videoId));

    await safe(async () => {
      const ext = await fetchVideoExtParams(videoId);
      if (!ext) return [];
      add(subsFromPlayerParams(ext));
      return subsFromHlsInParams(ext);
    });

    add(
      getNetworkSubtitleUrls().map((url) => ({
        url,
        lang: url.match(/(ru|en|uk)/i)?.[1] ?? 'ru',
      })),
    );

    add(
      scrapeUrlsFromDom().map((url) => ({
        url,
        lang: url.match(/(ru|en|uk)/i)?.[1] ?? 'ru',
      })),
    );

    return merged;
  };

  const scrapeUrlsFromDom = (): string[] => {
    const urls: string[] = [];
    const patterns = [
      /https?:\/\/vkvd\d+\.okcdn\.ru\/[^"'\s\\]+/gi,
      /https?:\\?\/\\?\/vkvd\d+\\.okcdn\\.ru\\?\/[^"'\s\\]+/gi,
      /https?:\/\/[^"'\s\\]+\.vtt/gi,
      /https?:\/\/[^"'\s\\]+\.srt/gi,
      /"(https?:[^"]*subId=[^"]+)"/gi,
    ];
    const sample = (text: string) => {
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const url = (m[1] ?? m[0]).replace(/\\\//g, '/').replace(/\\u0026/g, '&');
          if (url.startsWith('http') && !urls.includes(url)) urls.push(url);
        }
      }
    };
    // Inline <script> bodies hold JSON-encoded URLs (not HTML — regex is correct).
    document.querySelectorAll('script').forEach((s) => {
      const t = s.textContent;
      if (t) sample(t);
    });
    // URL-bearing attributes are read via the structured DOM, not by regex on HTML.
    document.querySelectorAll('[src], [href], [data-src]').forEach((node) => {
      const el = node as Element;
      for (const attr of ['src', 'href', 'data-src']) {
        const v = el.getAttribute(attr);
        if (v) sample(v);
      }
    });
    return urls;
  };

  const tryClickVkCc = () => {
    const selectors = [
      '[class*="subtitle" i]',
      '[class*="Subtitles" i]',
      '[data-testid*="subtitle" i]',
      'button[aria-label*="убтитр" i]',
      '.videoplayer_subtitles_btn',
      '.VideoPlayerSubtitlesButton',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        el.click();
        return true;
      }
    }
    return false;
  };

  const readTextTrackCues = async () => {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    const videos = Array.from(document.querySelectorAll('video'));
    for (const v of videos) {
      const tracks = v.textTracks;
      if (!tracks?.length) continue;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.kind === 'metadata') continue;
        track.mode = 'hidden';
        await new Promise<void>((resolve) => {
          if (track.cues?.length) {
            resolve();
            return;
          }
          track.addEventListener('load', () => resolve(), { once: true });
          setTimeout(resolve, 2000);
        });
        const cues = track.cues;
        if (!cues) continue;
        for (let j = 0; j < cues.length; j++) {
          const cue = cues[j];
          if (!cue) continue;
          const t = (cue as VTTCue).text?.replace(/\n/g, ' ').trim();
          if (!t) continue;
          segments.push({
            start: cue.startTime,
            end: Math.max(cue.endTime, cue.startTime + 0.1),
            text: decodeHtml(t),
          });
        }
      }
    }
    segments.sort((a, b) => a.start - b.start);
    return segments;
  };

  try {
    let tracks = await collectAllTracks();

    if (!tracks.length) {
      tryClickVkCc();
      await new Promise((r) => setTimeout(r, 800));
      tracks = await collectAllTracks();
    }

    if (tracks.length) {
      return {
        segments: [],
        tracks,
        language: pickTrack(tracks)?.lang ?? 'ru',
        title,
        durationSec,
      };
    }

    const cues = await readTextTrackCues();
    if (cues.length) {
      return {
        segments: cues,
        language: preferLang || 'ru',
        title,
        durationSec,
      };
    }

    return {
      segments: [],
      language: 'ru',
      title,
      durationSec,
      error:
        'VK не отдал файл субтитров (возможны только вшитые в кадр). Обновите страницу (F5), включите «Субтитры» в плеере, подождите 5 с и повторите.',
    };
  } catch (e) {
    return {
      segments: [],
      language: 'ru',
      title,
      durationSec,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function fetchCaptionsInPage(
  videoId: string,
  languageCode: string,
  baseUrl: string,
  kind?: string,
): Promise<Array<{ start: number; end: number; text: string }>> {
  const decodeHtml = (text: string) =>
    text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');

  const parseXmlRaw = (xml: string) => {
    const out: Array<{ start: number; end: number; text: string }> = [];
    const pRe = /<p\b[^>]*\bt="(\d+)"[^>]*\bd="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let m: RegExpExecArray | null;
    while ((m = pRe.exec(xml)) !== null) {
      const text = decodeHtml(m[3].replace(/<[^>]+>/g, '').trim());
      if (!text) continue;
      const start = parseInt(m[1], 10) / 1000;
      const end = start + parseInt(m[2], 10) / 1000;
      out.push({ start, end: Math.max(end, start + 0.1), text });
    }
    if (out.length > 0) return out;
    const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    while ((m = textRe.exec(xml)) !== null) {
      const attrs = m[1];
      const start = parseFloat(attrs.match(/\bstart="([^"]+)"/)?.[1] ?? '0');
      const dur = parseFloat(attrs.match(/\bdur="([^"]+)"/)?.[1] ?? '0');
      const text = decodeHtml(m[2].replace(/<[^>]+>/g, '').trim());
      if (text) out.push({ start, end: start + (dur || 0.1), text });
    }
    return out;
  };

  const fetchUrl = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    const raw = await res.text();
    if (!raw.trim()) return [];
    if (raw.trimStart().startsWith('{')) {
      try {
        const data = JSON.parse(raw) as {
          events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }>;
        };
        const segs: Array<{ start: number; end: number; text: string }> = [];
        for (const ev of data.events ?? []) {
          if (!ev.segs) continue;
          const text = ev.segs
            .map((s) => s.utf8 ?? '')
            .join('')
            .replace(/\n/g, ' ')
            .trim();
          if (!text) continue;
          const start = (ev.tStartMs ?? 0) / 1000;
          const end = start + (ev.dDurationMs ?? 0) / 1000;
          segs.push({ start, end: Math.max(end, start + 0.1), text: decodeHtml(text) });
        }
        return segs;
      } catch {
        return [];
      }
    }
    if (raw.includes('<text') || raw.includes('<p ')) return parseXmlRaw(raw);
    return [];
  };

  const lang = languageCode.split('-')[0] || 'en';
  const urls: string[] = [];
  if (baseUrl) {
    const clean = baseUrl.replace(/\\u0026/g, '&').replace(/&fmt=\w+/g, '');
    const sep = clean.includes('?') ? '&' : '?';
    urls.push(clean, `${clean}${sep}fmt=json3`, `${clean}${sep}fmt=srv3`);
  }
  const manual = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`;
  urls.push(manual, `${manual}&fmt=json3`);

  for (const url of urls) {
    try {
      const segs = await fetchUrl(url);
      if (segs.length > 0) return segs;
    } catch {
      /* next */
    }
  }
  throw new Error('Не удалось загрузить субтитры');
}

/**
 * Read the timedtext URL captured by yt-net-hook.ts. If none yet, programmatically
 * click the player's CC button so the player issues its own (POT-signed) timedtext
 * request, wait briefly, then re-read the store.
 *
 * Returns the most recent timedtext URL, or null if the player never fetched one
 * (video genuinely has no captions, or the player hasn't loaded yet).
 */
export async function getCapturedTimedtextUrlInPage(
  preferLang: string,
): Promise<string | null> {
  const w = window as unknown as { __ytTimedtextUrls?: string[] };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const pickBestForLang = (urls: string[]): string | null => {
    if (!urls.length) return null;
    const lang = (preferLang || '').toLowerCase().split('-')[0];
    if (!lang || lang === 'auto') return urls[urls.length - 1];
    const exact = [...urls].reverse().find((u) => {
      try {
        const p = new URL(u).searchParams;
        return (p.get('lang') ?? '').toLowerCase().startsWith(lang);
      } catch {
        return false;
      }
    });
    if (exact) return exact;
    const tlang = [...urls].reverse().find((u) => {
      try {
        const p = new URL(u).searchParams;
        return (p.get('tlang') ?? '').toLowerCase().startsWith(lang);
      } catch {
        return false;
      }
    });
    return tlang ?? urls[urls.length - 1];
  };

  if (w.__ytTimedtextUrls && w.__ytTimedtextUrls.length > 0) {
    return pickBestForLang(w.__ytTimedtextUrls);
  }

  /** Trigger the player to load captions: enable subtitles, then nudge the time slider. */
  const ccBtn = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
  const video = document.querySelector<HTMLVideoElement>('video');
  let toggled = false;
  if (ccBtn && ccBtn.getAttribute('aria-pressed') !== 'true') {
    ccBtn.click();
    toggled = true;
  }
  if (video) {
    /** Seek a tiny amount to force the player to re-evaluate the active caption track. */
    try {
      const t = video.currentTime;
      video.currentTime = Math.max(0, t + 0.01);
    } catch {
      /* read-only — ignore */
    }
  }

  for (let i = 0; i < 12; i++) {
    await wait(250);
    if (w.__ytTimedtextUrls && w.__ytTimedtextUrls.length > 0) {
      const url = pickBestForLang(w.__ytTimedtextUrls);
      if (toggled && ccBtn) {
        /** Restore the user's CC preference. */
        try {
          ccBtn.click();
        } catch {
          /* not critical */
        }
      }
      return url;
    }
  }

  if (toggled && ccBtn) {
    try {
      ccBtn.click();
    } catch {
      /* not critical */
    }
  }
  return null;
}

/** Перевод через Google (в контексте страницы — без CORS extension://). */
export async function translateTextsInPage(
  texts: string[],
  targetLang: string,
  sourceLang: string,
  pageUrl?: string,
): Promise<string[]> {
  const SEP = '\u2063';
  const BATCH = 'https://translate.googleapis.com/translate_a/t';
  const SINGLE = 'https://translate.googleapis.com/translate_a/single';
  const CHUNK = 12;
  const referer =
    pageUrl && !pageUrl.startsWith('chrome') ? pageUrl : window.location.href || 'https://www.youtube.com/';

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    Referer: referer,
  };

  function isBlocked(res: Response): boolean {
    return (
      !res.ok ||
      res.url.includes('google.com/sorry') ||
      res.url.includes('/sorry/') ||
      (res.redirected && res.url.includes('google.com') && !res.url.includes('translate.googleapis.com'))
    );
  }

  function extractSingle(data: unknown): string {
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Неверный ответ перевода');
    }
    return (data[0] as unknown[])
      .filter((p): p is [string, ...unknown[]] => Array.isArray(p) && typeof p[0] === 'string')
      .map((p) => p[0])
      .join('');
  }

  async function translateChunk(chunk: string[]): Promise<string[]> {
    const body = new URLSearchParams();
    body.set('client', 'gtx');
    body.set('sl', sourceLang || 'auto');
    body.set('tl', targetLang);
    body.set('dt', 't');
    for (const t of chunk) body.append('q', t);

    try {
      const res = await fetch(BATCH, { method: 'POST', headers, body });
      if (!isBlocked(res)) {
        const data: unknown = await res.json();
        if (
          Array.isArray(data) &&
          data.length === chunk.length &&
          data.every((x) => typeof x === 'string')
        ) {
          return data as string[];
        }
      }
    } catch {
      /* fallback */
    }

    const joined = chunk.join(SEP);
    const url = new URL(SINGLE);
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', sourceLang || 'auto');
    url.searchParams.set('tl', targetLang);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', joined);
    const res = await fetch(url.toString(), { headers: { Referer: referer } });
    if (isBlocked(res)) {
      throw new Error('Google Translate rate limit');
    }
    const parts = extractSingle(await res.json()).split(SEP);
    if (parts.length === chunk.length) return parts;

    const out: string[] = [];
    for (const text of chunk) {
      const u = new URL(SINGLE);
      u.searchParams.set('client', 'gtx');
      u.searchParams.set('sl', sourceLang || 'auto');
      u.searchParams.set('tl', targetLang);
      u.searchParams.set('dt', 't');
      u.searchParams.set('q', text);
      const r = await fetch(u.toString(), { headers: { Referer: referer } });
      if (isBlocked(r)) {
        throw new Error('Google Translate rate limit');
      }
      out.push(extractSingle(await r.json()));
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  const result: string[] = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    result.push(...(await translateChunk(texts.slice(i, i + CHUNK))));
    if (i + CHUNK < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return result;
}
