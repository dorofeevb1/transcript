import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolveRutubeTracks } from '../rutube';

describe('resolveRutubeTracks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads captions from play/options when subtitles API is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/play/options/')) {
          return {
            ok: true,
            json: async () => ({
              captions: [
                {
                  code: 'ru',
                  file: 'https://cdn.example/sub.srt',
                  langTitle: 'Русский • Авто',
                },
              ],
            }),
          };
        }
        if (url.includes('/subtitles/')) {
          return { ok: false };
        }
        return { ok: false };
      }),
    );

    const tracks = await resolveRutubeTracks('c65b465ad0c98c89f3b25cb03dcc87c6');
    expect(tracks).toHaveLength(1);
    expect(tracks[0].code).toBe('ru');
    expect(tracks[0].file).toContain('.srt');
  });
});
