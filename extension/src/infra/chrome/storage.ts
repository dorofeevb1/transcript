import { upsertHistoryEntry } from '../storage/history.repo';
import type { ExtensionOptions, TranscriptResult, VideoPlatform } from '../../domain/types';
import { DEFAULT_OPTIONS } from '../../domain/types';

const OPTIONS_KEY = 'options';

function transcriptKey(platform: VideoPlatform, videoId: string): string {
  return `transcript:${platform}:${videoId}`;
}

function translationKey(platform: VideoPlatform, videoId: string, lang: string): string {
  return `translation:${platform}:${videoId}:${lang}`;
}

export async function getOptions(): Promise<ExtensionOptions> {
  const data = await chrome.storage.local.get(OPTIONS_KEY);
  return { ...DEFAULT_OPTIONS, ...(data[OPTIONS_KEY] as ExtensionOptions | undefined) };
}

export async function setOptions(options: ExtensionOptions): Promise<void> {
  await chrome.storage.local.set({ [OPTIONS_KEY]: options });
}

export async function getCachedTranscript(
  platform: VideoPlatform,
  videoId: string,
): Promise<TranscriptResult | null> {
  const key = transcriptKey(platform, videoId);
  const data = await chrome.storage.local.get(key);
  const hit = data[key] as TranscriptResult | undefined;
  if (hit) return hit;

  if (platform === 'youtube') {
    const legacyKey = `transcript:${videoId}`;
    const legacy = await chrome.storage.local.get(legacyKey);
    return (legacy[legacyKey] as TranscriptResult | undefined) ?? null;
  }
  return null;
}

export async function cacheTranscript(result: TranscriptResult): Promise<void> {
  const platform = result.platform ?? 'youtube';
  const payload = { ...result, platform };
  await chrome.storage.local.set({ [transcriptKey(platform, result.videoId)]: payload });
  await upsertHistoryEntry(payload);
}

export async function getCachedTranslation(
  platform: VideoPlatform,
  videoId: string,
  targetLang: string,
): Promise<TranscriptResult | null> {
  const key = translationKey(platform, videoId, targetLang);
  const data = await chrome.storage.local.get(key);
  const hit = data[key] as TranscriptResult | undefined;
  if (hit) return hit;

  if (platform === 'youtube') {
    const legacyKey = `translation:${videoId}:${targetLang}`;
    const legacy = await chrome.storage.local.get(legacyKey);
    return (legacy[legacyKey] as TranscriptResult | undefined) ?? null;
  }
  return null;
}

export async function cacheTranslation(result: TranscriptResult, targetLang: string): Promise<void> {
  const platform = result.platform ?? 'youtube';
  const payload = { ...result, platform };
  await chrome.storage.local.set({
    [translationKey(platform, result.videoId, targetLang)]: payload,
  });
  await upsertHistoryEntry(payload);
}
