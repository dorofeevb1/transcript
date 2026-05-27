/**
 * E2E: реальный запрос к YouTube Innertube (нужен интернет).
 * Запуск: npm run test:e2e
 */
import { describe, expect, it } from 'vitest';
import { parseCaptionXml } from '../src/lib/innertube';

const TEST_VIDEO_ID = 'jNQXAC9IVRw'; // Me at the zoo
const INNERTUBE_CONTEXT = {
  client: { clientName: 'ANDROID', clientVersion: '20.10.38' },
};

async function fetchInnertubeCaptions(videoId: string) {
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const html = await watchRes.text();
  const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!keyMatch) throw new Error('INNERTUBE_API_KEY not found');

  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(keyMatch[1])}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38',
      },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
    },
  );

  const raw = await playerRes.text();
  if (!raw.trim()) throw new Error('Empty innertube response');
  const data = JSON.parse(raw) as {
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: Array<{ baseUrl: string; languageCode: string }>;
      };
    };
  };

  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) throw new Error('No caption tracks');

  const en =
    tracks.find((t) => t.languageCode.startsWith('en')) ?? tracks[0];
  const capRes = await fetch(en.baseUrl.replace(/\\u0026/g, '&'), {
    headers: { 'User-Agent': 'com.google.android.youtube/20.10.38' },
  });
  const xml = await capRes.text();
  return parseCaptionXml(xml);
}

describe('YouTube captions E2E', () => {
  it('loads English subtitles for Me at the zoo', async () => {
    const segments = await fetchInnertubeCaptions(TEST_VIDEO_ID);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].text.length).toBeGreaterThan(0);
    expect(segments.some((s) => s.text.toLowerCase().includes('elephant'))).toBe(true);
  }, 30000);
});
