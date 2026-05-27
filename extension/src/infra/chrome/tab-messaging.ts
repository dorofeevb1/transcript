import {
  fetchCaptionsInPage,
  getCapturedTimedtextUrlInPage,
  getPageInfoInPage,
} from '../../content/inject-page';
import type { CaptionTrack, VideoPageInfo, VideoPlatform } from '../../domain/types';
import { pickCaptionTrack } from '../captions/youtube-helpers';

const MAIN: chrome.scripting.ExecutionWorld = 'MAIN';

export async function getPageInfoFromTab(
  tabId: number,
  fallbackVideoId?: string,
  fallbackPlatform: VideoPlatform = 'youtube',
): Promise<VideoPageInfo> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: MAIN,
        func: getPageInfoInPage,
      });
      const data = result?.result;
      if (data && (data.videoId || data.error)) {
        if (data.error) throw new Error(data.error);
        if (!data.videoId) throw new Error('Не удалось определить videoId');
        return data as VideoPageInfo;
      }
    } catch (e) {
      if (attempt === 2) {
        if (fallbackVideoId) {
          return {
            platform: fallbackPlatform,
            videoId: fallbackVideoId,
            durationSec: 0,
            captionTracks: [],
          };
        }
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Страница видео: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (fallbackVideoId) {
    return {
      platform: fallbackPlatform,
      videoId: fallbackVideoId,
      durationSec: 0,
      captionTracks: [],
    };
  }
  throw new Error('Страница видео: пустой ответ со страницы');
}

export async function fetchCaptionsOnTab(
  tabId: number,
  videoId: string,
  tracks: CaptionTrack[],
  preferLang: 'ru' | 'en' | 'auto',
): Promise<{ segments: import('../../domain/types').Segment[]; language: string }> {
  const track = pickCaptionTrack(tracks, preferLang);
  if (!track) throw new Error('У этого видео нет субтитров');

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: MAIN,
    func: fetchCaptionsInPage,
    args: [videoId, track.languageCode, track.baseUrl, track.kind ?? ''],
  });
  const segments = result?.result ?? [];
  if (!segments.length) throw new Error('Субтитры пустые');
  return { segments, language: track.languageCode };
}

/**
 * Ask the page (MAIN world) for the timedtext URL its own player just used.
 * Works around POT-signed baseUrls that anonymous visitors can't replay themselves —
 * the URL captured by `yt-net-hook.ts` is already POT/cookie-signed by the player.
 */
export async function fetchCapturedTimedtextOnTab(
  tabId: number,
  preferLang: 'ru' | 'en' | 'auto',
): Promise<{ segments: import('../../domain/types').Segment[]; language: string } | null> {
  let url: string | null = null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: MAIN,
      func: getCapturedTimedtextUrlInPage,
      args: [preferLang],
    });
    url = (result?.result as string | null) ?? null;
  } catch {
    return null;
  }
  if (!url) return null;

  const [parsed] = await chrome.scripting.executeScript({
    target: { tabId },
    world: MAIN,
    func: fetchCaptionsInPage,
    args: ['', '', url, ''],
  });
  const segments = parsed?.result ?? [];
  if (!segments.length) return null;
  let lang = preferLang === 'auto' ? '' : preferLang;
  try {
    const p = new URL(url).searchParams;
    lang = p.get('lang') || p.get('tlang') || lang || '';
  } catch {
    /* keep fallback */
  }
  return { segments, language: lang };
}
