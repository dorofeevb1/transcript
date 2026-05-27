/**
 * VK platform adapter.
 *
 * Subtitle URLs are populated into `window.__vkSubtitleUrls` by the MAIN-world
 * net hook (`src/content/vk-net-hook.ts`). The actual track resolution is done
 * in-page by `fetchVkCaptionsInPage`; this adapter just hands off to the
 * existing `fetchVkCaptionsViaTab` orchestrator.
 *
 * The MAIN-world hook itself lives under `src/content/` because the manifest
 * loader wires it into `world: 'MAIN'`. Moving it would break that wiring.
 */

import { parseVideoRef } from '../../shared/url-parser';
import { fetchVkCaptionsViaTab } from '../captions/vk';
import type {
  Platform,
  PlatformCaptionsResult,
  PlatformPageCtx,
} from '../../domain/platform';

/**
 * VK `Platform` adapter.
 *
 * Reads subtitle URLs captured by the MAIN-world net hook
 * (`src/content/vk-net-hook.ts`) and downloads the track in-page.
 *
 * @throws `CANCELLED` when the abort signal fires.
 */
export const vkPlatform: Platform = {
  id: 'vk',
  matches(url) {
    const host = url.hostname.replace(/^www\./, '');
    return host === 'vk.com' || host === 'vkvideo.ru' || host.endsWith('.vk.com');
  },
  getVideoId(url) {
    return parseVideoRef(url.toString())?.platform === 'vk'
      ? (parseVideoRef(url.toString())?.videoId ?? null)
      : null;
  },
  async fetchCaptions(
    ctx: PlatformPageCtx,
    signal: AbortSignal,
  ): Promise<PlatformCaptionsResult> {
    if (signal.aborted) throw new Error('CANCELLED');
    const vk = await fetchVkCaptionsViaTab(
      ctx.tabId,
      ctx.videoId,
      ctx.options.captionLanguage,
    );
    return {
      segments: vk.segments,
      language: vk.language,
      title: vk.title ?? ctx.pageInfo?.title,
      durationSec: vk.durationSec || ctx.pageInfo?.durationSec || 0,
    };
  },
};
