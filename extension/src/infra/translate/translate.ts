import { normalizeRollingSubtitlesIfNeeded } from '../captions/caption-normalize';
import { buildTranscriptResult } from '../../shared/build-result';
import {
  LARGE_SEGMENT_THRESHOLD,
  translateTranscriptByMinutes,
} from './by-minute';
import { translateTexts, type TranslateFetchOptions, type TranslateProgressFn } from './texts';
import type { ExtensionOptions, Segment, TranscriptResult } from '../../domain/types';

export { extractGtxText, parseBatchPostResponse } from './gtx';
export { dedupeTexts } from './dedupe';
export { LARGE_SEGMENT_THRESHOLD } from './by-minute';
export { translateTexts, type TranslateFetchOptions, type TranslateProgressFn } from './texts';

function sourceLangCode(result: TranscriptResult): string {
  const lang = result.originalLanguage ?? result.language;
  if (!lang || lang === 'auto') return 'auto';
  return lang.split('-')[0] || 'auto';
}

export async function translateTranscript(
  result: TranscriptResult,
  targetLang: string,
  options: ExtensionOptions,
  onProgress?: TranslateProgressFn,
  fetchOpts: TranslateFetchOptions = {},
): Promise<TranscriptResult> {
  const originals = normalizeRollingSubtitlesIfNeeded(
    result.originalSegments ?? result.segments,
  );

  if (!targetLang) {
    if (!result.originalSegments) return result;
    return buildTranscriptResult({
      videoId: result.videoId,
      title: result.title,
      durationSec: result.durationSec,
      source: result.source,
      language: result.originalLanguage ?? result.language,
      segments: result.originalSegments,
      options,
      fromCache: result.fromCache,
    });
  }

  const sl = sourceLangCode(result);
  const tl = targetLang.split('-')[0];
  if (sl !== 'auto' && sl === tl && !result.originalSegments) {
    return result;
  }

  const opts = {
    serverUrl: fetchOpts.serverUrl ?? options.serverUrl,
    tabId: fetchOpts.tabId,
  };

  if (originals.length > LARGE_SEGMENT_THRESHOLD) {
    return translateTranscriptByMinutes(
      result,
      targetLang,
      options,
      sl,
      onProgress,
      opts,
    );
  }

  const texts = originals.map((s) => s.text);
  const translated = await translateTexts(texts, targetLang, sl, onProgress, opts);
  const segments: Segment[] = originals.map((seg, i) => ({
    ...seg,
    text: translated[i] ?? seg.text,
  }));

  const built = buildTranscriptResult({
    videoId: result.videoId,
    title: result.title,
    durationSec: result.durationSec,
    source: result.source,
    language: targetLang,
    segments,
    options,
    fromCache: false,
  });

  return {
    ...built,
    originalSegments: result.originalSegments ?? result.segments,
    originalLanguage: result.originalLanguage ?? result.language,
    translatedTo: targetLang,
  };
}
