/** Убирает дубликаты фраз — один запрос на уникальный текст. */
export function dedupeTexts(texts: string[]): { unique: string[]; mapIndex: number[] } {
  const seen = new Map<string, number>();
  const unique: string[] = [];
  const mapIndex: number[] = [];
  for (const t of texts) {
    let idx = seen.get(t);
    if (idx === undefined) {
      idx = unique.length;
      seen.set(t, idx);
      unique.push(t);
    }
    mapIndex.push(idx);
  }
  return { unique, mapIndex };
}
