/**
 * `getTranscript` — fetch captions for a video, with cancellation support.
 *
 * Routes platform-specific caption logic through `Platform` adapters (one per
 * host). The single `AbortController` is owned by the caller (background SW),
 * which surfaces it on `CANCEL_STT`-style messages.
 */

import { buildTranscriptResult } from '../../shared/build-result';
import { upsertHistoryEntry } from '../../infra/storage/history.repo';
import { getPlatform } from '../../infra/platform';
import {
  cacheTranscript,
  getCachedTranscript,
  getOptions,
} from '../../infra/chrome/storage';
import type {
  ExtensionOptions,
  TranscriptResult,
  VideoPageInfo,
  VideoPlatform,
} from '../../domain/types';

/**
 * Input for the `getTranscript` use case.
 *
 * @property platform - One of `'youtube' | 'rutube' | 'vk'`.
 * @property tabId - Chrome tab ID hosting the video page.
 * @property videoId - Platform-specific video ID.
 * @property pageInfo - Snapshot collected by the content script (title,
 *   duration, caption tracks). `null` when the content script could not
 *   reach the player.
 * @property force - When `true`, skip cache and refetch.
 * @property options - User options. Loaded from storage when omitted.
 * @property signal - Abort signal owned by the caller (SW message handler).
 */
export interface GetTranscriptInput {
  platform: VideoPlatform;
  tabId: number;
  videoId: string;
  pageInfo: VideoPageInfo | null;
  force: boolean;
  options?: ExtensionOptions;
  signal: AbortSignal;
}

/**
 * Fetch captions for a video and cache the result.
 *
 * On cache hit, the existing entry is returned (with `fromCache: true`) and
 * the history list updated. On cache miss, the platform adapter is invoked
 * and the new result is persisted.
 *
 * @param input - Platform, tab, video, options, abort signal.
 * @returns The `TranscriptResult` ready for the popup to render.
 * @throws `CANCELLED` when `signal` fires.
 * @throws `NO_CAPTIONS` (and platform-specific codes) when the adapter cannot
 *   produce captions.
 */
export async function getTranscript(
  input: GetTranscriptInput,
): Promise<TranscriptResult> {
  if (!input.force) {
    const cached = await getCachedTranscript(input.platform, input.videoId);
    if (cached && cached.source === 'captions') {
      const fromCache = { ...cached, fromCache: true };
      await upsertHistoryEntry(fromCache);
      return fromCache;
    }
  }

  if (input.signal.aborted) throw new Error('CANCELLED');

  const options = input.options ?? (await getOptions());
  const adapter = getPlatform(input.platform);
  const captions = await adapter.fetchCaptions(
    {
      tabId: input.tabId,
      videoId: input.videoId,
      pageInfo: input.pageInfo,
      options,
    },
    input.signal,
  );

  if (input.signal.aborted) throw new Error('CANCELLED');

  const result = buildTranscriptResult({
    platform: input.platform,
    videoId: input.videoId,
    title: captions.title ?? input.pageInfo?.title,
    durationSec:
      captions.durationSec ??
      input.pageInfo?.durationSec ??
      captions.segments[captions.segments.length - 1]?.end ??
      0,
    source: 'captions',
    language: captions.language,
    segments: captions.segments,
    options,
  });

  await cacheTranscript(result);
  return result;
}
