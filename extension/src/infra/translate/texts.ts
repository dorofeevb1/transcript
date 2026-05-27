import { runPool } from '../../shared/async-pool';
import { dedupeTexts } from './dedupe';
import { translateChunkWithFallbacks } from './proxy';

const DEFAULT_CHUNK_SIZE = 40;
const DEFAULT_PARALLEL = 8;

export type TranslateProgressFn = (done: number, total: number) => void;

export interface TranslateFetchOptions {
  serverUrl?: string;
  tabId?: number;
  /** Размер пакета для Google/сервера (для длинных стенограмм — 1–4). */
  chunkSize?: number;
  /** Параллельных пакетов (для Argos лучше 1–2). */
  parallel?: number;
  /** Только unit-тесты: прямой fetch из SW (в проде даёт CORS). */
  allowDirectGoogle?: boolean;
}

export async function translateTexts(
  texts: string[],
  targetLang: string,
  sourceLang = 'auto',
  onProgress?: TranslateProgressFn,
  fetchOpts: TranslateFetchOptions = {},
): Promise<string[]> {
  if (!texts.length) return [];
  if (!targetLang) return [...texts];

  const viaTab = fetchOpts.tabId != null;
  const chunkSize = Math.max(
    1,
    fetchOpts.chunkSize ?? (viaTab ? 12 : DEFAULT_CHUNK_SIZE),
  );
  const parallel = Math.max(
    1,
    fetchOpts.parallel ?? (viaTab ? 2 : DEFAULT_PARALLEL),
  );

  const { unique, mapIndex } = dedupeTexts(texts);
  const total = unique.length;
  onProgress?.(0, total);

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  let doneUnique = 0;
  const translatedUniqueChunks = await runPool(chunks, parallel, async (chunk) => {
    const out = await translateChunkWithFallbacks(chunk, targetLang, sourceLang, {
      serverUrl: fetchOpts.serverUrl,
      tabId: fetchOpts.tabId,
      allowDirectGoogle: fetchOpts.allowDirectGoogle,
    });
    doneUnique += chunk.length;
    onProgress?.(Math.min(doneUnique, total), total);
    return out;
  });

  const translatedUnique = translatedUniqueChunks.flat();
  return mapIndex.map((idx) => translatedUnique[idx] ?? '');
}
