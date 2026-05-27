import { describe, expect, it } from 'vitest';
import { entryFromResult, formatHistoryLabel } from '../history.repo';
import type { TranscriptResult } from '../../../domain/types';

const sample: TranscriptResult = {
  platform: 'youtube',
  videoId: 'abc123',
  title: 'Test Video',
  durationSec: 125,
  source: 'captions',
  language: 'en',
  segments: [{ start: 0, end: 1, text: 'hi' }],
  byMinute: [{ start: 0, end: 60, text: 'hi' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  translatedTo: 'ru',
};

describe('history', () => {
  it('builds entry from result', () => {
    const e = entryFromResult(sample);
    expect(e.videoId).toBe('abc123');
    expect(e.title).toBe('Test Video');
    expect(e.translatedTo).toBe('ru');
    expect(e.segmentCount).toBe(1);
  });

  it('formats label', () => {
    const e = entryFromResult(sample);
    expect(formatHistoryLabel(e)).toContain('Test Video');
    expect(formatHistoryLabel(e)).toContain('ru');
  });
});
