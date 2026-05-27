import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCaptionsViaInnertube = vi.fn();
const getInnertubeApiKeyFromTab = vi.fn();
const fetchCaptionsViaWhisperServer = vi.fn();
const fetchCaptionsOnTab = vi.fn();
const fetchCapturedTimedtextOnTab = vi.fn();

vi.mock('../../captions/innertube', () => ({
  fetchCaptionsViaInnertube: (...args: unknown[]) => fetchCaptionsViaInnertube(...args),
  getInnertubeApiKeyFromTab: (...args: unknown[]) => getInnertubeApiKeyFromTab(...args),
}));
vi.mock('../../captions/whisper-server', () => ({
  fetchCaptionsViaWhisperServer: (...args: unknown[]) => fetchCaptionsViaWhisperServer(...args),
}));
vi.mock('../../chrome/tab-messaging', () => ({
  fetchCaptionsOnTab: (...args: unknown[]) => fetchCaptionsOnTab(...args),
  fetchCapturedTimedtextOnTab: (...args: unknown[]) => fetchCapturedTimedtextOnTab(...args),
}));

import { youtubePlatform } from '../youtube';
import { DEFAULT_OPTIONS } from '../../../domain/types';

const ctx = (overrides: Partial<Parameters<typeof youtubePlatform.fetchCaptions>[0]> = {}) => ({
  tabId: 1,
  videoId: 'abc',
  pageInfo: {
    videoId: 'abc',
    title: 'Title',
    durationSec: 60,
    captionTracks: [],
  },
  options: { ...DEFAULT_OPTIONS },
  ...overrides,
});

describe('youtubePlatform.matches/getVideoId', () => {
  it('matches youtube hosts', () => {
    expect(youtubePlatform.matches(new URL('https://www.youtube.com/watch?v=x'))).toBe(true);
    expect(youtubePlatform.matches(new URL('https://m.youtube.com/watch?v=x'))).toBe(true);
    expect(youtubePlatform.matches(new URL('https://youtu.be/x'))).toBe(true);
    expect(youtubePlatform.matches(new URL('https://example.com/'))).toBe(false);
  });

  it('extracts videoId', () => {
    expect(youtubePlatform.getVideoId(new URL('https://www.youtube.com/watch?v=abc'))).toBe('abc');
    expect(youtubePlatform.getVideoId(new URL('https://vimeo.com/123'))).toBeNull();
  });
});

describe('youtubePlatform.fetchCaptions', () => {
  beforeEach(() => {
    fetchCaptionsViaInnertube.mockReset();
    getInnertubeApiKeyFromTab.mockReset().mockResolvedValue('innertube-key');
    fetchCaptionsViaWhisperServer.mockReset();
    fetchCaptionsOnTab.mockReset();
    fetchCapturedTimedtextOnTab.mockReset().mockResolvedValue(null);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('throws LIVE_CAPTIONS_UNSUPPORTED when stream is live', async () => {
    await expect(
      youtubePlatform.fetchCaptions(
        ctx({ pageInfo: { videoId: 'x', durationSec: 0, captionTracks: [], isLive: true } }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('LIVE_CAPTIONS_UNSUPPORTED');
  });

  it('uses Innertube when available', async () => {
    fetchCaptionsViaInnertube.mockResolvedValueOnce({
      segments: [{ start: 0, end: 1, text: 'hi' }],
      language: 'en',
      tracks: [],
    });
    const out = await youtubePlatform.fetchCaptions(ctx(), new AbortController().signal);
    expect(out.segments.length).toBe(1);
    expect(out.language).toBe('en');
    expect(fetchCaptionsViaWhisperServer).not.toHaveBeenCalled();
  });

  it('falls through to Whisper when Innertube fails', async () => {
    fetchCaptionsViaInnertube.mockRejectedValueOnce(new Error('NO_TRACK'));
    fetchCaptionsViaWhisperServer.mockResolvedValueOnce({
      segments: [{ start: 0, end: 1, text: 'whisper' }],
      language: 'ru',
    });
    const out = await youtubePlatform.fetchCaptions(ctx(), new AbortController().signal);
    expect(out.segments[0].text).toBe('whisper');
  });

  it('falls through to page tracks when both fail', async () => {
    fetchCaptionsViaInnertube.mockRejectedValueOnce(new Error('x'));
    fetchCaptionsViaWhisperServer.mockRejectedValueOnce(new Error('y'));
    fetchCaptionsOnTab.mockResolvedValueOnce({
      segments: [{ start: 0, end: 1, text: 'page' }],
      language: 'en',
    });
    const out = await youtubePlatform.fetchCaptions(
      ctx({
        pageInfo: {
          videoId: 'abc',
          durationSec: 0,
          captionTracks: [{ baseUrl: 'u', languageCode: 'en' }],
        },
      }),
      new AbortController().signal,
    );
    expect(out.segments[0].text).toBe('page');
  });

  it('throws aggregated error when all fail', async () => {
    fetchCaptionsViaInnertube.mockRejectedValueOnce(new Error('e1'));
    fetchCaptionsViaWhisperServer.mockRejectedValueOnce(new Error('e2'));
    await expect(
      youtubePlatform.fetchCaptions(ctx(), new AbortController().signal),
    ).rejects.toThrow(/e1/);
  });

  it('respects abort signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      youtubePlatform.fetchCaptions(ctx(), ctrl.signal),
    ).rejects.toThrow('CANCELLED');
  });
});
