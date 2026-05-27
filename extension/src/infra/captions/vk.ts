import { parseVttOrSrt } from './captions';
import { fetchVkCaptionsInPage } from '../../content/inject-page';
import { fetchRemoteText } from './fetch-remote-text';
import { withTimeout } from '../chrome/script-timeout';
import type { ExtensionOptions, Segment } from '../../domain/types';

const VK_SCRIPT_TIMEOUT_MS = 30_000;

function pickVkTrack(
  tracks: Array<{ url: string; lang: string }>,
  prefer: ExtensionOptions['captionLanguage'],
): { url: string; lang: string } | null {
  if (!tracks.length) return null;
  const code = (t: { lang: string }) => t.lang.split(/[._-]/)[0].toLowerCase();
  if (prefer === 'ru') return tracks.find((t) => code(t) === 'ru') ?? tracks[0];
  if (prefer === 'en') return tracks.find((t) => code(t) === 'en') ?? tracks[0];
  return tracks.find((t) => code(t) === 'ru') ?? tracks.find((t) => code(t) === 'en') ?? tracks[0];
}

export async function fetchVkCaptionsViaTab(
  tabId: number,
  videoId: string,
  preferLang: ExtensionOptions['captionLanguage'],
): Promise<{
  segments: Segment[];
  language: string;
  title?: string;
  durationSec: number;
}> {
  const [result] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: fetchVkCaptionsInPage,
      args: [videoId, preferLang],
    }),
    VK_SCRIPT_TIMEOUT_MS,
    'Загрузка субтитров VK',
  );
  const data = result?.result as
    | {
        segments?: Segment[];
        tracks?: Array<{ url: string; lang: string }>;
        language?: string;
        title?: string;
        durationSec?: number;
        error?: string;
      }
    | undefined;

  if (data?.error) throw new Error(data.error);

  if (data?.segments?.length) {
    return {
      segments: data.segments,
      language: data.language ?? preferLang ?? 'ru',
      title: data.title,
      durationSec: data.durationSec ?? 0,
    };
  }

  const tracks = data?.tracks ?? [];
  if (!tracks.length) {
    throw new Error('У этого видео VK нет субтитров или не удалось их извлечь');
  }

  const picked = pickVkTrack(tracks, preferLang);
  const ordered = [
    ...(picked ? [picked] : []),
    ...tracks.filter((t) => !picked || t.url !== picked.url),
  ];

  let referer = 'https://vk.com/';
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url?.includes('vkvideo.ru')) referer = 'https://vkvideo.ru/';
  } catch {
    /* default vk.com */
  }
  let lastError = '';
  for (const track of ordered) {
    try {
      const raw = await fetchRemoteText(track.url, referer);
      const segments = parseVttOrSrt(raw);
      if (!segments.length) {
        lastError = 'файл субтитров пустой';
        continue;
      }
      const lang = track.lang.match(/(ru|en|uk)/i)?.[1] ?? preferLang ?? 'ru';
      return {
        segments,
        language: lang.toLowerCase(),
        title: data?.title,
        durationSec: data?.durationSec ?? 0,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(
    lastError ||
      'Не удалось загрузить файл субтитров VK. Обновите страницу (F5) и повторите.',
  );
}
