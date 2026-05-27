import { describe, expect, it, vi } from 'vitest';
import { dedupeTexts } from '../dedupe';
import { extractGtxText, parseBatchPostResponse } from '../gtx';
import { translateTexts } from '../texts';

const SEP = '\u2063';

describe('parseBatchPostResponse', () => {
  it('accepts string array', () => {
    expect(parseBatchPostResponse(['A', 'B'], 2)).toEqual(['A', 'B']);
  });

  it('rejects wrong length', () => {
    expect(parseBatchPostResponse(['A'], 2)).toBeNull();
  });
});

describe('dedupeTexts', () => {
  it('maps duplicates to same index', () => {
    const { unique, mapIndex } = dedupeTexts(['a', 'b', 'a', 'c', 'b']);
    expect(unique).toEqual(['a', 'b', 'c']);
    expect(mapIndex).toEqual([0, 1, 0, 2, 1]);
  });
});

describe('extractGtxText', () => {
  it('joins word fragments for one sentence', () => {
    const data = [
      [
        ['При', 'Hi', null, null, 3],
        ['вет', '', null, null, 3],
      ],
      null,
      'en',
    ];
    expect(extractGtxText(data)).toBe('Привет');
  });
});

describe('translateTexts', () => {
  it('uses POST batch when available', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ['Один', 'Два'] };
      }
      throw new Error('unexpected GET');
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await translateTexts(['One', 'Two'], 'ru', 'en', undefined, {
      allowDirectGoogle: true,
    });
    expect(out).toEqual(['Один', 'Два']);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('splits batch by separator when POST fails', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false };
      return {
        ok: true,
        json: async () => [
          [[`Один${SEP}Два`, `One${SEP}Two`, null, null, 3]],
          null,
          'en',
        ],
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await translateTexts(['One', 'Two'], 'ru', 'en', undefined, {
      allowDirectGoogle: true,
    });
    expect(out).toEqual(['Один', 'Два']);

    vi.unstubAllGlobals();
  });

  it('dedupes before translating', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ['X', 'Y'] };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await translateTexts(['One', 'One', 'Two'], 'ru', 'en', undefined, {
      allowDirectGoogle: true,
    });
    expect(out).toEqual(['X', 'X', 'Y']);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
