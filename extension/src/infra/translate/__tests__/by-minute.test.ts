import { describe, expect, it } from 'vitest';
import { packMinuteBlocks, splitProportional } from '../by-minute';

describe('packMinuteBlocks', () => {
  it('groups by char limit', () => {
    const texts = Array.from({ length: 10 }, (_, i) => `line ${i} `.repeat(50));
    const packs = packMinuteBlocks(texts, 600, 5);
    expect(packs.length).toBeGreaterThan(1);
    expect(packs.flat().length).toBe(10);
  });
});

describe('splitProportional', () => {
  it('splits words by length ratio', () => {
    const out = splitProportional(['Hello', 'World test'], 'Привет мир тест');
    expect(out[0]).toBe('Привет');
    expect(out[1]).toContain('мир');
  });
});
