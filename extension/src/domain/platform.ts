import type {
  ExtensionOptions,
  Segment,
  VideoPageInfo,
  VideoPlatform,
} from './types';

export type PlatformId = VideoPlatform;

/** Architecture-doc alias for the page context passed to a Platform adapter. */
export interface PageCtx {
  tabId: number;
  url: URL;
}

/** Architecture-doc alias for the captions result returned by a Platform adapter. */
export interface Transcript {
  segments: Array<{ start: number; end: number; text: string }>;
  lang: string;
  source: 'captions' | 'stt';
}

/**
 * Concrete page-context shape used by the in-repo adapters (richer than the
 * architecture-doc `PageCtx`, kept for backward compatibility with existing
 * callers in `app/use-cases` and `background/service-worker`).
 */
export interface PlatformPageCtx {
  tabId: number;
  videoId: string;
  pageInfo: VideoPageInfo | null;
  options: ExtensionOptions;
}

export interface PlatformCaptionsResult {
  segments: Segment[];
  language: string;
  title?: string;
  durationSec?: number;
}

/**
 * Platform adapter contract — one implementation per supported video host.
 *
 * Concrete implementations live in `infra/platform/{youtube,rutube,vk}.ts`.
 * The pipeline picks one by URL match and delegates caption fetching to it.
 */
export interface Platform {
  readonly id: PlatformId;
  /** URL-based matcher. Used by the router. */
  matches(url: URL): boolean;
  /** Pure id extractor — returns null when the URL is a section page, not a video. */
  getVideoId(url: URL): string | null;
  /**
   * Fetch captions. Implementations should honour `signal.aborted` and throw
   * `Error('CANCELLED')` (or whatever AbortError surfaces) when cancelled.
   */
  fetchCaptions(
    ctx: PlatformPageCtx,
    signal: AbortSignal,
  ): Promise<PlatformCaptionsResult>;
}
