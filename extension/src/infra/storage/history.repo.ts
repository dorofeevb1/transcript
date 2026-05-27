import { getUiLocale, t } from '../../shared/i18n';
import type { TranscriptResult, VideoPlatform } from '../../domain/types';

export const HISTORY_KEY = 'history:index';
const MAX_HISTORY = 50;

function transcriptKey(platform: VideoPlatform, videoId: string): string {
  return `transcript:${platform}:${videoId}`;
}

function translationKey(platform: VideoPlatform, videoId: string, lang: string): string {
  return `translation:${platform}:${videoId}:${lang}`;
}

export interface HistoryEntry {
  platform: VideoPlatform;
  videoId: string;
  title?: string;
  savedAt: string;
  source: TranscriptResult['source'];
  language?: string;
  translatedTo?: string;
  durationSec: number;
  segmentCount: number;
  translateEngine?: string;
}

export function entryFromResult(result: TranscriptResult): HistoryEntry {
  const platform = result.platform ?? 'youtube';
  return {
    platform,
    videoId: result.videoId,
    title: result.title,
    savedAt: new Date().toISOString(),
    source: result.source,
    language: result.language,
    translatedTo: result.translatedTo,
    durationSec: result.durationSec,
    segmentCount: result.segments.length,
    translateEngine: result.translateEngine,
  };
}

function entryKey(entry: HistoryEntry): string {
  return `${entry.platform}:${entry.videoId}`;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const list = (data[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
  return list.map((e) => ({ ...e, platform: e.platform ?? 'youtube' }));
}

export async function upsertHistoryEntry(result: TranscriptResult): Promise<void> {
  const entry = entryFromResult(result);
  let list = await getHistory();
  const key = entryKey(entry);
  list = list.filter((e) => entryKey(e) !== key);
  list.unshift(entry);
  if (list.length > MAX_HISTORY) {
    list = list.slice(0, MAX_HISTORY);
  }
  await chrome.storage.local.set({ [HISTORY_KEY]: list });
}

export async function loadHistoryTranscript(
  platform: VideoPlatform,
  videoId: string,
): Promise<TranscriptResult | null> {
  const entry = (await getHistory()).find(
    (e) => e.platform === platform && e.videoId === videoId,
  );
  if (entry?.translatedTo) {
    const tKey = translationKey(platform, videoId, entry.translatedTo);
    const tData = await chrome.storage.local.get(tKey);
    const translated = tData[tKey] as TranscriptResult | undefined;
    if (translated) return { ...translated, fromCache: true };
  }
  const key = transcriptKey(platform, videoId);
  const data = await chrome.storage.local.get(key);
  const cached = data[key] as TranscriptResult | undefined;
  if (cached) return { ...cached, fromCache: true };

  if (platform === 'youtube') {
    const legacyKey = `transcript:${videoId}`;
    const legacy = await chrome.storage.local.get(legacyKey);
    const old = legacy[legacyKey] as TranscriptResult | undefined;
    return old ? { ...old, fromCache: true } : null;
  }
  return null;
}

export async function clearAllHistory(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all ?? {}).filter(
    (k) =>
      k === HISTORY_KEY ||
      k.startsWith('transcript:') ||
      k.startsWith('translation:'),
  );
  if (keys.length) {
    await chrome.storage.local.remove(keys);
  }
}

export function formatHistoryLabel(entry: HistoryEntry): string {
  const platformTag =
    entry.platform === 'youtube'
      ? ''
      : entry.platform === 'rutube'
        ? t('historyRutube')
        : t('historyVk');
  const title = `${platformTag}${entry.title?.trim() || entry.videoId}`;
  const mins = String(Math.ceil(entry.durationSec / 60));
  const lang = entry.translatedTo ?? entry.language ?? '—';
  const when = new Date(entry.savedAt).toLocaleString(getUiLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return t('historyLabel', [when, title, mins, lang]);
}
