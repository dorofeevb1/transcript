import type { MinuteBlock, Segment } from '../domain/types';
import { segmentOverlapsBlock } from './segmenter-minute-utils';

export { segmentOverlapsBlock };

/** Формат HH:MM:SS */
export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function segmentsToMinutes(
  segments: Segment[],
  durationSec: number,
  blockSizeSec = 60,
  markSilent = false,
): MinuteBlock[] {
  const totalBlocks = Math.max(1, Math.ceil(durationSec / blockSizeSec));
  const blocks: MinuteBlock[] = [];

  for (let i = 0; i < totalBlocks; i++) {
    const start = i * blockSizeSec;
    const end = Math.min((i + 1) * blockSizeSec, durationSec);
    const parts: string[] = [];

    for (const seg of segments) {
      if (!segmentOverlapsBlock(seg, start, end)) continue;
      const t = seg.text.trim();
      if (!t) continue;
      const last = parts[parts.length - 1];
      if (last) {
        if (last === t) continue;
        if (t.startsWith(last) && t.length > last.length) {
          parts[parts.length - 1] = t;
          continue;
        }
        if (last.startsWith(t)) continue;
      }
      parts.push(t);
    }

    let text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!text && markSilent) {
      text = '[тишина]';
    }

    blocks.push({ start, end, text });
  }

  return blocks;
}
