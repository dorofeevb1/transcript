/** Разбор ответов Google Translate (client=gtx). */
export function extractGtxText(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Неверный формат ответа перевода');
  }
  return (data[0] as unknown[])
    .filter((part): part is [string, ...unknown[]] => Array.isArray(part) && typeof part[0] === 'string')
    .map((part) => part[0])
    .join('');
}

export function parseBatchPostResponse(data: unknown, count: number): string[] | null {
  if (Array.isArray(data) && data.length === count && data.every((x) => typeof x === 'string')) {
    return data as string[];
  }
  return null;
}
