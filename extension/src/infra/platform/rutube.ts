/**
 * Rutube platform adapter.
 *
 * Captions live behind `play/options`. We first ask the page (cookies, private
 * video query param) and fall back to a SW-side fetch on failure.
 */

import { parseVideoRef } from '../../shared/url-parser';
import { fetchRutubeCaptions } from '../captions/rutube';
import { fetchRutubeCaptionsViaTab } from '../captions/rutube-via-tab';
import type {
  Platform,
  PlatformCaptionsResult,
  PlatformPageCtx,
} from '../../domain/platform';

/**
 * Rutube `Platform` adapter.
 *
 * Calls `play/options` from the tab first (cookies, `?p=` private-video token)
 * and falls back to a SW-side fetch on failure.
 *
 * @throws `CANCELLED` when the abort signal fires.
 */
export const rutubePlatform: Platform = {
  id: 'rutube',
  matches(url) {
    const host = url.hostname.replace(/^www\./, '');
    return host === 'rutube.ru' || host.endsWith('.rutube.ru');
  },
  getVideoId(url) {
    return parseVideoRef(url.toString())?.platform === 'rutube'
      ? (parseVideoRef(url.toString())?.videoId ?? null)
      : null;
  },
  async fetchCaptions(
    ctx: PlatformPageCtx,
    signal: AbortSignal,
  ): Promise<PlatformCaptionsResult> {
    if (signal.aborted) throw new Error('CANCELLED');

    let tabUrl: string | undefined;
    try {
      const tab = await chrome.tabs.get(ctx.tabId);
      tabUrl = tab.url;
    } catch {
      tabUrl = undefined;
    }

    let rutube;
    try {
      rutube = await fetchRutubeCaptionsViaTab(
        ctx.tabId,
        ctx.videoId,
        ctx.options.captionLanguage,
      );
    } catch {
      if (signal.aborted) throw new Error('CANCELLED');
      rutube = await fetchRutubeCaptions(ctx.videoId, ctx.options.captionLanguage, tabUrl);
    }

    return {
      segments: rutube.segments,
      language: rutube.language,
      title: rutube.title ?? ctx.pageInfo?.title,
      durationSec: rutube.durationSec || ctx.pageInfo?.durationSec || 0,
    };
  },
};
