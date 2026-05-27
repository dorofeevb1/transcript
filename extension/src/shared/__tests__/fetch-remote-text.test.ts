import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRemoteText } from '../../infra/captions/fetch-remote-text';

describe('fetchRemoteText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns response body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi'),
      }),
    );
    const text = await fetchRemoteText('https://vd.okcdn.ru/foo.vtt');
    expect(text).toContain('WEBVTT');
    expect(fetch).toHaveBeenCalledWith(
      'https://vd.okcdn.ru/foo.vtt',
      expect.objectContaining({
        headers: expect.objectContaining({ Referer: 'https://vk.com/' }),
      }),
    );
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(fetchRemoteText('https://example.com/x.vtt')).rejects.toThrow(/HTTP 403/);
  });
});
