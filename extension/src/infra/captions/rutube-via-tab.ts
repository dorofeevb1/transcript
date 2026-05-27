import { fetchRutubeCaptionsInPage } from '../../content/inject-page';
import { withTimeout } from '../chrome/script-timeout';
import type { ExtensionOptions } from '../../domain/types';

const RUTUBE_SCRIPT_TIMEOUT_MS = 25_000;

/** Загрузка субтитров Rutube в контексте страницы (cookies, приватные видео ?p=). */
export async function fetchRutubeCaptionsViaTab(
  tabId: number,
  videoId: string,
  preferLang: ExtensionOptions['captionLanguage'],
): Promise<{
  segments: import('../../domain/types').Segment[];
  language: string;
  title?: string;
  durationSec: number;
}> {
  const [result] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: fetchRutubeCaptionsInPage,
      args: [videoId, preferLang],
    }),
    RUTUBE_SCRIPT_TIMEOUT_MS,
    'Загрузка субтитров Rutube',
  );
  const data = result?.result as
    | {
        segments?: import('../../domain/types').Segment[];
        language?: string;
        title?: string;
        durationSec?: number;
        error?: string;
      }
    | undefined;

  if (data?.error) throw new Error(data.error);
  if (!data?.segments?.length) {
    throw new Error(
      'У этого видео Rutube нет субтитров. Включите автосубтитры в плеере или нажмите «Из аудио».',
    );
  }
  return {
    segments: data.segments,
    language: data.language ?? 'ru',
    title: data.title,
    durationSec: data.durationSec ?? 0,
  };
}
