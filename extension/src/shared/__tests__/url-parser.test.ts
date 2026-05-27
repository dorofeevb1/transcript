import { describe, expect, it } from 'vitest';
import { isVideoPageUrl, parseVideoRef } from '../url-parser';

describe('parseVideoRef', () => {
  it('parses youtube watch', () => {
    expect(parseVideoRef('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      platform: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('parses rutube', () => {
    const id = 'a8de4e6e-7c8f-9b0e-1d2c-3b4a5f6e7d8a';
    expect(parseVideoRef(`https://rutube.ru/video/${id}/`)).toEqual({
      platform: 'rutube',
      videoId: id,
    });
  });

  it('parses vk', () => {
    expect(parseVideoRef('https://vk.com/video-123456_789')).toEqual({
      platform: 'vk',
      videoId: '-123456_789',
    });
  });

  it('detects video pages', () => {
    expect(isVideoPageUrl('https://vkvideo.ru/video-1_2')).toBe(true);
    expect(isVideoPageUrl('https://example.com/')).toBe(false);
  });
});
