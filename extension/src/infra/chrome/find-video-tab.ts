import { parseVideoRef } from '../../shared/url-parser';
import type { VideoPlatform } from '../../domain/types';

const PLATFORM_TAB_URLS: Record<VideoPlatform, string[]> = {
  youtube: ['*://www.youtube.com/*', '*://youtube.com/*', '*://youtu.be/*'],
  rutube: ['*://rutube.ru/*', '*://*.rutube.ru/*'],
  vk: ['*://vk.com/*', '*://*.vk.com/*', '*://vkvideo.ru/*'],
};

/** Вкладка с нужным видео (popup часто не на видео-вкладке). */
export async function findVideoTabId(
  platform: VideoPlatform,
  videoId: string,
): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const ref = parseVideoRef(tab.url);
    if (ref?.platform === platform && ref.videoId === videoId) {
      return tab.id;
    }
  }
  return undefined;
}

/**
 * Вкладка для перевода через Google (запросы только из контекста страницы, не extension://).
 * 1) точное совпадение videoId  2) активная вкладка  3) любая вкладка платформы.
 */
export async function resolveTranslateTabId(
  platform: VideoPlatform,
  videoId: string,
): Promise<number | undefined> {
  const exact = await findVideoTabId(platform, videoId);
  if (exact != null) return exact;

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id && active.url) {
    const ref = parseVideoRef(active.url);
    if (ref?.platform === platform && ref.videoId === videoId) {
      return active.id;
    }
  }

  try {
    const onPlatform = await chrome.tabs.query({ url: PLATFORM_TAB_URLS[platform] });
    for (const tab of onPlatform) {
      if (!tab.id || !tab.url) continue;
      const ref = parseVideoRef(tab.url);
      if (ref?.platform === platform && ref.videoId === videoId) {
        return tab.id;
      }
    }
    return onPlatform.find((t) => t.id != null)?.id;
  } catch {
    return undefined;
  }
}
