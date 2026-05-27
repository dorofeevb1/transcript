import { describe, expect, it } from 'vitest';
import { parseVttOrSrt } from '../captions';

describe('parseVttOrSrt', () => {
  it('parses SRT from Rutube (comma timestamps)', () => {
    const srt = `1
00:00:00,160 --> 00:00:01,520
Привет, мир.

2
00:00:01,679 --> 00:00:03,680
Вторая фраза.`;
    const segs = parseVttOrSrt(srt);
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe('Привет, мир.');
    expect(segs[0].start).toBeCloseTo(0.16, 2);
    expect(segs[1].text).toBe('Вторая фраза.');
  });

  it('parses WEBVTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;
    const segs = parseVttOrSrt(vtt);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('Hello');
  });
});
