import { runPool } from '../../shared/async-pool';
import { normalizeRollingSubtitlesIfNeeded } from '../captions/caption-normalize';
import { segmentsToMinutes } from '../../shared/segmenter';
import { dedupeTexts } from './dedupe';
import { translateTexts, type TranslateFetchOptions, type TranslateProgressFn } from './texts';
import type { ExtensionOptions, Segment, TranscriptResult } from '../../domain/types';
import { buildTranscriptResult } from '../../shared/build-result';

/** Выше порога — перевод по минутным блокам (сотни запросов вместо тысяч). */
export const LARGE_SEGMENT_THRESHOLD = 200;

/** Склеивает минутные блоки в пакеты по лимиту символов (меньше HTTP-запросов). */
export function packMinuteBlocks(
  texts: string[],
  maxChars: number,
  maxItems: number,
): string[][] {
  const packs: string[][] = [];
  let batch: string[] = [];
  let chars = 0;

  for (const text of texts) {
    const len = text.length;
    if (
      batch.length > 0 &&
      (batch.length >= maxItems || (chars + len > maxChars && batch.length > 0))
    ) {
      packs.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(text);
    chars += len;
  }
  if (batch.length) packs.push(batch);
  return packs;
}

/** Делит перевод блока между фразами пропорционально длине оригинала. */
export function splitProportional(parts: string[], translated: string): string[] {
  if (!parts.length) return [];
  const words = translated.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return parts.map(() => '');

  const lengths = parts.map((p) => Math.max(1, p.trim().length));
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  let wordIdx = 0;

  return parts.map((part, i) => {
    if (!part.trim()) return '';
    const isLast = i === parts.length - 1;
    const count = isLast
      ? words.length - wordIdx
      : Math.max(1, Math.round((lengths[i] / totalLen) * words.length));
    const slice = words.slice(wordIdx, wordIdx + count);
    wordIdx += count;
    return slice.join(' ');
  });
}

export async function translateSegmentsByMinutes(
  originals: Segment[],
  durationSec: number,
  targetLang: string,
  sourceLang: string,
  options: ExtensionOptions,
  onProgress?: TranslateProgressFn,
  fetchOpts: TranslateFetchOptions = {},
): Promise<Segment[]> {
  const blocks = segmentsToMinutes(
    originals,
    durationSec,
    options.blockSizeSec,
    options.markSilentMinutes,
  );

  const blockTexts = blocks.map((b) => b.text.trim());
  const toTranslate = blockTexts.filter((t) => t && t !== '[тишина]');
  /** Одинаковые блоки (повторяющиеся интро/паузы) — один запрос на всех. */
  const { unique: uniqueBlocks, mapIndex } = dedupeTexts(toTranslate);
  const total = uniqueBlocks.length;
  onProgress?.(0, total || 1);

  const useServer = Boolean(fetchOpts.serverUrl);
  /** Пакеты умеренного размера + параллель (без 429 от Google). */
  const packs = packMinuteBlocks(
    uniqueBlocks,
    useServer ? 10_000 : 18_000,
    useServer ? 18 : 24,
  );
  const minuteFetchOpts: TranslateFetchOptions = {
    ...fetchOpts,
    chunkSize: useServer ? 24 : 12,
    parallel: useServer ? 6 : 4,
  };
  const packParallel = useServer ? 4 : 3;

  let doneMinutes = 0;
  const packResults = await runPool(packs, packParallel, async (pack) => {
    const part = await translateTexts(
      pack,
      targetLang,
      sourceLang,
      (done) => onProgress?.(Math.min(doneMinutes + done, total), total),
      minuteFetchOpts,
    );
    doneMinutes += pack.length;
    onProgress?.(Math.min(doneMinutes, total), total);
    return part;
  });
  const translatedUnique = packResults.flat();
  const translatedDense = mapIndex.map((idx) => translatedUnique[idx] ?? '');

  let ti = 0;
  const translatedByBlock = blockTexts.map((t) => {
    if (!t || t === '[тишина]') return t;
    return translatedDense[ti++] ?? t;
  });

  /** Один блок = вся минута целиком (не дробим на 30–50 коротких строк). */
  return blocks
    .map((block, bi) => {
      const text = (translatedByBlock[bi] ?? '').trim();
      if (!text || text === '[тишина]') return null;
      return {
        start: block.start,
        end: block.end,
        text,
      };
    })
    .filter((s): s is Segment => s != null);
}

export async function translateTranscriptByMinutes(
  result: TranscriptResult,
  targetLang: string,
  options: ExtensionOptions,
  sourceLang: string,
  onProgress?: TranslateProgressFn,
  fetchOpts: TranslateFetchOptions = {},
): Promise<TranscriptResult> {
  const originals = normalizeRollingSubtitlesIfNeeded(
    result.originalSegments ?? result.segments,
  );
  const segments = await translateSegmentsByMinutes(
    originals,
    result.durationSec,
    targetLang,
    sourceLang,
    options,
    onProgress,
    fetchOpts,
  );

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
    translatedByMinutes: true,
  };
}
