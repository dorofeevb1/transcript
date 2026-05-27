/**
 * YouTube platform adapter.
 *
 * Caption fetch strategy (in order):
 *   1. The timedtext URL the player itself just used (captured by `yt-net-hook.ts`,
 *      auto-triggered by toggling CC if not yet seen). Works without YouTube cookies.
 *   2. Innertube `player` endpoint with the WEB client (fails when Google adds POT).
 *   3. Caption tracks discovered on the page via `executeScript` (also affected by POT).
 *   4. Whisper-server captions fallback (only if `serverUrl` configured).
 */

import { fetchCaptionsViaInnertube, getInnertubeApiKeyFromTab } from '../captions/innertube';
import { logger } from '../../shared/logger';
import { parseVideoRef } from '../../shared/url-parser';
import { fetchCaptionsViaWhisperServer } from '../captions/whisper-server';
import {
  fetchCapturedTimedtextOnTab,
  fetchCaptionsOnTab,
} from '../chrome/tab-messaging';
import type { Segment } from '../../domain/types';
import type {
  Platform,
  PlatformCaptionsResult,
  PlatformPageCtx,
} from '../../domain/platform';

/**
 * YouTube `Platform` adapter.
 *
 * `fetchCaptions` tries Innertube first, then optional Whisper-server captions,
 * then on-page caption track URLs. Each step is gated on `signal.aborted`.
 *
 * @throws `LIVE_CAPTIONS_UNSUPPORTED` for live streams.
 * @throws `CANCELLED` when the abort signal fires.
 * @throws Aggregated error string when every fallback fails.
 */
export const youtubePlatform: Platform = {
  id: 'youtube',
  matches(url) {
    const host = url.hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  },
  getVideoId(url) {
    return parseVideoRef(url.toString())?.platform === 'youtube'
      ? (parseVideoRef(url.toString())?.videoId ?? null)
      : null;
  },
  async fetchCaptions(
    ctx: PlatformPageCtx,
    signal: AbortSignal,
  ): Promise<PlatformCaptionsResult> {
    if (ctx.pageInfo?.isLive) {
      throw new Error('LIVE_CAPTIONS_UNSUPPORTED');
    }

    const errors: string[] = [];
    let segments: Segment[] = [];
    let language = '';

    const apply = (segs: Segment[], lang: string) => {
      segments = segs;
      language = lang;
    };

    if (signal.aborted) throw new Error('CANCELLED');

    /** Step 1: re-use the timedtext URL the player itself used (yt-net-hook). */
    try {
      const captured = await fetchCapturedTimedtextOnTab(
        ctx.tabId,
        ctx.options.captionLanguage,
      );
      if (captured) apply(captured.segments, captured.language);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    /** Step 2: page-state captionTracks (works on videos that ship clean baseUrls). */
    if (
      segments.length === 0 &&
      ctx.pageInfo &&
      ctx.pageInfo.captionTracks.length > 0 &&
      !signal.aborted
    ) {
      try {
        const fromPage = await fetchCaptionsOnTab(
          ctx.tabId,
          ctx.videoId,
          ctx.pageInfo.captionTracks,
          ctx.options.captionLanguage,
        );
        apply(fromPage.segments, fromPage.language);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    /** Step 3: Innertube via service worker (often 403; kept as cheap legacy fallback). */
    if (segments.length === 0 && !signal.aborted) {
      try {
        const apiKey = await getInnertubeApiKeyFromTab(ctx.tabId);
        if (signal.aborted) throw new Error('CANCELLED');
        const innertube = await fetchCaptionsViaInnertube(
          ctx.videoId,
          apiKey,
          ctx.options.captionLanguage,
        );
        apply(innertube.segments, innertube.language);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    /** Step 4: whisper-server (only if user explicitly configured one). */
    if (segments.length === 0 && !signal.aborted && ctx.options.serverUrl) {
      try {
        const fromServer = await fetchCaptionsViaWhisperServer(
          ctx.options.serverUrl,
          ctx.videoId,
          ctx.options.captionLanguage,
        );
        apply(fromServer.segments, fromServer.language);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (segments.length === 0) {
      logger.warn('youtube caption errors:', errors.join(' → '));
      throw new Error(errors.join(' → ') || 'NO_CAPTIONS');
    }

    return {
      segments,
      language,
      title: ctx.pageInfo?.title,
      durationSec:
        ctx.pageInfo?.durationSec ?? segments[segments.length - 1]?.end ?? 0,
    };
  },
};
