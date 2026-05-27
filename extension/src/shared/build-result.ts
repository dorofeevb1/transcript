import { normalizeRollingSubtitlesIfNeeded } from '../infra/captions/caption-normalize';
import { segmentsToMinutes } from './segmenter';
import type { ExtensionOptions, Segment, TranscriptResult, VideoPlatform } from '../domain/types';

export function buildTranscriptResult(params: {
  platform?: VideoPlatform;
  videoId: string;
  title?: string;
  durationSec: number;
  source: TranscriptResult['source'];
  language?: string;
  segments: Segment[];
  options: ExtensionOptions;
  fromCache?: boolean;
}): TranscriptResult {
  const { platform = 'youtube', videoId, title, durationSec, source, language, options, fromCache } =
    params;
  const segments = normalizeRollingSubtitlesIfNeeded(params.segments);
  const lastEnd = segments.length ? segments[segments.length - 1].end : 0;
  const dur = Math.max(durationSec, lastEnd);

  return {
    platform,
    videoId,
    title,
    durationSec: dur,
    source,
    language,
    segments,
    byMinute: segmentsToMinutes(
      segments,
      dur,
      options.blockSizeSec,
      options.markSilentMinutes,
    ),
    createdAt: new Date().toISOString(),
    fromCache,
  };
}
