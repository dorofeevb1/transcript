import { describe, expect, it } from 'vitest';
import {
  looksLikeRollingCaptions,
  normalizeRollingSubtitles,
  normalizeRollingSubtitlesIfNeeded,
} from '../caption-normalize';

describe('looksLikeRollingCaptions', () => {
  it('detects cumulative cues', () => {
    const segs = [
      { start: 0, end: 1, text: 'A' },
      { start: 1, end: 2, text: 'A B' },
      { start: 2, end: 3, text: 'A B C' },
      { start: 3, end: 4, text: 'A B C D' },
    ];
    expect(looksLikeRollingCaptions(segs)).toBe(true);
  });

  it('skips independent phrase subtitles', () => {
    const segs = [
      { start: 0, end: 1, text: 'Hello there' },
      { start: 1, end: 2, text: 'Goodbye now' },
      { start: 2, end: 3, text: 'Another line' },
      { start: 3, end: 4, text: 'Fourth line' },
    ];
    expect(looksLikeRollingCaptions(segs)).toBe(false);
    expect(normalizeRollingSubtitlesIfNeeded(segs)).toEqual(segs);
  });
});

describe('normalizeRollingSubtitles', () => {
  it('unwraps cumulative VK-style cues', () => {
    const segments = normalizeRollingSubtitles([
      { start: 248, end: 249, text: 'что она здесь делает, простите, сэр,' },
      {
        start: 248,
        end: 250,
        text: 'что она здесь делает, простите, сэр,  Шейла, я поклялся, что никогда',
      },
      { start: 251, end: 252, text: 'Шейла, я поклялся, что никогда' },
      {
        start: 251,
        end: 254,
        text: 'Шейла, я поклялся, что никогда  больше не увижу эту подлую девчонку.',
      },
    ]);

    expect(segments.map((s) => s.text)).toEqual([
      'что она здесь делает, простите, сэр,',
      'Шейла, я поклялся, что никогда',
      'больше не увижу эту подлую девчонку.',
    ]);
  });
});
