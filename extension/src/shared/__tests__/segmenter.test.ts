import { describe, expect, it } from 'vitest';
import { formatTime, segmentsToMinutes } from '../segmenter';

describe('segmenter', () => {
  it('formatTime formats mm:ss', () => {
    expect(formatTime(125)).toBe('02:05');
  });

  it('formatTime formats hh:mm:ss', () => {
    expect(formatTime(3661)).toBe('01:01:01');
  });

  it('segmentsToMinutes groups by 60s blocks', () => {
    const segments = [
      { start: 5, end: 10, text: 'hello' },
      { start: 65, end: 70, text: 'world' },
    ];
    const blocks = segmentsToMinutes(segments, 120, 60, false);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toContain('hello');
    expect(blocks[1].text).toContain('world');
  });

  it('markSilentMinutes adds [тишина]', () => {
    const blocks = segmentsToMinutes([], 120, 60, true);
    expect(blocks[0].text).toBe('[тишина]');
  });
});
