import { parseVideoRef } from '../../shared/url-parser';
import type { CaptionTrack, VideoPageInfo } from '../../domain/types';

export {
  parseVideoRef,
  isVideoPageUrl,
  platformLabel,
  storageVideoKey,
} from '../../shared/url-parser';

export function parseVideoId(url: string): string | null {
  return parseVideoRef(url)?.videoId ?? null;
}

interface PlayerResponse {
  videoDetails?: {
    title?: string;
    lengthSeconds?: string;
    isLiveContent?: boolean;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl: string;
        languageCode: string;
        name?: { simpleText?: string };
        kind?: string;
      }>;
    };
  };
}

export function extractPlayerResponse(): PlayerResponse | null {
  const win = window as unknown as { ytInitialPlayerResponse?: PlayerResponse };
  if (win.ytInitialPlayerResponse) return win.ytInitialPlayerResponse;

  const scripts = Array.from(document.querySelectorAll('script'));
  for (const script of scripts) {
    const text = script.textContent;
    if (!text?.includes('ytInitialPlayerResponse')) continue;
    const marker = 'ytInitialPlayerResponse';
    const idx = text.indexOf(marker);
    if (idx === -1) continue;
    const start = text.indexOf('{', idx);
    if (start === -1) continue;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1)) as PlayerResponse;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

export function getVideoPageInfo(): VideoPageInfo | null {
  const videoId = parseVideoId(window.location.href);
  if (!videoId) return null;

  const player = extractPlayerResponse();
  const video = document.querySelector('video.html5-main-video') as HTMLVideoElement | null;

  let durationSec = video?.duration && Number.isFinite(video.duration) ? video.duration : 0;
  let title: string | undefined;
  let isLive = false;
  let captionTracks: CaptionTrack[] = [];

  if (player?.videoDetails) {
    title = player.videoDetails.title;
    isLive = Boolean(player.videoDetails.isLiveContent);
    const len = parseInt(player.videoDetails.lengthSeconds ?? '0', 10);
    if (len > 0) durationSec = len;
  }

  const rawTracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  captionTracks = rawTracks.map((t) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    name: t.name,
    kind: t.kind,
  }));

  if (!title) {
    const h1 = document.querySelector('h1.ytd-video-primary-info-renderer, h1 yt-formatted-string');
    title = h1?.textContent?.trim() ?? undefined;
  }

  return { platform: 'youtube', videoId, title, durationSec, captionTracks, isLive };
}

export function pickCaptionTrack(
  tracks: CaptionTrack[],
  prefer: 'ru' | 'en' | 'auto',
): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const asr = (t: CaptionTrack) => t.kind === 'asr';
  const manual = (t: CaptionTrack) => t.kind !== 'asr';

  const byLang = (code: string) =>
    tracks.find((t) => t.languageCode === code || t.languageCode.startsWith(`${code}-`));

  if (prefer === 'ru') {
    return byLang('ru') ?? tracks.find(manual) ?? tracks.find(asr) ?? tracks[0];
  }
  if (prefer === 'en') {
    return byLang('en') ?? tracks.find(manual) ?? tracks.find(asr) ?? tracks[0];
  }
  return byLang('ru') ?? byLang('en') ?? tracks.find(manual) ?? tracks.find(asr) ?? tracks[0];
}
