import type { Segment } from '../domain/types';

export function segmentOverlapsBlock(seg: Segment, blockStart: number, blockEnd: number): boolean {
  return seg.end > blockStart && seg.start < blockEnd;
}
