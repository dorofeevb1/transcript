import type { Segment } from '../../domain/types';

/** Накопительные субтитры (VK): следующая строка содержит предыдущую. */
export function looksLikeRollingCaptions(segments: Segment[]): boolean {
  if (segments.length < 4) return false;
  let rolling = 0;
  let pairs = 0;
  const sample = Math.min(segments.length, 120);
  for (let i = 1; i < sample; i++) {
    const a = cleanText(segments[i - 1].text);
    const b = cleanText(segments[i].text);
    if (!a || !b) continue;
    pairs++;
    if (b.startsWith(a) || a.startsWith(b)) rolling++;
  }
  return pairs >= 2 && rolling / pairs >= 0.4;
}

export function normalizeRollingSubtitlesIfNeeded(segments: Segment[]): Segment[] {
  if (!looksLikeRollingCaptions(segments)) return segments;
  return normalizeRollingSubtitles(segments);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Наибольший суффикс A, совпадающий с префиксом B (для стыковки rolling-субтитров). */
export function longestSuffixPrefixOverlap(a: string, b: string, minLen = 8): string {
  const max = Math.min(a.length, b.length);
  for (let len = max; len >= minLen; len--) {
    const suffix = a.slice(-len);
    if (b.startsWith(suffix)) return suffix;
  }
  return '';
}

/**
 * Убирает «накопительные» дубли (типично VK/плеер): каждая следующая фраза
 * содержит предыдущую целиком — оставляем только новую часть.
 */
export function normalizeRollingSubtitles(segments: Segment[]): Segment[] {
  if (segments.length < 2) return segments;

  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Segment[] = [];
  let carry = '';

  for (const seg of sorted) {
    const raw = cleanText(seg.text);
    if (!raw) continue;

    let text = raw;

    if (carry) {
      if (text === carry) continue;

      if (text.startsWith(carry)) {
        text = cleanText(text.slice(carry.length).replace(/^[\s,.;:!?—–-]+/, ''));
      } else if (carry.startsWith(text)) {
        continue;
      } else {
        const overlap = longestSuffixPrefixOverlap(carry, text);
        if (overlap) {
          text = cleanText(text.slice(overlap.length).replace(/^[\s,.;:!?—–-]+/, ''));
        }
      }
    }

    if (!text) {
      carry = raw;
      continue;
    }

    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.start - seg.start) < 0.08 &&
      (prev.text === text || prev.text.startsWith(text) || text.startsWith(prev.text))
    ) {
      if (text.length > prev.text.length) {
        prev.text = text;
        prev.end = Math.max(prev.end, seg.end);
      }
      carry = raw;
      continue;
    }

    out.push({
      start: seg.start,
      end: Math.max(seg.end, seg.start + 0.1),
      text,
    });
    carry = raw;
  }

  return out;
}
